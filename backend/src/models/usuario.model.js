'use strict';

const { consultar, consultarUna, ejecutar } = require('../config/database');

const CAMPOS_PUBLICOS = `
  u.id, u.nombre, u.email, u.telefono, u.estado, u.creado_en, u.ultimo_acceso,
  r.nombre AS rol`;

async function buscarPorEmail(email) {
  return consultarUna(
    `SELECT u.id, u.nombre, u.email, u.telefono, u.password_hash, u.estado, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.email = ?`,
    [email]
  );
}

/**
 * Igual que buscarPorEmail, pero además cuenta los fallos de login seguidos de
 * ese correo. Va en una sola consulta porque el login es la única petición que
 * un visitante hace antes de tener nada en pantalla: cada viaje a Supabase que
 * se ahorra ahí se nota.
 *
 * El LEFT JOIN sobre una fila fija devuelve siempre exactamente un registro,
 * también cuando el correo no existe, así que el contador de fallos llega
 * igual y el bloqueo por intentos funciona contra correos inventados.
 */
async function buscarPorEmailConFallos(email, minutosVentana) {
  return consultarUna(
    `SELECT u.id, u.nombre, u.email, u.telefono, u.password_hash, u.estado,
            r.nombre AS rol,
            (SELECT COUNT(*)::int
               FROM intentos_login i
              WHERE i.email = ?
                AND i.exito = 0
                -- Dos motivos no cuentan como fallo de contraseña:
                --   'mfa_pendiente': la contraseña fue correcta y solo falta el
                --     segundo factor. Contarlo bloqueaba la cuenta a los cinco
                --     ingresos BUENOS de quien tiene el segundo factor.
                --   'codigo_acceso_invalido': pasó en el registro, cuando esta
                --     cuenta ni existía. Contarlo dejaría al veterinario que se
                --     equivocó de código sin poder entrar después, y frenar el
                --     tanteo del código por correo no serviría de nada: quien
                --     lo prueba a ciegas cambia de correo en cada intento. Ese
                --     freno va por IP, en seguridad.fallosDeCodigoDesde().
                -- El paréntesis con IS NULL es necesario: con NOT IN a secas,
                -- un motivo nulo daría NULL y la fila dejaría de contarse.
                AND (i.motivo IS NULL
                     OR i.motivo NOT IN ('mfa_pendiente', 'codigo_acceso_invalido'))
                AND i.creado_en > LOCALTIMESTAMP - (? || ' minutes')::interval
                AND i.creado_en > COALESCE(
                      (SELECT MAX(creado_en) FROM intentos_login
                        WHERE email = ? AND exito = 1),
                      '-infinity'::timestamp)) AS fallos
       FROM (SELECT 1) AS fila
       LEFT JOIN usuarios u ON u.email = ?
       LEFT JOIN roles r    ON r.id = u.rol_id`,
    [email, String(minutosVentana), email, email]
  );
}

async function buscarPorId(id) {
  return consultarUna(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = ?`,
    [id]
  );
}

async function idRol(nombreRol) {
  const fila = await consultarUna('SELECT id FROM roles WHERE nombre = ?', [nombreRol]);
  return fila ? fila.id : null;
}

/**
 * Crea el usuario. Recibe una conexión opcional para participar en una
 * transacción junto con la fila de clientes o veterinarios.
 */
async function crear({ rolId, nombre, email, telefono, passwordHash, debeCambiarPassword = false }, conexion = null) {
  const sql = `INSERT INTO usuarios (rol_id, nombre, email, telefono, password_hash, debe_cambiar_password)
               VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id`;
  const params = [rolId, nombre, email, telefono || null, passwordHash, debeCambiarPassword ? 1 : 0];
  if (conexion) {
    const [resultado] = await conexion.execute(sql, params);
    return resultado.insertId;
  }
  const resultado = await ejecutar(sql, params);
  return resultado.insertId;
}

// actualizarUltimoAcceso() se eliminó: el login ya marca `ultimo_acceso` en la
// misma consulta que arma el perfil (auth.service.sesionPara), así que esta
// función quedó sin usarse y solo invitaba a volver a hacer ese viaje extra.

/**
 * Recibe una conexión opcional para participar en una transacción junto con la
 * fila de clientes, igual que crear().
 */
async function actualizarPerfil(id, { nombre, telefono }, conexion = null) {
  const sql = 'UPDATE usuarios SET nombre = ?, telefono = ? WHERE id = ?';
  const params = [nombre, telefono || null, id];
  if (conexion) {
    await conexion.execute(sql, params);
    return;
  }
  await ejecutar(sql, params);
}

/**
 * Guarda la contraseña nueva y levanta la marca de cambio obligatorio.
 *
 * Van juntos a propósito: si el borrado de la marca quedara en otra llamada,
 * un fallo entre las dos dejaría al usuario con la contraseña ya cambiada y
 * todavía encerrado en la pantalla de cambio, sin forma de salir.
 */
async function actualizarPassword(id, passwordHash) {
  await ejecutar(
    'UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?',
    [passwordHash, id]
  );
}

/** Obliga a esa cuenta a cambiar la contraseña en su próxima entrada. */
async function exigirCambioPassword(id) {
  const resultado = await ejecutar(
    'UPDATE usuarios SET debe_cambiar_password = 1 WHERE id = ?',
    [id]
  );
  return resultado.affectedRows > 0;
}

async function passwordHashDe(id) {
  const fila = await consultarUna('SELECT password_hash FROM usuarios WHERE id = ?', [id]);
  return fila ? fila.password_hash : null;
}

/** Listado para el panel de administración, con filtros opcionales. */
async function listar({ rol = null, estado = null, busqueda = null, limite = 50, desplazamiento = 0 }) {
  const condiciones = [];
  const params = [];

  if (rol) { condiciones.push('r.nombre = ?'); params.push(rol); }
  if (estado) { condiciones.push('u.estado = ?'); params.push(estado); }
  if (busqueda) {
    // ILIKE: en MySQL la comparación era insensible a mayúsculas por la
    // collation; en PostgreSQL hay que pedirlo explícitamente.
    condiciones.push('(u.nombre ILIKE ? OR u.email ILIKE ? OR u.telefono ILIKE ?)');
    const patron = `%${busqueda}%`;
    params.push(patron, patron, patron);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  // LIMIT/OFFSET no admiten placeholders en sentencias preparadas, así que se
  // interpolan ya convertidos a entero (nunca llegan directo del usuario).
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);
  const off = Math.max(Number.parseInt(desplazamiento, 10) || 0, 0);

  const filas = await consultar(
    `SELECT ${CAMPOS_PUBLICOS}, c.id AS cliente_id, v.id AS veterinario_id
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN clientes c     ON c.usuario_id = u.id
       LEFT JOIN veterinarios v ON v.usuario_id = u.id
       ${where}
      ORDER BY u.creado_en DESC
      LIMIT ${lim} OFFSET ${off}`,
    params
  );

  const total = await consultarUna(
    `SELECT COUNT(*) AS total FROM usuarios u JOIN roles r ON r.id = u.rol_id ${where}`,
    params
  );

  return { filas, total: total ? total.total : 0 };
}

async function cambiarEstado(id, estado) {
  const resultado = await ejecutar('UPDATE usuarios SET estado = ? WHERE id = ?', [estado, id]);
  return resultado.affectedRows > 0;
}

async function cambiarRol(id, rolId) {
  const resultado = await ejecutar('UPDATE usuarios SET rol_id = ? WHERE id = ?', [rolId, id]);
  return resultado.affectedRows > 0;
}

module.exports = {
  buscarPorEmail,
  buscarPorEmailConFallos,
  buscarPorId,
  idRol,
  crear,
  actualizarPerfil,
  actualizarPassword,
  exigirCambioPassword,
  passwordHashDe,
  listar,
  cambiarEstado,
  cambiarRol,
};
