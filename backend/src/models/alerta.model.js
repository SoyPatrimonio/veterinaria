'use strict';

const { consultar, consultarUna, ejecutar } = require('../config/database');

/**
 * Alertas críticas.
 *
 * Una alerta no es una notificación. La notificación se lee y se descarta; la
 * alerta se queda hasta que alguien la resuelve. Por eso viven en tablas
 * distintas y esta tiene estado.
 *
 * Las alertas se recalculan: cada regla es una consulta que dice qué está mal
 * ahora mismo. La `clave_unica` evita que se dupliquen —un producto vencido no
 * puede generar una alerta nueva cada vez que alguien abre el panel— y las que
 * dejan de cumplirse se cierran solas.
 */

/* ------------------------------------------------------------------
   Consulta
   ------------------------------------------------------------------ */

async function listar({ categoria = null, severidad = null, estado = null, sedeId = null, limite = 80 } = {}) {
  const condiciones = [];
  const params = [];

  if (categoria) { condiciones.push('a.categoria = ?'); params.push(categoria); }
  if (severidad) { condiciones.push('a.severidad = ?'); params.push(severidad); }
  if (estado) { condiciones.push('a.estado = ?'); params.push(estado); }
  else condiciones.push(`a.estado IN ('abierta','vista')`);
  if (sedeId) { condiciones.push('(a.sede_id = ? OR a.sede_id IS NULL)'); params.push(sedeId); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 80, 1), 200);

  return consultar(
    `SELECT a.*, m.nombre AS mascota, s.nombre AS sede_nombre, u.nombre AS atendida_por_nombre
       FROM alertas_criticas a
       LEFT JOIN mascotas m ON m.id = a.mascota_id
       LEFT JOIN sedes s    ON s.id = a.sede_id
       LEFT JOIN usuarios u ON u.id = a.atendida_por
       ${where}
      ORDER BY
        CASE a.severidad WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
        a.creado_en DESC
      LIMIT ${lim}`,
    params
  );
}

async function porId(id) {
  return consultarUna('SELECT * FROM alertas_criticas WHERE id = ?', [id]);
}

/** Cuántas hay abiertas por severidad y categoría, para las insignias del panel. */
async function resumen() {
  const [porSeveridad, porCategoria, totales] = await Promise.all([
    consultar(
      `SELECT severidad, COUNT(*) AS total FROM alertas_criticas
        WHERE estado IN ('abierta','vista') GROUP BY severidad`
    ),
    consultar(
      `SELECT categoria, COUNT(*) AS total FROM alertas_criticas
        WHERE estado IN ('abierta','vista') GROUP BY categoria ORDER BY total DESC`
    ),
    consultarUna(
      `SELECT COUNT(*) FILTER (WHERE estado = 'abierta')                          AS sin_ver,
              COUNT(*) FILTER (WHERE estado IN ('abierta','vista'))               AS abiertas,
              COUNT(*) FILTER (WHERE estado IN ('abierta','vista')
                                 AND severidad = 'critica')                       AS criticas
         FROM alertas_criticas`
    ),
  ]);

  return { porSeveridad, porCategoria, ...totales };
}

async function resolver(id, datos, usuarioId) {
  const resultado = await ejecutar(
    `UPDATE alertas_criticas
        SET estado = ?, nota_cierre = COALESCE(?, nota_cierre),
            atendida_por = CASE WHEN ? = 'vista' THEN atendida_por ELSE ? END,
            atendida_en  = CASE WHEN ? = 'vista' THEN atendida_en  ELSE LOCALTIMESTAMP END
      WHERE id = ? AND estado IN ('abierta','vista')`,
    [datos.estado, datos.notaCierre ?? null, datos.estado, usuarioId, datos.estado, id]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Reglas
   ------------------------------------------------------------------ */

async function reglas() {
  return consultar('SELECT * FROM reglas_alerta ORDER BY categoria, codigo');
}

async function actualizarRegla(id, datos) {
  const resultado = await ejecutar(
    `UPDATE reglas_alerta
        SET severidad = COALESCE(?, severidad),
            parametros = COALESCE(?::jsonb, parametros),
            activo = COALESCE(?, activo)
      WHERE id = ?`,
    [
      datos.severidad ?? null,
      datos.parametros ? JSON.stringify(datos.parametros) : null,
      datos.activo === undefined ? null : Number(datos.activo),
      id,
    ]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Generación
   ------------------------------------------------------------------ */

/**
 * Cada regla es una consulta que devuelve las filas que están mal ahora.
 *
 * Se escriben aquí y no en la base porque necesitan lógica de presentación
 * (títulos legibles) y porque así el catálogo de reglas de la tabla puede
 * activarlas y ajustarles umbrales sin tener que reescribir SQL guardado.
 *
 * `clave` tiene que identificar el problema, no el momento: 'lote_vencido:42'
 * es la misma alerta hoy y mañana.
 */
const DETECTORES = {
  // --- Clínica ---
  hospitalizado_sin_control: {
    categoria: 'clinica',
    severidad: 'alta',
    sql: `SELECT 'hosp_sin_control:' || h.id AS clave,
                 h.id AS entidad_id, 'hospitalizaciones' AS entidad,
                 h.mascota_id, h.sede_id,
                 'Paciente hospitalizado sin control' AS titulo,
                 m.nombre || ' lleva más de ' || ? || ' horas sin control registrado.' AS mensaje,
                 'admin/hospitalizacion.html' AS enlace
            FROM hospitalizaciones h
            JOIN mascotas m ON m.id = h.mascota_id
           WHERE h.estado = 'activa'
             AND COALESCE(
                   (SELECT MAX(c.fecha) FROM hospitalizacion_controles c
                     WHERE c.hospitalizacion_id = h.id),
                   h.fecha_ingreso
                 ) < LOCALTIMESTAMP - (? * INTERVAL '1 hour')`,
    params: (p) => [p.horas ?? 8, p.horas ?? 8],
  },

  alergia_registrada: {
    categoria: 'clinica',
    severidad: 'critica',
    // Una alergia sola no es una alerta: lo es cuando el paciente tiene un
    // tratamiento activo y hay que mirar dos veces qué se le está dando.
    sql: `SELECT 'alergia:' || ma.id AS clave,
                 ma.id AS entidad_id, 'mascota_alergias' AS entidad,
                 ma.mascota_id, NULL::smallint AS sede_id,
                 'Paciente con alergia y tratamiento activo' AS titulo,
                 m.nombre || ' es alérgico a ' || a.nombre || ' (' || ma.severidad ||
                   ') y tiene tratamiento en curso.' AS mensaje,
                 'veterinario/historia.html' AS enlace
            FROM mascota_alergias ma
            JOIN alergias a ON a.id = ma.alergia_id
            JOIN mascotas m ON m.id = ma.mascota_id
           WHERE a.tipo = 'medicamento' AND ma.severidad IN ('moderada','grave')
             AND m.activo = 1 AND m.fallecido = 0
             AND EXISTS (
               SELECT 1 FROM tratamientos t
                 JOIN consultas c ON c.id = t.consulta_id
                 JOIN historias_clinicas h ON h.id = c.historia_id
                WHERE h.mascota_id = m.id AND t.estado = 'activo')`,
    params: () => [],
  },

  medicamento_incompatible: {
    categoria: 'clinica',
    severidad: 'critica',
    // Cruza el catálogo de interacciones con lo que el paciente tiene recetado
    // y vigente. Es un aviso para que alguien lo mire, no un veto.
    sql: `SELECT DISTINCT
                 'interaccion:' || h.mascota_id || ':' || i.id AS clave,
                 i.id AS entidad_id, 'interacciones_medicamentosas' AS entidad,
                 h.mascota_id, NULL::smallint AS sede_id,
                 'Posible interacción medicamentosa' AS titulo,
                 m.nombre || ': ' || i.principio_a || ' + ' || i.principio_b ||
                   ' (' || i.severidad || '). ' || i.efecto AS mensaje,
                 'veterinario/historia.html' AS enlace
            FROM interacciones_medicamentosas i
            JOIN prescripciones pa ON EXISTS (
                   SELECT 1 FROM medicamentos me
                    WHERE me.id = pa.medicamento_id AND me.principio_activo = i.principio_a)
            JOIN prescripciones pb ON EXISTS (
                   SELECT 1 FROM medicamentos me
                    WHERE me.id = pb.medicamento_id AND me.principio_activo = i.principio_b)
            JOIN tratamientos ta ON ta.id = pa.tratamiento_id AND ta.estado = 'activo'
            JOIN tratamientos tb ON tb.id = pb.tratamiento_id AND tb.estado = 'activo'
            JOIN consultas ca ON ca.id = ta.consulta_id
            JOIN consultas cb ON cb.id = tb.consulta_id AND cb.historia_id = ca.historia_id
            JOIN historias_clinicas h ON h.id = ca.historia_id
            JOIN mascotas m ON m.id = h.mascota_id
           WHERE i.activo = 1 AND i.severidad IN ('grave','contraindicada')`,
    params: () => [],
  },

  medicacion_vencida: {
    categoria: 'clinica',
    severidad: 'critica',
    sql: `SELECT 'medicacion:' || hm.id AS clave,
                 hm.id AS entidad_id, 'hospitalizacion_medicacion' AS entidad,
                 h.mascota_id, h.sede_id,
                 'Medicación pendiente' AS titulo,
                 m.nombre || ': ' || hm.descripcion || ' estaba programada para ' ||
                   to_char(hm.proxima_toma, 'HH24:MI') AS mensaje,
                 'admin/hospitalizacion.html' AS enlace
            FROM hospitalizacion_medicacion hm
            JOIN hospitalizaciones h ON h.id = hm.hospitalizacion_id
            JOIN mascotas m ON m.id = h.mascota_id
           WHERE hm.estado = 'activo' AND h.estado = 'activa'
             AND hm.proxima_toma IS NOT NULL
             AND hm.proxima_toma < LOCALTIMESTAMP`,
    params: () => [],
  },

  urgencia_sin_atender: {
    categoria: 'clinica',
    severidad: 'critica',
    sql: `SELECT 'urgencia:' || iu.id AS clave,
                 iu.id AS entidad_id, 'ingresos_urgencias' AS entidad,
                 iu.mascota_id, iu.sede_id,
                 'Urgencia sin atender' AS titulo,
                 m.nombre || ' (' || COALESCE(iu.prioridad, 'sin triage') || ') lleva ' ||
                   EXTRACT(EPOCH FROM (LOCALTIMESTAMP - iu.llegada))::integer / 60 ||
                   ' minutos esperando.' AS mensaje,
                 'veterinario/urgencias.html' AS enlace
            FROM ingresos_urgencias iu
            JOIN mascotas m ON m.id = iu.mascota_id
           WHERE iu.estado IN ('en_espera','en_triage')
             AND iu.llegada < LOCALTIMESTAMP - (? * INTERVAL '1 minute')`,
    params: (p) => [p.minutos ?? 15],
  },

  examen_pendiente: {
    categoria: 'clinica',
    severidad: 'media',
    sql: `SELECT 'examen:' || e.id AS clave,
                 e.id AS entidad_id, 'examenes' AS entidad,
                 e.mascota_id, NULL::smallint AS sede_id,
                 'Examen sin resultado' AS titulo,
                 m.nombre || ': ' || COALESCE(te.nombre, e.descripcion, 'examen') ||
                   ' solicitado hace ' || (CURRENT_DATE - e.fecha_solicitud) || ' días.' AS mensaje,
                 'admin/laboratorio.html' AS enlace
            FROM examenes e
            JOIN mascotas m ON m.id = e.mascota_id
            LEFT JOIN tipos_examen te ON te.id = e.tipo_examen_id
           WHERE e.estado IN ('solicitado','en_proceso')
             AND e.fecha_solicitud < CURRENT_DATE - (? * INTERVAL '1 day')`,
    params: (p) => [p.dias ?? 5],
  },

  vacuna_pendiente: {
    categoria: 'clinica',
    severidad: 'alta',
    sql: `SELECT 'vacuna:' || v.mascota_id || ':' || v.vacuna_id AS clave,
                 v.mascota_id AS entidad_id, 'aplicaciones_vacunas' AS entidad,
                 v.mascota_id, NULL::smallint AS sede_id,
                 CASE WHEN v.situacion = 'vencida' THEN 'Vacuna vencida'
                      ELSE 'Refuerzo de vacuna próximo' END AS titulo,
                 v.mascota || ': ' || v.vacuna ||
                   CASE WHEN v.situacion = 'vencida'
                        THEN ' venció el ' || to_char(v.proxima_fecha, 'DD/MM/YYYY') || '.'
                        ELSE ' toca el ' || to_char(v.proxima_fecha, 'DD/MM/YYYY') || '.' END AS mensaje,
                 'admin/vacunacion.html' AS enlace
            FROM v_vacunas_pendientes v
           WHERE v.proxima_fecha <= CURRENT_DATE + (? * INTERVAL '1 day')
             -- Un refuerzo de hace dos años ya no es una alerta accionable:
             -- es un paciente que dejó de venir, y eso lo cubre reactivación.
             AND v.proxima_fecha >= CURRENT_DATE - INTERVAL '1 year'`,
    params: (p) => [p.dias_aviso ?? 30],
  },

  // --- Inventario ---
  producto_vencido: {
    categoria: 'inventario',
    severidad: 'alta',
    // Cubre vencidos y por vencer en la misma regla: es el mismo problema en
    // dos momentos, y el mensaje distingue cuál de los dos es.
    sql: `SELECT 'lote:' || l.id AS clave,
                 l.id AS entidad_id, 'lotes' AS entidad,
                 NULL::integer AS mascota_id, NULL::smallint AS sede_id,
                 CASE WHEN l.situacion = 'vencido' THEN 'Producto vencido en existencia'
                      ELSE 'Producto próximo a vencer' END AS titulo,
                 l.producto || ' — lote ' || l.codigo ||
                   CASE WHEN l.situacion = 'vencido'
                        THEN ' venció el ' || to_char(l.fecha_vencimiento, 'DD/MM/YYYY')
                        ELSE ' vence en ' || l.dias_restantes || ' días' END ||
                   ' y quedan ' || l.cantidad || ' unidades.' AS mensaje,
                 'admin/inventario.html' AS enlace
            FROM v_lotes_vencimiento l
           WHERE l.cantidad > 0 AND l.dias_restantes <= ?`,
    params: (p) => [p.dias_aviso ?? 30],
  },

  inventario_critico: {
    categoria: 'inventario',
    severidad: 'alta',
    sql: `SELECT 'stock:' || p.id AS clave,
                 p.id AS entidad_id, 'productos' AS entidad,
                 NULL::integer AS mascota_id, NULL::smallint AS sede_id,
                 'Inventario en mínimos' AS titulo,
                 p.nombre || ': quedan ' || p.cantidad || ' de un mínimo de ' ||
                   p.stock_minimo || '.' AS mensaje,
                 'admin/inventario.html' AS enlace
            FROM productos p
           WHERE p.activo = 1 AND p.cantidad <= p.stock_minimo`,
    params: () => [],
  },

  // --- Agenda ---
  cita_superpuesta: {
    categoria: 'agenda',
    severidad: 'alta',
    sql: `SELECT 'cita_solapada:' || LEAST(a.id, b.id) || ':' || GREATEST(a.id, b.id) AS clave,
                 LEAST(a.id, b.id) AS entidad_id, 'citas' AS entidad,
                 NULL::integer AS mascota_id, a.sede_id,
                 'Citas superpuestas' AS titulo,
                 u.nombre || ' tiene dos citas cruzadas el ' ||
                   to_char(a.inicio, 'DD/MM HH24:MI') || '.' AS mensaje,
                 'admin/citas.html' AS enlace
            FROM citas a
            JOIN citas b ON b.veterinario_id = a.veterinario_id AND b.id > a.id
                        AND a.inicio < b.fin AND b.inicio < a.fin
            JOIN veterinarios v ON v.id = a.veterinario_id
            JOIN usuarios u ON u.id = v.usuario_id
           WHERE a.estado NOT IN ('cancelada','no_asistio')
             AND b.estado NOT IN ('cancelada','no_asistio')
             AND a.inicio >= LOCALTIMESTAMP`,
    params: () => [],
  },

  // --- Facturación ---
  factura_vencida: {
    categoria: 'facturacion',
    severidad: 'media',
    sql: `SELECT 'factura:' || f.id AS clave,
                 f.id AS entidad_id, 'facturas' AS entidad,
                 NULL::integer AS mascota_id, f.sede_id,
                 'Factura vencida sin pagar' AS titulo,
                 f.numero || ' de ' || u.nombre || ': saldo de $' ||
                   to_char(f.total - f.pagado, 'FM999,999,999') || ' con ' ||
                   (CURRENT_DATE - f.fecha) || ' días.' AS mensaje,
                 'admin/facturacion.html' AS enlace
            FROM facturas f
            JOIN clientes cl ON cl.id = f.cliente_id
            JOIN usuarios u  ON u.id = cl.usuario_id
           WHERE f.estado IN ('pendiente','parcial')
             AND f.fecha < CURRENT_DATE - (? * INTERVAL '1 day')`,
    params: (p) => [p.dias ?? 30],
  },

  // --- Equipos ---
  equipo_mantenimiento: {
    categoria: 'equipos',
    severidad: 'alta',
    // Mantenimiento y calibración en una sola regla: para quien mira el panel
    // es el mismo pendiente, y el mensaje dice cuál de los dos toca.
    sql: `SELECT 'equipo:' || e.id AS clave,
                 e.id AS entidad_id, 'equipos_medicos' AS entidad,
                 NULL::integer AS mascota_id, e.sede_id,
                 CASE WHEN e.requiere_calibracion = 1
                       AND e.proxima_calibracion IS NOT NULL
                       AND e.proxima_calibracion <= CURRENT_DATE + (? * INTERVAL '1 day')
                      THEN 'Equipo pendiente de calibración'
                      ELSE 'Equipo pendiente de mantenimiento' END AS titulo,
                 e.nombre || ': vence el ' ||
                   to_char(LEAST(
                     COALESCE(e.proximo_mantenimiento, DATE '9999-12-31'),
                     COALESCE(e.proxima_calibracion,   DATE '9999-12-31')), 'DD/MM/YYYY') || '.' AS mensaje,
                 'admin/equipos.html' AS enlace
            FROM equipos_medicos e
           WHERE e.activo = 1 AND e.estado <> 'dado_baja'
             AND (
               (e.proximo_mantenimiento IS NOT NULL
                  AND e.proximo_mantenimiento <= CURRENT_DATE + (? * INTERVAL '1 day'))
               OR (e.requiere_calibracion = 1 AND e.proxima_calibracion IS NOT NULL
                  AND e.proxima_calibracion <= CURRENT_DATE + (? * INTERVAL '1 day'))
             )`,
    params: (p) => [p.dias_aviso ?? 15, p.dias_aviso ?? 15, p.dias_aviso ?? 15],
  },

  // --- Personal ---
  certificacion_vencida: {
    categoria: 'personal',
    severidad: 'alta',
    sql: `SELECT 'certificacion:' || c.id AS clave,
                 c.id AS entidad_id, 'certificaciones' AS entidad,
                 NULL::integer AS mascota_id, NULL::smallint AS sede_id,
                 'Certificación por vencer' AS titulo,
                 u.nombre || ': ' || c.nombre || ' vence el ' ||
                   to_char(c.vence_en, 'DD/MM/YYYY') || '.' AS mensaje,
                 'admin/personal.html' AS enlace
            FROM certificaciones c
            JOIN usuarios u ON u.id = c.usuario_id
           WHERE c.vence_en IS NOT NULL
             AND c.vence_en <= CURRENT_DATE + (? * INTERVAL '1 day')`,
    params: (p) => [p.dias_aviso ?? 60],
  },

  // --- Soporte (plazo legal de PQRS) ---
  pqrs_por_vencer: {
    categoria: 'seguridad',
    severidad: 'alta',
    sql: `SELECT 'pqrs:' || t.id AS clave,
                 t.id AS entidad_id, 'tickets' AS entidad,
                 NULL::integer AS mascota_id, t.sede_id,
                 'PQRS por vencer' AS titulo,
                 t.numero || ' (' || t.tipo || ') vence el ' ||
                   to_char(t.vence_en, 'DD/MM/YYYY') || '.' AS mensaje,
                 'admin/soporte.html' AS enlace
            FROM tickets t
           WHERE t.estado NOT IN ('resuelto','cerrado')
             AND t.vence_en IS NOT NULL
             AND t.vence_en <= LOCALTIMESTAMP + (? * INTERVAL '1 day')`,
    params: (p) => [p.dias ?? 3],
  },
};

/**
 * Recalcula todas las alertas.
 *
 * Devuelve cuántas se abrieron y cuántas se cerraron solas. Lo llama el panel
 * al abrirse: como en Vercel no hay proceso en segundo plano, es el propio uso
 * del sistema el que hace de reloj, igual que con los recordatorios.
 */
async function recalcular() {
  const catalogo = await consultar('SELECT * FROM reglas_alerta WHERE activo = 1');
  let abiertas = 0;
  const clavesVigentes = [];

  for (const regla of catalogo) {
    const detector = DETECTORES[regla.codigo];
    if (!detector) continue;

    const parametros = regla.parametros || {};
    let filas;

    try {
      filas = await consultar(detector.sql, detector.params(parametros));
    } catch (error) {
      // Una regla rota no puede tumbar las demás: se anota y se sigue. Sin esto
      // un error en un detector dejaría a la clínica sin ninguna alerta.
      console.error(`[alertas] la regla "${regla.codigo}" falló: ${error.message}`);
      continue;
    }

    for (const fila of filas) {
      clavesVigentes.push(fila.clave);

      const resultado = await ejecutar(
        `INSERT INTO alertas_criticas
           (regla_id, codigo, categoria, severidad, titulo, mensaje, entidad, entidad_id,
            mascota_id, sede_id, enlace, clave_unica)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (clave_unica) WHERE clave_unica IS NOT NULL
                                     AND estado IN ('abierta','vista')
         DO UPDATE SET mensaje = EXCLUDED.mensaje, severidad = EXCLUDED.severidad
         RETURNING id, (xmax = 0) AS nueva`,
        [
          regla.id, regla.codigo, regla.categoria, regla.severidad,
          fila.titulo, fila.mensaje, fila.entidad, fila.entidad_id,
          fila.mascota_id, fila.sede_id, fila.enlace, fila.clave,
        ]
      );

      if (resultado.rows[0]?.nueva) abiertas += 1;
    }
  }

  // Lo que ya no cumple la condición se cierra solo: si alguien repuso el
  // producto o dio el control pendiente, la alerta no tiene por qué seguir ahí.
  const resueltas = await ejecutar(
    `UPDATE alertas_criticas
        SET estado = 'resuelta', atendida_en = LOCALTIMESTAMP,
            nota_cierre = COALESCE(nota_cierre, 'Se resolvió sola: la condición ya no se cumple.')
      WHERE estado IN ('abierta','vista')
        AND clave_unica IS NOT NULL
        AND clave_unica <> ALL (?::text[])`,
    [clavesVigentes]
  );

  return { abiertas, resueltas: resueltas.affectedRows, evaluadas: catalogo.length };
}

module.exports = {
  DETECTORES,
  listar,
  porId,
  resumen,
  resolver,
  reglas,
  actualizarRegla,
  recalcular,
};
