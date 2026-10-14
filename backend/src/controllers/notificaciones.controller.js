'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const notificacionModel = require('../models/notificacion.model');
const avisos = require('../services/notificaciones.service');
const { consultarUna } = require('../config/database');

/** GET /api/notificaciones — las de la propia sesión. */
const listar = asyncHandler(async (req, res) => {
  const { soloNoLeidas, limite } = req.consulta || {};

  const [notificaciones, noLeidas] = await Promise.all([
    notificacionModel.listar(req.usuario.id, { soloNoLeidas, limite }),
    notificacionModel.contarNoLeidas(req.usuario.id),
  ]);

  res.json({ ok: true, notificaciones, noLeidas });
});

/** PATCH /api/notificaciones/:id/leida */
const marcarLeida = asyncHandler(async (req, res) => {
  const marcada = await notificacionModel.marcarLeida(req.params.id, req.usuario.id);
  if (!marcada) throw ApiError.noEncontrado('Ese aviso no existe o ya estaba leído.');

  res.json({ ok: true, noLeidas: await notificacionModel.contarNoLeidas(req.usuario.id) });
});

/** POST /api/notificaciones/leer-todas */
const leerTodas = asyncHandler(async (req, res) => {
  const marcadas = await notificacionModel.marcarTodasLeidas(req.usuario.id);
  res.json({ ok: true, marcadas, noLeidas: 0 });
});

/** DELETE /api/notificaciones/:id */
const eliminar = asyncHandler(async (req, res) => {
  const borrada = await notificacionModel.eliminar(req.params.id, req.usuario.id);
  if (!borrada) throw ApiError.noEncontrado('Ese aviso no existe.');

  res.json({ ok: true, mensaje: 'Aviso eliminado.' });
});

/** POST /api/notificaciones — avisa a una persona o a todo un rol. */
const enviar = asyncHandler(async (req, res) => {
  if (req.body.usuarioId) {
    const destino = await consultarUna('SELECT id, estado FROM usuarios WHERE id = ?', [req.body.usuarioId]);
    if (!destino) throw ApiError.badRequest('Ese usuario no existe.');
    if (destino.estado !== 'activo') throw ApiError.badRequest('Esa cuenta no está activa.');
  }

  const resultado = await avisos.avisar(req.body);
  if (resultado === null) throw new ApiError(500, 'No se pudo enviar el aviso.');

  res.status(201).json({
    ok: true,
    // Con un rol, avisar() devuelve a cuántas cuentas llegó; con un usuario,
    // el id del aviso creado.
    destinatarios: req.body.rol ? resultado : 1,
  });
});

/* ------------------------------------------------------------------
   Recordatorios
   ------------------------------------------------------------------ */

/** GET /api/notificaciones/recordatorios */
const listarRecordatorios = asyncHandler(async (req, res) => {
  const { estado, limite } = req.consulta || {};

  // El personal ve los de toda la clínica; un cliente, solo los suyos.
  const usuarioId = req.usuario.rol === 'cliente' ? req.usuario.id : null;
  const recordatorios = await notificacionModel.listarRecordatorios({ usuarioId, estado, limite });

  res.json({ ok: true, recordatorios });
});

/** POST /api/notificaciones/recordatorios */
const crearRecordatorio = asyncHandler(async (req, res) => {
  // Sin destinatario explícito, el aviso es para quien lo programa.
  const usuarioId = req.body.usuarioId || req.usuario.id;

  const destino = await consultarUna('SELECT id FROM usuarios WHERE id = ?', [usuarioId]);
  if (!destino) throw ApiError.badRequest('Ese usuario no existe.');

  const id = await notificacionModel.crearRecordatorio({ ...req.body, usuarioId });
  res.status(201).json({ ok: true, recordatorio: await notificacionModel.recordatorioPorId(id) });
});

/** DELETE /api/notificaciones/recordatorios/:id */
const cancelarRecordatorio = asyncHandler(async (req, res) => {
  const recordatorio = await notificacionModel.recordatorioPorId(req.params.id);
  if (!recordatorio) throw ApiError.noEncontrado('Ese recordatorio no existe.');

  if (req.usuario.rol === 'cliente' && recordatorio.usuario_id !== req.usuario.id) {
    throw ApiError.prohibido('Ese recordatorio no es tuyo.');
  }

  const cancelado = await notificacionModel.cancelarRecordatorio(recordatorio.id);
  if (!cancelado) throw ApiError.conflicto('Ese recordatorio ya se había enviado o cancelado.');

  res.json({ ok: true, mensaje: 'Recordatorio cancelado.' });
});

/**
 * POST /api/notificaciones/recordatorios/procesar
 *
 * Entrega los recordatorios cuya hora ya pasó. No hay proceso en segundo plano
 * —la función de Vercel solo vive mientras atiende una petición—, así que esto
 * es lo que hace de reloj: lo llama el panel de la clínica al abrirse y se
 * puede llamar a mano desde el panel de avisos.
 */
const procesarRecordatorios = asyncHandler(async (req, res) => {
  const entregados = await avisos.procesarPendientes();
  res.json({ ok: true, entregados });
});

/** GET /api/notificaciones/plantillas */
const plantillas = asyncHandler(async (req, res) => {
  res.json({ ok: true, plantillas: await notificacionModel.listarPlantillas() });
});

module.exports = {
  listar,
  marcarLeida,
  leerTodas,
  eliminar,
  enviar,
  listarRecordatorios,
  crearRecordatorio,
  cancelarRecordatorio,
  procesarRecordatorios,
  plantillas,
};
