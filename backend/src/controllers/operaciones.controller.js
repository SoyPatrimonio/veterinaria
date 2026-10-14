'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const operacionesModel = require('../models/operaciones.model');
const avisos = require('../services/notificaciones.service');
const { resolverRango } = require('../utils/fechas');

/** Equipos médicos, bioseguridad y caja. */

/* ==================================================================
   EQUIPOS
   ================================================================== */

/** GET /api/operaciones/equipos */
const equipos = asyncHandler(async (req, res) => {
  res.json({ ok: true, equipos: await operacionesModel.equipos(req.consulta || {}) });
});

/** GET /api/operaciones/equipos/:id */
const detalleEquipo = asyncHandler(async (req, res) => {
  const equipo = await operacionesModel.equipoPorId(req.params.id);
  if (!equipo) throw ApiError.noEncontrado('Ese equipo no existe.');

  res.json({ ok: true, equipo, mantenimientos: await operacionesModel.mantenimientosDe(equipo.id) });
});

/** POST /api/operaciones/equipos */
const crearEquipo = asyncHandler(async (req, res) => {
  const id = await operacionesModel.crearEquipo(req.body);
  res.status(201).json({ ok: true, equipo: await operacionesModel.equipoPorId(id) });
});

/** PUT /api/operaciones/equipos/:id */
const actualizarEquipo = asyncHandler(async (req, res) => {
  const equipo = await operacionesModel.equipoPorId(req.params.id);
  if (!equipo) throw ApiError.noEncontrado('Ese equipo no existe.');

  await operacionesModel.actualizarEquipo(equipo.id, req.body);
  res.json({ ok: true, equipo: await operacionesModel.equipoPorId(equipo.id) });
});

/** POST /api/operaciones/equipos/:id/mantenimientos */
const registrarMantenimiento = asyncHandler(async (req, res) => {
  const equipo = await operacionesModel.equipoPorId(req.params.id);
  if (!equipo) throw ApiError.noEncontrado('Ese equipo no existe.');

  await operacionesModel.registrarMantenimiento(equipo, req.body, req.usuario.id);

  if (req.body.resultado === 'fallido') {
    await avisos.avisar({
      rol: 'admin',
      tipo: 'equipo_fuera_servicio',
      titulo: `${equipo.nombre} quedó fuera de servicio`,
      mensaje: 'No pasó la revisión. No debe usarse hasta repararlo.',
      enlace: 'admin/equipos.html',
    });
  }

  res.status(201).json({
    ok: true,
    equipo: await operacionesModel.equipoPorId(equipo.id),
    mantenimientos: await operacionesModel.mantenimientosDe(equipo.id),
  });
});

/* ==================================================================
   BIOSEGURIDAD
   ================================================================== */

/** GET /api/operaciones/protocolos */
const protocolos = asyncHandler(async (req, res) => {
  res.json({ ok: true, protocolos: await operacionesModel.protocolos(req.consulta || {}) });
});

/** POST /api/operaciones/protocolos */
const crearProtocolo = asyncHandler(async (req, res) => {
  await operacionesModel.crearProtocolo(req.body);
  res.status(201).json({ ok: true, protocolos: await operacionesModel.protocolos({ soloActivos: false }) });
});

/** GET /api/operaciones/bioseguridad */
const registrosBioseguridad = asyncHandler(async (req, res) => {
  res.json({ ok: true, registros: await operacionesModel.registrosBioseguridad(req.consulta || {}) });
});

/** POST /api/operaciones/bioseguridad */
const registrarProtocolo = asyncHandler(async (req, res) => {
  await operacionesModel.registrarProtocolo(req.body, req.usuario.id);
  res.status(201).json({ ok: true, mensaje: 'Registro guardado.' });
});

/** GET /api/operaciones/residuos */
const residuos = asyncHandler(async (req, res) => {
  const { desde, hasta } = resolverRango(req.consulta);

  res.json({
    ok: true,
    desde,
    hasta,
    residuos: await operacionesModel.residuos({ desde, hasta, tipo: req.consulta?.tipo }),
    resumen: await operacionesModel.resumenResiduos({ desde, hasta }),
  });
});

/** POST /api/operaciones/residuos */
const registrarResiduos = asyncHandler(async (req, res) => {
  await operacionesModel.registrarResiduos(req.body, req.usuario.id);
  res.status(201).json({ ok: true, mensaje: 'Entrega de residuos registrada.' });
});

/** GET /api/operaciones/incidentes */
const incidentes = asyncHandler(async (req, res) => {
  res.json({ ok: true, incidentes: await operacionesModel.incidentes(req.consulta || {}) });
});

/** POST /api/operaciones/incidentes */
const registrarIncidente = asyncHandler(async (req, res) => {
  await operacionesModel.registrarIncidente(req.body, req.usuario.id);

  // Un incidente grave se avisa de inmediato: puede implicar profilaxis
  // postexposición, y eso tiene ventana de horas.
  if (req.body.gravedad === 'grave') {
    await avisos.avisar({
      rol: 'admin',
      tipo: 'incidente_bioseguridad',
      titulo: 'Incidente grave de bioseguridad',
      mensaje: req.body.descripcion.slice(0, 180),
      enlace: 'admin/bioseguridad.html',
    });
  }

  res.status(201).json({ ok: true, mensaje: 'Incidente registrado.' });
});

/** PATCH /api/operaciones/incidentes/:id */
const cerrarIncidente = asyncHandler(async (req, res) => {
  const cerrado = await operacionesModel.cerrarIncidente(req.params.id, req.body);
  if (!cerrado) throw ApiError.noEncontrado('Ese incidente no existe.');

  res.json({ ok: true, mensaje: 'Incidente actualizado.' });
});

/** GET /api/operaciones/epp */
const elementosProteccion = asyncHandler(async (req, res) => {
  const [elementos, entregas] = await Promise.all([
    operacionesModel.elementosProteccion(),
    operacionesModel.entregasEpp(req.consulta || {}),
  ]);

  res.json({ ok: true, elementos, entregas });
});

/** POST /api/operaciones/epp */
const crearElementoProteccion = asyncHandler(async (req, res) => {
  await operacionesModel.crearElementoProteccion(req.body);
  res.status(201).json({ ok: true, elementos: await operacionesModel.elementosProteccion() });
});

/** POST /api/operaciones/epp/entregas */
const entregarEpp = asyncHandler(async (req, res) => {
  try {
    await operacionesModel.entregarEpp(req.body, req.usuario.id);
  } catch (error) {
    throw ApiError.conflicto(error.message);
  }

  res.status(201).json({ ok: true, entregas: await operacionesModel.entregasEpp({}) });
});

/* ==================================================================
   CAJA
   ================================================================== */

/** GET /api/operaciones/cajas */
const cajas = asyncHandler(async (req, res) => {
  res.json({ ok: true, cajas: await operacionesModel.cajas(req.consulta || {}) });
});

/** POST /api/operaciones/cajas */
const crearCaja = asyncHandler(async (req, res) => {
  await operacionesModel.crearCaja(req.body);
  res.status(201).json({ ok: true, cajas: await operacionesModel.cajas({}) });
});

/** POST /api/operaciones/cajas/apertura */
const abrirCaja = asyncHandler(async (req, res) => {
  const abierta = await operacionesModel.aperturaAbierta(req.body.cajaId);
  if (abierta) {
    throw ApiError.conflicto(
      `Esa caja ya está abierta desde ${abierta.apertura} por otro turno. Ciérrala antes de abrirla de nuevo.`
    );
  }

  const id = await operacionesModel.abrirCaja(req.body, req.usuario.id);
  res.status(201).json({ ok: true, apertura: await operacionesModel.aperturaPorId(id) });
});

/** GET /api/operaciones/cajas/apertura/:id */
const detalleApertura = asyncHandler(async (req, res) => {
  const apertura = await operacionesModel.aperturaPorId(req.params.id);
  if (!apertura) throw ApiError.noEncontrado('Esa apertura no existe.');

  res.json({
    ok: true,
    apertura,
    movimientos: await operacionesModel.movimientosCaja(apertura.id),
    // Lo que debería haber en el cajón según lo registrado, para que quien
    // cuadra vea la cifra antes de contar y no después.
    esperado: await operacionesModel.totalEsperado(apertura.id),
  });
});

/** POST /api/operaciones/cajas/apertura/:id/movimientos */
const registrarMovimiento = asyncHandler(async (req, res) => {
  const apertura = await operacionesModel.aperturaPorId(req.params.id);
  if (!apertura) throw ApiError.noEncontrado('Esa apertura no existe.');
  if (apertura.estado !== 'abierta') throw ApiError.conflicto('Esa caja ya está cerrada.');

  await operacionesModel.registrarMovimiento(apertura.id, req.body, req.usuario.id);

  res.status(201).json({
    ok: true,
    movimientos: await operacionesModel.movimientosCaja(apertura.id),
    esperado: await operacionesModel.totalEsperado(apertura.id),
  });
});

/** POST /api/operaciones/cajas/apertura/:id/cierre */
const cerrarCaja = asyncHandler(async (req, res) => {
  const apertura = await operacionesModel.aperturaPorId(req.params.id);
  if (!apertura) throw ApiError.noEncontrado('Esa apertura no existe.');

  const cuadre = await operacionesModel.cerrarCaja(apertura.id, req.body, req.usuario.id);
  if (!cuadre) throw ApiError.conflicto('Esa caja ya estaba cerrada.');

  // Un descuadre se avisa siempre, sobre o falte: las dos cosas significan que
  // algo no se registró.
  if (cuadre.diferencia !== 0) {
    await avisos.avisar({
      rol: 'admin',
      tipo: 'caja_descuadre',
      titulo: `Descuadre en ${apertura.caja}`,
      mensaje: `Esperado $${cuadre.esperado.toLocaleString('es-CO')} · contado $${cuadre.contado.toLocaleString('es-CO')} · diferencia $${cuadre.diferencia.toLocaleString('es-CO')}.`,
      enlace: 'admin/caja.html',
    });
  }

  res.json({ ok: true, cuadre });
});

/** GET /api/operaciones/cajas/historial */
const historialCajas = asyncHandler(async (req, res) => {
  res.json({ ok: true, aperturas: await operacionesModel.historialCajas(req.consulta || {}) });
});

module.exports = {
  equipos,
  detalleEquipo,
  crearEquipo,
  actualizarEquipo,
  registrarMantenimiento,
  protocolos,
  crearProtocolo,
  registrosBioseguridad,
  registrarProtocolo,
  residuos,
  registrarResiduos,
  incidentes,
  registrarIncidente,
  cerrarIncidente,
  elementosProteccion,
  crearElementoProteccion,
  entregarEpp,
  cajas,
  crearCaja,
  abrirCaja,
  detalleApertura,
  registrarMovimiento,
  cerrarCaja,
  historialCajas,
};
