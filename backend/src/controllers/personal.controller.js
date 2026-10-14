'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const personalModel = require('../models/personal.model');
const avisos = require('../services/notificaciones.service');
const { alcanceSede } = require('../middleware/roles');
const { resolverRango } = require('../utils/fechas');

/** Gestión del personal: turnos, asistencia, ausencias, comisiones. */

/* ---- Turnos --------------------------------------------------------- */

/** GET /api/personal/turnos */
const turnos = asyncHandler(async (req, res) => {
  res.json({ ok: true, turnos: await personalModel.turnos(req.consulta || {}) });
});

/** POST /api/personal/turnos */
const crearTurno = asyncHandler(async (req, res) => {
  await personalModel.crearTurno(req.body);
  res.status(201).json({ ok: true, turnos: await personalModel.turnos({ soloActivos: false }) });
});

/** GET /api/personal/asignaciones */
const asignaciones = asyncHandler(async (req, res) => {
  const { desde, hasta } = resolverRango(req.consulta);

  // Cada quien ve su cuadro; quien gestiona, el de todos.
  const usuarioId = req.permisos.includes('personal.gestionar')
    ? req.consulta?.usuarioId ?? null
    : req.usuario.id;

  // Los turnos son de un local: fuera de la administración, cada quien ve los
  // de su sede.
  const sedeId = alcanceSede(req, req.consulta?.sedeId);

  res.json({
    ok: true,
    asignaciones: await personalModel.asignaciones({ desde, hasta, usuarioId, sedeId }),
  });
});

/** POST /api/personal/asignaciones */
const asignarTurno = asyncHandler(async (req, res) => {
  const resultado = await personalModel.asignarTurno(req.body);
  if (resultado.error) throw ApiError.conflicto(resultado.error);

  res.status(201).json({ ok: true, mensaje: 'Turno asignado.' });
});

/** DELETE /api/personal/asignaciones/:id */
const quitarAsignacion = asyncHandler(async (req, res) => {
  const quitada = await personalModel.quitarAsignacion(req.params.id);
  if (!quitada) throw ApiError.noEncontrado('Esa asignación no existe.');

  res.json({ ok: true, mensaje: 'Asignación retirada.' });
});

/* ---- Asistencia ----------------------------------------------------- */

/** GET /api/personal/asistencia */
const asistencia = asyncHandler(async (req, res) => {
  const { desde, hasta } = resolverRango(req.consulta);
  const usuarioId = req.permisos.includes('personal.gestionar')
    ? req.consulta?.usuarioId ?? null
    : req.usuario.id;

  res.json({ ok: true, asistencia: await personalModel.asistencia({ desde, hasta, usuarioId }) });
});

/** POST /api/personal/asistencia */
const registrarAsistencia = asyncHandler(async (req, res) => {
  await personalModel.registrarAsistencia(req.body, req.usuario.id);
  res.status(201).json({ ok: true, mensaje: 'Asistencia registrada.' });
});

/* ---- Ausencias ------------------------------------------------------ */

/** GET /api/personal/ausencias */
const ausencias = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };
  if (!req.permisos.includes('ausencias.aprobar')) filtros.usuarioId = req.usuario.id;

  res.json({ ok: true, ausencias: await personalModel.ausencias(filtros) });
});

/** POST /api/personal/ausencias */
const solicitarAusencia = asyncHandler(async (req, res) => {
  // Solo quien aprueba puede pedir en nombre de otro.
  const usuarioId = req.permisos.includes('ausencias.aprobar') && req.body.usuarioId
    ? req.body.usuarioId
    : req.usuario.id;

  const id = await personalModel.solicitarAusencia({ ...req.body, usuarioId });

  await avisos.avisar({
    rol: 'admin',
    tipo: 'ausencia',
    titulo: `Solicitud de ${req.body.tipo}`,
    mensaje: `${req.usuario.nombre}: del ${req.body.desde} al ${req.body.hasta}.`,
    enlace: 'admin/personal.html',
  });

  res.status(201).json({ ok: true, ausenciaId: id });
});

/** PATCH /api/personal/ausencias/:id */
const resolverAusencia = asyncHandler(async (req, res) => {
  const ausencia = await personalModel.ausenciaPorId(req.params.id);
  if (!ausencia) throw ApiError.noEncontrado('Esa solicitud no existe.');
  if (ausencia.estado !== 'solicitada' && req.body.estado !== 'cancelada') {
    throw ApiError.conflicto('Esa solicitud ya fue resuelta.');
  }

  const bloqueoId = await personalModel.resolverAusencia(ausencia, req.body, req.usuario.id);

  await avisos.avisar({
    usuarioId: ausencia.usuario_id,
    tipo: 'ausencia',
    titulo: `Tu solicitud de ${ausencia.tipo} fue ${req.body.estado}`,
    mensaje: req.body.motivo || `Del ${ausencia.desde} al ${ausencia.hasta}.`,
    enlace: 'veterinario/agenda.html',
  });

  res.json({
    ok: true,
    mensaje: bloqueoId
      ? 'Aprobada. Se bloqueó la agenda en esas fechas.'
      : `Solicitud ${req.body.estado}.`,
  });
});

/* ---- Comisiones ----------------------------------------------------- */

/** GET /api/personal/comisiones/reglas */
const reglasComision = asyncHandler(async (req, res) => {
  res.json({ ok: true, reglas: await personalModel.reglasComision() });
});

/** POST /api/personal/comisiones/reglas */
const crearReglaComision = asyncHandler(async (req, res) => {
  await personalModel.crearReglaComision(req.body);
  res.status(201).json({ ok: true, reglas: await personalModel.reglasComision() });
});

/** GET /api/personal/comisiones */
const comisiones = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };
  if (!req.permisos.includes('comisiones.gestionar')) filtros.usuarioId = req.usuario.id;

  res.json({ ok: true, comisiones: await personalModel.comisiones(filtros) });
});

/** POST /api/personal/comisiones/calcular */
const calcularComisiones = asyncHandler(async (req, res) => {
  const generadas = await personalModel.calcularComisiones(req.body.periodo, req.usuario.id);

  res.json({
    ok: true,
    generadas,
    comisiones: await personalModel.comisiones({ periodo: req.body.periodo }),
  });
});

/** POST /api/personal/comisiones/liquidar */
const liquidarComisiones = asyncHandler(async (req, res) => {
  const liquidadas = await personalModel.liquidar(req.body.periodo, req.body.usuarioId ?? null);
  if (!liquidadas) throw ApiError.conflicto('No hay comisiones pendientes en ese periodo.');

  res.json({ ok: true, liquidadas });
});

/* ---- Certificaciones y productividad -------------------------------- */

/** GET /api/personal/certificaciones */
const certificaciones = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };
  if (!req.permisos.includes('personal.gestionar')) filtros.usuarioId = req.usuario.id;

  res.json({ ok: true, certificaciones: await personalModel.certificaciones(filtros) });
});

/** POST /api/personal/certificaciones */
const crearCertificacion = asyncHandler(async (req, res) => {
  await personalModel.crearCertificacion(req.body);
  res.status(201).json({ ok: true, certificaciones: await personalModel.certificaciones({}) });
});

/** GET /api/personal/productividad */
const productividad = asyncHandler(async (req, res) => {
  const { desde, hasta } = resolverRango(req.consulta);
  res.json({ ok: true, desde, hasta, productividad: await personalModel.productividad({ desde, hasta }) });
});

module.exports = {
  turnos,
  crearTurno,
  asignaciones,
  asignarTurno,
  quitarAsignacion,
  asistencia,
  registrarAsistencia,
  ausencias,
  solicitarAusencia,
  resolverAusencia,
  reglasComision,
  crearReglaComision,
  comisiones,
  calcularComisiones,
  liquidarComisiones,
  certificaciones,
  crearCertificacion,
  productividad,
};
