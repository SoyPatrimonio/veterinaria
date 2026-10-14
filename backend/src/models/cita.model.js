'use strict';

const { consultar, consultarUna, enTransaccion } = require('../config/database');

/** Citas de un veterinario en un día, sin las que ya no ocupan agenda. */
async function ocupadasDelDia(veterinarioId, fechaISO) {
  return consultar(
    `SELECT id, inicio, fin, estado
       FROM citas
      WHERE veterinario_id = ?
        AND inicio::date = ?::date
        AND estado NOT IN ('cancelada','no_asistio')
      ORDER BY inicio`,
    [veterinarioId, fechaISO]
  );
}

/**
 * Igual que la anterior pero bloqueando las filas dentro de una transacción:
 * dos clientes que pidan el mismo horario a la vez se serializan aquí.
 */
async function ocupadasDelDiaBloqueando(conexion, veterinarioId, fechaISO) {
  const filas = await conexion.consultar(
    `SELECT id, inicio, fin
       FROM citas
      WHERE veterinario_id = ?
        AND inicio::date = ?::date
        AND estado NOT IN ('cancelada','no_asistio')
      FOR UPDATE`,
    [veterinarioId, fechaISO]
  );
  return filas;
}

async function crear(conexion, datos) {
  const [resultado] = await conexion.execute(
    `INSERT INTO citas (cliente_id, mascota_id, veterinario_id, servicio_id,
                        inicio, fin, motivo, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.clienteId,
      datos.mascotaId,
      datos.veterinarioId,
      datos.servicioId,
      datos.inicio,
      datos.fin,
      datos.motivo ?? null,
      datos.creadoPor ?? null,
    ]
  );
  return resultado.insertId;
}

async function buscarPorId(id) {
  return consultarUna('SELECT * FROM v_citas_detalle WHERE id = ?', [id]);
}

/** Listado flexible usado por los tres paneles. */
async function listar({ clienteId, veterinarioId, mascotaId, estado, desde, hasta, limite = 100 }) {
  const condiciones = [];
  const params = [];

  if (clienteId) { condiciones.push('cliente_id = ?'); params.push(clienteId); }
  if (veterinarioId) { condiciones.push('veterinario_id = ?'); params.push(veterinarioId); }
  if (mascotaId) { condiciones.push('mascota_id = ?'); params.push(mascotaId); }
  if (estado) { condiciones.push('estado = ?'); params.push(estado); }
  if (desde) { condiciones.push('inicio >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('inicio <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 500);

  return consultar(`SELECT * FROM v_citas_detalle ${where} ORDER BY inicio LIMIT ${lim}`, params);
}

/**
 * Cambia el estado de una cita.
 *
 * Va dentro de una transacción para poder decirle a la base quién lo hizo: el
 * disparador trg_citas_historial deja el renglón en agenda.cita_historial y
 * saca el autor de `huellitas.usuario_id`, que solo existe dentro de la
 * transacción que lo fija. Sin eso la bitácora registra el cambio pero no de
 * quién fue, que es justo lo que se le pregunta cuando alguien reclama por una
 * cita cancelada.
 */
async function cambiarEstado(id, estado, notas = null, usuarioId = null) {
  const cancelada = estado === 'cancelada' ? 'LOCALTIMESTAMP' : 'NULL';

  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `UPDATE citas
          SET estado = ?,
              notas = COALESCE(?, notas),
              cancelada_en = ${cancelada}
        WHERE id = ?`,
      [estado, notas, id]
    );
    return resultado.affectedRows > 0;
  }, usuarioId);
}

/**
 * Contadores para los paneles.
 * En MySQL se sumaban condiciones booleanas (`SUM(estado = 'x')`); el
 * equivalente en PostgreSQL es COUNT(*) FILTER (WHERE …).
 */
async function resumenCliente(clienteId) {
  return consultarUna(
    `SELECT
        COUNT(*) FILTER (WHERE estado = 'pendiente')  AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'confirmada') AS confirmadas,
        COUNT(*) FILTER (WHERE estado = 'atendida')   AS atendidas,
        COUNT(*) FILTER (WHERE inicio >= LOCALTIMESTAMP
                           AND estado IN ('pendiente','confirmada')) AS proximas
       FROM citas WHERE cliente_id = ?`,
    [clienteId]
  );
}

async function resumenVeterinario(veterinarioId) {
  return consultarUna(
    `SELECT
        COUNT(*) FILTER (WHERE inicio::date = CURRENT_DATE
                           AND estado IN ('pendiente','confirmada')) AS hoy,
        COUNT(*) FILTER (WHERE inicio > LOCALTIMESTAMP
                           AND estado IN ('pendiente','confirmada')) AS proximas,
        COUNT(*) FILTER (WHERE estado = 'pendiente')                 AS por_confirmar,
        COUNT(DISTINCT mascota_id)                                   AS pacientes
       FROM citas WHERE veterinario_id = ?`,
    [veterinarioId]
  );
}

async function resumenClinica() {
  return consultarUna(
    `SELECT
        (SELECT COUNT(*) FROM citas WHERE inicio::date = CURRENT_DATE AND estado IN ('pendiente','confirmada')) AS citas_hoy,
        (SELECT COUNT(*) FROM citas WHERE estado = 'pendiente') AS citas_pendientes,
        (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'cliente' AND u.estado = 'activo') AS clientes,
        (SELECT COUNT(*) FROM mascotas WHERE activo = 1) AS mascotas,
        (SELECT COUNT(*) FROM veterinarios WHERE activo = 1) AS veterinarios,
        (SELECT COUNT(*) FROM servicios WHERE activo = 1) AS servicios`
  );
}

module.exports = {
  ocupadasDelDia,
  ocupadasDelDiaBloqueando,
  crear,
  buscarPorId,
  listar,
  cambiarEstado,
  resumenCliente,
  resumenVeterinario,
  resumenClinica,
};
