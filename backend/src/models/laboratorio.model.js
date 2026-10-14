'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');
const { siguienteNumero } = require('../utils/consecutivos');

/**
 * Laboratorio.
 *
 * El circuito es orden → muestra → resultado → validación → aviso. Cada línea
 * de la orden crea un examen en historia_clinica.examenes, que es donde el
 * veterinario ya buscaba los resultados: así el laboratorio gana su flujo
 * propio sin partir la historia clínica en dos sitios.
 */

/* ------------------------------------------------------------------
   Órdenes
   ------------------------------------------------------------------ */

async function listar({ mascotaId, clienteId, estado, prioridad, desde, hasta, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (mascotaId) { condiciones.push('o.mascota_id = ?'); params.push(mascotaId); }
  // El dueño solo ve las órdenes de sus mascotas.
  if (clienteId) { condiciones.push('m.cliente_id = ?'); params.push(clienteId); }
  if (estado) { condiciones.push('o.estado = ?'); params.push(estado); }
  if (prioridad) { condiciones.push('o.prioridad = ?'); params.push(prioridad); }
  if (desde) { condiciones.push('o.fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('o.fecha <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT o.*, m.nombre AS mascota_nombre, m.foto AS mascota_foto, m.cliente_id,
            e.nombre AS especie, uv.nombre AS veterinario_nombre, uc.nombre AS cliente_nombre,
            (SELECT COUNT(*) FROM orden_laboratorio_items i WHERE i.orden_id = o.id) AS examenes,
            (SELECT COUNT(*) FROM orden_laboratorio_items i
               JOIN examenes ex ON ex.id = i.examen_id
              WHERE i.orden_id = o.id AND ex.estado = 'validado') AS validados,
            (SELECT COUNT(*) FROM muestras mu
              WHERE mu.orden_id = o.id AND mu.estado = 'rechazada') AS muestras_rechazadas
       FROM ordenes_laboratorio o
       JOIN mascotas m     ON m.id = o.mascota_id
       JOIN especies e     ON e.id = m.especie_id
       JOIN clientes cl    ON cl.id = m.cliente_id
       JOIN usuarios uc    ON uc.id = cl.usuario_id
       JOIN veterinarios v ON v.id = o.veterinario_id
       JOIN usuarios uv    ON uv.id = v.usuario_id
       ${where}
      ORDER BY (o.prioridad = 'urgente') DESC, o.fecha DESC
      LIMIT ${lim}`,
    params
  );
}

async function porId(id) {
  return consultarUna(
    `SELECT o.*, m.nombre AS mascota_nombre, m.cliente_id, m.peso_kg, m.fecha_nacimiento, m.sexo,
            e.id AS especie_id, e.nombre AS especie,
            uv.nombre AS veterinario_nombre, uc.nombre AS cliente_nombre,
            sd.nombre AS sede_nombre
       FROM ordenes_laboratorio o
       JOIN mascotas m     ON m.id = o.mascota_id
       JOIN especies e     ON e.id = m.especie_id
       JOIN clientes cl    ON cl.id = m.cliente_id
       JOIN usuarios uc    ON uc.id = cl.usuario_id
       JOIN veterinarios v ON v.id = o.veterinario_id
       JOIN usuarios uv    ON uv.id = v.usuario_id
       LEFT JOIN sedes sd  ON sd.id = o.sede_id
      WHERE o.id = ?`,
    [id]
  );
}

async function itemsDeOrden(ordenId) {
  return consultar(
    `SELECT i.*, te.nombre AS tipo_examen, te.categoria, te.precio,
            ex.estado, ex.conclusion, ex.fecha_resultado, ex.archivo_pdf,
            ex.validado_en, uv.nombre AS validado_por_nombre
       FROM orden_laboratorio_items i
       JOIN tipos_examen te ON te.id = i.tipo_examen_id
       LEFT JOIN examenes ex ON ex.id = i.examen_id
       LEFT JOIN usuarios uv ON uv.id = ex.validado_por
      WHERE i.orden_id = ?
      ORDER BY te.nombre`,
    [ordenId]
  );
}

/**
 * Crea la orden y, con ella, un examen por cada tipo pedido. Se hace aquí y no
 * al recibir la muestra para que el veterinario vea desde el primer momento
 * qué está pendiente en la historia del paciente.
 */
async function crearOrden(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const numero = await siguienteNumero(conexion, 'ordenes_laboratorio');

    const [resultado] = await conexion.execute(
      `INSERT INTO ordenes_laboratorio
         (numero, mascota_id, consulta_id, veterinario_id, sede_id, prioridad, indicaciones, ayuno)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        numero,
        datos.mascotaId,
        datos.consultaId ?? null,
        datos.veterinarioId,
        datos.sedeId ?? null,
        datos.prioridad,
        datos.indicaciones ?? null,
        datos.ayuno ? 1 : 0,
      ]
    );

    const ordenId = resultado.insertId;

    for (const tipoId of [...new Set(datos.tipos)]) {
      const [examen] = await conexion.execute(
        `INSERT INTO examenes
           (mascota_id, consulta_id, tipo_examen_id, solicitado_por, orden_id, estado)
         VALUES (?, ?, ?, ?, ?, 'solicitado')
         RETURNING id`,
        [datos.mascotaId, datos.consultaId ?? null, tipoId, datos.veterinarioId, ordenId]
      );

      await conexion.execute(
        'INSERT INTO orden_laboratorio_items (orden_id, tipo_examen_id, examen_id) VALUES (?, ?, ?)',
        [ordenId, tipoId, examen.insertId]
      );
    }

    return { id: ordenId, numero };
  }, usuarioId);
}

async function cambiarEstadoOrden(id, estado) {
  const resultado = await ejecutar(
    'UPDATE ordenes_laboratorio SET estado = ? WHERE id = ?',
    [estado, id]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Muestras
   ------------------------------------------------------------------ */

async function muestrasDeOrden(ordenId) {
  return consultar(
    `SELECT mu.*, u.nombre AS tomada_por_nombre
       FROM muestras mu
       LEFT JOIN usuarios u ON u.id = mu.tomada_por
      WHERE mu.orden_id = ?
      ORDER BY mu.id`,
    [ordenId]
  );
}

async function muestraPorId(id) {
  return consultarUna('SELECT * FROM muestras WHERE id = ?', [id]);
}

async function registrarMuestra(ordenId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const codigo = datos.codigo || (await siguienteNumero(conexion, 'muestras'));

    const [resultado] = await conexion.execute(
      `INSERT INTO muestras (orden_id, codigo, tipo, tomada_por, tomada_en, estado, observaciones)
       VALUES (?, ?, ?, ?, LOCALTIMESTAMP, 'tomada', ?)
       RETURNING id`,
      [ordenId, codigo, datos.tipo, usuarioId ?? null, datos.observaciones ?? null]
    );

    // Tomar la primera muestra pone la orden en proceso: es el momento en que
    // deja de estar solo pedida.
    await conexion.execute(
      `UPDATE ordenes_laboratorio SET estado = 'en_proceso' WHERE id = ? AND estado = 'solicitada'`,
      [ordenId]
    );

    return { id: resultado.insertId, codigo };
  }, usuarioId);
}

async function cambiarEstadoMuestra(id, datos) {
  const resultado = await ejecutar(
    `UPDATE muestras
        SET estado = ?,
            motivo_rechazo = ?,
            recibida_en = CASE WHEN ? = 'recibida' THEN COALESCE(recibida_en, LOCALTIMESTAMP) ELSE recibida_en END
      WHERE id = ?`,
    [datos.estado, datos.motivoRechazo ?? null, datos.estado, id]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Parámetros y rangos de referencia
   ------------------------------------------------------------------ */

async function parametrosDe(tipoExamenId) {
  return consultar(
    `SELECT * FROM parametros_laboratorio
      WHERE tipo_examen_id = ? AND activo = 1
      ORDER BY orden, nombre`,
    [tipoExamenId]
  );
}

/**
 * Rango normal de cada parámetro para un paciente concreto.
 *
 * Se elige el rango más específico que encaje: primero el de su especie y, si
 * lo hay, el que además coincide con su sexo y su edad. Un rango genérico solo
 * se usa cuando no hay ninguno mejor.
 */
async function rangosPara(tipoExamenId, { especieId = null, sexo = null, edadMeses = null } = {}) {
  return consultar(
    `SELECT DISTINCT ON (p.id)
            p.id AS parametro_id, p.codigo, p.nombre, p.unidad, p.decimales, p.orden,
            r.valor_min, r.valor_max, r.texto
       FROM parametros_laboratorio p
       LEFT JOIN rangos_referencia r
              ON r.parametro_id = p.id
             AND (r.especie_id IS NULL OR r.especie_id = ?)
             AND (r.sexo IS NULL OR r.sexo = ?)
             AND (r.edad_min_meses IS NULL OR ? IS NULL OR ? >= r.edad_min_meses)
             AND (r.edad_max_meses IS NULL OR ? IS NULL OR ? <= r.edad_max_meses)
      WHERE p.tipo_examen_id = ? AND p.activo = 1
      ORDER BY p.id,
               (r.especie_id IS NOT NULL) DESC,
               (r.sexo IS NOT NULL) DESC,
               (r.edad_min_meses IS NOT NULL) DESC`,
    [especieId, sexo, edadMeses, edadMeses, edadMeses, edadMeses, tipoExamenId]
  );
}

async function crearParametro(datos) {
  const resultado = await ejecutar(
    `INSERT INTO parametros_laboratorio (tipo_examen_id, codigo, nombre, unidad, orden, decimales)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [datos.tipoExamenId, datos.codigo ?? null, datos.nombre, datos.unidad ?? null, datos.orden ?? 0, datos.decimales ?? 2]
  );
  return resultado.insertId;
}

async function crearRango(datos) {
  const resultado = await ejecutar(
    `INSERT INTO rangos_referencia
       (parametro_id, especie_id, sexo, edad_min_meses, edad_max_meses, valor_min, valor_max, texto)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.parametroId,
      datos.especieId ?? null,
      datos.sexo ?? null,
      datos.edadMinMeses ?? null,
      datos.edadMaxMeses ?? null,
      datos.valorMin ?? null,
      datos.valorMax ?? null,
      datos.texto ?? null,
    ]
  );
  return resultado.insertId;
}

/* ------------------------------------------------------------------
   Resultados
   ------------------------------------------------------------------ */

async function resultadosDe(examenId) {
  return consultar(
    `SELECT r.*, p.codigo, p.decimales
       FROM resultados_examenes r
       LEFT JOIN parametros_laboratorio p ON p.id = r.parametro_id
      WHERE r.examen_id = ?
      ORDER BY COALESCE(p.orden, 999), r.id`,
    [examenId]
  );
}

/**
 * Guarda los resultados de un examen.
 *
 * Se borra lo anterior y se vuelve a insertar: corregir un valor mal digitado
 * es lo normal, y llevar versiones de cada renglón complicaría la pantalla sin
 * aportar nada que la auditoría no cubra ya.
 *
 * `fuera_rango` se calcula aquí comparando con el rango que aplica al paciente,
 * para que la pantalla no tenga que repetir esa lógica.
 */
async function guardarResultados(examenId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    await conexion.execute('DELETE FROM resultados_examenes WHERE examen_id = ?', [examenId]);

    for (const r of datos.resultados) {
      const numero = Number.parseFloat(String(r.valor ?? '').replace(',', '.'));
      const valorNumerico = Number.isFinite(numero) ? numero : null;

      let fueraRango = 0;
      if (r.parametroId && valorNumerico !== null) {
        const rango = await conexion.consultarUna(
          `SELECT valor_min, valor_max
             FROM rangos_referencia rr
             JOIN examenes ex ON ex.id = ?
             JOIN mascotas m  ON m.id = ex.mascota_id
            WHERE rr.parametro_id = ?
              AND (rr.especie_id IS NULL OR rr.especie_id = m.especie_id)
            ORDER BY (rr.especie_id IS NOT NULL) DESC
            LIMIT 1`,
          [examenId, r.parametroId]
        );

        if (rango) {
          const bajo = rango.valor_min !== null && valorNumerico < Number(rango.valor_min);
          const alto = rango.valor_max !== null && valorNumerico > Number(rango.valor_max);
          fueraRango = bajo || alto ? 1 : 0;
        }
      }

      await conexion.execute(
        `INSERT INTO resultados_examenes
           (examen_id, parametro_id, parametro, valor, valor_numerico, unidad, referencia, fuera_rango, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          examenId,
          r.parametroId ?? null,
          r.parametro,
          r.valor ?? null,
          valorNumerico,
          r.unidad ?? null,
          r.referencia ?? null,
          fueraRango,
          r.notas ?? null,
        ]
      );
    }

    await conexion.execute(
      `UPDATE examenes
          SET estado = 'listo',
              fecha_resultado = CURRENT_DATE,
              conclusion = COALESCE(?, conclusion),
              archivo_pdf = COALESCE(?, archivo_pdf)
        WHERE id = ?`,
      [datos.conclusion ?? null, datos.archivoPdf ?? null, examenId]
    );
  }, usuarioId);
}

/**
 * Validación: es lo que autoriza a avisar al propietario. Antes de este paso el
 * resultado existe pero no ha pasado por los ojos de nadie.
 */
async function validar(examenId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `UPDATE examenes
          SET estado = 'validado',
              validado_por = ?,
              validado_en = LOCALTIMESTAMP,
              conclusion = COALESCE(?, conclusion)
        WHERE id = ? AND estado = 'listo'
        RETURNING id, orden_id, mascota_id`,
      [usuarioId ?? null, datos.conclusion ?? null, examenId]
    );

    if (!resultado.affectedRows) return null;
    const examen = resultado.rows[0];

    // Cuando ya no queda ningún examen sin validar, la orden se da por cerrada.
    if (examen.orden_id) {
      await conexion.execute(
        `UPDATE ordenes_laboratorio o
            SET estado = 'completada'
          WHERE o.id = ?
            AND NOT EXISTS (
              SELECT 1 FROM orden_laboratorio_items i
                JOIN examenes ex ON ex.id = i.examen_id
               WHERE i.orden_id = o.id AND ex.estado <> 'validado')`,
        [examen.orden_id]
      );
    }

    return examen;
  }, usuarioId);
}

async function marcarAvisado(examenId) {
  await ejecutar('UPDATE examenes SET avisado_en = LOCALTIMESTAMP WHERE id = ?', [examenId]);
}

async function examenPorId(id) {
  return consultarUna(
    `SELECT ex.*, te.nombre AS tipo_examen, te.categoria,
            m.nombre AS mascota_nombre, m.cliente_id, m.especie_id, m.sexo, m.fecha_nacimiento,
            o.numero AS orden_numero, uv.nombre AS solicitado_por_nombre
       FROM examenes ex
       LEFT JOIN tipos_examen te ON te.id = ex.tipo_examen_id
       JOIN mascotas m ON m.id = ex.mascota_id
       LEFT JOIN ordenes_laboratorio o ON o.id = ex.orden_id
       LEFT JOIN veterinarios v ON v.id = ex.solicitado_por
       LEFT JOIN usuarios uv    ON uv.id = v.usuario_id
      WHERE ex.id = ?`,
    [id]
  );
}

/**
 * Evolución de un parámetro a lo largo del tiempo. Es lo que convierte una
 * pila de hemogramas sueltos en una curva que se puede leer.
 */
async function evolucionParametro(mascotaId, parametroId) {
  return consultar(
    `SELECT ex.fecha_resultado AS fecha, r.valor_numerico AS valor, r.unidad, r.fuera_rango
       FROM resultados_examenes r
       JOIN examenes ex ON ex.id = r.examen_id
      WHERE ex.mascota_id = ? AND r.parametro_id = ?
        AND r.valor_numerico IS NOT NULL AND ex.fecha_resultado IS NOT NULL
      ORDER BY ex.fecha_resultado`,
    [mascotaId, parametroId]
  );
}

/** Exámenes solicitados que llevan demasiado sin resultado (para las alertas). */
async function pendientesAntiguos(dias = 5) {
  return consultar(
    `SELECT ex.id, ex.mascota_id, m.nombre AS mascota, te.nombre AS examen,
            ex.fecha_solicitud, (CURRENT_DATE - ex.fecha_solicitud) AS dias
       FROM examenes ex
       JOIN mascotas m ON m.id = ex.mascota_id
       LEFT JOIN tipos_examen te ON te.id = ex.tipo_examen_id
      WHERE ex.estado IN ('solicitado','en_proceso')
        AND ex.fecha_solicitud < CURRENT_DATE - ?::int
      ORDER BY ex.fecha_solicitud`,
    [dias]
  );
}

module.exports = {
  listar,
  porId,
  itemsDeOrden,
  crearOrden,
  cambiarEstadoOrden,
  muestrasDeOrden,
  muestraPorId,
  registrarMuestra,
  cambiarEstadoMuestra,
  parametrosDe,
  rangosPara,
  crearParametro,
  crearRango,
  resultadosDe,
  guardarResultados,
  validar,
  marcarAvisado,
  examenPorId,
  evolucionParametro,
  pendientesAntiguos,
};
