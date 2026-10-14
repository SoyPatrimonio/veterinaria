'use strict';

const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso, tienePermiso } = require('../middleware/roles');
const { limiteExportacion } = require('../middleware/rateLimit');
const esquemas = require('../utils/esquemas');
const pdf = require('../services/pdf.service');
const mascotaModel = require('../models/mascota.model');
const { consultarUna, ejecutar } = require('../config/database');

/**
 * Reportes profesionales en PDF.
 *
 * Van en su propio router y no dentro de cada módulo porque comparten tres
 * cosas: el permiso de exportar, la comprobación de propiedad (un cliente solo
 * saca los documentos de SUS mascotas) y el registro de quién descargó qué.
 *
 * Ese registro no es burocracia: la historia clínica es un documento médico y
 * conviene poder responder quién la sacó y cuándo.
 */

const router = Router();

router.use(requiereAuth);
// Todas las rutas de aquí devuelven un documento clínico, así que comparten
// también el freno contra la descarga masiva.
router.use(limiteExportacion);

/** Un cliente solo puede sacar documentos de sus propias mascotas. */
async function exigirAccesoAMascota(req, mascotaId) {
  const mascota = await mascotaModel.buscarPorId(mascotaId);
  if (!mascota) throw ApiError.noEncontrado('Esa mascota no existe.');

  const esClinica = ['admin', 'veterinario'].includes(req.usuario.rol);
  const esDueno = req.usuario.cliente_id && mascota.cliente_id === req.usuario.cliente_id;

  if (!esClinica && !esDueno) throw ApiError.prohibido('Esa mascota no es tuya.');
  return mascota;
}

async function registrar(req, tipo, { titulo, entidad, entidadId, mascotaId = null, clienteId = null }) {
  await ejecutar(
    `INSERT INTO reportes_generados
       (tipo, titulo, entidad, entidad_id, mascota_id, cliente_id, generado_por, formato)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pdf')`,
    [tipo, titulo, entidad, entidadId, mascotaId, clienteId, req.usuario.id]
  );
}

/**
 * Nombre de archivo seguro para la cabecera.
 *
 * El nombre lleva dentro el de la mascota, que lo escribe el usuario. Unas
 * comillas ahí rompen la cabecera —y un salto de línea intentaría partirla en
 * dos—, así que se deja solo lo que puede formar parte de un nombre de archivo
 * y se recorta. Los acentos se conservan: la cabecera viaja en latin-1 y las
 * letras acentuadas sí caben.
 */
function nombreSeguro(texto, respaldo = 'documento') {
  const limpio = String(texto)
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .trim()
    .slice(0, 80);
  return limpio || respaldo;
}

/**
 * Manda el PDF al navegador.
 *
 * `inline` para que se abra en el visor en vez de descargarse a ciegas: quien
 * pide un certificado normalmente quiere mirarlo antes de imprimirlo.
 */
function enviar(res, doc, nombreArchivo) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreSeguro(nombreArchivo, 'documento.pdf')}"`);
  doc.pipe(res);
}

/** GET /api/reportes/pdf/historia/:id */
router.get(
  '/historia/:id',
  requierePermiso('reportes.exportar', 'historia.ver_propia', 'historia.ver_todas'),
  validar({ params: esquemas.paramsId }),
  asyncHandler(async (req, res) => {
    const mascota = await exigirAccesoAMascota(req, req.params.id);

    const doc = await pdf.historiaClinica(mascota.id, req.usuario.nombre);
    if (!doc) throw ApiError.noEncontrado('No se pudo generar la historia.');

    await registrar(req, 'historia_clinica', {
      titulo: `Historia clínica de ${mascota.nombre}`,
      entidad: 'mascotas',
      entidadId: mascota.id,
      mascotaId: mascota.id,
      clienteId: mascota.cliente_id,
    });

    enviar(res, doc, `historia-${mascota.nombre}.pdf`);
  })
);

/** GET /api/reportes/pdf/vacunacion/:id */
router.get(
  '/vacunacion/:id',
  requierePermiso('reportes.exportar', 'historia.ver_propia', 'historia.ver_todas'),
  validar({ params: esquemas.paramsId }),
  asyncHandler(async (req, res) => {
    const mascota = await exigirAccesoAMascota(req, req.params.id);

    const doc = await pdf.certificadoVacunacion(mascota.id, req.usuario.nombre);
    if (!doc) throw ApiError.noEncontrado('No se pudo generar el certificado.');

    await registrar(req, 'certificado_vacunacion', {
      titulo: `Certificado de vacunación de ${mascota.nombre}`,
      entidad: 'mascotas',
      entidadId: mascota.id,
      mascotaId: mascota.id,
      clienteId: mascota.cliente_id,
    });

    enviar(res, doc, `vacunacion-${mascota.nombre}.pdf`);
  })
);

/** GET /api/reportes/pdf/receta/:id */
router.get(
  '/receta/:id',
  requierePermiso('recetas.ver_propias', 'recetas.ver_todas', 'reportes.exportar'),
  validar({ params: esquemas.paramsId }),
  asyncHandler(async (req, res) => {
    const receta = await consultarUna(
      'SELECT id, numero, mascota_id, cliente_id FROM recetas WHERE id = ?',
      [req.params.id]
    );
    if (!receta) throw ApiError.noEncontrado('Esa receta no existe.');

    if (!tienePermiso(req, 'recetas.ver_todas') && receta.cliente_id !== req.usuario.cliente_id) {
      throw ApiError.prohibido('Esa receta no es tuya.');
    }

    const doc = await pdf.formulaMedica(receta.id, req.usuario.nombre);
    await registrar(req, 'formula_medica', {
      titulo: `Fórmula ${receta.numero}`,
      entidad: 'recetas',
      entidadId: receta.id,
      mascotaId: receta.mascota_id,
      clienteId: receta.cliente_id,
    });

    enviar(res, doc, `formula-${receta.numero}.pdf`);
  })
);

/** GET /api/reportes/pdf/laboratorio/:id */
router.get(
  '/laboratorio/:id',
  requierePermiso('laboratorio.ver', 'historia.ver_propia', 'reportes.exportar'),
  validar({ params: esquemas.paramsId }),
  asyncHandler(async (req, res) => {
    const examen = await consultarUna(
      'SELECT id, mascota_id, estado FROM examenes WHERE id = ?',
      [req.params.id]
    );
    if (!examen) throw ApiError.noEncontrado('Ese examen no existe.');

    const mascota = await exigirAccesoAMascota(req, examen.mascota_id);

    // Al propietario no se le entrega un resultado sin validar: el PDF avisaría
    // igual, pero es mejor no ponerlo en circulación.
    const esClinica = ['admin', 'veterinario'].includes(req.usuario.rol);
    if (!esClinica && examen.estado !== 'validado') {
      throw ApiError.conflicto('Ese resultado todavía no está validado por el laboratorio.');
    }

    const doc = await pdf.resultadoLaboratorio(examen.id, req.usuario.nombre);
    await registrar(req, 'resultado_laboratorio', {
      titulo: `Resultado de laboratorio de ${mascota.nombre}`,
      entidad: 'examenes',
      entidadId: examen.id,
      mascotaId: mascota.id,
      clienteId: mascota.cliente_id,
    });

    enviar(res, doc, `laboratorio-${examen.id}.pdf`);
  })
);

/** GET /api/reportes/pdf/hospitalizacion/:id */
router.get(
  '/hospitalizacion/:id',
  requierePermiso('hospitalizacion.ver', 'hospitalizacion.gestionar', 'reportes.exportar'),
  validar({ params: esquemas.paramsId }),
  asyncHandler(async (req, res) => {
    const hosp = await consultarUna(
      'SELECT id, mascota_id FROM hospitalizaciones WHERE id = ?',
      [req.params.id]
    );
    if (!hosp) throw ApiError.noEncontrado('Esa hospitalización no existe.');

    const mascota = await exigirAccesoAMascota(req, hosp.mascota_id);

    const doc = await pdf.informeHospitalizacion(hosp.id, req.usuario.nombre);
    await registrar(req, 'informe_hospitalizacion', {
      titulo: `Informe de hospitalización de ${mascota.nombre}`,
      entidad: 'hospitalizaciones',
      entidadId: hosp.id,
      mascotaId: mascota.id,
      clienteId: mascota.cliente_id,
    });

    enviar(res, doc, `hospitalizacion-${hosp.id}.pdf`);
  })
);

module.exports = router;
// Un router de Express es una función, así que la limpieza del nombre viaja
// colgada de él para poder probarla sin levantar el servidor.
module.exports.nombreSeguro = nombreSeguro;
