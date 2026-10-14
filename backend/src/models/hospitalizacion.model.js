'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

/**
 * Hospitalización: quién está internado, en qué jaula y qué le toca.
 *
 * El estado de la habitación no se escribe desde aquí: lo lleva el disparador
 * trg_hosp_habitacion, que la marca ocupada al ingresar y en limpieza al dar el
 * alta. Así no puede quedar una jaula "ocupada" por un paciente que ya se fue.
 */

/* ------------------------------------------------------------------
   Habitaciones
   ------------------------------------------------------------------ */

async function listarHabitaciones({ sedeId = null, soloLibres = false } = {}) {
  const condiciones = ['h.activo = 1'];
  const params = [];

  if (sedeId) { condiciones.push('h.sede_id = ?'); params.push(sedeId); }
  if (soloLibres) condiciones.push("h.estado = 'disponible'");

  return consultar(
    `SELECT h.*, s.nombre AS sede_nombre,
            ho.id AS hospitalizacion_id, m.nombre AS paciente, m.foto AS paciente_foto
       FROM habitaciones h
       JOIN sedes s ON s.id = h.sede_id
       LEFT JOIN hospitalizaciones ho ON ho.habitacion_id = h.id AND ho.estado = 'activa'
       LEFT JOIN mascotas m ON m.id = ho.mascota_id
      WHERE ${condiciones.join(' AND ')}
      ORDER BY s.nombre, h.codigo`,
    params
  );
}

async function habitacionPorId(id) {
  return consultarUna('SELECT * FROM habitaciones WHERE id = ?', [id]);
}

async function crearHabitacion(datos) {
  const resultado = await ejecutar(
    `INSERT INTO habitaciones (sede_id, codigo, nombre, tipo, tamano, aislamiento, notas, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.sedeId,
      datos.codigo,
      datos.nombre ?? null,
      datos.tipo,
      datos.tamano,
      datos.aislamiento ? 1 : 0,
      datos.notas ?? null,
      datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

/**
 * Cambio manual de estado (limpieza terminada, jaula en mantenimiento).
 * Marcar como disponible una jaula ocupada se rechaza en el controlador.
 */
async function cambiarEstadoHabitacion(id, datos) {
  const resultado = await ejecutar(
    'UPDATE habitaciones SET estado = ?, notas = COALESCE(?, notas) WHERE id = ?',
    [datos.estado, datos.notas ?? null, id]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Pacientes internados
   ------------------------------------------------------------------ */

/** Tablero de hospitalización, con el aviso de controles vencidos. */
async function tablero(sedeId = null) {
  const filtro = sedeId ? 'WHERE sede_id = ?' : '';
  return consultar(
    `SELECT * FROM v_hospitalizados ${filtro} ORDER BY fecha_ingreso`,
    sedeId ? [sedeId] : []
  );
}

async function listar({ mascotaId = null, estado = null, sedeId = null, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (mascotaId) { condiciones.push('ho.mascota_id = ?'); params.push(mascotaId); }
  if (estado) { condiciones.push('ho.estado = ?'); params.push(estado); }
  if (sedeId) { condiciones.push('ho.sede_id = ?'); params.push(sedeId); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT ho.*, m.nombre AS mascota_nombre, m.foto AS mascota_foto, m.cliente_id,
            e.nombre AS especie, uv.nombre AS veterinario_nombre,
            hb.codigo AS habitacion_codigo, uc.nombre AS cliente_nombre
       FROM hospitalizaciones ho
       JOIN mascotas m  ON m.id = ho.mascota_id
       JOIN especies e  ON e.id = m.especie_id
       JOIN clientes cl ON cl.id = m.cliente_id
       JOIN usuarios uc ON uc.id = cl.usuario_id
       LEFT JOIN veterinarios v  ON v.id = ho.veterinario_id
       LEFT JOIN usuarios uv     ON uv.id = v.usuario_id
       LEFT JOIN habitaciones hb ON hb.id = ho.habitacion_id
       ${where}
      ORDER BY ho.fecha_ingreso DESC
      LIMIT ${lim}`,
    params
  );
}

async function porId(id) {
  return consultarUna(
    `SELECT ho.*, m.nombre AS mascota_nombre, m.foto AS mascota_foto, m.cliente_id, m.peso_kg,
            e.nombre AS especie, r.nombre AS raza,
            uv.nombre AS veterinario_nombre,
            hb.codigo AS habitacion_codigo, hb.tipo AS habitacion_tipo,
            uc.nombre AS cliente_nombre, uc.telefono AS cliente_telefono,
            sd.nombre AS sede_nombre
       FROM hospitalizaciones ho
       JOIN mascotas m  ON m.id = ho.mascota_id
       JOIN especies e  ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       JOIN clientes cl ON cl.id = m.cliente_id
       JOIN usuarios uc ON uc.id = cl.usuario_id
       LEFT JOIN veterinarios v  ON v.id = ho.veterinario_id
       LEFT JOIN usuarios uv     ON uv.id = v.usuario_id
       LEFT JOIN habitaciones hb ON hb.id = ho.habitacion_id
       LEFT JOIN sedes sd        ON sd.id = ho.sede_id
      WHERE ho.id = ?`,
    [id]
  );
}

async function ingresar(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    // La jaula se bloquea antes de mirarla: dos ingresos simultáneos podrían
    // ver la misma "disponible" y meter dos pacientes en la misma jaula.
    if (datos.habitacionId) {
      const habitacion = await conexion.consultarUna(
        'SELECT id, estado, codigo FROM habitaciones WHERE id = ? FOR UPDATE',
        [datos.habitacionId]
      );
      if (!habitacion) throw new Error('La habitación indicada no existe.');
      if (habitacion.estado === 'ocupada') {
        throw new Error(`La habitación ${habitacion.codigo} ya está ocupada.`);
      }
    }

    const [resultado] = await conexion.execute(
      `INSERT INTO hospitalizaciones
         (mascota_id, consulta_id, veterinario_id, sede_id, habitacion_id,
          motivo, indicaciones, dieta, pronostico)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        datos.mascotaId,
        datos.consultaId ?? null,
        datos.veterinarioId,
        datos.sedeId ?? null,
        datos.habitacionId ?? null,
        datos.motivo,
        datos.indicaciones ?? null,
        datos.dieta ?? null,
        datos.pronostico ?? null,
      ]
    );

    return resultado.insertId;
  }, usuarioId);
}

async function egresar(id, datos, usuarioId) {
  const resultado = await ejecutar(
    `UPDATE hospitalizaciones
        SET estado = ?, epicrisis = ?, fecha_egreso = LOCALTIMESTAMP
      WHERE id = ? AND estado = 'activa'`,
    [datos.estado, datos.epicrisis, id]
  );

  // El disparador de habitaciones se dispara con este UPDATE y deja la jaula
  // en limpieza; el usuarioId va aquí solo por coherencia con el resto.
  void usuarioId;
  return resultado.affectedRows > 0;
}

async function cambiarHabitacion(id, habitacionId, usuarioId) {
  return enTransaccion(async (conexion) => {
    if (habitacionId) {
      const habitacion = await conexion.consultarUna(
        'SELECT id, estado, codigo FROM habitaciones WHERE id = ? FOR UPDATE',
        [habitacionId]
      );
      if (!habitacion) throw new Error('La habitación indicada no existe.');
      if (habitacion.estado === 'ocupada') {
        throw new Error(`La habitación ${habitacion.codigo} ya está ocupada.`);
      }
    }

    const [resultado] = await conexion.execute(
      `UPDATE hospitalizaciones SET habitacion_id = ? WHERE id = ? AND estado = 'activa'`,
      [habitacionId ?? null, id]
    );
    return resultado.affectedRows > 0;
  }, usuarioId);
}

/* ------------------------------------------------------------------
   El día a día del paciente
   ------------------------------------------------------------------ */

async function controles(hospitalizacionId) {
  return consultar(
    `SELECT c.*, u.nombre AS registrado_por_nombre
       FROM hospitalizacion_controles c
       LEFT JOIN usuarios u ON u.id = c.registrado_por
      WHERE c.hospitalizacion_id = ?
      ORDER BY c.fecha DESC`,
    [hospitalizacionId]
  );
}

async function registrarControl(hospitalizacionId, datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO hospitalizacion_controles
       (hospitalizacion_id, registrado_por, temperatura_c, frec_cardiaca, frec_respiratoria,
        come, orina, defeca, medicacion, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      hospitalizacionId,
      usuarioId ?? null,
      datos.temperaturaC ?? null,
      datos.frecCardiaca ?? null,
      datos.frecRespiratoria ?? null,
      datos.come === null || datos.come === undefined ? null : Number(datos.come),
      datos.orina === null || datos.orina === undefined ? null : Number(datos.orina),
      datos.defeca === null || datos.defeca === undefined ? null : Number(datos.defeca),
      datos.medicacion ?? null,
      datos.observaciones ?? null,
    ]
  );
  return resultado.insertId;
}

async function alimentacion(hospitalizacionId) {
  return consultar(
    `SELECT a.*, u.nombre AS registrado_por_nombre
       FROM hospitalizacion_alimentacion a
       LEFT JOIN usuarios u ON u.id = a.registrado_por
      WHERE a.hospitalizacion_id = ?
      ORDER BY a.fecha DESC`,
    [hospitalizacionId]
  );
}

async function registrarAlimentacion(hospitalizacionId, datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO hospitalizacion_alimentacion
       (hospitalizacion_id, registrado_por, alimento, cantidad_g, consumido, agua_ml, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      hospitalizacionId,
      usuarioId ?? null,
      datos.alimento ?? null,
      datos.cantidadG ?? null,
      datos.consumido,
      datos.aguaMl ?? null,
      datos.observaciones ?? null,
    ]
  );
  return resultado.insertId;
}

async function medicacion(hospitalizacionId) {
  return consultar(
    `SELECT hm.*, med.nombre AS medicamento_nombre, uv.nombre AS indicado_por_nombre,
            (hm.proxima_toma IS NOT NULL AND hm.proxima_toma <= LOCALTIMESTAMP
             AND hm.estado = 'activo') AS vencida
       FROM hospitalizacion_medicacion hm
       LEFT JOIN medicamentos med ON med.id = hm.medicamento_id
       LEFT JOIN veterinarios v   ON v.id = hm.indicado_por
       LEFT JOIN usuarios uv      ON uv.id = v.usuario_id
      WHERE hm.hospitalizacion_id = ?
      ORDER BY hm.estado, hm.proxima_toma NULLS LAST`,
    [hospitalizacionId]
  );
}

/**
 * Alta de una pauta. La primera toma se programa a la hora de inicio; a partir
 * de ahí cada toma registrada empuja la siguiente.
 */
async function crearMedicacion(hospitalizacionId, datos, veterinarioId) {
  const resultado = await ejecutar(
    `INSERT INTO hospitalizacion_medicacion
       (hospitalizacion_id, medicamento_id, descripcion, dosis, via, cada_horas, fin,
        proxima_toma, indicado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, LOCALTIMESTAMP, ?)
     RETURNING id`,
    [
      hospitalizacionId,
      datos.medicamentoId ?? null,
      datos.descripcion,
      datos.dosis ?? null,
      datos.via ?? null,
      datos.cadaHoras ?? null,
      datos.fin ?? null,
      veterinarioId ?? null,
    ]
  );
  return resultado.insertId;
}

/**
 * Marca una toma como dada y calcula la siguiente.
 *
 * La siguiente se cuenta desde ahora y no desde la toma teórica: si la pauta
 * es cada 8 horas y se dio con una hora de retraso, la siguiente es 8 horas
 * después de la dosis real, no 7.
 */
async function registrarToma(medicacionId, usuarioId) {
  const resultado = await ejecutar(
    `UPDATE hospitalizacion_medicacion
        SET proxima_toma = CASE
              WHEN cada_horas IS NULL THEN NULL
              WHEN fin IS NOT NULL AND LOCALTIMESTAMP + (cada_horas * INTERVAL '1 hour') > fin THEN NULL
              ELSE LOCALTIMESTAMP + (cada_horas * INTERVAL '1 hour')
            END,
            estado = CASE
              WHEN fin IS NOT NULL AND LOCALTIMESTAMP >= fin THEN 'finalizado'
              ELSE estado
            END
      WHERE id = ? AND estado = 'activo'
      RETURNING hospitalizacion_id, descripcion, dosis`,
    [medicacionId]
  );

  if (!resultado.affectedRows) return null;

  const fila = resultado.rows[0];
  await ejecutar(
    `INSERT INTO hospitalizacion_controles (hospitalizacion_id, registrado_por, medicacion)
     VALUES (?, ?, ?)`,
    [fila.hospitalizacion_id, usuarioId ?? null, `${fila.descripcion}${fila.dosis ? ` · ${fila.dosis}` : ''}`]
  );

  return fila;
}

async function suspenderMedicacion(medicacionId) {
  const resultado = await ejecutar(
    `UPDATE hospitalizacion_medicacion
        SET estado = 'suspendido', proxima_toma = NULL
      WHERE id = ? AND estado = 'activo'`,
    [medicacionId]
  );
  return resultado.affectedRows > 0;
}

async function visitas(hospitalizacionId) {
  return consultar(
    `SELECT v.*, u.nombre AS autorizada_por_nombre
       FROM hospitalizacion_visitas v
       LEFT JOIN usuarios u ON u.id = v.autorizada_por
      WHERE v.hospitalizacion_id = ?
      ORDER BY v.entrada DESC`,
    [hospitalizacionId]
  );
}

async function registrarVisita(hospitalizacionId, datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO hospitalizacion_visitas
       (hospitalizacion_id, visitante, parentesco, autorizada_por, observaciones)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [hospitalizacionId, datos.visitante, datos.parentesco ?? null, usuarioId ?? null, datos.observaciones ?? null]
  );
  return resultado.insertId;
}

async function cerrarVisita(visitaId) {
  const resultado = await ejecutar(
    'UPDATE hospitalizacion_visitas SET salida = LOCALTIMESTAMP WHERE id = ? AND salida IS NULL',
    [visitaId]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Avisos
   ------------------------------------------------------------------ */

/**
 * Pacientes internados que llevan demasiado sin control, para el módulo de
 * alertas. El umbral llega desde la regla, no está escrito aquí.
 */
async function sinControlReciente(horas = 8) {
  return consultar(
    `SELECT ho.id, ho.mascota_id, m.nombre AS mascota, ho.sede_id,
            hb.codigo AS habitacion,
            COALESCE(MAX(c.fecha), ho.fecha_ingreso) AS ultimo_control,
            ROUND(EXTRACT(EPOCH FROM (LOCALTIMESTAMP - COALESCE(MAX(c.fecha), ho.fecha_ingreso))) / 3600, 1) AS horas_sin_control
       FROM hospitalizaciones ho
       JOIN mascotas m ON m.id = ho.mascota_id
       LEFT JOIN habitaciones hb ON hb.id = ho.habitacion_id
       LEFT JOIN hospitalizacion_controles c ON c.hospitalizacion_id = ho.id
      WHERE ho.estado = 'activa'
      GROUP BY ho.id, ho.mascota_id, m.nombre, ho.sede_id, hb.codigo, ho.fecha_ingreso
     HAVING COALESCE(MAX(c.fecha), ho.fecha_ingreso) < LOCALTIMESTAMP - (? * INTERVAL '1 hour')`,
    [horas]
  );
}

module.exports = {
  listarHabitaciones,
  habitacionPorId,
  crearHabitacion,
  cambiarEstadoHabitacion,
  tablero,
  listar,
  porId,
  ingresar,
  egresar,
  cambiarHabitacion,
  controles,
  registrarControl,
  alimentacion,
  registrarAlimentacion,
  medicacion,
  crearMedicacion,
  registrarToma,
  suspenderMedicacion,
  visitas,
  registrarVisita,
  cerrarVisita,
  sinControlReciente,
};
