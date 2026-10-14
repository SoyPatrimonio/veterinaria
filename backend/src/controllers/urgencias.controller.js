'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const urgenciasModel = require('../models/urgencias.model');
const mascotaModel = require('../models/mascota.model');
const avisos = require('../services/notificaciones.service');
const { alcanceSede } = require('../middleware/roles');
const { consultarUna } = require('../config/database');

/**
 * Urgencias.
 *
 * Todo lo de este módulo es del personal de la clínica: el dueño no clasifica
 * ni medica. Lo único que ve el cliente es la notificación de que su mascota
 * ingresó y la de la salida, que se mandan desde aquí.
 */

async function ingresoExistente(id) {
  const ingreso = await urgenciasModel.porId(id);
  if (!ingreso) throw ApiError.noEncontrado('Ese ingreso de urgencias no existe.');
  return ingreso;
}

/** Un ingreso cerrado ya no admite cambios: lo que pasó, pasó. */
function exigirAbierto(ingreso) {
  if (ingreso.estado === 'cerrado') {
    throw ApiError.conflicto('Esta urgencia ya está cerrada. Abre un ingreso nuevo si el paciente volvió.');
  }
}

/* ------------------------------------------------------------------
   Lectura
   ------------------------------------------------------------------ */

/** GET /api/urgencias/salas */
const salas = asyncHandler(async (req, res) => {
  // Las salas de urgencias son sitios físicos de un local: quien no es de la
  // administración ve las de su sede, pida la que pida.
  const sedeId = alcanceSede(req, req.consulta?.sedeId);
  res.json({ ok: true, salas: await urgenciasModel.listarSalas(sedeId) });
});

/** GET /api/urgencias/tablero — la sala en vivo, ordenada por gravedad. */
const tablero = asyncHandler(async (req, res) => {
  const sedeId = alcanceSede(req, req.consulta?.sedeId);

  const [enSala, resumen, salasDisponibles] = await Promise.all([
    urgenciasModel.activas(sedeId),
    urgenciasModel.resumen(sedeId),
    urgenciasModel.listarSalas(sedeId),
  ]);

  res.json({ ok: true, urgencias: enSala, resumen, salas: salasDisponibles });
});

/** GET /api/urgencias */
const listar = asyncHandler(async (req, res) => {
  res.json({ ok: true, urgencias: await urgenciasModel.listar(req.consulta || {}) });
});

/** GET /api/urgencias/:id — el caso completo con su línea de tiempo. */
const detalle = asyncHandler(async (req, res) => {
  const ingreso = await ingresoExistente(req.params.id);

  const [eventos, signos, medicacion, procedimientos] = await Promise.all([
    urgenciasModel.eventos(ingreso.id),
    urgenciasModel.signos(ingreso.id),
    urgenciasModel.medicacion(ingreso.id),
    urgenciasModel.procedimientos(ingreso.id),
  ]);

  res.json({ ok: true, ingreso, eventos, signos, medicacion, procedimientos });
});

/* ------------------------------------------------------------------
   Escritura
   ------------------------------------------------------------------ */

/** POST /api/urgencias — registro de llegada. */
const registrar = asyncHandler(async (req, res) => {
  const mascota = await mascotaModel.buscarPorId(req.body.mascotaId);
  if (!mascota) throw ApiError.badRequest('Esa mascota no existe.');

  // Una mascota no puede tener dos urgencias abiertas a la vez: sería la misma
  // atención partida en dos y con la medicación repartida entre las dos hojas.
  const abierta = await consultarUna(
    `SELECT id FROM ingresos_urgencias WHERE mascota_id = ? AND estado <> 'cerrado'`,
    [mascota.id]
  );
  if (abierta) {
    throw ApiError.conflicto(`${mascota.nombre} ya tiene una urgencia abierta (nº ${abierta.id}).`);
  }

  const id = await urgenciasModel.registrarLlegada(
    { ...req.body, clienteId: mascota.cliente_id },
    req.usuario.id
  );

  const usuarioCliente = await avisos.usuarioDelCliente(mascota.cliente_id);
  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'urgencia_ingreso',
    titulo: `${mascota.nombre} está siendo atendida en urgencias`,
    mensaje: `Motivo de ingreso: ${req.body.motivo}. Te avisamos en cuanto tengamos novedades.`,
    enlace: 'cliente/historia.html',
  });

  res.status(201).json({ ok: true, ingreso: await urgenciasModel.porId(id) });
});

/** PATCH /api/urgencias/:id/triage */
const triage = asyncHandler(async (req, res) => {
  const ingreso = await ingresoExistente(req.params.id);
  exigirAbierto(ingreso);

  await urgenciasModel.clasificar(ingreso.id, req.body, req.usuario.id);

  // Un rojo o un naranja no se pueden quedar esperando a que alguien mire la
  // pantalla: se avisa a todo el equipo clínico.
  if (['rojo', 'naranja'].includes(req.body.prioridad)) {
    await avisos.avisar({
      rol: 'veterinario',
      tipo: 'urgencia_critica',
      titulo: `Urgencia ${req.body.prioridad}: ${ingreso.mascota_nombre}`,
      mensaje: `${ingreso.mascota_nombre} (${ingreso.especie}) — ${ingreso.motivo}`,
      enlace: 'veterinario/urgencias.html',
    });
  }

  res.json({ ok: true, ingreso: await urgenciasModel.porId(ingreso.id) });
});

/** PATCH /api/urgencias/:id */
const actualizar = asyncHandler(async (req, res) => {
  const ingreso = await ingresoExistente(req.params.id);

  if (ingreso.estado === 'cerrado' && req.body.estado !== 'cerrado') {
    throw ApiError.conflicto('Una urgencia cerrada no se puede reabrir.');
  }

  await urgenciasModel.actualizar(ingreso.id, req.body, req.usuario.id);

  if (req.body.estado === 'cerrado') {
    const usuarioCliente = await avisos.usuarioDelCliente(ingreso.cliente_id);
    const textoDesenlace = {
      alta: 'salió de alta',
      hospitalizacion: 'quedó hospitalizada',
      remitido: 'fue remitida a otro centro',
      fallecido: 'falleció',
      retiro_voluntario: 'salió por retiro voluntario',
    }[req.body.desenlace] || 'salió de urgencias';

    await avisos.avisar({
      usuarioId: usuarioCliente,
      tipo: 'urgencia_cierre',
      titulo: `${ingreso.mascota_nombre} ${textoDesenlace}`,
      mensaje: 'Puedes consultar el detalle de la atención en la historia clínica.',
      enlace: 'cliente/historia.html',
    });
  }

  res.json({ ok: true, ingreso: await urgenciasModel.porId(ingreso.id) });
});

/** POST /api/urgencias/:id/eventos */
const crearEvento = asyncHandler(async (req, res) => {
  const ingreso = await ingresoExistente(req.params.id);
  exigirAbierto(ingreso);

  await urgenciasModel.crearEvento(ingreso.id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, eventos: await urgenciasModel.eventos(ingreso.id) });
});

/** POST /api/urgencias/:id/signos */
const registrarSignos = asyncHandler(async (req, res) => {
  const ingreso = await ingresoExistente(req.params.id);
  exigirAbierto(ingreso);

  await urgenciasModel.registrarSignos(ingreso.id, ingreso.mascota_id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, signos: await urgenciasModel.signos(ingreso.id) });
});

/** POST /api/urgencias/:id/medicacion */
const registrarMedicacion = asyncHandler(async (req, res) => {
  const ingreso = await ingresoExistente(req.params.id);
  exigirAbierto(ingreso);

  await urgenciasModel.registrarMedicacion(ingreso.id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, medicacion: await urgenciasModel.medicacion(ingreso.id) });
});

/** POST /api/urgencias/:id/procedimientos */
const registrarProcedimiento = asyncHandler(async (req, res) => {
  const ingreso = await ingresoExistente(req.params.id);
  exigirAbierto(ingreso);

  await urgenciasModel.registrarProcedimiento(ingreso.id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, procedimientos: await urgenciasModel.procedimientos(ingreso.id) });
});

module.exports = {
  salas,
  tablero,
  listar,
  detalle,
  registrar,
  triage,
  actualizar,
  crearEvento,
  registrarSignos,
  registrarMedicacion,
  registrarProcedimiento,
};
