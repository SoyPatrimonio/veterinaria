'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const servicioModel = require('../models/servicio.model');

/** GET /api/servicios — público. El admin puede pedir también los inactivos. */
const listar = asyncHandler(async (req, res) => {
  const incluirInactivos = req.usuario?.rol === 'admin' && req.query.todos === '1';
  const servicios = await servicioModel.listar({ soloActivos: !incluirInactivos });
  res.json({ ok: true, servicios });
});

/** GET /api/servicios/:id — público. */
const detalle = asyncHandler(async (req, res) => {
  const servicio = await servicioModel.buscarPorId(req.params.id);
  if (!servicio) throw ApiError.noEncontrado('Ese servicio no existe.');

  const veterinarios = await servicioModel.veterinariosDe(servicio.id);
  res.json({ ok: true, servicio, veterinarios });
});

/** GET /api/servicios/:id/veterinarios — para el paso 3 del agendamiento. */
const veterinarios = asyncHandler(async (req, res) => {
  const servicio = await servicioModel.buscarPorId(req.params.id);
  if (!servicio) throw ApiError.noEncontrado('Ese servicio no existe.');

  let lista = await servicioModel.veterinariosDe(servicio.id);

  // Un servicio sin especialistas asignados lo puede atender todo el equipo.
  // El recorte va igual que en /veterinarios: esta ruta también la abre quien
  // está agendando sin haber entrado todavía.
  if (!lista.length) {
    const veterinarioModel = require('../models/veterinario.model');
    lista = await veterinarioModel.listar({ soloActivos: true, completo: Boolean(req.usuario) });
  }

  res.json({ ok: true, veterinarios: lista });
});

/** POST /api/servicios — solo admin. */
const crear = asyncHandler(async (req, res) => {
  const id = await servicioModel.crear(req.body);
  const servicio = await servicioModel.buscarPorId(id);
  res.status(201).json({ ok: true, servicio });
});

/** PUT /api/servicios/:id — solo admin. */
const actualizar = asyncHandler(async (req, res) => {
  const existente = await servicioModel.buscarPorId(req.params.id);
  if (!existente) throw ApiError.noEncontrado('Ese servicio no existe.');

  await servicioModel.actualizar(req.params.id, req.body);
  const servicio = await servicioModel.buscarPorId(req.params.id);
  res.json({ ok: true, servicio });
});

/** DELETE /api/servicios/:id — desactiva (las citas históricas lo referencian). */
const desactivar = asyncHandler(async (req, res) => {
  const existente = await servicioModel.buscarPorId(req.params.id);
  if (!existente) throw ApiError.noEncontrado('Ese servicio no existe.');

  await servicioModel.desactivar(req.params.id);
  res.json({ ok: true, mensaje: 'Servicio desactivado.' });
});

module.exports = { listar, detalle, veterinarios, crear, actualizar, desactivar };
