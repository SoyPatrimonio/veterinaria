'use strict';

/**
 * Módulo de seguridad: permisos, sesiones, intentos de login, accesos,
 * auditoría y tokens de recuperación.
 *
 * Todo lo que tiene que ver con "quién puede hacer qué" y con dejar rastro
 * de lo que se hizo pasa por aquí.
 */

const crypto = require('crypto');
const { consultar, consultarUna, ejecutar } = require('../config/database');

/**
 * De los tokens solo se guarda el hash. Si alguien llegara a leer la tabla de
 * sesiones no podría suplantar a nadie, porque del hash no se vuelve al token.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Token aleatorio para recuperar la contraseña. */
function tokenAleatorio() {
  return crypto.randomBytes(32).toString('hex');
}

/* ------------------------------------------------------------------
   Datos de la petición
   ------------------------------------------------------------------ */

/** IP y navegador de quien hace la petición, recortados a lo que cabe. */
function datosPeticion(req) {
  if (!req) return { ip: null, agente: null };
  const ip = (req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '').slice(0, 45) || null;
  const agente = (req.get?.('user-agent') || '').slice(0, 255) || null;
  return { ip, agente };
}

/* ------------------------------------------------------------------
   Permisos
   ------------------------------------------------------------------ */

/** Códigos de permiso que tiene un rol. */
async function permisosDeRol(rolId) {
  const filas = await consultar(
    `SELECT p.codigo
       FROM rol_permisos rp
       JOIN permisos p ON p.id = rp.permiso_id
      WHERE rp.rol_id = ?
      ORDER BY p.codigo`,
    [rolId]
  );
  return filas.map((f) => f.codigo);
}

/** Catálogo completo, para la pantalla de roles del administrador. */
async function catalogoPermisos() {
  return consultar(
    `SELECT p.id, p.codigo, p.modulo, p.nombre, p.descripcion,
            COALESCE(ARRAY_AGG(rp.rol_id ORDER BY rp.rol_id)
                     FILTER (WHERE rp.rol_id IS NOT NULL), '{}') AS roles
       FROM permisos p
       LEFT JOIN rol_permisos rp ON rp.permiso_id = p.id
      GROUP BY p.id
      ORDER BY p.modulo, p.codigo`
  );
}

async function listarRoles() {
  return consultar(
    `SELECT r.id, r.nombre, r.descripcion, r.sistema,
            COUNT(DISTINCT rp.permiso_id)::int AS permisos,
            COUNT(DISTINCT u.id)::int          AS usuarios
       FROM roles r
       LEFT JOIN rol_permisos rp ON rp.rol_id = r.id
       LEFT JOIN usuarios u      ON u.rol_id = r.id
      GROUP BY r.id
      ORDER BY r.id`
  );
}

/* ------------------------------------------------------------------
   Sesiones
   ------------------------------------------------------------------ */

/**
 * Abre la sesión asociada a un token recién firmado y deja el registro de
 * entrada. Devuelve el id de la sesión.
 *
 * Las dos inserciones van en una sola sentencia con CTE: la fila de accesos
 * necesita el id que genera la de sesiones, y encadenarlas costaría dos viajes
 * a la base en mitad del login, que es donde más se nota la espera.
 */
async function abrirSesion({ usuarioId, token, expiraEn, ip, agente }) {
  const fila = await consultarUna(
    `WITH nueva AS (
       INSERT INTO sesiones (usuario_id, token_hash, ip, agente, expira_en)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, usuario_id
     ), entrada AS (
       INSERT INTO accesos (usuario_id, sesion_id, tipo, ip, agente)
       SELECT usuario_id, id, 'entrada', ?, ? FROM nueva
     )
     SELECT id FROM nueva`,
    [usuarioId, hashToken(token), ip, agente, expiraEn, ip, agente]
  );
  return fila ? fila.id : null;
}

/** Cierra la sesión de un token concreto. */
async function cerrarSesion(token, { motivo = 'logout', ip = null, agente = null } = {}) {
  const fila = await consultarUna(
    `UPDATE sesiones
        SET cerrada_en = LOCALTIMESTAMP, motivo_cierre = ?
      WHERE token_hash = ? AND cerrada_en IS NULL
      RETURNING id, usuario_id`,
    [motivo, hashToken(token)]
  );

  if (fila) {
    await registrarAcceso({
      usuarioId: fila.usuario_id,
      sesionId: fila.id,
      tipo: motivo === 'expiro' ? 'expiro' : 'salida',
      ip,
      agente,
    });
  }
  return Boolean(fila);
}

/** Cierra todas las sesiones abiertas de un usuario (cambio de contraseña, bloqueo…). */
async function cerrarSesionesDe(usuarioId, motivo = 'admin') {
  const resultado = await ejecutar(
    `UPDATE sesiones
        SET cerrada_en = LOCALTIMESTAMP, motivo_cierre = ?
      WHERE usuario_id = ? AND cerrada_en IS NULL`,
    [motivo, usuarioId]
  );
  return resultado.affectedRows;
}

/** Marca actividad en la sesión. No bloquea la petición si falla. */
function tocarSesion(sesionId) {
  ejecutar('UPDATE sesiones SET ultima_vez = LOCALTIMESTAMP WHERE id = ?', [sesionId])
    .catch((error) => console.error('[seguridad] no se pudo marcar la sesión:', error.message));
}

/** Sesiones abiertas, para el panel del administrador. */
async function sesionesAbiertas(limite = 50) {
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);
  return consultar(
    `SELECT s.id, s.usuario_id, s.ip, s.agente, s.creada_en, s.ultima_vez, s.expira_en,
            u.nombre, u.email, r.nombre AS rol
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       JOIN roles r    ON r.id = u.rol_id
      WHERE s.cerrada_en IS NULL AND s.expira_en > LOCALTIMESTAMP
      ORDER BY s.ultima_vez DESC
      LIMIT ${lim}`
  );
}

/* ------------------------------------------------------------------
   Intentos de login y bloqueo temporal
   ------------------------------------------------------------------ */

async function registrarIntento({ email, usuarioId = null, exito, motivo = null, ip = null, agente = null }) {
  await ejecutar(
    `INSERT INTO intentos_login (email, usuario_id, exito, motivo, ip, agente)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [String(email || '').slice(0, 160), usuarioId, exito ? 1 : 0, motivo, ip, agente]
  );
}

// El conteo de fallos seguidos de un correo no vive aquí sino dentro de
// usuarioModel.buscarPorEmailConFallos(), junto con la búsqueda del usuario:
// el login los necesita a la vez y así se resuelven en un solo viaje a la base.

/**
 * Cuántas veces se ha fallado el código de acceso desde esta IP.
 *
 * El código del personal es fijo y no caduca, así que es lo único de este
 * sistema que se puede ir adivinando con tiempo. El límite por IP del
 * middleware cuenta en la memoria del proceso, y en Vercel eso se reinicia
 * con cada arranque en frío; esto cuenta en la base, que es la que no se
 * enfría.
 */
async function fallosDeCodigoDesde(ip, minutos) {
  if (!ip) return 0;

  const fila = await consultarUna(
    `SELECT COUNT(*)::int AS fallos
       FROM intentos_login
      WHERE ip = ?
        AND motivo = 'codigo_acceso_invalido'
        AND creado_en > LOCALTIMESTAMP - (? || ' minutes')::interval`,
    [ip, String(minutos)]
  );

  return fila ? fila.fallos : 0;
}

/**
 * Cuántos ingresos ha fallado esta IP, sumando todas las cuentas.
 *
 * El bloqueo que ya existe cuenta por correo, y por eso no ve el ataque que
 * prueba UNA contraseña contra MUCHAS cuentas: cada correo suma un fallo
 * suelto y ninguno llega nunca a su tope. Este cuenta al revés, por origen, y
 * en la base y no en la memoria del proceso, que en Vercel se reinicia con
 * cada arranque en frío.
 *
 * Solo cuentan los dos motivos que significan "credenciales equivocadas".
 * Quedan fuera a propósito los rechazos del propio bloqueo: si contaran, cada
 * golpe contra la puerta cerrada alargaría la espera y no terminaría nunca.
 * Y queda fuera 'mfa_pendiente', que se guarda con exito = 0 pero es un
 * ingreso al que la contraseña ya le salió bien.
 */
async function fallosDeLoginDesde(ip, minutos) {
  if (!ip) return 0;

  const fila = await consultarUna(
    `SELECT COUNT(*)::int AS fallos
       FROM intentos_login
      WHERE ip = ?
        AND exito = 0
        AND motivo IN ('correo_no_existe', 'password_incorrecta')
        AND creado_en > LOCALTIMESTAMP - (? || ' minutes')::interval`,
    [ip, String(minutos)]
  );

  return fila ? fila.fallos : 0;
}

async function intentosRecientes(limite = 50) {
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);
  return consultar(
    `SELECT id, email, usuario_id, exito, motivo, ip, creado_en
       FROM intentos_login
      ORDER BY creado_en DESC
      LIMIT ${lim}`
  );
}

/* ------------------------------------------------------------------
   Accesos
   ------------------------------------------------------------------ */

async function registrarAcceso({ usuarioId, sesionId = null, tipo, ip = null, agente = null }) {
  await ejecutar(
    'INSERT INTO accesos (usuario_id, sesion_id, tipo, ip, agente) VALUES (?, ?, ?, ?, ?)',
    [usuarioId, sesionId, tipo, ip, agente]
  );
}

async function accesosRecientes(limite = 50) {
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);
  return consultar(
    `SELECT a.id, a.tipo, a.ip, a.creado_en, u.nombre, u.email, r.nombre AS rol
       FROM accesos a
       JOIN usuarios u ON u.id = a.usuario_id
       JOIN roles r    ON r.id = u.rol_id
      ORDER BY a.creado_en DESC
      LIMIT ${lim}`
  );
}

/* ------------------------------------------------------------------
   Auditoría
   ------------------------------------------------------------------ */

/**
 * Deja constancia de un cambio. Nunca hace fallar la petición: si la auditoría
 * no se puede escribir se registra en consola, pero la operación de negocio ya
 * ocurrió y no tiene sentido deshacerla por esto.
 */
async function auditar({
  usuarioId = null, modulo, tabla, registroId = null, accion,
  descripcion = null, antes = null, despues = null, ip = null,
}) {
  try {
    await ejecutar(
      `INSERT INTO auditoria
         (usuario_id, modulo, tabla, registro_id, accion, descripcion, datos_antes, datos_despues, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuarioId, modulo, tabla,
        registroId === null || registroId === undefined ? null : String(registroId),
        accion, descripcion,
        antes ? JSON.stringify(antes) : null,
        despues ? JSON.stringify(despues) : null,
        ip,
      ]
    );
  } catch (error) {
    console.error('[auditoria] no se pudo registrar:', error.message);
  }
}

async function listarAuditoria({ modulo = null, usuarioId = null, limite = 100 }) {
  const condiciones = [];
  const params = [];
  if (modulo) { condiciones.push('a.modulo = ?'); params.push(modulo); }
  if (usuarioId) { condiciones.push('a.usuario_id = ?'); params.push(usuarioId); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT a.id, a.modulo, a.tabla, a.registro_id, a.accion, a.descripcion,
            a.datos_antes, a.datos_despues, a.ip, a.creado_en,
            u.nombre AS usuario_nombre, u.email AS usuario_email
       FROM auditoria a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       ${where}
      ORDER BY a.creado_en DESC
      LIMIT ${lim}`,
    params
  );
}

/* ------------------------------------------------------------------
   Recuperación de contraseña
   ------------------------------------------------------------------ */

/**
 * Cuántos enlaces de recuperación se pidieron para esa cuenta en los últimos
 * minutos.
 *
 * El límite por IP de express-rate-limit no alcanza aquí: en Vercel cada
 * instancia de la función tiene su propio contador en memoria, así que con
 * varias instancias en marcha el tope real es un múltiplo del configurado, y
 * al enfriarse la función vuelve a cero. Este contador vive en la base, que es
 * la misma para todas las instancias.
 */
async function solicitudesRecuperacionRecientes(usuarioId, minutos = 15) {
  const fila = await consultarUna(
    `SELECT COUNT(*)::int AS total
       FROM tokens_recuperacion
      WHERE usuario_id = ?
        AND creado_en > LOCALTIMESTAMP - (? || ' minutes')::interval`,
    [usuarioId, String(minutos)]
  );
  return fila ? fila.total : 0;
}

async function crearTokenRecuperacion(usuarioId, minutosValidez = 30, ip = null) {
  const token = tokenAleatorio();
  await ejecutar(
    `INSERT INTO tokens_recuperacion (usuario_id, token_hash, ip, expira_en)
     VALUES (?, ?, ?, LOCALTIMESTAMP + (? || ' minutes')::interval)`,
    [usuarioId, hashToken(token), ip, String(minutosValidez)]
  );
  return token;
}

/** Devuelve la fila del token si sigue siendo válido (sin usar y sin caducar). */
async function tokenRecuperacionVigente(token) {
  return consultarUna(
    `SELECT t.id, t.usuario_id
       FROM tokens_recuperacion t
      WHERE t.token_hash = ?
        AND t.usado_en IS NULL
        AND t.expira_en > LOCALTIMESTAMP`,
    [hashToken(token)]
  );
}

async function marcarTokenUsado(id) {
  await ejecutar('UPDATE tokens_recuperacion SET usado_en = LOCALTIMESTAMP WHERE id = ?', [id]);
}

module.exports = {
  hashToken,
  tokenAleatorio,
  datosPeticion,
  permisosDeRol,
  catalogoPermisos,
  listarRoles,
  abrirSesion,
  cerrarSesion,
  cerrarSesionesDe,
  tocarSesion,
  sesionesAbiertas,
  registrarIntento,
  fallosDeCodigoDesde,
  fallosDeLoginDesde,
  intentosRecientes,
  registrarAcceso,
  accesosRecientes,
  auditar,
  listarAuditoria,
  solicitudesRecuperacionRecientes,
  crearTokenRecuperacion,
  tokenRecuperacionVigente,
  marcarTokenUsado,
};
