'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

/**
 * Urgencias: llegada, triage y todo lo que pasa mientras el paciente está
 * dentro.
 *
 * La diferencia con una cita es el orden: aquí no se atiende por hora de
 * llegada sino por gravedad, y por eso la lista sale ordenada por el peso del
 * triage que calcula la vista v_urgencias_activas.
 */

/* ------------------------------------------------------------------
   Salas
   ------------------------------------------------------------------ */

async function listarSalas(sedeId = null) {
  const filtro = sedeId ? 'AND s.sede_id = ?' : '';
  return consultar(
    `SELECT s.*, sd.nombre AS sede_nombre,
            (SELECT COUNT(*) FROM ingresos_urgencias i
              WHERE i.sala_id = s.id AND i.estado <> 'cerrado') AS ocupacion
       FROM salas_urgencias s
       JOIN sedes sd ON sd.id = s.sede_id
      WHERE s.activo = 1 ${filtro}
      ORDER BY sd.nombre, s.nombre`,
    sedeId ? [sedeId] : []
  );
}

/* ------------------------------------------------------------------
   Ingresos
   ------------------------------------------------------------------ */

/** Sala de urgencias en vivo: lo que se ve en el tablero. */
async function activas(sedeId = null) {
  const filtro = sedeId ? 'WHERE sede_id = ?' : '';
  return consultar(
    `SELECT * FROM v_urgencias_activas
     ${filtro}
     ORDER BY orden_prioridad, llegada`,
    sedeId ? [sedeId] : []
  );
}

async function listar({ estado = null, sedeId = null, desde = null, hasta = null, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (estado) { condiciones.push('i.estado = ?'); params.push(estado); }
  if (sedeId) { condiciones.push('i.sede_id = ?'); params.push(sedeId); }
  if (desde) { condiciones.push('i.llegada >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('i.llegada <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT i.*, m.nombre AS mascota_nombre, m.foto AS mascota_foto,
            e.nombre AS especie, uc.nombre AS cliente_nombre, uc.telefono AS cliente_telefono,
            uv.nombre AS veterinario_nombre, sa.nombre AS sala_nombre, sd.nombre AS sede_nombre
       FROM ingresos_urgencias i
       JOIN mascotas m  ON m.id = i.mascota_id
       JOIN especies e  ON e.id = m.especie_id
       JOIN clientes cl ON cl.id = i.cliente_id
       JOIN usuarios uc ON uc.id = cl.usuario_id
       LEFT JOIN veterinarios v ON v.id = i.veterinario_id
       LEFT JOIN usuarios uv    ON uv.id = v.usuario_id
       LEFT JOIN salas_urgencias sa ON sa.id = i.sala_id
       LEFT JOIN sedes sd ON sd.id = i.sede_id
       ${where}
      ORDER BY i.llegada DESC
      LIMIT ${lim}`,
    params
  );
}

async function porId(id) {
  return consultarUna(
    `SELECT i.*, m.nombre AS mascota_nombre, m.foto AS mascota_foto, m.peso_kg,
            e.nombre AS especie, r.nombre AS raza,
            cl.id AS cliente_id, uc.nombre AS cliente_nombre, uc.telefono AS cliente_telefono,
            uv.nombre AS veterinario_nombre, sa.nombre AS sala_nombre, sd.nombre AS sede_nombre
       FROM ingresos_urgencias i
       JOIN mascotas m  ON m.id = i.mascota_id
       JOIN especies e  ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       JOIN clientes cl ON cl.id = i.cliente_id
       JOIN usuarios uc ON uc.id = cl.usuario_id
       LEFT JOIN veterinarios v ON v.id = i.veterinario_id
       LEFT JOIN usuarios uv    ON uv.id = v.usuario_id
       LEFT JOIN salas_urgencias sa ON sa.id = i.sala_id
       LEFT JOIN sedes sd ON sd.id = i.sede_id
      WHERE i.id = ?`,
    [id]
  );
}

/**
 * Registro de llegada. Deja el primer evento de la línea de tiempo en la misma
 * transacción: un ingreso sin su hora de llegada anotada no sirve para
 * reconstruir después cuánto se tardó en atenderlo.
 */
async function registrarLlegada(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `INSERT INTO ingresos_urgencias
         (sede_id, mascota_id, cliente_id, sala_id, veterinario_id, recibido_por,
          motivo, prioridad, estado, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        datos.sedeId ?? null,
        datos.mascotaId,
        datos.clienteId,
        datos.salaId ?? null,
        datos.veterinarioId ?? null,
        usuarioId ?? null,
        datos.motivo,
        datos.prioridad ?? null,
        datos.prioridad ? 'en_atencion' : 'en_espera',
        datos.observaciones ?? null,
      ]
    );

    const id = resultado.insertId;

    await conexion.execute(
      `INSERT INTO eventos_urgencias (ingreso_id, usuario_id, tipo, descripcion)
       VALUES (?, ?, 'llegada', ?)`,
      [id, usuarioId ?? null, `Llegada a urgencias: ${datos.motivo}`]
    );

    return id;
  }, usuarioId);
}

/** Clasificación de gravedad. Marca la hora del triage, que es un indicador. */
async function clasificar(id, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    await conexion.execute(
      `UPDATE ingresos_urgencias
          SET prioridad = ?,
              sala_id = COALESCE(?, sala_id),
              veterinario_id = COALESCE(?, veterinario_id),
              hallazgos_triage = COALESCE(?, hallazgos_triage),
              triage_en = COALESCE(triage_en, LOCALTIMESTAMP),
              estado = CASE WHEN estado = 'en_espera' THEN 'en_triage' ELSE estado END
        WHERE id = ?`,
      [datos.prioridad, datos.salaId ?? null, datos.veterinarioId ?? null, datos.hallazgos ?? null, id]
    );

    await conexion.execute(
      `INSERT INTO eventos_urgencias (ingreso_id, usuario_id, tipo, descripcion, detalle)
       VALUES (?, ?, 'triage', ?, ?)`,
      [
        id,
        usuarioId ?? null,
        `Triage ${datos.prioridad}`,
        JSON.stringify({ prioridad: datos.prioridad, hallazgos: datos.hallazgos ?? null }),
      ]
    );
  }, usuarioId);
}

async function actualizar(id, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    await conexion.execute(
      `UPDATE ingresos_urgencias
          SET estado = COALESCE(?, estado),
              sala_id = COALESCE(?, sala_id),
              veterinario_id = COALESCE(?, veterinario_id),
              desenlace = COALESCE(?, desenlace),
              observaciones = COALESCE(?, observaciones),
              -- La hora en que empezó la atención se fija una sola vez.
              atencion_en = CASE WHEN ? = 'en_atencion' THEN COALESCE(atencion_en, LOCALTIMESTAMP) ELSE atencion_en END,
              cierre_en   = CASE WHEN ? = 'cerrado'     THEN COALESCE(cierre_en, LOCALTIMESTAMP)   ELSE cierre_en   END
        WHERE id = ?`,
      [
        datos.estado ?? null,
        datos.salaId ?? null,
        datos.veterinarioId ?? null,
        datos.desenlace ?? null,
        datos.observaciones ?? null,
        datos.estado ?? null,
        datos.estado ?? null,
        id,
      ]
    );

    if (datos.estado) {
      await conexion.execute(
        `INSERT INTO eventos_urgencias (ingreso_id, usuario_id, tipo, descripcion)
         VALUES (?, ?, ?, ?)`,
        [
          id,
          usuarioId ?? null,
          datos.estado === 'cerrado' ? 'alta' : 'nota',
          datos.estado === 'cerrado'
            ? `Cierre de la urgencia: ${datos.desenlace}`
            : `Estado: ${datos.estado}`,
        ]
      );
    }
  }, usuarioId);
}

/* ------------------------------------------------------------------
   Línea de tiempo
   ------------------------------------------------------------------ */

async function eventos(ingresoId) {
  return consultar(
    `SELECT e.*, u.nombre AS usuario_nombre
       FROM eventos_urgencias e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.ingreso_id = ?
      ORDER BY e.fecha, e.id`,
    [ingresoId]
  );
}

async function crearEvento(ingresoId, datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO eventos_urgencias (ingreso_id, usuario_id, tipo, descripcion, detalle)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [
      ingresoId,
      usuarioId ?? null,
      datos.tipo,
      datos.descripcion,
      datos.detalle ? JSON.stringify(datos.detalle) : null,
    ]
  );
  return resultado.insertId;
}

/* ------------------------------------------------------------------
   Signos, medicación y procedimientos
   ------------------------------------------------------------------ */

async function signos(ingresoId) {
  return consultar(
    `SELECT s.*, u.nombre AS tomado_por_nombre
       FROM signos_vitales s
       LEFT JOIN usuarios u ON u.id = s.tomado_por
      WHERE s.ingreso_urgencia_id = ?
      ORDER BY s.fecha`,
    [ingresoId]
  );
}

async function registrarSignos(ingresoId, mascotaId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `INSERT INTO signos_vitales
         (ingreso_urgencia_id, mascota_id, tomado_por, peso_kg, temperatura_c,
          frec_cardiaca, frec_respiratoria, mucosas, hidratacion, condicion_corporal, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        ingresoId,
        mascotaId,
        usuarioId ?? null,
        datos.pesoKg ?? null,
        datos.temperaturaC ?? null,
        datos.frecCardiaca ?? null,
        datos.frecRespiratoria ?? null,
        datos.mucosas ?? null,
        datos.hidratacion ?? null,
        datos.condicionCorporal ?? null,
        datos.notas ?? null,
      ]
    );

    await conexion.execute(
      `INSERT INTO eventos_urgencias (ingreso_id, usuario_id, tipo, descripcion, detalle)
       VALUES (?, ?, 'signos', 'Toma de signos vitales', ?)`,
      [ingresoId, usuarioId ?? null, JSON.stringify(datos)]
    );

    return resultado.insertId;
  }, usuarioId);
}

async function medicacion(ingresoId) {
  return consultar(
    `SELECT mu.*, u.nombre AS administrado_por_nombre, med.nombre AS medicamento_nombre
       FROM medicacion_urgencias mu
       LEFT JOIN usuarios u    ON u.id = mu.administrado_por
       LEFT JOIN medicamentos med ON med.id = mu.medicamento_id
      WHERE mu.ingreso_id = ?
      ORDER BY mu.fecha`,
    [ingresoId]
  );
}

/**
 * Anota una dosis y, si se pidió, la descuenta del inventario en la misma
 * transacción: en urgencias se gasta material que si no se registra desaparece
 * del stock sin explicación.
 */
async function registrarMedicacion(ingresoId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `INSERT INTO medicacion_urgencias
         (ingreso_id, medicamento_id, producto_id, descripcion, dosis, via, cantidad, administrado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        ingresoId,
        datos.medicamentoId ?? null,
        datos.productoId ?? null,
        datos.descripcion,
        datos.dosis ?? null,
        datos.via ?? null,
        datos.cantidad ?? null,
        usuarioId ?? null,
      ]
    );

    if (datos.descontarStock && datos.productoId && datos.cantidad > 0) {
      await conexion.execute(
        `INSERT INTO movimientos_inventario
           (producto_id, ubicacion_id, usuario_id, tipo, cantidad, motivo, referencia)
         VALUES (?, ?, ?, 'salida', ?, ?, ?)`,
        [
          datos.productoId,
          datos.ubicacionId ?? null,
          usuarioId ?? null,
          Math.ceil(Number(datos.cantidad)),
          `Urgencia: ${datos.descripcion}`,
          `URG-${ingresoId}`,
        ]
      );
    }

    await conexion.execute(
      `INSERT INTO eventos_urgencias (ingreso_id, usuario_id, tipo, descripcion, detalle)
       VALUES (?, ?, 'medicacion', ?, ?)`,
      [
        ingresoId,
        usuarioId ?? null,
        `${datos.descripcion}${datos.dosis ? ` · ${datos.dosis}` : ''}`,
        JSON.stringify({ dosis: datos.dosis ?? null, via: datos.via ?? null, cantidad: datos.cantidad ?? null }),
      ]
    );

    return resultado.insertId;
  }, usuarioId);
}

async function procedimientos(ingresoId) {
  return consultar(
    `SELECT p.*, u.nombre AS realizado_por_nombre
       FROM procedimientos_urgencias p
       LEFT JOIN usuarios u ON u.id = p.realizado_por
      WHERE p.ingreso_id = ?
      ORDER BY p.inicio`,
    [ingresoId]
  );
}

async function registrarProcedimiento(ingresoId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `INSERT INTO procedimientos_urgencias
         (ingreso_id, nombre, descripcion, realizado_por, fin, resultado)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [ingresoId, datos.nombre, datos.descripcion ?? null, usuarioId ?? null, datos.fin ?? null, datos.resultado ?? null]
    );

    await conexion.execute(
      `INSERT INTO eventos_urgencias (ingreso_id, usuario_id, tipo, descripcion)
       VALUES (?, ?, 'procedimiento', ?)`,
      [ingresoId, usuarioId ?? null, datos.nombre]
    );

    return resultado.insertId;
  }, usuarioId);
}

/* ------------------------------------------------------------------
   Indicadores
   ------------------------------------------------------------------ */

/** Cuántos hay en cada estado y cuánto se está tardando en clasificar. */
async function resumen(sedeId = null) {
  const filtro = sedeId ? 'AND sede_id = ?' : '';
  const params = sedeId ? [sedeId] : [];

  return consultarUna(
    `SELECT
       COUNT(*) FILTER (WHERE estado <> 'cerrado')            AS activas,
       COUNT(*) FILTER (WHERE estado = 'en_espera')           AS en_espera,
       COUNT(*) FILTER (WHERE prioridad IN ('rojo','naranja')
                          AND estado <> 'cerrado')            AS criticas,
       COUNT(*) FILTER (WHERE llegada::date = CURRENT_DATE)   AS hoy,
       ROUND(AVG(EXTRACT(EPOCH FROM (triage_en - llegada)) / 60)
             FILTER (WHERE triage_en IS NOT NULL
                       AND llegada::date >= CURRENT_DATE - 30), 1) AS minutos_triage_promedio
     FROM ingresos_urgencias
     WHERE 1 = 1 ${filtro}`,
    params
  );
}

module.exports = {
  listarSalas,
  activas,
  listar,
  porId,
  registrarLlegada,
  clasificar,
  actualizar,
  eventos,
  crearEvento,
  signos,
  registrarSignos,
  medicacion,
  registrarMedicacion,
  procedimientos,
  registrarProcedimiento,
  resumen,
};
