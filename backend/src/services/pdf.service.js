'use strict';

const PDFDocument = require('pdfkit');
const { consultarUna, consultar } = require('../config/database');

/**
 * Reportes profesionales en PDF.
 *
 * Se genera con pdfkit y se devuelve como un stream: en una función serverless
 * no hay disco donde dejar el archivo, y armarlo entero en memoria para
 * mandarlo después solo gasta el doble.
 *
 * Todos los documentos comparten membrete y pie. El pie lleva la fecha de
 * emisión y quién lo generó a propósito: un certificado de vacunación sin
 * saber cuándo se imprimió no vale para nada, y la historia clínica es un
 * documento médico que puede acabar en una reclamación.
 */

const COLOR = { tinta: '#0C201A', musgo: '#1B5B46', gris: '#516158', linea: '#CFDDD5' };
const MARGEN = 46;

/* ------------------------------------------------------------------
   Piezas comunes
   ------------------------------------------------------------------ */

function nuevoDocumento(titulo) {
  return new PDFDocument({
    size: 'LETTER',
    margin: MARGEN,
    info: { Title: titulo, Author: 'Huellitas de Amor', Creator: 'Sistema Huellitas' },
  });
}

async function datosClinica() {
  const filas = await consultar(
    `SELECT clave, valor FROM configuraciones WHERE clave IN ('clinica.nombre','clinica.nit')`
  );
  const mapa = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));

  const sede = await consultarUna(
    `SELECT nombre, direccion, ciudad, telefono, email FROM sedes
      WHERE activo = 1 ORDER BY principal DESC LIMIT 1`
  );

  return {
    nombre: mapa['clinica.nombre'] || 'Huellitas de Amor',
    nit: mapa['clinica.nit'] || '',
    sede: sede || {},
  };
}

function membrete(doc, clinica, titulo, subtitulo) {
  doc.fillColor(COLOR.musgo).font('Helvetica-Bold').fontSize(16).text(clinica.nombre, MARGEN, MARGEN);

  doc.fillColor(COLOR.gris).font('Helvetica').fontSize(8);
  const contacto = [
    clinica.nit ? `NIT ${clinica.nit}` : null,
    clinica.sede.direccion,
    clinica.sede.ciudad,
    clinica.sede.telefono,
  ].filter(Boolean).join(' · ');
  doc.text(contacto, MARGEN, doc.y + 2);

  doc.moveDown(1);
  doc.fillColor(COLOR.tinta).font('Helvetica-Bold').fontSize(13).text(titulo);
  if (subtitulo) doc.fillColor(COLOR.gris).font('Helvetica').fontSize(9).text(subtitulo);

  doc.moveTo(MARGEN, doc.y + 6).lineTo(doc.page.width - MARGEN, doc.y + 6)
    .strokeColor(COLOR.linea).lineWidth(1).stroke();
  doc.moveDown(1);
}

/** Fila etiqueta/valor. Es el 90 % de lo que llevan estos documentos. */
function dato(doc, etiqueta, valor) {
  if (valor === null || valor === undefined || valor === '') return;

  const y = doc.y;
  doc.fillColor(COLOR.gris).font('Helvetica-Bold').fontSize(8.5)
    .text(String(etiqueta).toUpperCase(), MARGEN, y, { width: 130 });
  doc.fillColor(COLOR.tinta).font('Helvetica').fontSize(10)
    .text(String(valor), MARGEN + 135, y, { width: doc.page.width - MARGEN * 2 - 135 });
  doc.moveDown(0.35);
}

function seccion(doc, titulo) {
  doc.moveDown(0.6);
  doc.fillColor(COLOR.musgo).font('Helvetica-Bold').fontSize(11).text(titulo, MARGEN);
  doc.moveDown(0.3);
}

/**
 * Tabla sencilla con anchos proporcionales.
 *
 * Salta de página cuando se acaba el espacio: sin esto una historia clínica
 * larga escribiría las últimas filas encima del pie.
 */
function tabla(doc, columnas, filas) {
  const ancho = doc.page.width - MARGEN * 2;
  const anchos = columnas.map((c) => Math.round(ancho * c.ancho));

  const escribirCabecera = () => {
    const y = doc.y;
    doc.fillColor(COLOR.gris).font('Helvetica-Bold').fontSize(8);
    let x = MARGEN;
    columnas.forEach((c, i) => {
      doc.text(String(c.titulo).toUpperCase(), x, y, { width: anchos[i] - 6 });
      x += anchos[i];
    });
    doc.moveDown(0.2);
    doc.moveTo(MARGEN, doc.y).lineTo(doc.page.width - MARGEN, doc.y)
      .strokeColor(COLOR.linea).stroke();
    doc.moveDown(0.3);
  };

  escribirCabecera();

  if (!filas.length) {
    doc.fillColor(COLOR.gris).font('Helvetica-Oblique').fontSize(9).text('Sin registros.', MARGEN);
    doc.moveDown(0.4);
    return;
  }

  filas.forEach((fila) => {
    // 60 pt de margen inferior: cabe una fila más y el pie.
    if (doc.y > doc.page.height - 90) {
      doc.addPage();
      escribirCabecera();
    }

    const y = doc.y;
    let x = MARGEN;
    let alto = 0;

    doc.fillColor(COLOR.tinta).font('Helvetica').fontSize(9);
    columnas.forEach((c, i) => {
      const texto = String(fila[c.campo] ?? '—');
      const altura = doc.heightOfString(texto, { width: anchos[i] - 6 });
      doc.text(texto, x, y, { width: anchos[i] - 6 });
      alto = Math.max(alto, altura);
      x += anchos[i];
    });

    doc.y = y + alto + 4;
  });
}

/** Pie con la fecha de emisión y quién lo sacó. Va en todas las páginas. */
function pie(doc, generadoPor) {
  const paginas = doc.bufferedPageRange();
  const emitido = new Date().toLocaleString('es-CO');

  for (let i = 0; i < paginas.count; i += 1) {
    doc.switchToPage(paginas.start + i);
    doc.fillColor(COLOR.gris).font('Helvetica').fontSize(7.5).text(
      `Emitido el ${emitido}${generadoPor ? ` por ${generadoPor}` : ''} · Página ${i + 1} de ${paginas.count}`,
      MARGEN,
      doc.page.height - 42,
      { width: doc.page.width - MARGEN * 2, align: 'center' }
    );
  }
}

/**
 * Envuelve la generación: membrete, contenido, pie y cierre.
 *
 * `bufferPages` es obligatorio para poder numerar: sin él no se puede volver a
 * una página anterior a escribir "1 de 3", porque todavía no se sabe cuántas
 * van a ser.
 */
async function generar({ titulo, subtitulo, generadoPor }, contenido) {
  const clinica = await datosClinica();
  const doc = nuevoDocumento(titulo);
  doc.options.bufferPages = true;

  membrete(doc, clinica, titulo, subtitulo);
  await contenido(doc, clinica);
  pie(doc, generadoPor);
  doc.end();

  return doc;
}

/* ------------------------------------------------------------------
   Historia clínica completa
   ------------------------------------------------------------------ */

async function historiaClinica(mascotaId, generadoPor) {
  const ficha = await consultarUna(
    `SELECT m.*, e.nombre AS especie, r.nombre AS raza,
            u.nombre AS propietario, u.telefono, u.email,
            c.documento, c.direccion, c.ciudad,
            h.numero AS historia_numero
       FROM mascotas m
       JOIN especies e ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       JOIN clientes c ON c.id = m.cliente_id
       JOIN usuarios u ON u.id = c.usuario_id
       LEFT JOIN historias_clinicas h ON h.mascota_id = m.id
      WHERE m.id = ?`,
    [mascotaId]
  );

  if (!ficha) return null;

  const [alergias, condiciones, linea, pesos] = await Promise.all([
    consultar(
      `SELECT a.nombre, a.tipo, ma.severidad, ma.reaccion
         FROM mascota_alergias ma JOIN alergias a ON a.id = ma.alergia_id
        WHERE ma.mascota_id = ?`,
      [mascotaId]
    ),
    consultar(
      `SELECT cm.nombre, mc.estado, mc.diagnosticada_en
         FROM mascota_condiciones mc JOIN condiciones_medicas cm ON cm.id = mc.condicion_id
        WHERE mc.mascota_id = ?`,
      [mascotaId]
    ),
    consultar(
      `SELECT fecha, tipo, titulo, detalle, veterinario
         FROM v_linea_tiempo WHERE mascota_id = ? ORDER BY fecha DESC`,
      [mascotaId]
    ),
    consultar(
      'SELECT fecha, peso_kg FROM historial_peso WHERE mascota_id = ? ORDER BY fecha DESC LIMIT 12',
      [mascotaId]
    ),
  ]);

  return generar(
    {
      titulo: 'Historia clínica',
      subtitulo: `${ficha.nombre} · ${ficha.historia_numero || ''}`,
      generadoPor,
    },
    (doc) => {
      seccion(doc, 'Paciente');
      dato(doc, 'Nombre', ficha.nombre);
      dato(doc, 'Especie / raza', [ficha.especie, ficha.raza].filter(Boolean).join(' · '));
      dato(doc, 'Sexo', ficha.sexo);
      dato(doc, 'Nacimiento', ficha.fecha_nacimiento);
      dato(doc, 'Peso actual', ficha.peso_kg ? `${ficha.peso_kg} kg` : null);
      dato(doc, 'Microchip', ficha.microchip);
      dato(doc, 'Esterilizado', ficha.esterilizado ? 'Sí' : 'No');

      seccion(doc, 'Propietario');
      dato(doc, 'Nombre', ficha.propietario);
      dato(doc, 'Documento', ficha.documento);
      dato(doc, 'Teléfono', ficha.telefono);
      dato(doc, 'Dirección', [ficha.direccion, ficha.ciudad].filter(Boolean).join(', '));

      // Las alergias van pronto y destacadas: es lo que hay que ver antes de
      // recetar nada.
      if (alergias.length) {
        seccion(doc, 'Alergias');
        tabla(doc, [
          { titulo: 'Alérgeno', campo: 'nombre', ancho: 0.3 },
          { titulo: 'Tipo', campo: 'tipo', ancho: 0.18 },
          { titulo: 'Severidad', campo: 'severidad', ancho: 0.18 },
          { titulo: 'Reacción', campo: 'reaccion', ancho: 0.34 },
        ], alergias);
      }

      if (condiciones.length) {
        seccion(doc, 'Condiciones crónicas');
        tabla(doc, [
          { titulo: 'Condición', campo: 'nombre', ancho: 0.5 },
          { titulo: 'Estado', campo: 'estado', ancho: 0.25 },
          { titulo: 'Diagnosticada', campo: 'diagnosticada_en', ancho: 0.25 },
        ], condiciones);
      }

      if (pesos.length) {
        seccion(doc, 'Curva de peso');
        tabla(doc, [
          { titulo: 'Fecha', campo: 'fecha', ancho: 0.5 },
          { titulo: 'Peso (kg)', campo: 'peso_kg', ancho: 0.5 },
        ], pesos);
      }

      seccion(doc, 'Línea de tiempo');
      tabla(doc, [
        { titulo: 'Fecha', campo: 'fecha', ancho: 0.16 },
        { titulo: 'Tipo', campo: 'tipo', ancho: 0.14 },
        { titulo: 'Registro', campo: 'titulo', ancho: 0.3 },
        { titulo: 'Detalle', campo: 'detalle', ancho: 0.24 },
        { titulo: 'Profesional', campo: 'veterinario', ancho: 0.16 },
      ], linea);
    }
  );
}

/* ------------------------------------------------------------------
   Certificado de vacunación
   ------------------------------------------------------------------ */

async function certificadoVacunacion(mascotaId, generadoPor) {
  const ficha = await consultarUna(
    `SELECT m.nombre, m.sexo, m.fecha_nacimiento, m.color, m.microchip,
            e.nombre AS especie, r.nombre AS raza, u.nombre AS propietario, c.documento
       FROM mascotas m
       JOIN especies e ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       JOIN clientes c ON c.id = m.cliente_id
       JOIN usuarios u ON u.id = c.usuario_id
      WHERE m.id = ?`,
    [mascotaId]
  );

  if (!ficha) return null;

  const vacunas = await consultar(
    `SELECT v.nombre AS vacuna, av.fecha_aplicacion, av.proxima_fecha,
            COALESCE(av.lote, lv.lote) AS lote, lv.laboratorio,
            uv.nombre AS veterinario, ve.licencia
       FROM aplicaciones_vacunas av
       JOIN vacunas v ON v.id = av.vacuna_id
       LEFT JOIN lotes_vacunas lv ON lv.id = av.lote_id
       JOIN veterinarios ve ON ve.id = av.veterinario_id
       JOIN usuarios uv ON uv.id = ve.usuario_id
      WHERE av.mascota_id = ?
      ORDER BY av.fecha_aplicacion DESC`,
    [mascotaId]
  );

  return generar(
    {
      titulo: 'Certificado de vacunación',
      subtitulo: `${ficha.nombre} · ${ficha.especie}${ficha.raza ? ` (${ficha.raza})` : ''}`,
      generadoPor,
    },
    (doc) => {
      seccion(doc, 'Datos del paciente');
      dato(doc, 'Nombre', ficha.nombre);
      dato(doc, 'Especie / raza', [ficha.especie, ficha.raza].filter(Boolean).join(' · '));
      dato(doc, 'Sexo', ficha.sexo);
      dato(doc, 'Nacimiento', ficha.fecha_nacimiento);
      dato(doc, 'Color', ficha.color);
      dato(doc, 'Microchip', ficha.microchip);
      dato(doc, 'Propietario', ficha.propietario);
      dato(doc, 'Documento', ficha.documento);

      seccion(doc, 'Vacunas aplicadas');
      tabla(doc, [
        { titulo: 'Vacuna', campo: 'vacuna', ancho: 0.24 },
        { titulo: 'Aplicación', campo: 'fecha_aplicacion', ancho: 0.14 },
        { titulo: 'Refuerzo', campo: 'proxima_fecha', ancho: 0.14 },
        { titulo: 'Lote', campo: 'lote', ancho: 0.14 },
        { titulo: 'Laboratorio', campo: 'laboratorio', ancho: 0.16 },
        { titulo: 'Veterinario', campo: 'veterinario', ancho: 0.18 },
      ], vacunas);

      if (vacunas.length) {
        doc.moveDown(2);
        const firmante = vacunas[0];
        doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + 200, doc.y).strokeColor(COLOR.linea).stroke();
        doc.moveDown(0.3);
        doc.fillColor(COLOR.tinta).font('Helvetica').fontSize(9)
          .text(firmante.veterinario, MARGEN);
        doc.fillColor(COLOR.gris).fontSize(8)
          .text(`Médico veterinario · Licencia ${firmante.licencia || '—'}`, MARGEN);
      }
    }
  );
}

/* ------------------------------------------------------------------
   Fórmula médica (receta)
   ------------------------------------------------------------------ */

async function formulaMedica(recetaId, generadoPor) {
  const receta = await consultarUna(
    `SELECT r.*, m.nombre AS mascota, m.peso_kg, e.nombre AS especie,
            u.nombre AS propietario, uv.nombre AS veterinario, ve.licencia
       FROM recetas r
       JOIN mascotas m ON m.id = r.mascota_id
       JOIN especies e ON e.id = m.especie_id
       JOIN clientes c ON c.id = r.cliente_id
       JOIN usuarios u ON u.id = c.usuario_id
       JOIN veterinarios ve ON ve.id = r.veterinario_id
       JOIN usuarios uv ON uv.id = ve.usuario_id
      WHERE r.id = ?`,
    [recetaId]
  );

  if (!receta) return null;

  const items = await consultar(
    `SELECT me.nombre AS medicamento, me.concentracion, ri.dosis, ri.frecuencia,
            ri.duracion, ri.via, ri.cantidad, ri.indicaciones
       FROM receta_items ri
       JOIN medicamentos me ON me.id = ri.medicamento_id
      WHERE ri.receta_id = ?`,
    [recetaId]
  );

  return generar(
    { titulo: 'Fórmula médica veterinaria', subtitulo: receta.numero, generadoPor },
    (doc) => {
      seccion(doc, 'Paciente');
      dato(doc, 'Nombre', receta.mascota);
      dato(doc, 'Especie', receta.especie);
      dato(doc, 'Peso', receta.peso_kg ? `${receta.peso_kg} kg` : null);
      dato(doc, 'Propietario', receta.propietario);
      dato(doc, 'Fecha', receta.fecha);
      dato(doc, 'Vigente hasta', receta.vigente_hasta);

      seccion(doc, 'Prescripción');
      tabla(doc, [
        { titulo: 'Medicamento', campo: 'medicamento', ancho: 0.24 },
        { titulo: 'Dosis', campo: 'dosis', ancho: 0.16 },
        { titulo: 'Frecuencia', campo: 'frecuencia', ancho: 0.18 },
        { titulo: 'Duración', campo: 'duracion', ancho: 0.14 },
        { titulo: 'Vía', campo: 'via', ancho: 0.1 },
        { titulo: 'Cantidad', campo: 'cantidad', ancho: 0.18 },
      ], items);

      if (receta.indicaciones) {
        seccion(doc, 'Indicaciones');
        doc.fillColor(COLOR.tinta).font('Helvetica').fontSize(10)
          .text(receta.indicaciones, MARGEN, doc.y, { width: doc.page.width - MARGEN * 2 });
      }

      doc.moveDown(2.5);
      doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + 200, doc.y).strokeColor(COLOR.linea).stroke();
      doc.moveDown(0.3);
      doc.fillColor(COLOR.tinta).font('Helvetica').fontSize(9).text(receta.veterinario, MARGEN);
      doc.fillColor(COLOR.gris).fontSize(8)
        .text(`Médico veterinario · Licencia ${receta.licencia || '—'}`, MARGEN);
    }
  );
}

/* ------------------------------------------------------------------
   Resultado de laboratorio
   ------------------------------------------------------------------ */

async function resultadoLaboratorio(examenId, generadoPor) {
  const examen = await consultarUna(
    `SELECT ex.*, te.nombre AS tipo_nombre, m.nombre AS mascota, e.nombre AS especie,
            u.nombre AS propietario, uv.nombre AS solicitante,
            val.nombre AS validado_por_nombre
       FROM examenes ex
       LEFT JOIN tipos_examen te ON te.id = ex.tipo_examen_id
       JOIN mascotas m ON m.id = ex.mascota_id
       JOIN especies e ON e.id = m.especie_id
       JOIN clientes c ON c.id = m.cliente_id
       JOIN usuarios u ON u.id = c.usuario_id
       LEFT JOIN veterinarios ve ON ve.id = ex.solicitado_por
       LEFT JOIN usuarios uv ON uv.id = ve.usuario_id
       LEFT JOIN usuarios val ON val.id = ex.validado_por
      WHERE ex.id = ?`,
    [examenId]
  );

  if (!examen) return null;

  const resultados = await consultar(
    `SELECT parametro, valor, unidad, referencia,
            CASE WHEN fuera_rango = 1 THEN 'FUERA DE RANGO' ELSE '' END AS aviso
       FROM resultados_examenes WHERE examen_id = ? ORDER BY id`,
    [examenId]
  );

  return generar(
    {
      titulo: 'Resultado de laboratorio',
      subtitulo: `${examen.tipo_nombre || examen.descripcion || 'Examen'} · ${examen.mascota}`,
      generadoPor,
    },
    (doc) => {
      seccion(doc, 'Datos');
      dato(doc, 'Paciente', `${examen.mascota} (${examen.especie})`);
      dato(doc, 'Propietario', examen.propietario);
      dato(doc, 'Solicitado por', examen.solicitante);
      dato(doc, 'Fecha solicitud', examen.fecha_solicitud);
      dato(doc, 'Fecha resultado', examen.fecha_resultado);
      dato(doc, 'Estado', examen.estado);

      seccion(doc, 'Resultados');
      tabla(doc, [
        { titulo: 'Parámetro', campo: 'parametro', ancho: 0.32 },
        { titulo: 'Valor', campo: 'valor', ancho: 0.16 },
        { titulo: 'Unidad', campo: 'unidad', ancho: 0.14 },
        { titulo: 'Referencia', campo: 'referencia', ancho: 0.22 },
        { titulo: '', campo: 'aviso', ancho: 0.16 },
      ], resultados);

      if (examen.conclusion) {
        seccion(doc, 'Conclusión');
        doc.fillColor(COLOR.tinta).font('Helvetica').fontSize(10)
          .text(examen.conclusion, MARGEN, doc.y, { width: doc.page.width - MARGEN * 2 });
      }

      // Un resultado sin validar no es un resultado: se dice en el propio PDF
      // para que nadie tome una decisión clínica sobre un borrador.
      doc.moveDown(1.5);
      if (examen.estado === 'validado') {
        doc.fillColor(COLOR.gris).font('Helvetica').fontSize(8.5)
          .text(`Validado por ${examen.validado_por_nombre || '—'} el ${examen.validado_en || '—'}.`, MARGEN);
      } else {
        doc.fillColor('#C0392B').font('Helvetica-Bold').fontSize(9)
          .text('DOCUMENTO PRELIMINAR — resultado aún sin validar por el laboratorio.', MARGEN);
      }
    }
  );
}

/* ------------------------------------------------------------------
   Informe de hospitalización (epicrisis)
   ------------------------------------------------------------------ */

async function informeHospitalizacion(hospitalizacionId, generadoPor) {
  const hosp = await consultarUna(
    `SELECT ho.*, m.nombre AS mascota, e.nombre AS especie, u.nombre AS propietario,
            uv.nombre AS veterinario, hb.codigo AS habitacion
       FROM hospitalizaciones ho
       JOIN mascotas m ON m.id = ho.mascota_id
       JOIN especies e ON e.id = m.especie_id
       JOIN clientes c ON c.id = m.cliente_id
       JOIN usuarios u ON u.id = c.usuario_id
       LEFT JOIN veterinarios ve ON ve.id = ho.veterinario_id
       LEFT JOIN usuarios uv ON uv.id = ve.usuario_id
       LEFT JOIN habitaciones hb ON hb.id = ho.habitacion_id
      WHERE ho.id = ?`,
    [hospitalizacionId]
  );

  if (!hosp) return null;

  const controles = await consultar(
    `SELECT fecha, temperatura_c, frec_cardiaca, frec_respiratoria, observaciones
       FROM hospitalizacion_controles WHERE hospitalizacion_id = ? ORDER BY fecha`,
    [hospitalizacionId]
  );

  return generar(
    { titulo: 'Informe de hospitalización', subtitulo: hosp.mascota, generadoPor },
    (doc) => {
      seccion(doc, 'Internamiento');
      dato(doc, 'Paciente', `${hosp.mascota} (${hosp.especie})`);
      dato(doc, 'Propietario', hosp.propietario);
      dato(doc, 'Veterinario', hosp.veterinario);
      dato(doc, 'Ingreso', hosp.fecha_ingreso);
      dato(doc, 'Egreso', hosp.fecha_egreso);
      dato(doc, 'Jaula', hosp.habitacion);
      dato(doc, 'Motivo', hosp.motivo);
      dato(doc, 'Estado', hosp.estado);

      if (hosp.epicrisis) {
        seccion(doc, 'Epicrisis');
        doc.fillColor(COLOR.tinta).font('Helvetica').fontSize(10)
          .text(hosp.epicrisis, MARGEN, doc.y, { width: doc.page.width - MARGEN * 2 });
      }

      seccion(doc, 'Controles');
      tabla(doc, [
        { titulo: 'Fecha', campo: 'fecha', ancho: 0.22 },
        { titulo: 'Temp.', campo: 'temperatura_c', ancho: 0.12 },
        { titulo: 'FC', campo: 'frec_cardiaca', ancho: 0.1 },
        { titulo: 'FR', campo: 'frec_respiratoria', ancho: 0.1 },
        { titulo: 'Observaciones', campo: 'observaciones', ancho: 0.46 },
      ], controles);
    }
  );
}

module.exports = {
  historiaClinica,
  certificadoVacunacion,
  formulaMedica,
  resultadoLaboratorio,
  informeHospitalizacion,
};
