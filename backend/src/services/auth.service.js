'use strict';

const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const { firmarToken, verificarToken } = require('../utils/jwt');
const { aTimestampSQL } = require('../utils/fechas');
const { enTransaccion, consultar, consultarUna } = require('../config/database');
const { jwt: configJwt } = require('../config/env');
const usuarioModel = require('../models/usuario.model');
const veterinarioModel = require('../models/veterinario.model');
const codigoAcceso = require('./codigoAcceso.service');
const seguridad = require('../models/seguridad.model');
const mfa = require('../models/mfa.model');
const totp = require('../utils/totp');
const correo = require('./correo.service');

// bcryptjs es JavaScript puro: 10 rondas da un buen equilibrio entre coste de
// login y resistencia a fuerza bruta en esta máquina.
const RONDAS = 10;

// Tras este número de fallos seguidos la cuenta queda en espera unos minutos.
// Los valores reales se leen de configuracion.configuraciones, con estos de
// respaldo por si la tabla aún no está cargada.
const INTENTOS_MAXIMOS = 5;
const BLOQUEO_MINUTOS = 15;

/**
 * El tope por IP es un múltiplo del de la cuenta, no el mismo número.
 *
 * La diferencia no es cosmética: la clínica entera sale a internet por una
 * sola dirección, así que con el cinco de la cuenta bastaría con que tres
 * personas se equivocaran una mañana para dejar al mostrador sin poder entrar
 * —el bloqueo se lo habríamos hecho nosotros mismos—. Con el factor hacen
 * falta veinte fallos en el mismo cuarto de hora desde el mismo sitio, que ya
 * no es gente recordando su contraseña.
 */
const FACTOR_FALLOS_IP = 4;

// Enlaces de recuperación que se le pueden pedir a una misma cuenta seguidos.
// Tres en un cuarto de hora cubre de sobra a quien no recibe el primer correo
// y corta el envío en masa a la bandeja de una persona concreta.
const MAXIMO_RECUPERACIONES = 3;
const MINUTOS_RECUPERACION = 15;

// Cuánto vale el enlace que se manda. El mismo número va a la base y al texto
// del correo: si se separan, el correo promete una cosa y el token hace otra.
const MINUTOS_TOKEN_RECUPERACION = 30;

/* ------------------------------------------------------------------
   Segundo factor
   ------------------------------------------------------------------ */

// Cuánto dura el paso intermedio del ingreso. Cinco minutos alcanzan para
// sacar el teléfono y teclear seis cifras.
const MINUTOS_DESAFIO = 5;

// Fallos seguidos antes de invalidar el desafío. Con seis cifras y tres
// intentos, adivinar tiene una probabilidad de tres entre un millón.
const INTENTOS_MFA = 3;

// Y el freno de verdad: fallos por cuenta, sumando todos sus desafíos.
const FALLOS_MFA_MAXIMOS = 10;
const MINUTOS_BLOQUEO_MFA = 15;

// Códigos de recuperación que se entregan al activar.
const CODIGOS_RECUPERACION = 8;

// Veces que se puede fallar el código de acceso del personal desde una misma
// IP antes de que deje de responder un rato. Ocho da margen a quien lo copia
// mal de un papel y corta el tanteo a ciegas, que es el único ataque que tiene
// sentido contra un código que no caduca.
const FALLOS_CODIGO_MAXIMOS = 8;
const MINUTOS_BLOQUEO_CODIGO = 15;

// Correos con código que se le pueden mandar seguidos a una misma cuenta.
// Cinco en un cuarto de hora le sobran a quien no ve llegar el primero, y
// cierran el envío en masa a la bandeja de una persona concreta.
const MAXIMO_CODIGOS = 5;
const MINUTOS_CODIGOS = 15;

// Qué roles lo necesitan sale de la configuración, no de aquí: lo lee también
// el middleware, y dos listas que hay que mantener iguales terminan
// distintas.
const { codigoPorCorreo, debeConfigurarApp } = require('../utils/politicaMfa');

async function hashear(password) {
  return bcrypt.hash(password, RONDAS);
}

async function comparar(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Reglas de bloqueo, leídas de configuracion.configuraciones.
 *
 * Se guardan en memoria un minuto: son dos números que casi nunca cambian y
 * consultarlos en cada login añadiría un viaje a la base justo en la petición
 * donde más se nota. Al minuto siguiente ya se ve el valor nuevo si la
 * administración lo cambió.
 */
const CACHE_MINUTO = 60 * 1000;
let cacheReglas = { valor: null, hasta: 0 };

async function reglasDeBloqueo() {
  if (cacheReglas.valor && Date.now() < cacheReglas.hasta) return cacheReglas.valor;

  const reglas = { maximos: INTENTOS_MAXIMOS, minutos: BLOQUEO_MINUTOS };
  try {
    const filas = await consultar(
      `SELECT clave, valor FROM configuraciones
        WHERE sede_id IS NULL
          AND clave IN ('seguridad.intentos_maximos', 'seguridad.bloqueo_minutos')`
    );

    for (const fila of filas) {
      const numero = Number(fila.valor);
      if (!Number.isFinite(numero) || numero <= 0) continue;
      if (fila.clave === 'seguridad.intentos_maximos') reglas.maximos = numero;
      if (fila.clave === 'seguridad.bloqueo_minutos') reglas.minutos = numero;
    }
  } catch (error) {
    // Se sigue con los valores de respaldo para no dejar a nadie sin poder
    // entrar, pero queda dicho: si la tabla no está o la base falla, el
    // bloqueo por intentos estaría usando números distintos a los del panel.
    console.warn(
      `[seguridad] no se pudieron leer las reglas de bloqueo (${error.message}); ` +
      `se usan las de respaldo: ${INTENTOS_MAXIMOS} intentos / ${BLOQUEO_MINUTOS} min.`
    );
  }

  cacheReglas = { valor: reglas, hasta: Date.now() + CACHE_MINUTO };
  return reglas;
}

/** Quita el hash y normaliza lo que se devuelve al cliente. */
function usuarioPublico(usuario, extras = {}) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    telefono: usuario.telefono || null,
    rol: usuario.rol,
    estado: usuario.estado,
    sedeId: usuario.sede_id ?? null,
    // El frontend lo necesita para mandar a la pantalla de cambio en vez de al
    // panel. Quien manda sigue siendo el servidor, que corta las demás rutas.
    debeCambiarPassword: usuario.debe_cambiar_password === 1,
    mfaActivo: usuario.mfa_activo === 1,
    ...extras,
  };
}

/**
 * Registro público sin código: crea un CLIENTE.
 *
 * Es la puerta abierta del sitio, así que solo puede dar el rol que no ve nada
 * ajeno: el que no necesita que nadie le entregue nada para entrar. Para nacer
 * con cualquier otro rol hay que traer el código de ese rol, y de eso se
 * encarga registrarConCodigo().
 */
async function registrarCliente({ nombre, email, telefono, password }, req = null) {
  const existente = await usuarioModel.buscarPorEmail(email);
  if (existente) {
    throw ApiError.conflicto('Ya existe una cuenta registrada con ese correo.');
  }

  const rolId = await usuarioModel.idRol('cliente');
  if (!rolId) throw new ApiError(500, 'La tabla de roles no está inicializada. Ejecuta database/supabase/seed.sql.');

  const passwordHash = await hashear(password);

  const usuarioId = await enTransaccion(async (conexion) => {
    const id = await usuarioModel.crear({ rolId, nombre, email, telefono, passwordHash }, conexion);
    await conexion.execute('INSERT INTO clientes (usuario_id) VALUES (?)', [id]);
    return id;
  });

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId, modulo: 'seguridad', tabla: 'usuarios', registroId: usuarioId,
    accion: 'registro', descripcion: `Registro público de la cuenta ${email}`, ip,
  });

  return sesionPara(usuarioId, req);
}

/**
 * Registro con el código de acceso de la clínica: crea un VETERINARIO.
 *
 * La administración no se crea por aquí. Un código fijo escrito en un
 * formulario abierto no puede ser lo único que separe a un desconocido de una
 * cuenta que ve historias clínicas y facturación; esas altas van por el panel,
 * donde las hace un administrador que ya está identificado. El porqué largo
 * está en utils/codigoAcceso.js.
 *
 * Los códigos son fijos y no caducan, así que aquí se juntan las tres cosas
 * que los sostienen: el intento fallido queda registrado —para que un goteo de
 * pruebas se vea en la pantalla de intentos, igual que el de las contraseñas—,
 * el error es siempre el mismo texto, y el alta entera va en una transacción
 * para que no quede un usuario con rol de veterinario sin su ficha, que es una
 * cuenta que entra al panel clínico y rompe en cuanto abre la agenda.
 */
async function registrarConCodigo(
  { rol, nombre, email, telefono, password, codigo, licencia, especialidad },
  req = null
) {
  // Se responde a la administración por separado y con su propio texto en vez
  // de dejarla caer en el "ese tipo de cuenta no existe" de abajo: quien lo
  // intenta suele ser alguien de la clínica con un código viejo en la mano, y
  // lo que necesita es saber a dónde ir. Va lo primero de todo, antes incluso
  // de mirar el código, para que no quede ninguna rama por la que se llegue a
  // crear la cuenta.
  if (rol === 'admin') {
    throw ApiError.prohibido(
      'Las cuentas de administración ya no se crean desde el registro. ' +
      'Pídele a un administrador que la cree desde el panel de usuarios.'
    );
  }

  if (!codigoAcceso.ROLES.includes(rol)) {
    throw ApiError.badRequest('Ese tipo de cuenta no se crea con un código de acceso.');
  }

  const { ip, agente } = seguridad.datosPeticion(req);

  // El freno va antes de mirar el código: si ya se falló demasiadas veces
  // desde aquí, ni se comprueba. Los intentos rechazados por este motivo no se
  // guardan, y es a propósito: si se guardaran, cada golpe alargaría la espera
  // y el bloqueo no terminaría nunca.
  if (await seguridad.fallosDeCodigoDesde(ip, MINUTOS_BLOQUEO_CODIGO) >= FALLOS_CODIGO_MAXIMOS) {
    throw ApiError.prohibido(
      `Demasiados intentos con el código de acceso. Vuelve a intentarlo en ${MINUTOS_BLOQUEO_CODIGO} minutos.`
    );
  }

  if (!(await codigoAcceso.verificar(rol, codigo))) {
    await seguridad.registrarIntento({
      email, exito: false, motivo: 'codigo_acceso_invalido', ip, agente,
    });
    throw ApiError.prohibido('El código de acceso no es válido. Pídeselo a la administración de la clínica.');
  }

  if (await usuarioModel.buscarPorEmail(email)) {
    throw ApiError.conflicto('Ya existe una cuenta registrada con ese correo.');
  }

  // La licencia es única en la tabla. Se mira antes para poder decir qué pasó:
  // dejarlo al índice devolvería un choque de clave que no explica nada a
  // quien está rellenando el formulario.
  if (rol === 'veterinario') {
    const licenciaTomada = await consultarUna(
      'SELECT id FROM veterinarios WHERE licencia = ?',
      [licencia]
    );
    if (licenciaTomada) {
      throw ApiError.conflicto('Esa licencia ya está registrada. Si es la tuya, habla con la administración.');
    }
  }

  const rolId = await usuarioModel.idRol(rol);
  if (!rolId) throw new ApiError(500, `Falta el rol "${rol}". Ejecuta database/supabase/seed.sql.`);

  const passwordHash = await hashear(password);

  const usuarioId = await enTransaccion(async (conexion) => {
    const id = await usuarioModel.crear({ rolId, nombre, email, telefono, passwordHash }, conexion);

    // El administrador no lleva ficha aparte: su cuenta es solo la fila de
    // usuarios con ese rol, igual que cuando la crea otro admin desde el panel.
    if (rol === 'veterinario') {
      await veterinarioModel.crear({ usuarioId: id, licencia, especialidad }, conexion);
    }
    return id;
  });

  await seguridad.auditar({
    usuarioId, modulo: 'seguridad', tabla: 'usuarios', registroId: usuarioId,
    accion: 'registro',
    descripcion: rol === 'veterinario'
      ? `Registro con código de acceso de la cuenta ${email} como veterinario (licencia ${licencia})`
      : `Registro con código de acceso de la cuenta ${email} como administrador`,
    ip,
  });

  return sesionPara(usuarioId, req);
}

/**
 * La puerta única del registro público: el rol pedido decide el camino.
 *
 * El reparto se hace aquí y no en el controlador para que no haya dos rutas
 * que crean cuentas; una sola es la que hay que mirar cuando se revisa quién
 * puede entrar al sistema.
 */
async function registrar(datos, req = null) {
  const rol = datos.rol || 'cliente';
  if (rol === 'cliente') return registrarCliente(datos, req);

  return registrarConCodigo(
    {
      rol,
      nombre: datos.nombre,
      email: datos.email,
      telefono: datos.telefono,
      password: datos.password,
      codigo: datos.codigoAcceso,
      licencia: datos.licencia,
      especialidad: datos.especialidad,
    },
    req
  );
}

/**
 * Valida credenciales y devuelve { token, usuario }.
 *
 * Cada intento —acertado o no— queda en seguridad.intentos_login, y tras varios
 * fallos seguidos el correo entra en espera unos minutos. Eso frena la fuerza
 * bruta incluso si el atacante rota de IP, que es lo que el límite por IP no
 * alcanza a cubrir.
 */
async function login({ email, password }, req = null) {
  const { ip, agente } = seguridad.datosPeticion(req);
  const { maximos, minutos } = await reglasDeBloqueo();

  // Dos frenos que miran cosas distintas, y las dos consultas a la vez para no
  // pagar dos viajes a Supabase en la petición donde más se nota. El de la
  // cuenta cuenta los fallos de ESTE correo; el del origen cuenta los de esta
  // IP contra todos los correos, que es lo único que ve al que prueba una sola
  // contraseña contra media lista de direcciones: ahí cada cuenta suma un
  // fallo suelto y ninguna llega jamás a su tope.
  const [usuario, fallosIp] = await Promise.all([
    usuarioModel.buscarPorEmailConFallos(email, minutos),
    seguridad.fallosDeLoginDesde(ip, minutos),
  ]);

  if ((usuario?.fallos || 0) >= maximos) {
    await seguridad.registrarIntento({ email, exito: false, motivo: 'bloqueo_temporal', ip, agente });
    throw new ApiError(
      429,
      `Demasiados intentos fallidos. Espera ${minutos} minutos antes de volver a intentarlo.`
    );
  }

  // El motivo es propio y no uno de los que se cuentan: si el rechazo del
  // bloqueo sumara al bloqueo, cada intento contra la puerta cerrada alargaría
  // la espera y no terminaría nunca.
  if (fallosIp >= maximos * FACTOR_FALLOS_IP) {
    await seguridad.registrarIntento({ email, exito: false, motivo: 'bloqueo_ip', ip, agente });
    throw new ApiError(
      429,
      `Se han hecho demasiados intentos fallidos desde este equipo. ` +
      `Espera ${minutos} minutos antes de volver a intentarlo.`
    );
  }

  // Mismo mensaje para "no existe" y "contraseña incorrecta": así no se puede
  // usar el login para averiguar qué correos están registrados.
  const generico = ApiError.noAutorizado('Correo o contraseña incorrectos.');

  if (!usuario || !usuario.id) {
    // Se compara igual contra un hash ficticio para que el tiempo de respuesta
    // no delate si el correo existe.
    await comparar(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    await seguridad.registrarIntento({ email, exito: false, motivo: 'correo_no_existe', ip, agente });
    throw generico;
  }

  const coincide = await comparar(password, usuario.password_hash);
  if (!coincide) {
    await seguridad.registrarIntento({
      email, usuarioId: usuario.id, exito: false, motivo: 'password_incorrecta', ip, agente,
    });
    throw generico;
  }

  if (usuario.estado !== 'activo') {
    await seguridad.registrarIntento({
      email, usuarioId: usuario.id, exito: false, motivo: `cuenta_${usuario.estado}`, ip, agente,
    });
    throw ApiError.prohibido(
      usuario.estado === 'bloqueado'
        ? 'Tu cuenta está bloqueada. Comunícate con la clínica.'
        : 'Tu cuenta está desactivada. Comunícate con la clínica.'
    );
  }

  // La contraseña ya está bien. Si la cuenta tiene segundo factor —el código
  // que le llega al correo, la aplicación de autenticación, o los dos—, aquí
  // NO se abre sesión: se devuelve un desafío de vida corta que no sirve para
  // llamar a ninguna ruta. Sin esto, "tener MFA" sería un adorno, porque la
  // sesión ya estaría entregada antes de pedir el código.
  const tieneApp = await mfa.estaActivo(usuario.id);
  const porCorreo = codigoPorCorreo(usuario.rol);

  if (tieneApp || porCorreo) {
    // El código del correo se genera aquí y se manda ANTES de abrir el
    // desafío: si el correo no sale y esa cuenta no tiene la aplicación
    // puesta, no hay con qué terminar el ingreso, y es mejor decirlo que
    // dejar una fila esperando un código que nadie va a recibir.
    let codigo = null;
    let enviado = false;

    if (porCorreo) {
      // Tope de correos por cuenta y por rato. Sin él, quien ya tenga la
      // contraseña puede llamar al login en bucle y llenarle la bandeja a
      // alguien: el límite por IP no lo frena —una respuesta con desafío es un
      // 200 y no cuenta— y la cuenta de correo tiene un máximo de envíos al
      // día que, agotado, deja a TODO el mundo sin poder entrar. Es el mismo
      // freno que ya lleva la recuperación de contraseña.
      const alTope = (await mfa.codigosEnviados(usuario.id, MINUTOS_CODIGOS)) >= MAXIMO_CODIGOS;

      if (alTope && !tieneApp) {
        throw new ApiError(
          429,
          `Ya te enviamos varios códigos de ingreso. Revisa tu correo o espera ${MINUTOS_CODIGOS} minutos.`
        );
      }

      if (!alTope) {
        codigo = mfa.generarCodigoIngreso();
        enviado = await correo.enviarCodigoIngreso(usuario, codigo, MINUTOS_DESAFIO);

        // Que el correo no salga con la aplicación puesta es un contratiempo;
        // sin ella es quedarse fuera, y hay que decirlo en vez de abrir un
        // desafío que espera un código que nadie va a recibir.
        if (!enviado) {
          codigo = null;
          if (!tieneApp) {
            throw new ApiError(
              503,
              'No pudimos enviar el código a tu correo. Inténtalo de nuevo en unos minutos.'
            );
          }
        }
      }
    }

    const desafio = await mfa.crearDesafio(usuario.id, {
      minutos: MINUTOS_DESAFIO, ip, agente, codigo,
    });

    await seguridad.registrarIntento({
      email, usuarioId: usuario.id, exito: false, motivo: 'mfa_pendiente', ip, agente,
    });

    return {
      mfa: true,
      desafio,
      expiraEnMinutos: MINUTOS_DESAFIO,
      porCorreo: enviado,
      correo: enviado ? correo.ocultar(usuario.email) : null,
      mensaje: enviado
        ? `Te enviamos un código de seis cifras a ${correo.ocultar(usuario.email)}. ` +
          `Caduca en ${MINUTOS_DESAFIO} minutos.`
        : 'Escribe el código de tu aplicación de autenticación.',
    };
  }

  // El registro del intento acertado va en paralelo con el armado de la sesión:
  // no depende de él y nadie espera su resultado. Se resuelve antes de
  // responder —y no se deja "para después"— porque en serverless la función se
  // congela en cuanto sale la respuesta y la escritura se perdería.
  const [, sesion] = await Promise.all([
    seguridad.registrarIntento({ email, usuarioId: usuario.id, exito: true, ip, agente }),
    sesionPara(usuario.id, req),
  ]);

  return sesion;
}

/**
 * Segundo paso del ingreso: el código.
 *
 * Acepta el que se mandó al correo, el de la aplicación —para quien la tenga
 * puesta— o uno de recuperación. El desafío se cierra pase
 * lo que pase después de unos pocos fallos, para que no se pueda quedar
 * probando las mil combinaciones de seis cifras contra el mismo desafío.
 */
async function completarMfa({ desafio, codigo }, req = null) {
  const { ip, agente } = seguridad.datosPeticion(req);
  const fila = await mfa.desafioVigente(desafio);

  const generico = ApiError.noAutorizado('El código no es válido o el ingreso ya venció. Vuelve a empezar.');

  // Un desafío con código enviado vale por sí solo: la cuenta no necesita
  // tener la aplicación configurada para que le pidan el segundo factor.
  if (!fila || (fila.activo !== 1 && !fila.codigo_hash)) throw generico;

  // Freno por CUENTA, no por desafío. El tope de tres por desafío no servía de
  // nada solo: quien ya tiene la contraseña puede pedir un desafío nuevo cada
  // vez y seguir probando de tres en tres hasta acertar seis cifras.
  if (await mfa.fallosRecientes(fila.usuario_id, MINUTOS_BLOQUEO_MFA) >= FALLOS_MFA_MAXIMOS) {
    await mfa.cerrarDesafio(fila.id);
    throw new ApiError(
      429,
      `Demasiados códigos incorrectos. Espera ${MINUTOS_BLOQUEO_MFA} minutos antes de volver a intentarlo.`
    );
  }

  const limpio = String(codigo || '').trim();

  // Un código de recuperación se distingue por la forma, no por un campo que
  // mande el navegador: seis cifras es el del correo o el de la aplicación, y
  // lo demás se prueba contra los de recuperación.
  const cifras = limpio.replace(/\s/g, '');
  const esNumerico = /^\d{6}$/.test(cifras);

  // El del correo se comprueba volviendo a hashear lo que se escribió: es de
  // ESTE desafío y de nadie más, y como el desafío se cierra al entrar, no
  // sirve una segunda vez.
  const porCorreo = esNumerico && Boolean(fila.codigo_hash) &&
    mfa.hashCodigo(cifras) === fila.codigo_hash;

  // La aplicación solo se consulta si esta cuenta la tiene puesta: sin secreto
  // guardado no hay nada contra qué comparar.
  const conApp = fila.activo === 1 && Boolean(fila.secreto);

  let restantes = null;
  let contador = null;

  if (porCorreo) {
    // Ya está: el hash cuadra y no hay más que mirar.
  } else if (esNumerico && conApp) {
    contador = totp.verificar(fila.secreto, limpio);
    // Un código ya usado no vale otra vez aunque siga dentro de su ventana.
    if (contador !== null && fila.ultimo_contador !== null && contador <= Number(fila.ultimo_contador)) {
      contador = null;
    }
  } else if (!esNumerico) {
    restantes = await mfa.gastarCodigo(fila.usuario_id, limpio);
  }

  if (!porCorreo && contador === null && restantes === null) {
    const intentos = await mfa.sumarIntento(fila.id);
    if (intentos >= INTENTOS_MFA) await mfa.cerrarDesafio(fila.id);

    await seguridad.registrarIntento({
      email: fila.email, usuarioId: fila.usuario_id, exito: false, motivo: 'mfa_incorrecto', ip, agente,
    });
    throw generico;
  }

  // El contador se avanza ANTES de dar la sesión, y se mira si ganó la carrera.
  // Sin esto, dos peticiones a la vez con el mismo código pasaban las dos: las
  // dos leían el contador viejo y ninguna se enteraba de la otra. Es el UPDATE
  // condicional el que decide, no la comprobación de arriba.
  if (contador !== null && !(await mfa.avanzarContador(fila.usuario_id, contador))) {
    await mfa.cerrarDesafio(fila.id);
    throw generico;
  }

  await mfa.cerrarDesafio(fila.id);

  // El correo va de verdad y no en blanco: es lo que reinicia el contador de
  // fallos del login. Con el campo vacío, la cuenta acumulaba intentos para
  // siempre y se bloqueaba sola tras unos cuantos ingresos correctos.
  const [, sesion] = await Promise.all([
    seguridad.registrarIntento({
      email: fila.email, usuarioId: fila.usuario_id, exito: true,
      motivo: porCorreo ? 'mfa_correo' : (esNumerico ? 'mfa_totp' : 'mfa_recuperacion'), ip, agente,
    }),
    sesionPara(fila.usuario_id, req),
  ]);

  if (restantes !== null) {
    await seguridad.auditar({
      usuarioId: fila.usuario_id, modulo: 'seguridad', tabla: 'mfa_codigos',
      registroId: fila.usuario_id, accion: 'mfa_recuperacion',
      descripcion: `Entró con un código de recuperación; le quedan ${restantes}`, ip,
    });
  }

  return { ...sesion, codigosRestantes: restantes };
}

/* ------------------------------------------------------------------
   Alta y baja del segundo factor
   ------------------------------------------------------------------ */

/** Paso 1: genera el secreto y la dirección que lee la aplicación. */
async function prepararMfa(usuario) {
  if (await mfa.estaActivo(usuario.id)) {
    throw ApiError.conflicto('Ya tienes el segundo factor activo. Quítalo antes de volver a configurarlo.');
  }

  const secreto = totp.generarSecreto();
  await mfa.guardarSecreto(usuario.id, secreto);

  return {
    secreto,
    direccion: totp.direccionOtpauth(secreto, usuario.email),
    // Se dice cómo se comprueba: si alguien usa una app que pregunta, no tiene
    // que adivinarlo.
    algoritmo: 'SHA1',
    digitos: totp.DIGITOS,
    periodo: totp.PASO_SEGUNDOS,
  };
}

/** Paso 2: confirma con un código y entrega los de recuperación. */
async function activarMfa(usuario, codigo, req = null) {
  const estado = await mfa.estadoDe(usuario.id);
  if (!estado) throw ApiError.badRequest('Primero pide el código de configuración.');
  if (estado.activo === 1) throw ApiError.conflicto('El segundo factor ya estaba activo.');

  const contador = totp.verificar(estado.secreto, codigo);
  if (contador === null) {
    throw ApiError.badRequest('Ese código no coincide. Revisa la hora del teléfono y prueba con el siguiente.');
  }

  const codigos = Array.from({ length: CODIGOS_RECUPERACION }, () => mfa.generarCodigo());
  await mfa.activar(usuario.id, contador, codigos);

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: usuario.id, modulo: 'seguridad', tabla: 'mfa', registroId: usuario.id,
    accion: 'mfa_activado', descripcion: 'Activó el segundo factor', ip,
  });

  // Se entregan una sola vez, aquí. Después solo se pueden cambiar por otros.
  return { codigos };
}

/**
 * Baja del segundo factor. Pide la contraseña otra vez.
 *
 * Es la reautenticación de la que habla el encargo: quitar el segundo factor
 * desde una sesión ya abierta —un computador que alguien dejó sin bloquear—
 * sería justo la forma de desarmarlo.
 */
async function desactivarMfa(usuario, password, req = null) {
  const hash = await usuarioModel.passwordHashDe(usuario.id);
  if (!hash || !(await comparar(password, hash))) {
    throw ApiError.badRequest('La contraseña no es correcta.');
  }

  await mfa.desactivar(usuario.id);

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: usuario.id, modulo: 'seguridad', tabla: 'mfa', registroId: usuario.id,
    accion: 'mfa_desactivado', descripcion: 'Quitó el segundo factor', ip,
  });
}

/** Cambia los códigos de recuperación por unos nuevos. También pide contraseña. */
async function renovarCodigosMfa(usuario, password, req = null) {
  const hash = await usuarioModel.passwordHashDe(usuario.id);
  if (!hash || !(await comparar(password, hash))) {
    throw ApiError.badRequest('La contraseña no es correcta.');
  }
  if (!(await mfa.estaActivo(usuario.id))) {
    throw ApiError.badRequest('No tienes el segundo factor activo.');
  }

  const codigos = Array.from({ length: CODIGOS_RECUPERACION }, () => mfa.generarCodigo());
  await mfa.renovarCodigos(usuario.id, codigos);

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: usuario.id, modulo: 'seguridad', tabla: 'mfa_codigos', registroId: usuario.id,
    accion: 'mfa_codigos', descripcion: 'Generó códigos de recuperación nuevos', ip,
  });

  return { codigos };
}

/**
 * Arma el token, abre la sesión en la base y devuelve el perfil completo
 * (incluye cliente_id / veterinario_id y los permisos del rol, que es lo que
 * el frontend usa para decidir qué menús pintar).
 */
async function sesionPara(usuarioId, req = null) {
  // Una consulta hace tres cosas a la vez: marca el último acceso, arma el
  // perfil y trae los permisos del rol. Antes eran tres viajes a Supabase.
  const perfil = await consultarUna(
    `WITH tocado AS (
       UPDATE usuarios SET ultimo_acceso = LOCALTIMESTAMP
        WHERE id = ?
       RETURNING id, nombre, email, telefono, estado, sede_id, rol_id, debe_cambiar_password
     )
     SELECT u.id, u.nombre, u.email, u.telefono, u.estado, u.sede_id, u.rol_id,
            u.debe_cambiar_password,
            r.nombre AS rol,
            c.id AS cliente_id,
            v.id AS veterinario_id,
            COALESCE(mf.activo, 0) AS mfa_activo,
            COALESCE(
              ARRAY(SELECT p.codigo
                      FROM rol_permisos rp
                      JOIN permisos p ON p.id = rp.permiso_id
                     WHERE rp.rol_id = u.rol_id),
              '{}') AS permisos
       FROM tocado u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN clientes c     ON c.usuario_id = u.id
       LEFT JOIN veterinarios v ON v.usuario_id = u.id
       LEFT JOIN mfa mf         ON mf.usuario_id = u.id`,
    [usuarioId]
  );

  if (!perfil) throw new ApiError(500, 'No se pudo cargar el perfil de la sesión.');

  // La sesión de administración vive menos: es la que puede tocar usuarios,
  // roles, facturación y configuración de seguridad, y suele quedarse abierta
  // en el computador del mostrador. Los demás roles conservan JWT_EXPIRES.
  const token = firmarToken(
    { sub: perfil.id, rol: perfil.rol },
    perfil.rol === 'admin' ? configJwt.expiresInAdmin : undefined
  );

  // El vencimiento sale del propio token para que la fila de sesiones y el JWT
  // caduquen exactamente a la vez.
  const { exp } = verificarToken(token);
  const expiraEn = aTimestampSQL(new Date(exp * 1000));

  const { ip, agente } = seguridad.datosPeticion(req);
  const sesionId = await seguridad.abrirSesion({ usuarioId: perfil.id, token, expiraEn, ip, agente });

  const permisos = perfil.permisos || [];

  return {
    token,
    expiraEn,
    sesionId,
    permisos,
    debeCambiarPassword: perfil.debe_cambiar_password === 1,
    // Su rol lo exige, no hay correo saliente y todavía no tiene la
    // aplicación: el frontend lleva a configurarla y el servidor no abre nada
    // más hasta que esté. Con el correo montado no hay nada que configurar.
    debeConfigurarMfa: debeConfigurarApp(perfil.rol, perfil.mfa_activo),
    usuario: usuarioPublico(perfil, {
      clienteId: perfil.cliente_id,
      veterinarioId: perfil.veterinario_id,
      permisos,
    }),
  };
}

/** Cierra la sesión del token con el que se hizo la petición. */
async function cerrarSesion(req) {
  if (!req.token) return false;
  const { ip, agente } = seguridad.datosPeticion(req);
  return seguridad.cerrarSesion(req.token, { motivo: 'logout', ip, agente });
}

/**
 * Cambio de contraseña del propio usuario. Se cierran las demás sesiones:
 * si la contraseña se cambia porque alguien más la conocía, sus tokens dejan
 * de servir en ese momento.
 */
async function cambiarPassword(usuarioId, { actual, nueva }, req = null) {
  const hash = await usuarioModel.passwordHashDe(usuarioId);
  if (!hash) throw ApiError.noEncontrado('Usuario no encontrado.');

  const coincide = await comparar(actual, hash);
  if (!coincide) throw ApiError.badRequest('La contraseña actual no es correcta.');

  if (await comparar(nueva, hash)) {
    throw ApiError.badRequest('La contraseña nueva debe ser distinta de la actual.');
  }

  await usuarioModel.actualizarPassword(usuarioId, await hashear(nueva));
  await seguridad.cerrarSesionesDe(usuarioId, 'cambio_password');

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId, modulo: 'seguridad', tabla: 'usuarios', registroId: usuarioId,
    accion: 'cambio_password', descripcion: 'El usuario cambió su contraseña', ip,
  });
}

/**
 * Paso 1 de la recuperación: genera un token de un solo uso.
 *
 * La respuesta es siempre la misma exista o no el correo, para no convertir
 * esto en un buscador de cuentas registradas. Sin servicio de correo montado,
 * el token se devuelve solo en desarrollo para poder probar el flujo.
 */
async function solicitarRecuperacion({ email }, req = null) {
  const usuario = await usuarioModel.buscarPorEmail(email);
  if (!usuario || usuario.estado !== 'activo') return { token: null };

  // Tope por cuenta, no por IP: el de IP vive en la memoria de cada instancia
  // de la función y en serverless no cuenta bien. Se sale igual que si el
  // correo no existiera —la respuesta del endpoint es siempre la misma—, para
  // no convertir el freno en una forma de averiguar qué cuentas hay.
  if (await seguridad.solicitudesRecuperacionRecientes(usuario.id, MINUTOS_RECUPERACION) >= MAXIMO_RECUPERACIONES) {
    console.warn(`[seguridad] demasiadas solicitudes de recuperación para el usuario ${usuario.id}`);
    return { token: null };
  }

  const { ip } = seguridad.datosPeticion(req);
  const token = await seguridad.crearTokenRecuperacion(usuario.id, MINUTOS_TOKEN_RECUPERACION, ip);

  // El envío no cambia lo que se responde, y eso es la mitad del asunto: la
  // respuesta de este endpoint es siempre la misma exista o no la cuenta, así
  // que tampoco puede depender de si el correo salió. Un fallo se queda en el
  // registro del servidor, que es donde se mira cuando alguien avisa de que no
  // le llegó nada.
  const enviado = await correo.enviarRecuperacion(usuario, token, MINUTOS_TOKEN_RECUPERACION, req);
  if (!enviado) {
    console.error(
      `[seguridad] no se pudo enviar el enlace de recuperación al usuario ${usuario.id}. ` +
      'Revisa CORREO_USUARIO y CORREO_PASSWORD.'
    );
  }

  await seguridad.auditar({
    usuarioId: usuario.id, modulo: 'seguridad', tabla: 'tokens_recuperacion',
    registroId: usuario.id, accion: 'recuperacion_solicitada',
    descripcion: `Solicitud de recuperación para ${email}` +
      (enviado ? '' : ' (el correo con el enlace no pudo enviarse)'),
    ip,
  });

  return { token };
}

/** Paso 2: con el token válido se fija la contraseña nueva. */
async function restablecerPassword({ token, nueva }, req = null) {
  const fila = await seguridad.tokenRecuperacionVigente(token);
  if (!fila) throw ApiError.badRequest('El enlace de recuperación no es válido o ya venció.');

  await usuarioModel.actualizarPassword(fila.usuario_id, await hashear(nueva));
  await seguridad.marcarTokenUsado(fila.id);
  await seguridad.cerrarSesionesDe(fila.usuario_id, 'recuperacion');

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: fila.usuario_id, modulo: 'seguridad', tabla: 'usuarios',
    registroId: fila.usuario_id, accion: 'recuperacion_completada',
    descripcion: 'Contraseña restablecida con token de recuperación', ip,
  });
}

module.exports = {
  hashear,
  comparar,
  usuarioPublico,
  registrar,
  registrarCliente,
  registrarConCodigo,
  login,
  sesionPara,
  cerrarSesion,
  cambiarPassword,
  solicitarRecuperacion,
  restablecerPassword,
  completarMfa,
  prepararMfa,
  activarMfa,
  desactivarMfa,
  renovarCodigosMfa,
};
