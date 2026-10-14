'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');
const { siguienteNumero } = require('../utils/consecutivos');

/**
 * Atención al cliente: PQRS, tickets y encuestas.
 *
 * En Colombia una PQRS tiene plazo legal de respuesta (15 días hábiles), así
 * que cada caso nace con fecha de vencimiento calculada y el tablero puede
 * ordenar por lo que está a punto de vencerse en vez de por fecha de llegada.
 */

// Días hábiles de plazo según el tipo. Una felicitación no tiene plazo legal,
// pero se le pone uno corto para que no se quede sin responder.
const PLAZO_DIAS = {
  peticion: 15,
  queja: 15,
  reclamo: 15,
  sugerencia: 10,
  felicitacion: 5,
  soporte: 3,
};

const SELECCION = `
  t.*, u.nombre AS usuario_nombre, u.email AS usuario_email,
  cu.nombre AS cliente_nombre,
  asig.nombre AS asignado_nombre,
  s.nombre AS sede_nombre,
  f.numero AS factura_numero,
  (SELECT COUNT(*) FROM ticket_mensajes tm WHERE tm.ticket_id = t.id AND tm.interno = 0) AS mensajes,
  CASE
    WHEN t.estado IN ('resuelto','cerrado') THEN NULL
    WHEN t.vence_en IS NULL                 THEN NULL
    ELSE EXTRACT(DAY FROM (t.vence_en - LOCALTIMESTAMP))::integer
  END AS dias_para_vencer`;

const DESDE = `
  FROM tickets t
  LEFT JOIN usuarios u   ON u.id = t.usuario_id
  LEFT JOIN clientes cl  ON cl.id = t.cliente_id
  LEFT JOIN usuarios cu  ON cu.id = cl.usuario_id
  LEFT JOIN usuarios asig ON asig.id = t.asignado_a
  LEFT JOIN sedes s      ON s.id = t.sede_id
  LEFT JOIN facturas f   ON f.id = t.factura_id`;

async function listar({ clienteId = null, usuarioId = null, tipo = null, estado = null, prioridad = null, asignadoA = null, desde = null, hasta = null, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (clienteId) { condiciones.push('t.cliente_id = ?'); params.push(clienteId); }
  // Un caso puede quedar colgado del usuario y no de una ficha de cliente
  // (quien radica sin tenerla). Ese es el filtro que le corresponde a él.
  if (usuarioId) { condiciones.push('t.usuario_id = ?'); params.push(usuarioId); }
  if (tipo) { condiciones.push('t.tipo = ?'); params.push(tipo); }
  if (estado) { condiciones.push('t.estado = ?'); params.push(estado); }
  if (prioridad) { condiciones.push('t.prioridad = ?'); params.push(prioridad); }
  if (asignadoA) { condiciones.push('t.asignado_a = ?'); params.push(asignadoA); }
  if (desde) { condiciones.push('t.creado_en >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('t.creado_en <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT ${SELECCION} ${DESDE} ${where}
      ORDER BY
        -- Lo abierto primero, y dentro de eso lo que está por vencerse.
        CASE WHEN t.estado IN ('resuelto','cerrado') THEN 1 ELSE 0 END,
        CASE t.prioridad WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        t.vence_en NULLS LAST,
        t.creado_en DESC
      LIMIT ${lim}`,
    params
  );
}

async function porId(id) {
  return consultarUna(`SELECT ${SELECCION} ${DESDE} WHERE t.id = ?`, [id]);
}

/** Mensajes del caso. Al cliente no se le entregan las notas internas. */
async function mensajes(ticketId, { incluirInternos = false } = {}) {
  return consultar(
    `SELECT tm.*, u.nombre AS autor_usuario, r.nombre AS autor_rol
       FROM ticket_mensajes tm
       LEFT JOIN usuarios u ON u.id = tm.autor_id
       LEFT JOIN roles r    ON r.id = u.rol_id
      WHERE tm.ticket_id = ? ${incluirInternos ? '' : 'AND tm.interno = 0'}
      ORDER BY tm.creado_en`,
    [ticketId]
  );
}

async function crear(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const numero = await siguienteNumero(conexion, 'tickets');
    const dias = PLAZO_DIAS[datos.tipo] ?? 15;

    const [ticket] = await conexion.execute(
      `INSERT INTO tickets
         (numero, usuario_id, cliente_id, sede_id, tipo, canal, asunto, descripcion,
          prioridad, cita_id, factura_id, nombre_contacto, email_contacto, telefono_contacto,
          vence_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               -- Días hábiles: se suman saltándose sábados y domingos.
               (SELECT MAX(d) FROM generate_series(
                   LOCALTIMESTAMP, LOCALTIMESTAMP + INTERVAL '40 days', INTERVAL '1 day') d
                 WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
                   AND (SELECT COUNT(*) FROM generate_series(
                          LOCALTIMESTAMP, d, INTERVAL '1 day') h
                         WHERE EXTRACT(ISODOW FROM h) BETWEEN 1 AND 5) <= ?))
       RETURNING id`,
      [
        numero,
        usuarioId ?? null,
        datos.clienteId ?? null,
        datos.sedeId ?? null,
        datos.tipo,
        datos.canal,
        datos.asunto,
        datos.descripcion,
        datos.prioridad,
        datos.citaId ?? null,
        datos.facturaId ?? null,
        datos.nombreContacto ?? null,
        datos.emailContacto ?? null,
        datos.telefonoContacto ?? null,
        dias,
      ]
    );

    // La descripción entra también como primer mensaje del hilo, para que la
    // conversación se lea completa de arriba abajo.
    await conexion.execute(
      `INSERT INTO ticket_mensajes (ticket_id, autor_id, autor_nombre, mensaje)
       VALUES (?, ?, ?, ?)`,
      [ticket.insertId, usuarioId ?? null, datos.nombreContacto ?? null, datos.descripcion]
    );

    return { id: ticket.insertId, numero };
  }, usuarioId);
}

async function responder(ticketId, datos, usuario) {
  const resultado = await ejecutar(
    `INSERT INTO ticket_mensajes (ticket_id, autor_id, autor_nombre, mensaje, interno, archivo)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [ticketId, usuario?.id ?? null, usuario?.nombre ?? null, datos.mensaje, datos.interno ? 1 : 0, datos.archivo ?? null]
  );

  // Una respuesta del equipo mueve el caso a "en proceso" si estaba recién
  // abierto: el estado tiene que reflejar que alguien ya lo está mirando.
  if (!datos.interno) {
    await ejecutar(
      `UPDATE tickets SET estado = 'en_proceso' WHERE id = ? AND estado = 'abierto'`,
      [ticketId]
    );
  }

  return resultado.insertId;
}

async function actualizar(id, datos, usuarioId) {
  const cierra = ['resuelto', 'cerrado'].includes(datos.estado);

  const resultado = await ejecutar(
    `UPDATE tickets
        SET estado = COALESCE(?, estado),
            prioridad = COALESCE(?, prioridad),
            asignado_a = COALESCE(?, asignado_a),
            comentario_cierre = COALESCE(?, comentario_cierre),
            cerrado_en = CASE WHEN ? THEN COALESCE(cerrado_en, LOCALTIMESTAMP) ELSE cerrado_en END
      WHERE id = ?`,
    [
      datos.estado ?? null,
      datos.prioridad ?? null,
      datos.asignadoA ?? null,
      datos.comentarioCierre ?? null,
      cierra,
      id,
    ]
  );

  void usuarioId;
  return resultado.affectedRows > 0;
}

async function calificar(id, datos) {
  const resultado = await ejecutar(
    `UPDATE tickets SET calificacion = ?, comentario_cierre = COALESCE(?, comentario_cierre)
      WHERE id = ? AND estado IN ('resuelto','cerrado')`,
    [datos.calificacion, datos.comentario ?? null, id]
  );
  return resultado.affectedRows > 0;
}

/** Indicadores del tablero de PQRS. */
async function resumen() {
  return consultarUna(
    `SELECT
       COUNT(*) FILTER (WHERE estado NOT IN ('resuelto','cerrado'))                AS abiertos,
       COUNT(*) FILTER (WHERE estado = 'abierto')                                  AS sin_atender,
       COUNT(*) FILTER (WHERE estado NOT IN ('resuelto','cerrado')
                          AND vence_en IS NOT NULL AND vence_en < LOCALTIMESTAMP)  AS vencidos,
       COUNT(*) FILTER (WHERE estado NOT IN ('resuelto','cerrado')
                          AND vence_en IS NOT NULL
                          AND vence_en BETWEEN LOCALTIMESTAMP
                                           AND LOCALTIMESTAMP + INTERVAL '2 days') AS por_vencer,
       COUNT(*) FILTER (WHERE tipo IN ('queja','reclamo')
                          AND creado_en >= LOCALTIMESTAMP - INTERVAL '30 days')    AS quejas_mes,
       ROUND(AVG(calificacion) FILTER (WHERE calificacion IS NOT NULL), 2)         AS calificacion_promedio,
       ROUND(AVG(EXTRACT(EPOCH FROM (cerrado_en - creado_en)) / 3600)
             FILTER (WHERE cerrado_en IS NOT NULL), 1)                             AS horas_promedio_cierre
     FROM tickets`
  );
}

/* ------------------------------------------------------------------
   Encuestas
   ------------------------------------------------------------------ */

async function encuestas({ momento = null, soloActivas = true } = {}) {
  const condiciones = [];
  const params = [];

  if (momento) { condiciones.push('momento = ?'); params.push(momento); }
  if (soloActivas) condiciones.push('activo = 1');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return consultar(`SELECT * FROM encuestas ${where} ORDER BY nombre`, params);
}

async function guardarRespuesta(datos, clienteId) {
  const resultado = await ejecutar(
    `INSERT INTO encuesta_respuestas
       (encuesta_id, cliente_id, cita_id, pedido_id, ticket_id, veterinario_id,
        respuestas, calificacion, comentario)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.encuestaId,
      clienteId ?? null,
      datos.citaId ?? null,
      datos.pedidoId ?? null,
      datos.ticketId ?? null,
      datos.veterinarioId ?? null,
      JSON.stringify(datos.respuestas),
      datos.calificacion ?? null,
      datos.comentario ?? null,
    ]
  );
  return resultado.insertId;
}

/**
 * Resultados agregados de una encuesta.
 *
 * Se devuelve también el detalle de los comentarios: el promedio dice si algo
 * va mal, pero solo el texto dice qué.
 */
async function resultadosEncuesta(encuestaId, { desde = null, hasta = null } = {}) {
  const condiciones = ['er.encuesta_id = ?'];
  const params = [encuestaId];

  if (desde) { condiciones.push('er.fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('er.fecha <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = `WHERE ${condiciones.join(' AND ')}`;

  const [totales, porVeterinario, comentarios] = await Promise.all([
    consultarUna(
      `SELECT COUNT(*) AS respuestas,
              ROUND(AVG(er.calificacion), 2) AS promedio,
              COUNT(*) FILTER (WHERE er.calificacion >= 4) AS promotores,
              COUNT(*) FILTER (WHERE er.calificacion <= 2) AS detractores
         FROM encuesta_respuestas er ${where}`,
      params
    ),
    consultar(
      `SELECT u.nombre AS veterinario, COUNT(*) AS respuestas,
              ROUND(AVG(er.calificacion), 2) AS promedio
         FROM encuesta_respuestas er
         JOIN veterinarios v ON v.id = er.veterinario_id
         JOIN usuarios u     ON u.id = v.usuario_id
         ${where}
        GROUP BY u.nombre
        ORDER BY promedio DESC NULLS LAST`,
      params
    ),
    consultar(
      `SELECT er.calificacion, er.comentario, er.fecha
         FROM encuesta_respuestas er
         ${where} AND er.comentario IS NOT NULL
        ORDER BY er.fecha DESC
        LIMIT 50`,
      params
    ),
  ]);

  return { resumen: totales, porVeterinario, comentarios };
}

module.exports = {
  PLAZO_DIAS,
  listar,
  porId,
  mensajes,
  crear,
  responder,
  actualizar,
  calificar,
  resumen,
  encuestas,
  guardarRespuesta,
  resultadosEncuesta,
};
