'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mascotaModel = require('../models/mascota.model');
const almacenamiento = require('../services/storage.service');
const { consultar, consultarUna } = require('../config/database');

/**
 * Recupera la mascota y comprueba el permiso en un solo sitio:
 * el cliente solo ve las suyas; veterinarios y admin ven todas.
 */
async function obtenerConPermiso(req, mascotaId, { exigirPropietario = false } = {}) {
  const mascota = await mascotaModel.buscarPorId(mascotaId);
  if (!mascota) throw ApiError.noEncontrado('Esa mascota no existe.');

  const esDueno = req.usuario.cliente_id && mascota.cliente_id === req.usuario.cliente_id;
  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';

  if (exigirPropietario) {
    // Editar o eliminar: solo el dueño o un administrador.
    if (!esDueno && req.usuario.rol !== 'admin') {
      throw ApiError.prohibido('Solo el dueño puede modificar esta mascota.');
    }
  } else if (!esDueno && !esClinica) {
    throw ApiError.prohibido('No tienes acceso a esta mascota.');
  }

  return mascota;
}

/** GET /api/mascotas — las del cliente, o todas si es personal de la clínica. */
const listar = asyncHandler(async (req, res) => {
  const { busqueda, limite, desplazamiento } = req.consulta || {};

  if (req.usuario.rol === 'cliente') {
    if (!req.usuario.cliente_id) throw ApiError.badRequest('Tu cuenta no tiene ficha de cliente.');
    const mascotas = await mascotaModel.listarPorCliente(req.usuario.cliente_id);
    return res.json({ ok: true, mascotas });
  }

  const mascotas = await mascotaModel.listarTodas({ busqueda, limite, desplazamiento });
  res.json({ ok: true, mascotas });
});

/** GET /api/mascotas/:id */
const detalle = asyncHandler(async (req, res) => {
  const mascota = await obtenerConPermiso(req, req.params.id);
  res.json({ ok: true, mascota });
});

/** POST /api/mascotas */
const crear = asyncHandler(async (req, res) => {
  // Un admin puede registrar la mascota a nombre de otro cliente enviando
  // clienteId; un cliente solo puede registrarla a su propio nombre.
  let clienteId = req.usuario.cliente_id;
  if (req.usuario.rol !== 'cliente') {
    clienteId = Number(req.body.clienteId) || null;
    if (!clienteId) throw ApiError.badRequest('Indica el cliente dueño de la mascota (clienteId).');
    const existe = await consultarUna('SELECT id FROM clientes WHERE id = ?', [clienteId]);
    if (!existe) throw ApiError.badRequest('Ese cliente no existe.');
  }
  if (!clienteId) throw ApiError.badRequest('Tu cuenta no tiene ficha de cliente.');

  await validarEspecieYRaza(req.body);

  const id = await mascotaModel.crear(clienteId, req.body);
  const mascota = await mascotaModel.buscarPorId(id);
  res.status(201).json({ ok: true, mascota });
});

/** PUT /api/mascotas/:id */
const actualizar = asyncHandler(async (req, res) => {
  await obtenerConPermiso(req, req.params.id, { exigirPropietario: true });
  await validarEspecieYRaza(req.body);

  await mascotaModel.actualizar(req.params.id, req.body);
  const mascota = await mascotaModel.buscarPorId(req.params.id);
  res.json({ ok: true, mascota });
});

/** DELETE /api/mascotas/:id — desactiva, no borra. */
const desactivar = asyncHandler(async (req, res) => {
  await obtenerConPermiso(req, req.params.id, { exigirPropietario: true });

  const citasFuturas = await consultarUna(
    `SELECT COUNT(*) AS total FROM citas
      WHERE mascota_id = ? AND inicio >= LOCALTIMESTAMP AND estado IN ('pendiente','confirmada')`,
    [req.params.id]
  );
  if (citasFuturas.total > 0) {
    throw ApiError.conflicto('Esta mascota tiene citas pendientes. Cancélalas antes de darla de baja.');
  }

  await mascotaModel.desactivar(req.params.id);
  res.json({ ok: true, mensaje: 'Mascota dada de baja.' });
});

/** POST /api/mascotas/:id/foto */
const subirFoto = asyncHandler(async (req, res) => {
  const mascota = await obtenerConPermiso(req, req.params.id, { exigirPropietario: true });
  if (!req.file) throw ApiError.badRequest('No se recibió ninguna imagen.');

  const url = await almacenamiento.guardarFoto(req.file, 'mascotas');
  await mascotaModel.actualizarFoto(mascota.id, url);

  // La anterior se borra después de guardar la nueva: si el borrado falla,
  // la mascota ya tiene su foto actualizada y solo queda un archivo suelto, así
  // que no se hace fallar la petición. Pero se registra: si el borrado dejara
  // de funcionar, el único síntoma sería el bucket creciendo sin explicación.
  try {
    await almacenamiento.borrarFoto(mascota.foto);
  } catch (error) {
    console.warn(
      `[mascotas] quedó sin borrar la foto anterior de la mascota ${mascota.id}: ${error.message}`
    );
  }

  res.json({ ok: true, foto: url });
});

/** Evita guardar una raza que no corresponde a la especie elegida. */
async function validarEspecieYRaza({ especieId, razaId }) {
  const especie = await consultarUna('SELECT id FROM especies WHERE id = ?', [especieId]);
  if (!especie) throw ApiError.badRequest('La especie seleccionada no existe.');

  if (razaId) {
    const raza = await consultarUna('SELECT id FROM razas WHERE id = ? AND especie_id = ?', [razaId, especieId]);
    if (!raza) throw ApiError.badRequest('La raza no corresponde a la especie seleccionada.');
  }
}

/** GET /api/catalogos/especies */
const especies = asyncHandler(async (req, res) => {
  const filas = await consultar('SELECT id, nombre FROM especies ORDER BY nombre');
  res.json({ ok: true, especies: filas });
});

/** GET /api/catalogos/razas?especieId= */
const razas = asyncHandler(async (req, res) => {
  const especieId = Number(req.query.especieId) || null;
  const filas = especieId
    ? await consultar('SELECT id, especie_id, nombre FROM razas WHERE especie_id = ? ORDER BY nombre', [especieId])
    : await consultar('SELECT id, especie_id, nombre FROM razas ORDER BY nombre');
  res.json({ ok: true, razas: filas });
});

module.exports = { listar, detalle, crear, actualizar, desactivar, subirFoto, especies, razas };
