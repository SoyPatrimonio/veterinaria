'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const citaModel = require('../models/cita.model');
const agenda = require('../services/agenda.service');
const avisos = require('../services/notificaciones.service');
const { aTimestampSQL } = require('../utils/fechas');
const { consultarUna } = require('../config/database');

/** Plantilla de aviso que corresponde a cada estado de la cita. */
const PLANTILLA_ESTADO = {
  confirmada: 'cita_confirmada',
  cancelada: 'cita_cancelada',
};

/** Cada rol ve su propio recorte de la agenda. */
function filtrosSegunRol(req, consulta) {
  const filtros = {
    estado: consulta.estado,
    desde: consulta.desde,
    hasta: consulta.hasta,
    mascotaId: consulta.mascotaId,
    limite: consulta.limite,
  };

  if (req.usuario.rol === 'cliente') {
    filtros.clienteId = req.usuario.cliente_id;
  } else if (req.usuario.rol === 'veterinario') {
    filtros.veterinarioId = req.usuario.veterinario_id;
  } else if (consulta.veterinarioId) {
    // El admin ve todo; si pidió un veterinario en concreto, se filtra por él.
    filtros.veterinarioId = consulta.veterinarioId;
  }

  return filtros;
}

function puedeVer(req, cita) {
  if (req.usuario.rol === 'admin') return true;
  if (req.usuario.rol === 'veterinario') return cita.veterinario_id === req.usuario.veterinario_id;
  return cita.cliente_id === req.usuario.cliente_id;
}

/** GET /api/citas */
const listar = asyncHandler(async (req, res) => {
  const filtros = filtrosSegunRol(req, req.consulta || {});

  if (req.usuario.rol === 'cliente' && !filtros.clienteId) {
    throw ApiError.badRequest('Tu cuenta no tiene ficha de cliente.');
  }
  if (req.usuario.rol === 'veterinario' && !filtros.veterinarioId) {
    throw ApiError.badRequest('Tu cuenta no está vinculada a un perfil de veterinario.');
  }

  const citas = await citaModel.listar(filtros);
  res.json({ ok: true, citas });
});

/** GET /api/citas/disponibilidad?veterinarioId=&servicioId=&fecha= */
const disponibilidad = asyncHandler(async (req, res) => {
  const resultado = await agenda.calcularDisponibilidad(req.consulta);
  res.json({ ok: true, ...resultado });
});

/** POST /api/citas */
const crear = asyncHandler(async (req, res) => {
  const { mascotaId, servicioId, veterinarioId, fecha, hora, motivo } = req.body;

  // El cliente agenda para sí mismo; el personal agenda a nombre del dueño de
  // la mascota indicada.
  let clienteId = req.usuario.cliente_id;
  if (req.usuario.rol !== 'cliente') {
    const mascota = await consultarUna('SELECT cliente_id FROM mascotas WHERE id = ?', [mascotaId]);
    if (!mascota) throw ApiError.badRequest('La mascota no existe.');
    clienteId = mascota.cliente_id;
  }
  if (!clienteId) throw ApiError.badRequest('Tu cuenta no tiene ficha de cliente.');

  const cita = await agenda.agendarCita({
    clienteId,
    mascotaId,
    servicioId,
    veterinarioId,
    fecha,
    hora,
    motivo,
    creadoPor: req.usuario.id,
  });

  await avisarAlCliente(cita, 'cita_creada');

  // Recordatorio automático 24 horas antes. Es el aviso que más se agradece y
  // el que nadie se acuerda de programar a mano.
  const usuarioCliente = await avisos.usuarioDelCliente(cita.cliente_id);
  if (usuarioCliente) {
    await avisos.programar({
      usuarioId: usuarioCliente,
      mascotaId: cita.mascota_id,
      citaId: cita.id,
      tipo: 'cita',
      programadoEn: restarUnDia(cita.inicio),
      mensaje: `Recuerda la cita de ${cita.mascota_nombre} mañana a las ${cita.inicio.slice(11, 16)}.`,
    });
  }

  res.status(201).json({ ok: true, cita });
});

/** GET /api/citas/:id */
const detalle = asyncHandler(async (req, res) => {
  const cita = await citaModel.buscarPorId(req.params.id);
  if (!cita) throw ApiError.noEncontrado('Esa cita no existe.');
  if (!puedeVer(req, cita)) throw ApiError.prohibido('No tienes acceso a esta cita.');
  res.json({ ok: true, cita });
});

/**
 * PATCH /api/citas/:id/estado
 * El cliente solo puede cancelar; el personal puede mover la cita a cualquier
 * estado del flujo.
 */
const cambiarEstado = asyncHandler(async (req, res) => {
  const { estado, notas } = req.body;

  const cita = await citaModel.buscarPorId(req.params.id);
  if (!cita) throw ApiError.noEncontrado('Esa cita no existe.');
  if (!puedeVer(req, cita)) throw ApiError.prohibido('No tienes acceso a esta cita.');

  if (req.usuario.rol === 'cliente' && estado !== 'cancelada') {
    throw ApiError.prohibido('Como cliente solo puedes cancelar la cita.');
  }

  if (cita.estado === 'atendida') {
    throw ApiError.conflicto('Una cita ya atendida no se puede modificar.');
  }
  if (cita.estado === 'cancelada' && estado !== 'cancelada') {
    throw ApiError.conflicto('Esa cita ya fue cancelada.');
  }

  await citaModel.cambiarEstado(req.params.id, estado, notas ?? null, req.usuario.id);
  const actualizada = await citaModel.buscarPorId(req.params.id);

  if (PLANTILLA_ESTADO[estado]) await avisarAlCliente(actualizada, PLANTILLA_ESTADO[estado]);

  res.json({ ok: true, cita: actualizada });
});

/** DELETE /api/citas/:id — atajo de cancelación. */
const cancelar = asyncHandler(async (req, res) => {
  const cita = await citaModel.buscarPorId(req.params.id);
  if (!cita) throw ApiError.noEncontrado('Esa cita no existe.');
  if (!puedeVer(req, cita)) throw ApiError.prohibido('No tienes acceso a esta cita.');

  if (cita.estado === 'atendida') {
    throw ApiError.conflicto('Una cita ya atendida no se puede cancelar.');
  }

  await citaModel.cambiarEstado(req.params.id, 'cancelada', null, req.usuario.id);
  await avisarAlCliente(cita, 'cita_cancelada');

  res.json({ ok: true, mensaje: 'Cita cancelada.' });
});

/* ------------------------------------------------------------------
   Avisos
   ------------------------------------------------------------------ */

/**
 * Notifica al dueño el movimiento de su cita con la plantilla del catálogo.
 * Nunca hace fallar la petición: el servicio de avisos se traga sus propios
 * errores y deja el motivo en el registro.
 */
async function avisarAlCliente(cita, codigo) {
  const usuarioId = await avisos.usuarioDelCliente(cita.cliente_id);
  if (!usuarioId) return;

  await avisos.avisarConPlantilla(codigo, {
    usuarioId,
    variables: {
      cliente: cita.cliente_nombre,
      mascota: cita.mascota_nombre,
      fecha: String(cita.inicio).slice(0, 10),
      hora: String(cita.inicio).slice(11, 16),
      veterinario: cita.veterinario_nombre,
      servicio: cita.servicio_nombre,
    },
    enlace: 'cliente/citas.html',
    tituloRespaldo: 'Novedad en tu cita',
  });
}

/** 'YYYY-MM-DD HH:mm:ss' menos 24 horas, en el mismo formato. */
function restarUnDia(timestamp) {
  const fecha = new Date(String(timestamp).replace(' ', 'T'));
  fecha.setDate(fecha.getDate() - 1);
  return aTimestampSQL(fecha);
}

module.exports = { listar, disponibilidad, crear, detalle, cambiarEstado, cancelar };
