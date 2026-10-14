'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

/**
 * Gestión del personal: turnos, asistencia, ausencias, comisiones y
 * certificaciones.
 *
 * Lo que hace que esto valga la pena y no sea una hoja de cálculo: aprobar unas
 * vacaciones crea el bloqueo de agenda del veterinario, así que nadie puede
 * agendarle una cita encima. Son dos tablas distintas, pero para la clínica es
 * un solo hecho.
 */

/* ------------------------------------------------------------------
   Turnos
   ------------------------------------------------------------------ */

async function turnos({ sedeId = null, soloActivos = true } = {}) {
  const condiciones = [];
  const params = [];

  if (sedeId) { condiciones.push('(t.sede_id = ? OR t.sede_id IS NULL)'); params.push(sedeId); }
  if (soloActivos) condiciones.push('t.activo = 1');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return consultar(
    `SELECT t.*, s.nombre AS sede_nombre
       FROM turnos t
       LEFT JOIN sedes s ON s.id = t.sede_id
       ${where}
      ORDER BY t.hora_inicio`,
    params
  );
}

async function crearTurno(datos) {
  const resultado = await ejecutar(
    `INSERT INTO turnos (nombre, sede_id, hora_inicio, hora_fin, color, nocturno, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.nombre,
      datos.sedeId ?? null,
      datos.horaInicio,
      datos.horaFin,
      datos.color ?? null,
      datos.nocturno ? 1 : 0,
      datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

/** Cuadro de turnos de un rango de fechas, para pintar el calendario. */
async function asignaciones({ desde, hasta, usuarioId = null, sedeId = null } = {}) {
  const condiciones = ['a.fecha BETWEEN ? AND ?'];
  const params = [desde, hasta];

  if (usuarioId) { condiciones.push('a.usuario_id = ?'); params.push(usuarioId); }
  if (sedeId) { condiciones.push('a.sede_id = ?'); params.push(sedeId); }

  return consultar(
    `SELECT a.*, u.nombre AS usuario_nombre, r.nombre AS rol,
            t.nombre AS turno, t.hora_inicio, t.hora_fin, t.color, t.nocturno,
            s.nombre AS sede_nombre
       FROM asignaciones_turno a
       JOIN usuarios u ON u.id = a.usuario_id
       JOIN roles r    ON r.id = u.rol_id
       JOIN turnos t   ON t.id = a.turno_id
       LEFT JOIN sedes s ON s.id = a.sede_id
      WHERE ${condiciones.join(' AND ')}
      ORDER BY a.fecha, t.hora_inicio, u.nombre`,
    params
  );
}

/**
 * Asigna un turno.
 *
 * Se rechaza si esa persona tiene una ausencia aprobada ese día: programar a
 * alguien que está de vacaciones es la forma más común de que el cuadro de
 * turnos deje de servir.
 */
async function asignarTurno(datos) {
  const ausente = await consultarUna(
    `SELECT id, tipo FROM ausencias
      WHERE usuario_id = ? AND estado = 'aprobada' AND ? BETWEEN desde AND hasta`,
    [datos.usuarioId, datos.fecha]
  );
  if (ausente) return { error: `Esa persona tiene ${ausente.tipo} aprobadas para ese día.` };

  const resultado = await ejecutar(
    `INSERT INTO asignaciones_turno (usuario_id, turno_id, sede_id, fecha, notas)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (usuario_id, fecha, turno_id) DO UPDATE
       SET sede_id = EXCLUDED.sede_id, notas = EXCLUDED.notas
     RETURNING id`,
    [datos.usuarioId, datos.turnoId, datos.sedeId ?? null, datos.fecha, datos.notas ?? null]
  );
  return { id: resultado.insertId };
}

async function quitarAsignacion(id) {
  const resultado = await ejecutar('DELETE FROM asignaciones_turno WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Asistencia
   ------------------------------------------------------------------ */

async function asistencia({ desde, hasta, usuarioId = null } = {}) {
  const condiciones = ['a.fecha BETWEEN ? AND ?'];
  const params = [desde, hasta];

  if (usuarioId) { condiciones.push('a.usuario_id = ?'); params.push(usuarioId); }

  return consultar(
    `SELECT a.*, u.nombre AS usuario_nombre, reg.nombre AS registrado_por_nombre
       FROM asistencia a
       JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN usuarios reg ON reg.id = a.registrado_por
      WHERE ${condiciones.join(' AND ')}
      ORDER BY a.fecha DESC, u.nombre`,
    params
  );
}

/** Registra o corrige la asistencia de un día; las horas se calculan solas. */
async function registrarAsistencia(datos, registradoPor) {
  const resultado = await ejecutar(
    `INSERT INTO asistencia (usuario_id, fecha, entrada, salida, horas, estado, observaciones, registrado_por)
     VALUES (?, ?, ?, ?,
             CASE WHEN ?::timestamp IS NOT NULL AND ?::timestamp IS NOT NULL
                  THEN ROUND(EXTRACT(EPOCH FROM (?::timestamp - ?::timestamp)) / 3600.0, 2)
                  ELSE NULL END,
             ?, ?, ?)
     ON CONFLICT (usuario_id, fecha) DO UPDATE
       SET entrada = EXCLUDED.entrada, salida = EXCLUDED.salida, horas = EXCLUDED.horas,
           estado = EXCLUDED.estado, observaciones = EXCLUDED.observaciones,
           registrado_por = EXCLUDED.registrado_por
     RETURNING id`,
    [
      datos.usuarioId,
      datos.fecha,
      datos.entrada ?? null,
      datos.salida ?? null,
      datos.entrada ?? null,
      datos.salida ?? null,
      datos.salida ?? null,
      datos.entrada ?? null,
      datos.estado,
      datos.observaciones ?? null,
      registradoPor ?? null,
    ]
  );
  return resultado.insertId;
}

/* ------------------------------------------------------------------
   Ausencias
   ------------------------------------------------------------------ */

async function ausencias({ usuarioId = null, estado = null, desde = null, limite = 100 } = {}) {
  const condiciones = [];
  const params = [];

  if (usuarioId) { condiciones.push('a.usuario_id = ?'); params.push(usuarioId); }
  if (estado) { condiciones.push('a.estado = ?'); params.push(estado); }
  if (desde) { condiciones.push('a.hasta >= ?'); params.push(desde); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT a.*, u.nombre AS usuario_nombre, ap.nombre AS aprobado_por_nombre,
            (a.hasta - a.desde + 1) AS dias_calendario
       FROM ausencias a
       JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN usuarios ap ON ap.id = a.aprobado_por
       ${where}
      ORDER BY a.desde DESC
      LIMIT ${lim}`,
    params
  );
}

async function ausenciaPorId(id) {
  return consultarUna(
    `SELECT a.*, u.nombre AS usuario_nombre, v.id AS veterinario_id
       FROM ausencias a
       JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN veterinarios v ON v.usuario_id = a.usuario_id
      WHERE a.id = ?`,
    [id]
  );
}

async function solicitarAusencia(datos) {
  const resultado = await ejecutar(
    `INSERT INTO ausencias (usuario_id, tipo, desde, hasta, dias, motivo, soporte_url)
     VALUES (?, ?, ?, ?, (?::date - ?::date + 1), ?, ?)
     RETURNING id`,
    [
      datos.usuarioId,
      datos.tipo,
      datos.desde,
      datos.hasta,
      datos.hasta,
      datos.desde,
      datos.motivo ?? null,
      datos.soporteUrl ?? null,
    ]
  );
  return resultado.insertId;
}

/**
 * Aprueba o rechaza. Aprobar a un veterinario le bloquea la agenda en esas
 * fechas; rechazar o cancelar una ya aprobada retira el bloqueo.
 */
async function resolverAusencia(ausencia, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    let bloqueoId = ausencia.bloqueo_id;

    if (datos.estado === 'aprobada' && datos.bloquearAgenda && ausencia.veterinario_id && !bloqueoId) {
      const [bloqueo] = await conexion.execute(
        `INSERT INTO bloqueos_agenda (veterinario_id, inicio, fin, motivo, creado_por)
         VALUES (?, ?::date, (?::date + INTERVAL '1 day'), ?, ?)
         RETURNING id`,
        [
          ausencia.veterinario_id,
          ausencia.desde,
          ausencia.hasta,
          `${ausencia.tipo}${ausencia.motivo ? `: ${ausencia.motivo}` : ''}`,
          usuarioId ?? null,
        ]
      );
      bloqueoId = bloqueo.insertId;
    }

    if (datos.estado !== 'aprobada' && ausencia.bloqueo_id) {
      await conexion.execute('DELETE FROM bloqueos_agenda WHERE id = ?', [ausencia.bloqueo_id]);
      bloqueoId = null;
    }

    await conexion.execute(
      `UPDATE ausencias
          SET estado = ?, motivo = COALESCE(?, motivo), aprobado_por = ?,
              aprobado_en = LOCALTIMESTAMP, bloqueo_id = ?
        WHERE id = ?`,
      [datos.estado, datos.motivo ?? null, usuarioId ?? null, bloqueoId, ausencia.id]
    );

    return bloqueoId;
  }, usuarioId);
}

/* ------------------------------------------------------------------
   Comisiones
   ------------------------------------------------------------------ */

async function reglasComision() {
  return consultar(
    `SELECT rc.*, s.nombre AS servicio_nombre, c.nombre AS categoria_nombre, u.nombre AS usuario_nombre
       FROM reglas_comision rc
       LEFT JOIN servicios s ON s.id = rc.servicio_id
       LEFT JOIN categorias_productos c ON c.id = rc.categoria_id
       LEFT JOIN usuarios u ON u.id = rc.usuario_id
      ORDER BY rc.activo DESC, rc.nombre`
  );
}

async function crearReglaComision(datos) {
  const resultado = await ejecutar(
    `INSERT INTO reglas_comision (nombre, aplica_a, servicio_id, categoria_id, usuario_id, porcentaje, valor_fijo, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.nombre,
      datos.aplicaA,
      datos.servicioId ?? null,
      datos.categoriaId ?? null,
      datos.usuarioId ?? null,
      datos.porcentaje ?? null,
      datos.valorFijo ?? null,
      datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

/**
 * Calcula las comisiones de un periodo a partir de lo facturado.
 *
 * Se recalcula entero: primero borra lo pendiente de ese periodo y lo vuelve a
 * generar. Las ya liquidadas no se tocan, porque eso sería cambiarle a alguien
 * un pago que ya recibió.
 *
 * La comisión se atribuye al veterinario que atendió la consulta de la factura;
 * si la factura no viene de una consulta, no genera comisión: no hay a quién
 * atribuírsela sin inventar.
 */
async function calcularComisiones(periodo, usuarioId) {
  return enTransaccion(async (conexion) => {
    await conexion.execute(
      `DELETE FROM comisiones_generadas WHERE periodo = ? AND estado = 'pendiente'`,
      [periodo]
    );

    const [resultado] = await conexion.execute(
      `INSERT INTO comisiones_generadas (usuario_id, regla_id, factura_id, detalle_id, periodo, base, valor)
       SELECT uv.id, rc.id, f.id, d.id, ?,
              d.total_linea,
              ROUND(COALESCE(d.total_linea * rc.porcentaje / 100, rc.valor_fijo, 0), 2)
         FROM facturas f
         JOIN detalle_facturas d ON d.factura_id = f.id
         JOIN consultas co       ON co.id = f.consulta_id
         JOIN veterinarios v     ON v.id = co.veterinario_id
         JOIN usuarios uv        ON uv.id = v.usuario_id
         JOIN reglas_comision rc ON rc.activo = 1
              AND (rc.usuario_id IS NULL OR rc.usuario_id = uv.id)
              AND (
                (rc.aplica_a = 'servicio' AND d.servicio_id IS NOT NULL
                   AND (rc.servicio_id IS NULL OR rc.servicio_id = d.servicio_id))
                OR (rc.aplica_a = 'producto' AND d.producto_id IS NOT NULL
                   AND (rc.categoria_id IS NULL
                        OR rc.categoria_id = (SELECT p.categoria_id FROM productos p WHERE p.id = d.producto_id)))
                OR (rc.aplica_a = 'examen' AND d.examen_id IS NOT NULL)
                OR rc.aplica_a = 'global'
              )
        WHERE f.estado <> 'anulada'
          AND to_char(f.fecha, 'YYYY-MM') = ?
       RETURNING id`,
      [periodo, periodo]
    );

    return resultado.affectedRows;
  }, usuarioId);
}

async function comisiones({ periodo = null, usuarioId = null, estado = null } = {}) {
  const condiciones = [];
  const params = [];

  if (periodo) { condiciones.push('cg.periodo = ?'); params.push(periodo); }
  if (usuarioId) { condiciones.push('cg.usuario_id = ?'); params.push(usuarioId); }
  if (estado) { condiciones.push('cg.estado = ?'); params.push(estado); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return consultar(
    `SELECT cg.usuario_id, u.nombre AS usuario_nombre, cg.periodo, cg.estado,
            COUNT(*) AS lineas, SUM(cg.base) AS base, SUM(cg.valor) AS total
       FROM comisiones_generadas cg
       JOIN usuarios u ON u.id = cg.usuario_id
       ${where}
      GROUP BY cg.usuario_id, u.nombre, cg.periodo, cg.estado
      ORDER BY cg.periodo DESC, total DESC`,
    params
  );
}

async function liquidar(periodo, usuarioId = null) {
  const resultado = await ejecutar(
    `UPDATE comisiones_generadas
        SET estado = 'liquidada', liquidado_en = CURRENT_DATE
      WHERE periodo = ? AND estado = 'pendiente'
        AND (?::integer IS NULL OR usuario_id = ?::integer)`,
    [periodo, usuarioId, usuarioId]
  );
  return resultado.affectedRows;
}

/* ------------------------------------------------------------------
   Certificaciones
   ------------------------------------------------------------------ */

async function certificaciones({ usuarioId = null, porVencer = false } = {}) {
  const condiciones = [];
  const params = [];

  if (usuarioId) { condiciones.push('c.usuario_id = ?'); params.push(usuarioId); }
  if (porVencer) {
    condiciones.push(`c.vence_en IS NOT NULL AND c.vence_en <= CURRENT_DATE + INTERVAL '60 days'`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return consultar(
    `SELECT c.*, u.nombre AS usuario_nombre,
            (c.vence_en - CURRENT_DATE) AS dias_restantes
       FROM certificaciones c
       JOIN usuarios u ON u.id = c.usuario_id
       ${where}
      ORDER BY c.vence_en NULLS LAST, u.nombre`,
    params
  );
}

async function crearCertificacion(datos) {
  const resultado = await ejecutar(
    `INSERT INTO certificaciones (usuario_id, nombre, entidad, tipo, expedida_en, vence_en, archivo)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.usuarioId,
      datos.nombre,
      datos.entidad ?? null,
      datos.tipo,
      datos.expedidaEn ?? null,
      datos.venceEn ?? null,
      datos.archivo ?? null,
    ]
  );
  return resultado.insertId;
}

/**
 * Productividad del equipo en un rango: cuántos pacientes atendió cada quien y
 * cuánto facturó. Es lo que alimenta el ranking del panel de administración.
 */
async function productividad({ desde, hasta } = {}) {
  return consultar(
    `SELECT u.id AS usuario_id, u.nombre,
            COUNT(DISTINCT co.id)                        AS consultas,
            COUNT(DISTINCT co.historia_id)               AS pacientes,
            COUNT(DISTINCT ci.id) FILTER (WHERE ci.estado = 'atendida')   AS citas_atendidas,
            COUNT(DISTINCT ci.id) FILTER (WHERE ci.estado = 'no_asistio') AS inasistencias,
            COALESCE(SUM(DISTINCT f.total), 0)           AS facturado
       FROM veterinarios v
       JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN consultas co ON co.veterinario_id = v.id AND co.fecha BETWEEN ? AND ?
       LEFT JOIN citas ci     ON ci.veterinario_id = v.id AND ci.inicio BETWEEN ? AND ?
       LEFT JOIN facturas f   ON f.consulta_id = co.id AND f.estado <> 'anulada'
      WHERE v.activo = 1
      GROUP BY u.id, u.nombre
      ORDER BY consultas DESC`,
    [`${desde} 00:00:00`, `${hasta} 23:59:59`, `${desde} 00:00:00`, `${hasta} 23:59:59`]
  );
}

module.exports = {
  turnos,
  crearTurno,
  asignaciones,
  asignarTurno,
  quitarAsignacion,
  asistencia,
  registrarAsistencia,
  ausencias,
  ausenciaPorId,
  solicitarAusencia,
  resolverAusencia,
  reglasComision,
  crearReglaComision,
  calcularComisiones,
  comisiones,
  liquidar,
  certificaciones,
  crearCertificacion,
  productividad,
};
