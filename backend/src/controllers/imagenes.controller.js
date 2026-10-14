'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const imagenesModel = require('../models/imagenes.model');
const mascotaModel = require('../models/mascota.model');
const avisos = require('../services/notificaciones.service');
const { alcanceCliente } = require('../middleware/roles');

/**
 * Imagenología.
 *
 * El dueño puede ver la galería y el informe firmado de sus mascotas; los
 * borradores no, porque un informe a medias no es una conclusión.
 */

async function mascotaConAcceso(req, mascotaId) {
  const mascota = await mascotaModel.buscarPorId(mascotaId);
  if (!mascota) throw ApiError.noEncontrado('Esa mascota no existe.');

  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';
  const esDueno = req.usuario.cliente_id && mascota.cliente_id === req.usuario.cliente_id;

  if (!esClinica && !esDueno) throw ApiError.prohibido('Esa mascota no es tuya.');
  return mascota;
}

async function estudioExistente(id) {
  const estudio = await imagenesModel.porId(id);
  if (!estudio) throw ApiError.noEncontrado('Ese estudio no existe.');
  return estudio;
}

/** GET /api/imagenes */
const listar = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  // La ruta acepta también historia.ver_propia, que es la del dueño. Sin este
  // recorte, pedir el listado sin mascotaId devolvía los estudios de todos los
  // pacientes de la clínica.
  const clienteId = alcanceCliente(req, 'imagenes.ver', 'imagenes.gestionar');
  if (clienteId) filtros.clienteId = clienteId;

  if (filtros.mascotaId) await mascotaConAcceso(req, filtros.mascotaId);

  res.json({ ok: true, estudios: await imagenesModel.listar(filtros) });
});

/** GET /api/imagenes/mascota/:id — la galería del paciente. */
const galeria = asyncHandler(async (req, res) => {
  const mascota = await mascotaConAcceso(req, req.params.id);
  res.json({ ok: true, mascota, estudios: await imagenesModel.galeriaDe(mascota.id) });
});

/** GET /api/imagenes/:id */
const detalle = asyncHandler(async (req, res) => {
  const estudio = await estudioExistente(req.params.id);
  await mascotaConAcceso(req, estudio.mascota_id);

  const [archivos, informe, comparables] = await Promise.all([
    imagenesModel.archivosDe(estudio.id),
    imagenesModel.informeDe(estudio.id),
    imagenesModel.comparables(estudio.id),
  ]);

  // Al dueño no se le enseña un informe en borrador.
  const informeVisible = informe && (informe.estado === 'firmado' || req.usuario.rol !== 'cliente')
    ? informe
    : null;

  res.json({ ok: true, estudio, archivos, informe: informeVisible, comparables });
});

/** POST /api/imagenes */
const crear = asyncHandler(async (req, res) => {
  await mascotaConAcceso(req, req.body.mascotaId);

  const { id } = await imagenesModel.crear(
    { ...req.body, solicitadoPor: req.usuario.veterinario_id ?? null },
    req.usuario.id
  );

  res.status(201).json({ ok: true, estudio: await imagenesModel.porId(id) });
});

/** DELETE /api/imagenes/:id */
const anular = asyncHandler(async (req, res) => {
  const estudio = await estudioExistente(req.params.id);

  // Lo anula quien lo solicitó, o la administración. Un estudio pedido sin
  // veterinario asociado solo lo anula la administración, que es quien puede
  // responder por qué se retiró.
  if (req.usuario.rol !== 'admin' && estudio.solicitado_por !== req.usuario.veterinario_id) {
    throw ApiError.prohibido('Solo el veterinario que solicitó el estudio puede anularlo.');
  }

  const anulado = await imagenesModel.anular(estudio.id);
  if (!anulado) throw ApiError.conflicto('Un estudio ya informado no se puede anular.');

  res.json({ ok: true, mensaje: 'Estudio anulado.' });
});

/** POST /api/imagenes/:id/archivos — la referencia; el archivo ya está en Storage. */
const agregarArchivo = asyncHandler(async (req, res) => {
  const estudio = await estudioExistente(req.params.id);

  await imagenesModel.agregarArchivo(estudio.id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, archivos: await imagenesModel.archivosDe(estudio.id) });
});

/** DELETE /api/imagenes/archivos/:id */
const eliminarArchivo = asyncHandler(async (req, res) => {
  const borrado = await imagenesModel.eliminarArchivo(req.params.id);
  if (!borrado) throw ApiError.noEncontrado('Ese archivo no existe.');

  res.json({ ok: true, mensaje: 'Archivo retirado del estudio.' });
});

/** PUT /api/imagenes/:id/informe */
const guardarInforme = asyncHandler(async (req, res) => {
  const estudio = await estudioExistente(req.params.id);

  if (req.body.firmar && !req.usuario.veterinario_id) {
    throw ApiError.badRequest('Solo un veterinario puede firmar un informe.');
  }

  try {
    await imagenesModel.guardarInforme(estudio.id, req.body, req.usuario.veterinario_id ?? null);
  } catch (error) {
    throw ApiError.conflicto(error.message);
  }

  if (req.body.firmar) {
    const usuarioCliente = await avisos.usuarioDelCliente(estudio.cliente_id);
    await avisos.avisar({
      usuarioId: usuarioCliente,
      tipo: 'informe_imagen',
      titulo: `Informe de ${estudio.modalidad} de ${estudio.mascota_nombre}`,
      mensaje: 'Ya puedes consultarlo en la historia clínica de tu mascota.',
      enlace: 'cliente/historia.html',
    });
  }

  res.json({
    ok: true,
    estudio: await imagenesModel.porId(estudio.id),
    informe: await imagenesModel.informeDe(estudio.id),
  });
});

module.exports = {
  listar,
  galeria,
  detalle,
  crear,
  anular,
  agregarArchivo,
  eliminarArchivo,
  guardarInforme,
};
