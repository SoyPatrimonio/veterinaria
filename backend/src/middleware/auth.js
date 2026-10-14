'use strict';

const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const usuarioModel = require('../models/usuario.model');
const { verificarToken, esErrorDeToken } = require('../utils/jwt');
const { debeConfigurarApp } = require('../utils/politicaMfa');
const { consultarUna } = require('../config/database');
const seguridad = require('../models/seguridad.model');

function extraerToken(req) {
  const cabecera = req.get('authorization') || '';
  if (cabecera.startsWith('Bearer ')) return cabecera.slice(7).trim();
  return null;
}

/**
 * Lo único que puede hacer una sesión obligada a cambiar la contraseña.
 *
 * Se deja pasar el perfil (el frontend necesita saber quién es para pintar la
 * pantalla), el cambio en sí y la salida. Todo lo demás se corta: si no, la
 * marca sería un aviso y no un control, y una contraseña conocida seguiría
 * dando acceso a las historias clínicas mientras el usuario ignora el cartel.
 */
const RUTAS_CON_PASSWORD_VENCIDA = new Set(['/api/auth/me', '/api/auth/password', '/api/auth/logout']);

/**
 * Lo único que puede hacer una sesión a la que le falta el segundo factor.
 *
 * A las anteriores se suman las de configurarlo. Que un rol lo exija y la
 * cuenta no lo tenga no puede quedarse en un aviso: si la sesión sigue
 * abriendo el panel, la exigencia no existe.
 */
const RUTAS_SIN_MFA = new Set([
  ...RUTAS_CON_PASSWORD_VENCIDA,
  '/api/auth/mfa',
  '/api/auth/mfa/iniciar',
  '/api/auth/mfa/activar',
]);

/**
 * Ruta completa de la petición.
 *
 * `req.path` viene recortado por el router donde corre el middleware —dentro
 * de /api/auth vale '/me'—, así que comparar contra él dejaría pasar cualquier
 * '/me' de otro módulo. Con baseUrl delante la comparación es la de verdad.
 */
function rutaCompleta(req) {
  return `${req.baseUrl || ''}${req.path || ''}`;
}

/**
 * Cuánto puede estar una sesión sin usarse antes de darla por abandonada.
 *
 * Es distinto del vencimiento del token: ocho horas de vida no deberían
 * significar ocho horas de sesión abierta en el computador del mostrador
 * después de que alguien se fue a almorzar.
 */
const MINUTOS_INACTIVIDAD = Number(process.env.SESION_INACTIVIDAD_MIN || 60);

/** ¿La sesión lleva demasiado tiempo sin actividad? */
function llevaInactiva(ultimaVez) {
  if (!ultimaVez) return false;
  const desde = new Date(String(ultimaVez).replace(' ', 'T'));
  if (Number.isNaN(desde.getTime())) return false;
  return Date.now() - desde.getTime() > MINUTOS_INACTIVIDAD * 60 * 1000;
}

/**
 * Carga en una sola consulta el usuario, su sesión y los permisos de su rol.
 *
 * Se lee de la base en cada petición en vez de confiar solo en el token: así
 * un usuario desactivado, con el rol cambiado o al que le revocaron un permiso
 * lo nota de inmediato, sin esperar a que expire el JWT.
 */
async function cargarContexto(usuarioId, tokenHash) {
  return consultarUna(
    `SELECT u.id, u.nombre, u.email, u.telefono, u.estado, u.sede_id,
            u.debe_cambiar_password,
            r.id AS rol_id, r.nombre AS rol,
            c.id AS cliente_id,
            v.id AS veterinario_id,
            COALESCE(mf.activo, 0) AS mfa_activo,
            s.id AS sesion_id, s.cerrada_en, s.expira_en, s.ultima_vez,
            COALESCE(
              ARRAY(SELECT p.codigo
                      FROM rol_permisos rp
                      JOIN permisos p ON p.id = rp.permiso_id
                     WHERE rp.rol_id = u.rol_id),
              '{}') AS permisos
       FROM usuarios u
       JOIN roles r             ON r.id = u.rol_id
       LEFT JOIN clientes c     ON c.usuario_id = u.id
       LEFT JOIN veterinarios v ON v.usuario_id = u.id
       LEFT JOIN mfa mf         ON mf.usuario_id = u.id
       LEFT JOIN sesiones s     ON s.token_hash = ? AND s.usuario_id = u.id
      WHERE u.id = ?`,
    [tokenHash, usuarioId]
  );
}

/** Exige sesión válida. */
const requiereAuth = asyncHandler(async (req, res, next) => {
  const token = extraerToken(req);
  if (!token) throw ApiError.noAutorizado();

  let payload;
  try {
    payload = verificarToken(token);
  } catch (error) {
    // Solo se traduce a 401 lo que viene del token. Un fallo de otro tipo
    // —por ejemplo un JWT_SECRET mal configurado— se deja subir: contestar
    // "sesión inválida" a una avería del servidor manda a buscar el problema
    // al lado equivocado.
    if (!esErrorDeToken(error)) throw error;
    throw ApiError.noAutorizado(
      error.name === 'TokenExpiredError'
        ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
        : 'Sesión inválida.'
    );
  }

  const contexto = await cargarContexto(payload.sub, seguridad.hashToken(token));
  if (!contexto) throw ApiError.noAutorizado('La cuenta ya no existe.');

  // Se responde 401 y no 403 a propósito: la sesión deja de ser válida, y el
  // frontend ya sabe que ante un 401 tiene que borrar el token y volver al
  // login. Con un 403 se quedaría en la página mostrando un error suelto.
  if (contexto.estado !== 'activo') {
    throw ApiError.noAutorizado(
      contexto.estado === 'bloqueado'
        ? 'Tu cuenta está bloqueada. Comunícate con la clínica.'
        : 'Tu cuenta está desactivada. Comunícate con la clínica.'
    );
  }

  // La sesión tiene que seguir abierta en la tabla: así "cerrar sesión" y el
  // cierre forzado desde el panel invalidan el token de verdad, aunque el JWT
  // todavía no haya caducado.
  if (!contexto.sesion_id) throw ApiError.noAutorizado('Tu sesión ya no está activa. Vuelve a iniciar sesión.');
  if (contexto.cerrada_en) throw ApiError.noAutorizado('Esta sesión fue cerrada. Vuelve a iniciar sesión.');

  // Inactividad: se cierra en la base, no solo se rechaza la petición. Si solo
  // se rechazara, la fila seguiría abierta en el panel de sesiones y el mismo
  // token volvería a servir en cuanto se tocara otra vez.
  if (llevaInactiva(contexto.ultima_vez)) {
    await seguridad.cerrarSesion(token, { motivo: 'inactividad' });
    throw ApiError.noAutorizado('Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.');
  }

  req.usuario = contexto;
  req.permisos = contexto.permisos || [];
  req.sesionId = contexto.sesion_id;
  req.token = token;

  // Contraseña vencida: la sesión existe, pero no sirve para nada más que
  // cambiarla. Va después de fijar req.usuario para que el propio /auth/me
  // pueda contestar quién es.
  const ruta = rutaCompleta(req);

  if (contexto.debe_cambiar_password === 1 && !RUTAS_CON_PASSWORD_VENCIDA.has(ruta)) {
    throw ApiError.prohibido('Tienes que cambiar tu contraseña antes de seguir usando el sistema.');
  }

  // Segundo factor pendiente: mismo trato. Se comprueba después de la
  // contraseña porque si las dos cosas faltan, primero se arregla la
  // contraseña —el código se configura una sola vez y conviene hacerlo con la
  // definitiva ya puesta—.
  //
  // Esto solo salta cuando NO hay correo saliente. Con la cuenta de correo
  // configurada, el código de seis cifras se manda en cada ingreso y el
  // segundo factor ya quedó comprobado antes de existir esta sesión: no hay
  // nada que configurar, y seguir pidiéndolo dejaría el panel cerrado para
  // quien acaba de entrar con el código del correo.
  if (debeConfigurarApp(contexto.rol, contexto.mfa_activo) && !RUTAS_SIN_MFA.has(ruta)) {
    throw ApiError.prohibido(
      'Tu rol necesita un segundo factor de autenticación. Configúralo para seguir usando el sistema.',
      'mfa_requerido'
    );
  }

  seguridad.tocarSesion(contexto.sesion_id);
  next();
});

/**
 * Vuelve a pedir la contraseña antes de una acción crítica.
 *
 * La sesión ya está abierta y el permiso ya se comprobó; esto es otra cosa:
 * demostrar que quien está al teclado es el dueño de la cuenta y no alguien
 * que se encontró el computador de recepción sin bloquear. Es lo que separa
 * "tener acceso" de "poder desmontar el sistema en dos clics".
 *
 * Se pone DESPUÉS del permiso —para no responder distinto según cuál de las
 * dos cosas falle— y ANTES de `validar`: zod descarta las claves que no
 * declara, así que si corriera después encontraría el campo ya borrado.
 *
 * El campo se llama `passwordActual` y no `password` porque en el alta de
 * usuarios `password` ya es la del usuario nuevo, y dos cosas distintas con el
 * mismo nombre en el mismo cuerpo terminan mal.
 *
 * El fallo se registra: alguien probando contraseñas contra esta puerta, ya
 * dentro de una sesión ajena, es exactamente el movimiento que hay que ver.
 */
const reautenticar = asyncHandler(async (req, res, next) => {
  const password = req.body ? req.body.passwordActual : null;
  if (!password || typeof password !== 'string') {
    throw ApiError.badRequest('Escribe tu contraseña para confirmar esta acción.');
  }

  const hash = await usuarioModel.passwordHashDe(req.usuario.id);
  if (!hash || !(await bcrypt.compare(String(password), hash))) {
    const { ip, agente } = seguridad.datosPeticion(req);
    await seguridad.registrarIntento({
      email: req.usuario.email,
      usuarioId: req.usuario.id,
      exito: false,
      motivo: 'reautenticacion_fallida',
      ip,
      agente,
    });
    throw ApiError.prohibido('La contraseña no es correcta.');
  }

  // El campo no sigue hacia el controlador: nada más abajo tiene que verlo, y
  // así no puede acabar en un registro de auditoría por descuido.
  delete req.body.passwordActual;
  next();
});

/** Adjunta el usuario si hay token, pero no falla si no lo hay. */
const authOpcional = asyncHandler(async (req, res, next) => {
  const token = extraerToken(req);
  if (!token) return next();

  // Un token vencido o manipulado sí es un caso normal aquí: se sigue como
  // visitante. Cualquier otro fallo (la base caída, por ejemplo) se deja subir
  // al manejador de errores; taparlo haría pasar una avería por "sin sesión".
  let payload;
  try {
    payload = verificarToken(token);
  } catch (error) {
    if (!esErrorDeToken(error)) throw error;
    return next();
  }

  const contexto = await cargarContexto(payload.sub, seguridad.hashToken(token));
  if (contexto && contexto.estado === 'activo' && contexto.sesion_id && !contexto.cerrada_en) {
    req.usuario = contexto;
    req.permisos = contexto.permisos || [];
    req.sesionId = contexto.sesion_id;
    req.token = token;
  }
  next();
});

module.exports = {
  requiereAuth,
  authOpcional,
  reautenticar,
  // Se exportan para poder probar las reglas sin levantar el servidor.
  RUTAS_CON_PASSWORD_VENCIDA,
  RUTAS_SIN_MFA,
  MINUTOS_INACTIVIDAD,
  llevaInactiva,
};
