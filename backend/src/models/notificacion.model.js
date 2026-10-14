'use strict';

const { consultar, consultarUna, ejecutar } = require('../config/database');

/**
 * Notificaciones dentro del sistema y recordatorios programados.
 *
 * El canal 'sistema' es el único que se entrega de verdad: las notificaciones
 * se leen en la propia aplicación. Los demás canales (email, sms, whatsapp)
 * quedan registrados para cuando se conecte un proveedor de envío; hasta
 * entonces se guardan igual, que es lo que permite auditarlas después.
 */

async function listar(usuarioId, { soloNoLeidas = false, limite = 50 } = {}) {
  const filtro = soloNoLeidas ? 'AND leida = 0' : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 100);

  return consultar(
    `SELECT id, tipo, titulo, mensaje, enlace, canal, leida, leida_en, creado_en
       FROM notificaciones
      WHERE usuario_id = ? ${filtro}
      ORDER BY leida, creado_en DESC
      LIMIT ${lim}`,
    [usuarioId]
  );
}

async function contarNoLeidas(usuarioId) {
  const fila = await consultarUna(
    'SELECT COUNT(*) AS total FROM notificaciones WHERE usuario_id = ? AND leida = 0',
    [usuarioId]
  );
  return Number(fila?.total || 0);
}

async function crear(datos) {
  const resultado = await ejecutar(
    `INSERT INTO notificaciones (usuario_id, plantilla_id, tipo, titulo, mensaje, enlace, canal)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.usuarioId,
      datos.plantillaId ?? null,
      datos.tipo || 'aviso',
      datos.titulo,
      datos.mensaje ?? null,
      datos.enlace ?? null,
      datos.canal || 'sistema',
    ]
  );
  return resultado.insertId;
}

/**
 * Avisa a todas las cuentas activas de un rol con un solo INSERT … SELECT.
 * Traer los usuarios y recorrerlos serían tantas idas a la base como personas
 * tenga el rol, y esto se llama desde acciones que ya son lentas de por sí.
 */
async function crearParaRol(rol, datos) {
  const resultado = await ejecutar(
    `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, enlace, canal)
     SELECT u.id, ?, ?, ?, ?, ?
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
      WHERE r.nombre = ? AND u.estado = 'activo'`,
    [datos.tipo || 'aviso', datos.titulo, datos.mensaje ?? null, datos.enlace ?? null, datos.canal || 'sistema', rol]
  );
  return resultado.affectedRows;
}

async function marcarLeida(id, usuarioId) {
  const resultado = await ejecutar(
    `UPDATE notificaciones
        SET leida = 1, leida_en = LOCALTIMESTAMP
      WHERE id = ? AND usuario_id = ? AND leida = 0`,
    [id, usuarioId]
  );
  return resultado.affectedRows > 0;
}

async function marcarTodasLeidas(usuarioId) {
  const resultado = await ejecutar(
    `UPDATE notificaciones
        SET leida = 1, leida_en = LOCALTIMESTAMP
      WHERE usuario_id = ? AND leida = 0`,
    [usuarioId]
  );
  return resultado.affectedRows;
}

async function eliminar(id, usuarioId) {
  const resultado = await ejecutar(
    'DELETE FROM notificaciones WHERE id = ? AND usuario_id = ?',
    [id, usuarioId]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Plantillas
   ------------------------------------------------------------------ */

async function plantillaPorCodigo(codigo, canal = 'sistema') {
  return consultarUna(
    'SELECT * FROM plantillas_notificaciones WHERE codigo = ? AND canal = ? AND activo = 1',
    [codigo, canal]
  );
}

async function listarPlantillas() {
  return consultar('SELECT * FROM plantillas_notificaciones ORDER BY codigo, canal');
}

/* ------------------------------------------------------------------
   Recordatorios
   ------------------------------------------------------------------ */

async function listarRecordatorios({ usuarioId = null, estado = null, limite = 100 } = {}) {
  const condiciones = [];
  const params = [];

  if (usuarioId) { condiciones.push('r.usuario_id = ?'); params.push(usuarioId); }
  if (estado) { condiciones.push('r.estado = ?'); params.push(estado); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 200);

  return consultar(
    `SELECT r.*, u.nombre AS usuario_nombre, m.nombre AS mascota_nombre
       FROM recordatorios r
       JOIN usuarios u       ON u.id = r.usuario_id
       LEFT JOIN mascotas m  ON m.id = r.mascota_id
       ${where}
      ORDER BY r.programado_en
      LIMIT ${lim}`,
    params
  );
}

async function crearRecordatorio(datos) {
  const resultado = await ejecutar(
    `INSERT INTO recordatorios (usuario_id, mascota_id, cita_id, aplicacion_id, tipo, canal, programado_en, mensaje)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.usuarioId,
      datos.mascotaId ?? null,
      datos.citaId ?? null,
      datos.aplicacionId ?? null,
      datos.tipo,
      datos.canal || 'sistema',
      datos.programadoEn,
      datos.mensaje ?? null,
    ]
  );
  return resultado.insertId;
}

async function recordatorioPorId(id) {
  return consultarUna('SELECT * FROM recordatorios WHERE id = ?', [id]);
}

async function cancelarRecordatorio(id) {
  const resultado = await ejecutar(
    `UPDATE recordatorios SET estado = 'cancelado' WHERE id = ? AND estado = 'pendiente'`,
    [id]
  );
  return resultado.affectedRows > 0;
}

/** Recordatorios cuya hora ya pasó y siguen sin enviar. */
async function pendientesVencidos(limite = 100) {
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 500);
  return consultar(
    `SELECT r.*, m.nombre AS mascota_nombre
       FROM recordatorios r
       LEFT JOIN mascotas m ON m.id = r.mascota_id
      WHERE r.estado = 'pendiente' AND r.programado_en <= LOCALTIMESTAMP
      ORDER BY r.programado_en
      LIMIT ${lim}`
  );
}

async function marcarEnviado(id) {
  await ejecutar(
    `UPDATE recordatorios SET estado = 'enviado', enviado_en = LOCALTIMESTAMP WHERE id = ?`,
    [id]
  );
}

module.exports = {
  listar,
  contarNoLeidas,
  crear,
  crearParaRol,
  marcarLeida,
  marcarTodasLeidas,
  eliminar,
  plantillaPorCodigo,
  listarPlantillas,
  listarRecordatorios,
  crearRecordatorio,
  recordatorioPorId,
  cancelarRecordatorio,
  pendientesVencidos,
  marcarEnviado,
};
