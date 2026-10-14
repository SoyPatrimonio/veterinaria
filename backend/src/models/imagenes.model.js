'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');
const { siguienteNumero } = require('../utils/consecutivos');

/**
 * Imagenología: radiografías, ecografías y fotografías clínicas.
 *
 * El archivo vive en Supabase Storage; aquí queda la referencia y, sobre todo,
 * el informe. Un estudio sin informe es una foto: lo que tiene valor clínico
 * es lo que alguien escribió al mirarla, y por eso el informe se firma.
 */

async function listar({ mascotaId, clienteId, modalidad, estado, desde, hasta, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (mascotaId) { condiciones.push('es.mascota_id = ?'); params.push(mascotaId); }
  // El dueño solo ve los estudios de sus mascotas.
  if (clienteId) { condiciones.push('m.cliente_id = ?'); params.push(clienteId); }
  if (modalidad) { condiciones.push('es.modalidad = ?'); params.push(modalidad); }
  if (estado) { condiciones.push('es.estado = ?'); params.push(estado); }
  if (desde) { condiciones.push('es.fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('es.fecha <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT es.*, m.nombre AS mascota_nombre, m.foto AS mascota_foto, m.cliente_id,
            e.nombre AS especie, uv.nombre AS solicitado_por_nombre,
            ur.nombre AS realizado_por_nombre, eq.nombre AS equipo_nombre,
            (inf.id IS NOT NULL) AS tiene_informe, inf.estado AS informe_estado,
            (SELECT COUNT(*) FROM archivos_estudio a WHERE a.estudio_id = es.id) AS archivos
       FROM estudios_imagen es
       JOIN mascotas m ON m.id = es.mascota_id
       JOIN especies e ON e.id = m.especie_id
       LEFT JOIN veterinarios v ON v.id = es.solicitado_por
       LEFT JOIN usuarios uv    ON uv.id = v.usuario_id
       LEFT JOIN usuarios ur    ON ur.id = es.realizado_por
       LEFT JOIN equipos_medicos eq ON eq.id = es.equipo_id
       LEFT JOIN informes_imagen inf ON inf.estudio_id = es.id
       ${where}
      ORDER BY es.fecha DESC
      LIMIT ${lim}`,
    params
  );
}

async function porId(id) {
  return consultarUna(
    `SELECT es.*, m.nombre AS mascota_nombre, m.cliente_id, m.peso_kg,
            e.nombre AS especie, r.nombre AS raza,
            uv.nombre AS solicitado_por_nombre, ur.nombre AS realizado_por_nombre,
            eq.nombre AS equipo_nombre, eq.codigo AS equipo_codigo,
            uc.nombre AS cliente_nombre, sd.nombre AS sede_nombre
       FROM estudios_imagen es
       JOIN mascotas m ON m.id = es.mascota_id
       JOIN especies e ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       JOIN clientes cl ON cl.id = m.cliente_id
       JOIN usuarios uc ON uc.id = cl.usuario_id
       LEFT JOIN veterinarios v ON v.id = es.solicitado_por
       LEFT JOIN usuarios uv    ON uv.id = v.usuario_id
       LEFT JOIN usuarios ur    ON ur.id = es.realizado_por
       LEFT JOIN equipos_medicos eq ON eq.id = es.equipo_id
       LEFT JOIN sedes sd ON sd.id = es.sede_id
      WHERE es.id = ?`,
    [id]
  );
}

async function crear(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const numero = await siguienteNumero(conexion, 'estudios_imagen');

    const [resultado] = await conexion.execute(
      `INSERT INTO estudios_imagen
         (numero, mascota_id, consulta_id, examen_id, solicitado_por, realizado_por,
          equipo_id, sede_id, modalidad, region, proyeccion, sedacion, indicacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        numero,
        datos.mascotaId,
        datos.consultaId ?? null,
        datos.examenId ?? null,
        datos.solicitadoPor ?? null,
        usuarioId ?? null,
        datos.equipoId ?? null,
        datos.sedeId ?? null,
        datos.modalidad,
        datos.region ?? null,
        datos.proyeccion ?? null,
        datos.sedacion ? 1 : 0,
        datos.indicacion ?? null,
      ]
    );

    return { id: resultado.insertId, numero };
  }, usuarioId);
}

async function anular(id) {
  const resultado = await ejecutar(
    `UPDATE estudios_imagen SET estado = 'anulado' WHERE id = ? AND estado <> 'informado'`,
    [id]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Archivos
   ------------------------------------------------------------------ */

async function archivosDe(estudioId) {
  return consultar(
    `SELECT a.*, u.nombre AS subido_por_nombre
       FROM archivos_estudio a
       LEFT JOIN usuarios u ON u.id = a.subido_por
      WHERE a.estudio_id = ?
      ORDER BY a.orden, a.id`,
    [estudioId]
  );
}

/**
 * Guarda el archivo del estudio y, de paso, deja una copia de la referencia en
 * documentos_clinicos: la historia clínica del paciente tiene que enseñar la
 * placa aunque nadie entre al módulo de imágenes.
 */
async function agregarArchivo(estudioId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const estudio = await conexion.consultarUna(
      'SELECT mascota_id, consulta_id, modalidad, region FROM estudios_imagen WHERE id = ?',
      [estudioId]
    );
    if (!estudio) throw new Error('Ese estudio no existe.');

    const tipoDocumento = { radiografia: 'radiografia', ecografia: 'ecografia' }[estudio.modalidad] || 'otro';

    const [documento] = await conexion.execute(
      `INSERT INTO documentos_clinicos
         (mascota_id, consulta_id, subido_por, tipo, titulo, archivo, mime, tamano_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        estudio.mascota_id,
        estudio.consulta_id,
        usuarioId ?? null,
        tipoDocumento,
        datos.titulo,
        datos.archivo,
        datos.mime ?? null,
        datos.tamanoBytes ?? null,
      ]
    );

    const [resultado] = await conexion.execute(
      `INSERT INTO archivos_estudio
         (estudio_id, documento_id, titulo, archivo, miniatura, mime, tamano_bytes, orden, subido_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        estudioId,
        documento.insertId,
        datos.titulo,
        datos.archivo,
        datos.miniatura ?? null,
        datos.mime ?? null,
        datos.tamanoBytes ?? null,
        datos.orden ?? 0,
        usuarioId ?? null,
      ]
    );

    return resultado.insertId;
  }, usuarioId);
}

async function eliminarArchivo(archivoId) {
  const resultado = await ejecutar('DELETE FROM archivos_estudio WHERE id = ?', [archivoId]);
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Informes
   ------------------------------------------------------------------ */

async function informeDe(estudioId) {
  return consultarUna(
    `SELECT inf.*, uv.nombre AS radiologo_nombre, v.licencia,
            ant.numero AS comparado_numero, ant.fecha AS comparado_fecha,
            ant.modalidad AS comparado_modalidad
       FROM informes_imagen inf
       LEFT JOIN veterinarios v ON v.id = inf.radiologo_id
       LEFT JOIN usuarios uv    ON uv.id = v.usuario_id
       LEFT JOIN estudios_imagen ant ON ant.id = inf.comparado_con
      WHERE inf.estudio_id = ?`,
    [estudioId]
  );
}

/**
 * Crea o actualiza el informe. Mientras está en borrador se puede reescribir;
 * una vez firmado, no: un informe firmado es el documento que respalda una
 * decisión clínica y cambiarlo después sería reescribir la historia.
 */
async function guardarInforme(estudioId, datos, radiologoId) {
  return enTransaccion(async (conexion) => {
    const existente = await conexion.consultarUna(
      'SELECT id, estado FROM informes_imagen WHERE estudio_id = ?',
      [estudioId]
    );

    if (existente && existente.estado === 'firmado') {
      throw new Error('Este informe ya está firmado y no se puede modificar.');
    }

    if (existente) {
      await conexion.execute(
        `UPDATE informes_imagen
            SET tecnica = ?, hallazgos = ?, conclusion = ?, recomendaciones = ?,
                comparado_con = ?, radiologo_id = ?,
                estado = ?, firmado_en = CASE WHEN ? = 'firmado' THEN LOCALTIMESTAMP ELSE NULL END
          WHERE id = ?`,
        [
          datos.tecnica ?? null,
          datos.hallazgos,
          datos.conclusion,
          datos.recomendaciones ?? null,
          datos.comparadoCon ?? null,
          radiologoId ?? null,
          datos.firmar ? 'firmado' : 'borrador',
          datos.firmar ? 'firmado' : 'borrador',
          existente.id,
        ]
      );
    } else {
      await conexion.execute(
        `INSERT INTO informes_imagen
           (estudio_id, comparado_con, radiologo_id, tecnica, hallazgos, conclusion,
            recomendaciones, estado, firmado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'firmado' THEN LOCALTIMESTAMP ELSE NULL END)`,
        [
          estudioId,
          datos.comparadoCon ?? null,
          radiologoId ?? null,
          datos.tecnica ?? null,
          datos.hallazgos,
          datos.conclusion,
          datos.recomendaciones ?? null,
          datos.firmar ? 'firmado' : 'borrador',
          datos.firmar ? 'firmado' : 'borrador',
        ]
      );
    }

    if (datos.firmar) {
      await conexion.execute(
        `UPDATE estudios_imagen SET estado = 'informado' WHERE id = ?`,
        [estudioId]
      );
    }
  }, radiologoId);
}

/**
 * Estudios anteriores del mismo paciente y la misma modalidad y región, que es
 * lo que se ofrece para comparar. Sin este filtro habría que buscar a mano la
 * placa de hace ocho meses entre todo el historial.
 */
async function comparables(estudioId) {
  return consultar(
    `SELECT ant.id, ant.numero, ant.fecha, ant.modalidad, ant.region, ant.proyeccion,
            inf.conclusion,
            (SELECT a.miniatura FROM archivos_estudio a
              WHERE a.estudio_id = ant.id ORDER BY a.orden LIMIT 1) AS miniatura
       FROM estudios_imagen actual
       JOIN estudios_imagen ant
         ON ant.mascota_id = actual.mascota_id
        AND ant.id <> actual.id
        AND ant.modalidad = actual.modalidad
        AND ant.fecha < actual.fecha
        AND ant.estado <> 'anulado'
       LEFT JOIN informes_imagen inf ON inf.estudio_id = ant.id
      WHERE actual.id = ?
      ORDER BY ant.fecha DESC
      LIMIT 10`,
    [estudioId]
  );
}

/** Galería de un paciente, agrupable por modalidad en la pantalla. */
async function galeriaDe(mascotaId) {
  return consultar(
    `SELECT es.id, es.numero, es.fecha, es.modalidad, es.region, es.proyeccion, es.estado,
            inf.conclusion,
            (SELECT a.archivo   FROM archivos_estudio a WHERE a.estudio_id = es.id ORDER BY a.orden LIMIT 1) AS archivo,
            (SELECT a.miniatura FROM archivos_estudio a WHERE a.estudio_id = es.id ORDER BY a.orden LIMIT 1) AS miniatura,
            (SELECT COUNT(*)    FROM archivos_estudio a WHERE a.estudio_id = es.id) AS archivos
       FROM estudios_imagen es
       LEFT JOIN informes_imagen inf ON inf.estudio_id = es.id
      WHERE es.mascota_id = ? AND es.estado <> 'anulado'
      ORDER BY es.fecha DESC`,
    [mascotaId]
  );
}

module.exports = {
  listar,
  porId,
  crear,
  anular,
  archivosDe,
  agregarArchivo,
  eliminarArchivo,
  informeDe,
  guardarInforme,
  comparables,
  galeriaDe,
};
