'use strict';

/**
 * Pruebas de las decisiones de autorización que recortan "lo mío" de "todo".
 *
 * Son las que fallaron en la auditoría: varias rutas admiten dos permisos —el
 * propio y el global— y quien solo tenía el propio recibía el listado entero,
 * porque nadie filtraba después del middleware. El agujero no estaba en el
 * permiso sino en lo que el controlador hacía con él, así que es eso lo que se
 * prueba aquí.
 *
 * No hace falta base de datos. De alcanceCliente() se comprueba la decisión,
 * que solo depende de la sesión; de los modelos, la consulta que arman, no lo
 * que devuelve PostgreSQL.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const bd = require('../src/config/database');

/* ------------------------------------------------------------------
   Espía de consultas

   Los modelos toman consultar() al cargarse (`const { consultar } = require`),
   así que hay que sustituirla ANTES de pedirlos. Por eso este bloque va arriba
   del todo y los modelos se cargan justo después.
   ------------------------------------------------------------------ */

let ultimaConsulta = null;

bd.consultar = async (sql, params = []) => {
  ultimaConsulta = { sql, params };
  return [];
};

const historia = require('../src/models/historia.model');
const imagenes = require('../src/models/imagenes.model');
const laboratorio = require('../src/models/laboratorio.model');
const soporte = require('../src/models/soporte.model');

const { alcanceCliente, alcanceSede, tienePermiso } = require('../src/middleware/roles');
const { traducirPlaceholders } = require('../src/config/database');
const { firmarToken, verificarToken, ALGORITMO } = require('../src/utils/jwt');
const { nombreSeguro } = require('../src/routes/reportes-pdf.routes');

/** Corre la tarea y devuelve la consulta que se habría mandado a la base. */
async function consultaDe(tarea) {
  ultimaConsulta = null;
  await tarea();
  assert.ok(ultimaConsulta, 'no se llegó a armar ninguna consulta');
  return ultimaConsulta;
}

/** Sesión de mentira, como la deja requiereAuth en req. */
function sesion({ rol = 'cliente', clienteId = null, veterinarioId = null, permisos = [] } = {}) {
  return {
    usuario: { id: 1, rol, cliente_id: clienteId, veterinario_id: veterinarioId },
    permisos,
  };
}

/* ------------------------------------------------------------------
   alcanceCliente
   ------------------------------------------------------------------ */

test('quien tiene el permiso global no lleva recorte', () => {
  const req = sesion({ rol: 'veterinario', veterinarioId: 4, permisos: ['historia.ver_todas'] });
  assert.equal(alcanceCliente(req, 'historia.ver_todas'), null);
});

test('el cliente queda recortado a su propia ficha', () => {
  const req = sesion({ clienteId: 7, permisos: ['historia.ver_propia'] });
  assert.equal(alcanceCliente(req, 'historia.ver_todas'), 7);
});

test('sin ficha de cliente y sin permiso global se rechaza, no se devuelve todo', () => {
  // El caso que abría el agujero: un cliente_id nulo se leía como "sin filtro",
  // y sin filtro el listado salía completo. Tiene que fallar, no pasar de largo.
  const req = sesion({ clienteId: null, permisos: ['historia.ver_propia'] });

  assert.throws(() => alcanceCliente(req, 'historia.ver_todas'), (error) => {
    assert.equal(error.status, 403);
    return true;
  });
});

test('basta con uno de los permisos globales que se le pasen', () => {
  const req = sesion({ rol: 'admin', permisos: ['imagenes.gestionar'] });
  assert.equal(alcanceCliente(req, 'imagenes.ver', 'imagenes.gestionar'), null);
});

test('sin sesión no hay alcance que calcular', () => {
  assert.throws(() => alcanceCliente({}, 'historia.ver_todas'), (error) => {
    assert.equal(error.status, 401);
    return true;
  });
});

test('el permiso propio no se confunde con el global aunque se parezcan', () => {
  const req = sesion({ clienteId: 3, permisos: ['recetas.ver_propias'] });
  assert.equal(tienePermiso(req, 'recetas.ver_todas'), false);
  assert.equal(alcanceCliente(req, 'recetas.ver_todas'), 3);
});

/* ------------------------------------------------------------------
   El recorte llega de verdad a la consulta

   Que el controlador calcule el cliente no sirve de nada si el modelo lo
   ignora, que es exactamente lo que pasaba antes.
   ------------------------------------------------------------------ */

test('la historia clínica filtra por el dueño cuando se le pasa clienteId', async () => {
  const conFiltro = await consultaDe(() => historia.listarConsultas({ clienteId: 9 }));
  assert.match(conFiltro.sql, /m\.cliente_id = \?/);
  assert.deepEqual(conFiltro.params, [9]);

  const sinFiltro = await consultaDe(() => historia.listarConsultas({}));
  assert.doesNotMatch(sinFiltro.sql, /m\.cliente_id = \?/);
});

test('los estudios de imagen filtran por el dueño', async () => {
  const capturado = await consultaDe(() => imagenes.listar({ clienteId: 4 }));
  assert.match(capturado.sql, /m\.cliente_id = \?/);
  assert.deepEqual(capturado.params, [4]);
});

test('las órdenes de laboratorio filtran por el dueño', async () => {
  const capturado = await consultaDe(() => laboratorio.listar({ clienteId: 4 }));
  assert.match(capturado.sql, /m\.cliente_id = \?/);
  assert.deepEqual(capturado.params, [4]);
});

test('las PQRS de quien no tiene ficha de cliente se filtran por su usuario', async () => {
  const capturado = await consultaDe(() => soporte.listar({ usuarioId: 12 }));
  assert.match(capturado.sql, /t\.usuario_id = \?/);
  assert.deepEqual(capturado.params, [12]);
});

/* ------------------------------------------------------------------
   Inyección SQL

   Lo que llega del usuario viaja como parámetro, nunca pegado a la consulta.
   Lo que sí se interpola —el LIMIT— tiene que terminar siendo un número
   aunque le manden texto.
   ------------------------------------------------------------------ */

test('un valor con comillas viaja como parámetro y no toca el SQL', async () => {
  const ataque = "1' OR '1'='1";
  const capturado = await consultaDe(() => historia.listarConsultas({ tipo: ataque }));

  assert.doesNotMatch(capturado.sql, /OR '1'='1/);
  assert.ok(capturado.params.includes(ataque), 'el valor tiene que ir en los parámetros');
});

test('el límite se interpola, así que nunca puede salir de ahí siendo texto', async () => {
  for (const intento of ['50; DROP TABLE consultas', '999999', '-1', 'abc', null]) {
    const capturado = await consultaDe(() => historia.listarConsultas({ limite: intento }));
    const limite = capturado.sql.match(/LIMIT (\d+)$/m);

    assert.ok(limite, `el LIMIT tiene que ser un número (probado con ${intento})`);
    assert.ok(
      Number(limite[1]) >= 1 && Number(limite[1]) <= 200,
      `LIMIT fuera del rango permitido: ${limite[1]}`
    );
    assert.doesNotMatch(capturado.sql, /DROP TABLE/i);
  }
});

test('los mismos topes valen para los otros listados clínicos', async () => {
  for (const listar of [imagenes.listar, laboratorio.listar]) {
    const capturado = await consultaDe(() => listar({ limite: '10000' }));
    const limite = Number(capturado.sql.match(/LIMIT (\d+)/)[1]);
    assert.ok(limite <= 200, `un listado dejó pedir ${limite} filas`);
  }
});

test('un ? dentro de un texto no corre la numeración de los parámetros', () => {
  // Con la traducción mal hecha, un parámetro acabaría en la columna de al
  // lado: el nombre de una mascota guardado en el campo del microchip.
  assert.equal(
    traducirPlaceholders("UPDATE mascotas SET nombre = ?, notas = '¿seguro?' WHERE id = ?"),
    "UPDATE mascotas SET nombre = $1, notas = '¿seguro?' WHERE id = $2"
  );
});

/* ------------------------------------------------------------------
   JWT
   ------------------------------------------------------------------ */

test('el token se firma con el algoritmo declarado', () => {
  const cabecera = JSON.parse(
    Buffer.from(firmarToken({ sub: 1, rol: 'cliente' }).split('.')[0], 'base64url').toString()
  );
  assert.equal(cabecera.alg, ALGORITMO);
});

test('no se acepta un token sin firma', () => {
  // El ataque clásico: poner alg "none" y quitar la firma. Se arma a mano
  // porque jsonwebtoken no deja firmar así.
  const cuerpo = { sub: 1, rol: 'admin', iss: 'huellitas-api', exp: Math.floor(Date.now() / 1000) + 3600 };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const falso = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(cuerpo)}.`;

  assert.throws(() => verificarToken(falso), /jwt|algorithm|signature/i);
});

test('no se acepta un token de otro emisor aunque la firma cuadre', () => {
  // Se firma con el secreto real del entorno a propósito: si se usara otro,
  // fallaría por la firma y no se estaría probando la comprobación del emisor.
  const ajeno = jwt.sign({ sub: 1 }, require('../src/config/env').jwt.secret, {
    algorithm: 'HS256',
    issuer: 'otra-api',
    expiresIn: '1h',
  });

  assert.throws(() => verificarToken(ajeno), /issuer/i);
});

test('subir el rol dentro del token no cuela: la firma deja de cuadrar', () => {
  const token = firmarToken({ sub: 1, rol: 'cliente' });
  const [cabecera, cuerpo, firma] = token.split('.');

  const cargaFalsa = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), rol: 'admin' })
  ).toString('base64url');

  assert.throws(() => verificarToken(`${cabecera}.${cargaFalsa}.${firma}`), /signature/i);
});

test('cada token es distinto aunque se firmen en el mismo segundo', () => {
  // El jti es lo que evita que dos ingresos seguidos choquen contra el índice
  // único de sesiones, y de paso que dos sesiones compartan token.
  assert.notEqual(firmarToken({ sub: 1, rol: 'cliente' }), firmarToken({ sub: 1, rol: 'cliente' }));
});

/* ------------------------------------------------------------------
   Contraseña vencida y sesión inactiva

   La marca `debe_cambiar_password` existía en el esquema desde el principio y
   no se comprobaba en ninguna parte. Estas pruebas fijan las dos reglas que
   ahora la sostienen: qué rutas se dejan pasar y cuándo caduca una sesión por
   estar parada.
   ------------------------------------------------------------------ */

const { RUTAS_CON_PASSWORD_VENCIDA, RUTAS_SIN_MFA, llevaInactiva, MINUTOS_INACTIVIDAD } =
  require('../src/middleware/auth');

test('con la contraseña vencida solo se puede mirar el perfil, cambiarla y salir', () => {
  assert.deepEqual(
    [...RUTAS_CON_PASSWORD_VENCIDA].sort(),
    ['/api/auth/logout', '/api/auth/me', '/api/auth/password']
  );
});

test('ninguna ruta clínica ni administrativa está entre las permitidas', () => {
  for (const ruta of [
    '/api/historia/consultas',
    '/api/mascotas',
    '/api/usuarios',
    '/api/facturas',
    '/api/reportes/pdf/historia/1',
    '/api/seguridad/auditoria',
  ]) {
    assert.equal(RUTAS_CON_PASSWORD_VENCIDA.has(ruta), false, `${ruta} no debería pasar`);
  }
});

test('una sesión recién usada sigue viva y una parada se da por vencida', () => {
  const haceMinutos = (n) => {
    const d = new Date(Date.now() - n * 60 * 1000);
    const dosCifras = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())} ` +
           `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}:${dosCifras(d.getSeconds())}`;
  };

  assert.equal(llevaInactiva(haceMinutos(1)), false);
  assert.equal(llevaInactiva(haceMinutos(MINUTOS_INACTIVIDAD - 5)), false);
  assert.equal(llevaInactiva(haceMinutos(MINUTOS_INACTIVIDAD + 5)), true);
});

test('una sesión sin marca de actividad no se cierra por sorpresa', () => {
  // Una fila recién creada puede no tener ultima_vez todavía. Tratarla como
  // inactiva echaría fuera al usuario justo después de entrar.
  assert.equal(llevaInactiva(null), false);
  assert.equal(llevaInactiva('fecha que no se puede leer'), false);
});

test('sin segundo factor solo se puede configurarlo, además de lo de la contraseña', () => {
  assert.deepEqual(
    [...RUTAS_SIN_MFA].sort(),
    [
      '/api/auth/logout',
      '/api/auth/me',
      '/api/auth/mfa',
      '/api/auth/mfa/activar',
      '/api/auth/mfa/iniciar',
      '/api/auth/password',
    ]
  );
});

test('la verificación del código NO está entre las rutas con sesión', () => {
  // /auth/mfa/verificar es del ingreso, antes de que exista sesión. Si
  // apareciera aquí sería señal de que se puede llamar ya autenticado, que es
  // justo lo que no debe pasar.
  assert.equal(RUTAS_SIN_MFA.has('/api/auth/mfa/verificar'), false);
});

test('quitar el segundo factor no se puede hacer sin tenerlo puesto', () => {
  // Está fuera de la lista a propósito: quien todavía no lo configuró no tiene
  // nada que desactivar, y dejar pasar esa ruta sería una salida del bloqueo.
  assert.equal(RUTAS_SIN_MFA.has('/api/auth/mfa/desactivar'), false);
  assert.equal(RUTAS_SIN_MFA.has('/api/auth/mfa/codigos'), false);
});

/* ------------------------------------------------------------------
   Reautenticación en acciones críticas

   El permiso dice que el ROL puede hacerlo; la contraseña dice que quien
   está al teclado es el dueño de la cuenta. Sin esto, un equipo sin
   bloquear en recepción alcanza para crear otro administrador.
   ------------------------------------------------------------------ */

test('la reautenticación exige la contraseña correcta y no deja rastro en el cuerpo', async () => {
  const bcrypt = require('bcryptjs');
  // Cuatro rondas y no las diez de producción: aquí lo que se prueba es la
  // decisión del middleware, no el coste del hash, y con diez esta sola prueba
  // se llevaba medio minuto.
  const hash = bcrypt.hashSync('LaBuena123', 4);

  // passwordHashDe() la pide con esta consulta; lo demás no se toca.
  const originalUna = bd.consultarUna;
  const originalEjecutar = bd.ejecutar;
  bd.consultarUna = async (sql) => (/password_hash FROM usuarios/.test(sql) ? { password_hash: hash } : null);
  bd.ejecutar = async () => ({ affectedRows: 1 });

  // Los tres módulos se descargan antes de pedirlos. Cada uno toma las
  // funciones de la base al cargarse (`const { ejecutar } = require(...)`), así
  // que una copia vieja en caché se quedaría con las de verdad: usuario.model
  // preguntaría a Supabase por el hash —y la contraseña correcta fallaría— y
  // seguridad.model intentaría escribir el intento fallido, dejando el proceso
  // esperando media hora de tiempo de espera de conexión.
  const modulos = [
    '../src/models/usuario.model',
    '../src/models/seguridad.model',
    '../src/middleware/auth',
  ];
  for (const m of modulos) delete require.cache[require.resolve(m)];
  const { reautenticar } = require('../src/middleware/auth');

  const correr = (body) => new Promise((ok) => {
    const req = { usuario: { id: 1, email: 'admin@huellitas.com' }, body, get: () => null, ip: '::1', socket: {} };
    reautenticar(req, {}, (error) => ok({ error, cuerpo: req.body }));
  });

  try {
    assert.equal((await correr({})).error.status, 400, 'sin contraseña');
    assert.equal((await correr({ passwordActual: '' })).error.status, 400, 'contraseña vacía');
    assert.equal((await correr({ passwordActual: 'otra' })).error.status, 403, 'contraseña equivocada');

    // Un objeto en vez de un texto no puede colarse como "algo que no es vacío".
    assert.equal((await correr({ passwordActual: { $ne: null } })).error.status, 400, 'objeto en vez de texto');

    const bien = await correr({ passwordActual: 'LaBuena123', rol: 'admin' });
    assert.equal(bien.error, undefined, 'la contraseña correcta tiene que pasar');

    // No sigue hacia el controlador: si siguiera, podría acabar escrita en un
    // registro de auditoría junto con el resto del cuerpo.
    assert.deepEqual(bien.cuerpo, { rol: 'admin' });
  } finally {
    bd.consultarUna = originalUna;
    bd.ejecutar = originalEjecutar;
    // Se dejan descargados para que quien venga después los tome con las
    // funciones de verdad y no con las de esta prueba.
    for (const m of modulos) delete require.cache[require.resolve(m)];
  }
});

/* ------------------------------------------------------------------
   El registro público no fabrica administradores

   Antes bastaba con escribir el código ADM en el formulario abierto para
   nacer con acceso a usuarios, facturación e historias clínicas, sin que
   ningún administrador se enterara. El código es fijo y no caduca, así que
   filtrarse una vez —un reenvío, un papel en el mostrador— valía para
   siempre. Ahora esas cuentas solo salen del panel.
   ------------------------------------------------------------------ */

test('el registro público rechaza el rol de administración', async () => {
  const authService = require('../src/services/auth.service');

  const datos = {
    rol: 'admin',
    nombre: 'Quien lo intente',
    email: 'nuevo.admin@example.com',
    telefono: '3000000000',
    password: 'LoQueSea123',
    codigoAcceso: 'ADM-ABCD-EFGH-JKMN',
  };

  await assert.rejects(
    () => authService.registrar(datos),
    (error) => {
      assert.equal(error.status, 403);
      assert.match(error.message, /panel de usuarios/);
      return true;
    }
  );

  // Y el corte tiene que llegar ANTES de tocar la base: si la comprobación
  // estuviera después de buscar el correo o de leer el código, esta prueba
  // se quedaría esperando a Supabase en vez de fallar en el acto.
  await assert.rejects(() => authService.registrar({ ...datos, codigoAcceso: undefined }));
});

/* ------------------------------------------------------------------
   Aislamiento por sede

   La regla no es la misma para todo, y la diferencia es clínica: la
   historia sigue al paciente entre sedes —si llega de urgencia a otra, sus
   antecedentes tienen que estar—, mientras que las jaulas, las salas y los
   turnos son cosas físicas de un local concreto.
   ------------------------------------------------------------------ */

test('la administración ve todas las sedes y puede pedir una concreta', () => {
  const admin = { usuario: { id: 1, rol: 'admin', sede_id: 1 }, permisos: [] };

  assert.equal(alcanceSede(admin), null, 'sin pedir nada, las ve todas');
  assert.equal(alcanceSede(admin, 2), 2, 'puede mirar la sede que quiera');
});

test('el personal queda atado a su sede aunque pida otra', () => {
  // Es el caso que importa: mandar ?sedeId=1 desde la sede 2 no puede servir
  // para ver las urgencias de la otra ciudad.
  const vet = { usuario: { id: 5, rol: 'veterinario', sede_id: 2 }, permisos: [] };

  assert.equal(alcanceSede(vet), 2);
  assert.equal(alcanceSede(vet, 1), 2, 'la sede pedida se ignora');
});

test('quien gestiona sucursales sí puede mirar otras sedes', () => {
  const gerente = { usuario: { id: 9, rol: 'veterinario', sede_id: 2 }, permisos: ['sucursales.ver'] };

  assert.equal(alcanceSede(gerente, 1), 1);
  assert.equal(alcanceSede(gerente), null);
});

test('sin sede asignada no se filtra, y es una decisión, no un descuido', () => {
  // Bloquear a una cuenta de personal por un dato administrativo que falta
  // sería peor que el riesgo que evita: no podría abrir el tablero de
  // urgencias. Lo que se protege por sede es operativo, no clínico.
  const sinSede = { usuario: { id: 7, rol: 'veterinario', sede_id: null }, permisos: [] };

  assert.equal(alcanceSede(sinSede), null);
});

test('sin sesión no se decide alcance de sede', () => {
  assert.throws(() => alcanceSede({}), (e) => e.status === 401);
});

test('la política de MFA se lee de la configuración y no está vacía', () => {
  const { exigeMfa, ROLES_CON_MFA } = require('../src/utils/politicaMfa');

  assert.ok(ROLES_CON_MFA.length > 0, 'sin roles, el segundo factor no se le exige a nadie');
  assert.equal(exigeMfa('admin'), true, 'la administración siempre lo necesita');
  assert.equal(exigeMfa('cliente'), false, 'a un cliente no se le exige');
  assert.equal(exigeMfa('rol-que-no-existe'), false);
});

/* ------------------------------------------------------------------
   Nombre de archivo de los PDF
   ------------------------------------------------------------------ */

test('el nombre de una mascota no puede romper la cabecera de descarga', () => {
  assert.equal(nombreSeguro('historia-Luna.pdf'), 'historia-Luna.pdf');
  assert.equal(nombreSeguro('vacunacion-Ñoño.pdf'), 'vacunacion-Ñoño.pdf');

  for (const peligroso of ['a"; filename="otro', 'a\r\nX-Inyectada: 1', 'a\\b/c']) {
    const limpio = nombreSeguro(peligroso);
    assert.doesNotMatch(limpio, /["\r\n\\/]/, `quedó un carácter peligroso en "${limpio}"`);
  }

  assert.equal(nombreSeguro('"""'), 'documento', 'si no queda nada usable, un respaldo');
});
