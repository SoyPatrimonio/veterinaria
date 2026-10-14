'use strict';

const { consultar, consultarUna, ejecutar } = require('../config/database');

/**
 * Asistente interno de IA.
 *
 * La regla del módulo, que está en el código y no solo en la documentación: la
 * IA propone, el veterinario dispone. Nada de lo que genera entra en la historia
 * clínica por su cuenta. Se guarda como sugerencia en estado 'propuesta' y solo
 * cuenta cuando alguien la revisa y la acepta, y queda registrado quién fue y
 * cuándo. La base lo obliga con un CHECK; aquí no hay forma de saltárselo.
 *
 * Buena parte de lo que pide el encargo no necesita un modelo de lenguaje:
 * "alertas de datos clínicos faltantes" e "interacciones medicamentosas" son
 * consultas deterministas y salen mejor así —siempre el mismo resultado, sin
 * costo por token y sin riesgo de que se invente un fármaco—. Esas se resuelven
 * con SQL. Las que sí necesitan redactar (resúmenes, borradores de evolución)
 * requieren un proveedor configurado; sin él se responde diciéndolo, en vez de
 * devolver un texto inventado.
 */

const MODELO = process.env.IA_MODELO || 'claude-sonnet-5';

function hayProveedor() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/* ------------------------------------------------------------------
   Registro
   ------------------------------------------------------------------ */

async function registrarSolicitud(datos) {
  const resultado = await ejecutar(
    `INSERT INTO solicitudes_ia
       (usuario_id, tipo, entidad, entidad_id, mascota_id, entrada, respuesta, modelo,
        tokens_entrada, tokens_salida, duracion_ms, estado, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.usuarioId ?? null, datos.tipo, datos.entidad ?? null, datos.entidadId ?? null,
      datos.mascotaId ?? null, datos.entrada ?? null, datos.respuesta ?? null,
      datos.modelo ?? null, datos.tokensEntrada ?? null, datos.tokensSalida ?? null,
      datos.duracionMs ?? null, datos.estado || 'completada', datos.error ?? null,
    ]
  );
  return resultado.insertId;
}

async function crearSugerencia(datos) {
  const resultado = await ejecutar(
    `INSERT INTO sugerencias_ia
       (solicitud_id, tipo, titulo, contenido, entidad, entidad_id, mascota_id, severidad)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.solicitudId ?? null, datos.tipo, datos.titulo, datos.contenido,
      datos.entidad ?? null, datos.entidadId ?? null, datos.mascotaId ?? null,
      datos.severidad || 'media',
    ]
  );
  return resultado.insertId;
}

async function sugerencias({ estado = 'propuesta', mascotaId = null, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (estado) { condiciones.push('s.estado = ?'); params.push(estado); }
  if (mascotaId) { condiciones.push('s.mascota_id = ?'); params.push(mascotaId); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT s.*, m.nombre AS mascota, u.nombre AS revisado_por_nombre
       FROM sugerencias_ia s
       LEFT JOIN mascotas m ON m.id = s.mascota_id
       LEFT JOIN usuarios u ON u.id = s.revisado_por
       ${where}
      ORDER BY
        CASE s.severidad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
        s.creado_en DESC
      LIMIT ${lim}`,
    params
  );
}

/** Aceptar o descartar. Sin revisor no se puede: lo impide el CHECK de la base. */
async function revisarSugerencia(id, datos, usuarioId) {
  const resultado = await ejecutar(
    `UPDATE sugerencias_ia
        SET estado = ?, revisado_por = ?, revisado_en = LOCALTIMESTAMP, nota_revision = ?
      WHERE id = ? AND estado = 'propuesta'`,
    [datos.estado, usuarioId, datos.nota ?? null, id]
  );
  return resultado.affectedRows > 0;
}

async function registro({ tipo = null, limite = 100 } = {}) {
  const where = tipo ? 'WHERE s.tipo = ?' : '';
  const params = tipo ? [tipo] : [];
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT s.*, u.nombre AS usuario_nombre, m.nombre AS mascota
       FROM solicitudes_ia s
       LEFT JOIN usuarios u ON u.id = s.usuario_id
       LEFT JOIN mascotas m ON m.id = s.mascota_id
       ${where}
      ORDER BY s.creado_en DESC
      LIMIT ${lim}`,
    params
  );
}

/* ------------------------------------------------------------------
   Análisis deterministas
   ------------------------------------------------------------------ */

/**
 * Datos clínicos que faltan en la ficha de un paciente.
 *
 * Es una lista de comprobación, no una opinión: o está el peso o no está. Por
 * eso no pasa por el modelo.
 */
async function datosFaltantes(mascotaId) {
  const fila = await consultarUna(
    `SELECT
       m.nombre, m.fecha_nacimiento, m.peso_kg, m.microchip, m.esterilizado,
       (SELECT COUNT(*) FROM mascota_alergias a WHERE a.mascota_id = m.id)        AS alergias,
       (SELECT COUNT(*) FROM aplicaciones_vacunas v WHERE v.mascota_id = m.id)    AS vacunas,
       (SELECT COUNT(*) FROM desparasitaciones d WHERE d.mascota_id = m.id)       AS desparasitaciones,
       (SELECT COUNT(*) FROM consultas c
          JOIN historias_clinicas h ON h.id = c.historia_id
         WHERE h.mascota_id = m.id)                                              AS consultas,
       (SELECT COUNT(*) FROM signos_vitales sv WHERE sv.mascota_id = m.id)       AS signos,
       (SELECT MAX(hp.fecha) FROM historial_peso hp WHERE hp.mascota_id = m.id)  AS ultimo_peso
     FROM mascotas m WHERE m.id = ?`,
    [mascotaId]
  );

  if (!fila) return null;

  const faltantes = [];
  const anotar = (campo, texto, severidad = 'media') => faltantes.push({ campo, texto, severidad });

  if (!fila.fecha_nacimiento) anotar('fecha_nacimiento', 'No hay fecha de nacimiento: no se puede calcular la edad ni el esquema de vacunación que le toca.', 'alta');
  if (!fila.peso_kg) anotar('peso', 'No hay peso registrado: las dosis se calculan por kilo.', 'alta');
  if (Number(fila.vacunas) === 0) anotar('vacunas', 'No tiene ninguna vacuna registrada.', 'alta');
  if (Number(fila.desparasitaciones) === 0) anotar('desparasitacion', 'No tiene desparasitaciones registradas.');
  if (Number(fila.alergias) === 0) anotar('alergias', 'No se ha registrado si tiene alergias (ni siquiera "ninguna conocida").');
  if (!fila.microchip) anotar('microchip', 'Sin microchip registrado.', 'baja');
  if (Number(fila.signos) === 0) anotar('signos_vitales', 'Nunca se le han tomado signos vitales.');

  if (fila.ultimo_peso) {
    const meses = (Date.now() - new Date(fila.ultimo_peso).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (meses > 12) anotar('peso_desactualizado', 'El último pesaje tiene más de un año.');
  }

  return { mascota: fila.nombre, faltantes };
}

/**
 * Interacciones entre lo que el paciente tiene activo y lo que se le va a dar.
 *
 * Cruza el catálogo de interacciones con los tratamientos vigentes y las
 * alergias registradas. Es un aviso, no un veto: la decisión sigue siendo del
 * veterinario, que sabe cosas del caso que la tabla no.
 */
async function revisarInteracciones(mascotaId, medicamentoIds = []) {
  const activos = await consultar(
    `SELECT DISTINCT me.id, me.nombre, me.principio_activo
       FROM prescripciones pr
       JOIN tratamientos t   ON t.id = pr.tratamiento_id
       JOIN consultas c      ON c.id = t.consulta_id
       JOIN historias_clinicas h ON h.id = c.historia_id
       JOIN medicamentos me  ON me.id = pr.medicamento_id
      WHERE h.mascota_id = ? AND t.estado = 'activo'`,
    [mascotaId]
  );

  const nuevos = medicamentoIds.length
    ? await consultar(
      `SELECT id, nombre, principio_activo FROM medicamentos WHERE id = ANY (?::integer[])`,
      [medicamentoIds]
    )
    : [];

  const principios = [...activos, ...nuevos]
    .map((m) => m.principio_activo)
    .filter(Boolean);

  const [interacciones, alergias] = await Promise.all([
    principios.length >= 2
      ? consultar(
        `SELECT * FROM interacciones_medicamentosas
          WHERE activo = 1
            AND principio_a = ANY (?::text[]) AND principio_b = ANY (?::text[])`,
        [principios, principios]
      )
      : Promise.resolve([]),

    nuevos.length
      ? consultar(
        `SELECT a.nombre AS alergeno, ma.severidad, ma.reaccion
           FROM mascota_alergias ma
           JOIN alergias a ON a.id = ma.alergia_id
          WHERE ma.mascota_id = ? AND a.tipo = 'medicamento'
            AND EXISTS (
              SELECT 1 FROM medicamentos m
               WHERE m.id = ANY (?::integer[])
                 AND (m.nombre ILIKE '%' || a.nombre || '%'
                      OR m.principio_activo ILIKE '%' || a.nombre || '%'))`,
        [mascotaId, medicamentoIds]
      )
      : Promise.resolve([]),
  ]);

  return { tratamientosActivos: activos, interacciones, alergias };
}

/**
 * Resumen de la historia clínica.
 *
 * Sin proveedor de IA configurado devuelve un resumen estructurado —los datos
 * ordenados, sin redactar— y lo dice. Es menos vistoso que un párrafo, pero es
 * información real; un texto inventado en una historia clínica es peor que no
 * tener resumen.
 */
async function resumirHistoria(mascotaId) {
  const [ficha, ultimas, cronicas, alergias, tratamientos] = await Promise.all([
    consultarUna(
      `SELECT m.nombre, m.sexo, m.peso_kg, m.fecha_nacimiento, e.nombre AS especie, r.nombre AS raza
         FROM mascotas m
         JOIN especies e ON e.id = m.especie_id
         LEFT JOIN razas r ON r.id = m.raza_id
        WHERE m.id = ?`,
      [mascotaId]
    ),
    consultar(
      `SELECT fecha, tipo, titulo, detalle, veterinario
         FROM v_linea_tiempo WHERE mascota_id = ?
        ORDER BY fecha DESC LIMIT 10`,
      [mascotaId]
    ),
    consultar(
      `SELECT cm.nombre, mc.estado, mc.diagnosticada_en
         FROM mascota_condiciones mc
         JOIN condiciones_medicas cm ON cm.id = mc.condicion_id
        WHERE mc.mascota_id = ? AND mc.estado <> 'resuelta'`,
      [mascotaId]
    ),
    consultar(
      `SELECT a.nombre, a.tipo, ma.severidad, ma.reaccion
         FROM mascota_alergias ma
         JOIN alergias a ON a.id = ma.alergia_id
        WHERE ma.mascota_id = ?`,
      [mascotaId]
    ),
    consultar(
      `SELECT t.descripcion, t.fecha_inicio, t.estado
         FROM tratamientos t
         JOIN consultas c ON c.id = t.consulta_id
         JOIN historias_clinicas h ON h.id = c.historia_id
        WHERE h.mascota_id = ? AND t.estado = 'activo'`,
      [mascotaId]
    ),
  ]);

  if (!ficha) return null;

  return {
    ficha,
    condicionesCronicas: cronicas,
    alergias,
    tratamientosActivos: tratamientos,
    ultimosEventos: ultimas,
    redactado: false,
    nota: hayProveedor()
      ? null
      : 'Resumen estructurado. Para el resumen redactado hace falta configurar ANTHROPIC_API_KEY.',
  };
}

/* ------------------------------------------------------------------
   Búsqueda en lenguaje natural
   ------------------------------------------------------------------ */

/**
 * Búsqueda por texto sobre pacientes, dueños y diagnósticos.
 *
 * No interpreta la frase: busca las palabras en los campos donde tiene sentido
 * buscarlas. Cubre el caso real ("gatos con enfermedad renal", "Luna") sin
 * depender de un modelo, y sin el riesgo de que una consulta generada se lleve
 * por delante datos que el usuario no debería ver.
 */
async function buscar(texto, { limite = 20 } = {}) {
  const patron = `%${texto}%`;
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 20, 1), 50);

  const [pacientes, diagnosticos] = await Promise.all([
    consultar(
      `SELECT m.id, m.nombre, m.foto, e.nombre AS especie, r.nombre AS raza,
              u.nombre AS propietario
         FROM mascotas m
         JOIN especies e  ON e.id = m.especie_id
         LEFT JOIN razas r ON r.id = m.raza_id
         JOIN clientes cl ON cl.id = m.cliente_id
         JOIN usuarios u  ON u.id = cl.usuario_id
        WHERE m.activo = 1
          AND (m.nombre ILIKE ? OR u.nombre ILIKE ? OR m.microchip ILIKE ?
               OR e.nombre ILIKE ? OR r.nombre ILIKE ?)
        ORDER BY m.nombre
        LIMIT ${lim}`,
      [patron, patron, patron, patron, patron]
    ),
    consultar(
      `SELECT DISTINCT m.id AS mascota_id, m.nombre AS mascota, cd.descripcion,
              c.fecha, cat.nombre AS diagnostico
         FROM consulta_diagnosticos cd
         JOIN consultas c ON c.id = cd.consulta_id
         JOIN historias_clinicas h ON h.id = c.historia_id
         JOIN mascotas m ON m.id = h.mascota_id
         LEFT JOIN catalogo_diagnosticos cat ON cat.id = cd.diagnostico_id
        WHERE cd.descripcion ILIKE ? OR cat.nombre ILIKE ?
        ORDER BY c.fecha DESC
        LIMIT ${lim}`,
      [patron, patron]
    ),
  ]);

  return { pacientes, diagnosticos };
}

module.exports = {
  MODELO,
  hayProveedor,
  registrarSolicitud,
  crearSugerencia,
  sugerencias,
  revisarSugerencia,
  registro,
  datosFaltantes,
  revisarInteracciones,
  resumirHistoria,
  buscar,
};
