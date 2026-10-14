'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

/**
 * Historia clínica: consultas, constantes, diagnósticos, tratamientos,
 * vacunas y exámenes.
 *
 * Una consulta no es una fila suelta: se guarda junto con sus signos vitales,
 * sus diagnósticos y sus tratamientos con recetas. Por eso las escrituras van
 * dentro de una transacción — a medias no sirve de nada, y la historia clínica
 * es justamente el registro que no puede quedar incompleto.
 */

const SELECT_CONSULTA = `
  SELECT c.id, c.historia_id, c.cita_id, c.veterinario_id, c.sede_id, c.fecha,
         c.tipo, c.motivo, c.anamnesis, c.sintomas, c.examen_fisico,
         c.observaciones, c.plan_manejo, c.estado, c.creado_en,
         h.mascota_id, h.numero AS historia_numero,
         m.nombre AS mascota_nombre, m.cliente_id,
         e.nombre AS especie,
         uc.nombre AS cliente_nombre,
         uv.nombre AS veterinario_nombre, v.especialidad
    FROM consultas c
    JOIN historias_clinicas h ON h.id = c.historia_id
    JOIN mascotas m           ON m.id = h.mascota_id
    JOIN especies e           ON e.id = m.especie_id
    JOIN clientes cl          ON cl.id = m.cliente_id
    JOIN usuarios uc          ON uc.id = cl.usuario_id
    JOIN veterinarios v       ON v.id = c.veterinario_id
    JOIN usuarios uv          ON uv.id = v.usuario_id`;

/**
 * La historia la abre un disparador al registrar la mascota. Esto la crea de
 * todos modos si falta: una mascota importada a mano o cargada antes de que
 * existiera el disparador no puede quedarse sin poder registrar consultas.
 */
async function asegurarHistoria(mascotaId) {
  const existente = await consultarUna('SELECT * FROM historias_clinicas WHERE mascota_id = ?', [mascotaId]);
  if (existente) return existente;

  await ejecutar(
    `INSERT INTO historias_clinicas (mascota_id, numero)
     VALUES (?, 'HC-' || LPAD(?::text, 6, '0'))
     ON CONFLICT (mascota_id) DO NOTHING`,
    [mascotaId, mascotaId]
  );
  return consultarUna('SELECT * FROM historias_clinicas WHERE mascota_id = ?', [mascotaId]);
}

async function listarConsultas({ mascotaId, clienteId, veterinarioId, tipo, desde, hasta, limite = 50 }) {
  const condiciones = [];
  const params = [];

  if (mascotaId) { condiciones.push('h.mascota_id = ?'); params.push(mascotaId); }
  // El dueño solo ve la historia de sus propias mascotas. Va aquí y no en el
  // controlador porque es la condición que recorta las filas de verdad.
  if (clienteId) { condiciones.push('m.cliente_id = ?'); params.push(clienteId); }
  if (veterinarioId) { condiciones.push('c.veterinario_id = ?'); params.push(veterinarioId); }
  if (tipo) { condiciones.push('c.tipo = ?'); params.push(tipo); }
  if (desde) { condiciones.push('c.fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('c.fecha <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(`${SELECT_CONSULTA} ${where} ORDER BY c.fecha DESC LIMIT ${lim}`, params);
}

async function consultaPorId(id) {
  return consultarUna(`${SELECT_CONSULTA} WHERE c.id = ?`, [id]);
}

/** Todo lo que cuelga de una consulta, para pintarla completa. */
async function detalleConsulta(id) {
  const [signos, diagnosticos, tratamientos] = await Promise.all([
    consultar('SELECT * FROM signos_vitales WHERE consulta_id = ? ORDER BY fecha', [id]),
    consultar(
      `SELECT cd.*, cat.nombre AS diagnostico_nombre, cat.codigo
         FROM consulta_diagnosticos cd
         LEFT JOIN catalogo_diagnosticos cat ON cat.id = cd.diagnostico_id
        WHERE cd.consulta_id = ?
        ORDER BY cd.principal DESC, cd.id`,
      [id]
    ),
    consultar('SELECT * FROM tratamientos WHERE consulta_id = ? ORDER BY id', [id]),
  ]);

  // Las recetas se piden de una sola vez y se reparten en memoria: una consulta
  // por tratamiento serían N viajes a la base para pintar una sola pantalla.
  const idsTratamiento = tratamientos.map((t) => t.id);
  let prescripciones = [];
  if (idsTratamiento.length) {
    prescripciones = await consultar(
      `SELECT p.*, med.nombre AS medicamento, med.presentacion, med.concentracion
         FROM prescripciones p
         JOIN medicamentos med ON med.id = p.medicamento_id
        WHERE p.tratamiento_id = ANY(?)
        ORDER BY p.id`,
      [idsTratamiento]
    );
  }

  return {
    signos,
    diagnosticos,
    tratamientos: tratamientos.map((t) => ({
      ...t,
      prescripciones: prescripciones.filter((p) => p.tratamiento_id === t.id),
    })),
  };
}

async function crearConsulta(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const historia = await conexion.consultarUna(
      'SELECT id FROM historias_clinicas WHERE mascota_id = ?',
      [datos.mascotaId]
    );

    const [resultado] = await conexion.execute(
      `INSERT INTO consultas (historia_id, cita_id, veterinario_id, sede_id, tipo, motivo,
                              anamnesis, sintomas, examen_fisico, observaciones, plan_manejo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        historia.id,
        datos.citaId ?? null,
        datos.veterinarioId,
        datos.sedeId ?? null,
        datos.tipo || 'consulta',
        datos.motivo,
        datos.anamnesis ?? null,
        datos.sintomas ?? null,
        datos.examenFisico ?? null,
        datos.observaciones ?? null,
        datos.planManejo ?? null,
      ]
    );
    const consultaId = resultado.insertId;

    const signos = datos.signos || {};
    const hayConstantes = Object.values(signos).some((v) => v !== null && v !== undefined && v !== '');
    if (hayConstantes) {
      // El disparador trg_signos_peso copia el peso a la ficha de la mascota
      // y a su curva, así que aquí no hay que actualizarlas a mano.
      await conexion.execute(
        `INSERT INTO signos_vitales (consulta_id, mascota_id, tomado_por, peso_kg, temperatura_c,
                                     frec_cardiaca, frec_respiratoria, mucosas, hidratacion,
                                     condicion_corporal, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          consultaId,
          datos.mascotaId,
          usuarioId ?? null,
          signos.pesoKg ?? null,
          signos.temperaturaC ?? null,
          signos.frecCardiaca ?? null,
          signos.frecRespiratoria ?? null,
          signos.mucosas ?? null,
          signos.hidratacion ?? null,
          signos.condicionCorporal ?? null,
          signos.notas ?? null,
        ]
      );
    }

    for (const diagnostico of datos.diagnosticos || []) {
      await conexion.execute(
        `INSERT INTO consulta_diagnosticos (consulta_id, diagnostico_id, descripcion, tipo, principal)
         VALUES (?, ?, ?, ?, ?)`,
        [
          consultaId,
          diagnostico.diagnosticoId ?? null,
          diagnostico.descripcion,
          diagnostico.tipo || 'presuntivo',
          diagnostico.principal ? 1 : 0,
        ]
      );
    }

    for (const tratamiento of datos.tratamientos || []) {
      const [filaTratamiento] = await conexion.execute(
        `INSERT INTO tratamientos (consulta_id, descripcion, indicaciones, fecha_inicio, fecha_fin)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
        [
          consultaId,
          tratamiento.descripcion,
          tratamiento.indicaciones ?? null,
          tratamiento.fechaInicio ?? null,
          tratamiento.fechaFin ?? null,
        ]
      );

      for (const receta of tratamiento.prescripciones || []) {
        await conexion.execute(
          `INSERT INTO prescripciones (tratamiento_id, medicamento_id, dosis, frecuencia,
                                       duracion, via, cantidad, indicaciones)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            filaTratamiento.insertId,
            receta.medicamentoId,
            receta.dosis ?? null,
            receta.frecuencia ?? null,
            receta.duracion ?? null,
            receta.via ?? null,
            receta.cantidad ?? null,
            receta.indicaciones ?? null,
          ]
        );
      }
    }

    // La cita que dio origen a la consulta queda atendida en el mismo paso: si
    // se dejara para otra petición, un fallo de red dejaría la consulta escrita
    // y la cita eternamente "confirmada".
    if (datos.citaId && datos.cerrarCita) {
      await conexion.execute(
        `UPDATE citas SET estado = 'atendida'
          WHERE id = ? AND estado NOT IN ('cancelada','no_asistio')`,
        [datos.citaId]
      );
    }

    return consultaId;
  }, usuarioId);
}

async function editarConsulta(id, datos) {
  const resultado = await ejecutar(
    `UPDATE consultas
        SET motivo = ?, anamnesis = ?, sintomas = ?, examen_fisico = ?,
            observaciones = ?, plan_manejo = ?
      WHERE id = ?`,
    [
      datos.motivo,
      datos.anamnesis ?? null,
      datos.sintomas ?? null,
      datos.examenFisico ?? null,
      datos.observaciones ?? null,
      datos.planManejo ?? null,
      id,
    ]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Vacunas
   ------------------------------------------------------------------ */

async function vacunasDeMascota(mascotaId) {
  return consultar(
    `SELECT av.*, v.nombre AS vacuna, v.enfermedades, v.refuerzo_meses, v.obligatoria,
            lv.lote AS lote_codigo, lv.laboratorio, lv.fecha_vencimiento,
            uv.nombre AS veterinario_nombre,
            (av.proxima_fecha - CURRENT_DATE) AS dias_para_refuerzo
       FROM aplicaciones_vacunas av
       JOIN vacunas v            ON v.id = av.vacuna_id
       LEFT JOIN lotes_vacunas lv ON lv.id = av.lote_id
       JOIN veterinarios vet     ON vet.id = av.veterinario_id
       JOIN usuarios uv          ON uv.id = vet.usuario_id
      WHERE av.mascota_id = ?
      ORDER BY av.fecha_aplicacion DESC`,
    [mascotaId]
  );
}

/**
 * Registra la aplicación y descuenta la dosis del lote en la misma
 * transacción: el carné y las existencias de la nevera tienen que contar lo
 * mismo, y son dos tablas distintas.
 */
async function aplicarVacuna(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `INSERT INTO aplicaciones_vacunas (mascota_id, vacuna_id, lote_id, consulta_id, veterinario_id,
                                         fecha_aplicacion, proxima_fecha, lote, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        datos.mascotaId,
        datos.vacunaId,
        datos.loteId ?? null,
        datos.consultaId ?? null,
        datos.veterinarioId,
        datos.fechaAplicacion,
        datos.proximaFecha ?? null,
        datos.lote ?? null,
        datos.observaciones ?? null,
      ]
    );

    if (datos.loteId) {
      await conexion.execute(
        'UPDATE lotes_vacunas SET dosis_usadas = dosis_usadas + 1 WHERE id = ?',
        [datos.loteId]
      );
    }

    return resultado.insertId;
  }, usuarioId);
}

async function aplicacionPorId(id) {
  return consultarUna(
    `SELECT av.*, v.nombre AS vacuna, m.nombre AS mascota_nombre, m.cliente_id
       FROM aplicaciones_vacunas av
       JOIN vacunas v  ON v.id = av.vacuna_id
       JOIN mascotas m ON m.id = av.mascota_id
      WHERE av.id = ?`,
    [id]
  );
}

/* ------------------------------------------------------------------
   Exámenes
   ------------------------------------------------------------------ */

async function examenesDeMascota(mascotaId) {
  const examenes = await consultar(
    `SELECT e.*, te.nombre AS tipo_nombre, te.categoria, te.precio,
            uv.nombre AS solicitado_por_nombre
       FROM examenes e
       LEFT JOIN tipos_examen te  ON te.id = e.tipo_examen_id
       LEFT JOIN veterinarios vet ON vet.id = e.solicitado_por
       LEFT JOIN usuarios uv      ON uv.id = vet.usuario_id
      WHERE e.mascota_id = ?
      ORDER BY e.fecha_solicitud DESC, e.id DESC`,
    [mascotaId]
  );

  if (!examenes.length) return [];

  const resultados = await consultar(
    'SELECT * FROM resultados_examenes WHERE examen_id = ANY(?) ORDER BY id',
    [examenes.map((e) => e.id)]
  );

  return examenes.map((e) => ({
    ...e,
    resultados: resultados.filter((r) => r.examen_id === e.id),
  }));
}

async function examenPorId(id) {
  return consultarUna(
    `SELECT e.*, m.cliente_id, m.nombre AS mascota_nombre, te.nombre AS tipo_nombre
       FROM examenes e
       JOIN mascotas m ON m.id = e.mascota_id
       LEFT JOIN tipos_examen te ON te.id = e.tipo_examen_id
      WHERE e.id = ?`,
    [id]
  );
}

async function crearExamen(datos) {
  const resultado = await ejecutar(
    `INSERT INTO examenes (mascota_id, consulta_id, tipo_examen_id, solicitado_por, descripcion)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.mascotaId,
      datos.consultaId ?? null,
      datos.tipoExamenId ?? null,
      datos.solicitadoPor ?? null,
      datos.descripcion ?? null,
    ]
  );
  return resultado.insertId;
}

/** Guarda los parámetros medidos y cierra el examen, todo o nada. */
async function guardarResultados(examenId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    await conexion.execute(
      `UPDATE examenes
          SET estado = ?, conclusion = ?,
              fecha_resultado = CASE WHEN ? = 'listo' THEN CURRENT_DATE ELSE fecha_resultado END
        WHERE id = ?`,
      [datos.estado, datos.conclusion ?? null, datos.estado, examenId]
    );

    // Se reemplazan: cargar dos veces el mismo informe no debe duplicar filas.
    await conexion.execute('DELETE FROM resultados_examenes WHERE examen_id = ?', [examenId]);

    for (const fila of datos.resultados || []) {
      await conexion.execute(
        `INSERT INTO resultados_examenes (examen_id, parametro, valor, unidad, referencia, fuera_rango, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          examenId,
          fila.parametro,
          fila.valor ?? null,
          fila.unidad ?? null,
          fila.referencia ?? null,
          fila.fueraRango ? 1 : 0,
          fila.notas ?? null,
        ]
      );
    }
  }, usuarioId);
}

/* ------------------------------------------------------------------
   Catálogos y resumen
   ------------------------------------------------------------------ */

/** Todo lo que necesitan los desplegables del formulario de consulta. */
async function catalogos() {
  const [vacunas, diagnosticos, medicamentos, tiposExamen, lotesVacunas] = await Promise.all([
    consultar(
      `SELECT v.id, v.nombre, v.especie_id, v.enfermedades, v.refuerzo_meses, v.obligatoria,
              e.nombre AS especie
         FROM vacunas v
         LEFT JOIN especies e ON e.id = v.especie_id
        ORDER BY v.nombre`
    ),
    consultar(
      'SELECT id, codigo, nombre, categoria, especie_id FROM catalogo_diagnosticos WHERE activo = 1 ORDER BY nombre'
    ),
    consultar(
      `SELECT id, nombre, principio_activo, presentacion, concentracion, via, producto_id
         FROM medicamentos WHERE activo = 1 ORDER BY nombre`
    ),
    consultar('SELECT id, nombre, categoria, descripcion, precio FROM tipos_examen WHERE activo = 1 ORDER BY nombre'),
    consultar(
      `SELECT id, vacuna_id, lote, laboratorio, fecha_vencimiento,
              (dosis_totales - dosis_usadas) AS dosis_disponibles
         FROM lotes_vacunas
        WHERE activo = 1 AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)
        ORDER BY fecha_vencimiento NULLS LAST`
    ),
  ]);

  return { vacunas, diagnosticos, medicamentos, tiposExamen, lotesVacunas };
}

async function historialPeso(mascotaId) {
  return consultar(
    'SELECT id, peso_kg, fecha, origen FROM historial_peso WHERE mascota_id = ? ORDER BY fecha',
    [mascotaId]
  );
}

async function alergiasYCondiciones(mascotaId) {
  const [alergias, condiciones] = await Promise.all([
    consultar(
      `SELECT ma.severidad, ma.reaccion, a.nombre, a.tipo
         FROM mascota_alergias ma
         JOIN alergias a ON a.id = ma.alergia_id
        WHERE ma.mascota_id = ?
        ORDER BY a.nombre`,
      [mascotaId]
    ),
    consultar(
      `SELECT mc.estado, mc.diagnosticada_en, mc.notas, c.nombre, c.descripcion
         FROM mascota_condiciones mc
         JOIN condiciones_medicas c ON c.id = mc.condicion_id
        WHERE mc.mascota_id = ?
        ORDER BY c.nombre`,
      [mascotaId]
    ),
  ]);

  return { alergias, condiciones };
}

/** Refuerzos de vacuna que vencen pronto, para el panel de la clínica. */
async function refuerzosProximos(dias = 30) {
  return consultar(
    `SELECT av.id, av.proxima_fecha, v.nombre AS vacuna,
            m.id AS mascota_id, m.nombre AS mascota, m.cliente_id,
            u.nombre AS cliente_nombre, u.id AS usuario_id,
            (av.proxima_fecha - CURRENT_DATE) AS dias
       FROM aplicaciones_vacunas av
       JOIN vacunas v   ON v.id = av.vacuna_id
       JOIN mascotas m  ON m.id = av.mascota_id
       JOIN clientes cl ON cl.id = m.cliente_id
       JOIN usuarios u  ON u.id = cl.usuario_id
      WHERE av.proxima_fecha IS NOT NULL
        AND av.proxima_fecha <= CURRENT_DATE + ?::int
        AND m.activo = 1
      ORDER BY av.proxima_fecha`,
    [dias]
  );
}

module.exports = {
  asegurarHistoria,
  listarConsultas,
  consultaPorId,
  detalleConsulta,
  crearConsulta,
  editarConsulta,
  vacunasDeMascota,
  aplicarVacuna,
  aplicacionPorId,
  examenesDeMascota,
  examenPorId,
  crearExamen,
  guardarResultados,
  catalogos,
  historialPeso,
  alergiasYCondiciones,
  refuerzosProximos,
};
