'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const hospModel = require('../models/hospitalizacion.model');
const mascotaModel = require('../models/mascota.model');
const avisos = require('../services/notificaciones.service');
const { alcanceSede } = require('../middleware/roles');
const { consultarUna } = require('../config/database');

/**
 * Hospitalización.
 *
 * Escribir es cosa de la clínica. El dueño solo lee, y solo lo de sus
 * mascotas: por eso las rutas de lectura pasan por comprobarAcceso().
 */

async function hospitalizacionConAcceso(req, id) {
  const hosp = await hospModel.porId(id);
  if (!hosp) throw ApiError.noEncontrado('Esa hospitalización no existe.');

  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';
  const esDueno = req.usuario.cliente_id && hosp.cliente_id === req.usuario.cliente_id;

  if (!esClinica && !esDueno) {
    throw ApiError.prohibido('No tienes acceso a esta hospitalización.');
  }
  return hosp;
}

function exigirActiva(hosp) {
  if (hosp.estado !== 'activa') {
    throw ApiError.conflicto('Este paciente ya no está internado.');
  }
}

async function veterinarioQueFirma(req, indicado) {
  if (req.usuario.rol === 'veterinario') {
    if (!req.usuario.veterinario_id) {
      throw ApiError.badRequest('Tu cuenta no está vinculada a un perfil de veterinario.');
    }
    return req.usuario.veterinario_id;
  }
  if (!indicado) throw ApiError.badRequest('Indica el veterinario responsable (veterinarioId).');

  const existe = await consultarUna('SELECT id FROM veterinarios WHERE id = ? AND activo = 1', [indicado]);
  if (!existe) throw ApiError.badRequest('Ese veterinario no existe o está inactivo.');
  return indicado;
}

/* ------------------------------------------------------------------
   Habitaciones
   ------------------------------------------------------------------ */

/** GET /api/hospitalizacion/habitaciones */
const habitaciones = asyncHandler(async (req, res) => {
  const { libres } = req.consulta || {};
  // Las jaulas son de un local concreto: fuera de la administración, cada
  // quien ve las de su sede.
  const sedeId = alcanceSede(req, req.consulta?.sedeId);

  res.json({
    ok: true,
    habitaciones: await hospModel.listarHabitaciones({ sedeId, soloLibres: Boolean(libres) }),
  });
});

/** POST /api/hospitalizacion/habitaciones */
const crearHabitacion = asyncHandler(async (req, res) => {
  const id = await hospModel.crearHabitacion(req.body);
  res.status(201).json({ ok: true, habitacion: await hospModel.habitacionPorId(id) });
});

/** PATCH /api/hospitalizacion/habitaciones/:id */
const cambiarEstadoHabitacion = asyncHandler(async (req, res) => {
  const habitacion = await hospModel.habitacionPorId(req.params.id);
  if (!habitacion) throw ApiError.noEncontrado('Esa habitación no existe.');

  // Liberar a mano una jaula ocupada dejaría al paciente sin sitio asignado y
  // permitiría meter a otro encima. Primero hay que dar el alta o trasladarlo.
  if (habitacion.estado === 'ocupada' && req.body.estado !== 'ocupada') {
    throw ApiError.conflicto(
      'Esta habitación tiene un paciente dentro. Da el alta o traslada al paciente antes de cambiar su estado.'
    );
  }

  await hospModel.cambiarEstadoHabitacion(habitacion.id, req.body);
  res.json({ ok: true, habitacion: await hospModel.habitacionPorId(habitacion.id) });
});

/* ------------------------------------------------------------------
   Pacientes
   ------------------------------------------------------------------ */

/** GET /api/hospitalizacion/tablero */
const tablero = asyncHandler(async (req, res) => {
  const sedeId = alcanceSede(req, req.consulta?.sedeId);

  const [pacientes, habitacionesLibres] = await Promise.all([
    hospModel.tablero(sedeId),
    hospModel.listarHabitaciones({ sedeId, soloLibres: true }),
  ]);

  res.json({ ok: true, pacientes, habitacionesLibres });
});

/** GET /api/hospitalizacion */
const listar = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  // Un cliente solo puede pedir las de sus mascotas.
  if (req.usuario.rol === 'cliente') {
    if (!filtros.mascotaId) throw ApiError.badRequest('Indica la mascota (mascotaId).');
    const mascota = await mascotaModel.buscarPorId(filtros.mascotaId);
    if (!mascota || mascota.cliente_id !== req.usuario.cliente_id) {
      throw ApiError.prohibido('Esa mascota no es tuya.');
    }
  }

  res.json({ ok: true, hospitalizaciones: await hospModel.listar(filtros) });
});

/** GET /api/hospitalizacion/:id */
const detalle = asyncHandler(async (req, res) => {
  const hosp = await hospitalizacionConAcceso(req, req.params.id);

  const [controles, alimentacion, medicacion, visitas] = await Promise.all([
    hospModel.controles(hosp.id),
    hospModel.alimentacion(hosp.id),
    hospModel.medicacion(hosp.id),
    hospModel.visitas(hosp.id),
  ]);

  res.json({ ok: true, hospitalizacion: hosp, controles, alimentacion, medicacion, visitas });
});

/** POST /api/hospitalizacion — ingreso. */
const ingresar = asyncHandler(async (req, res) => {
  const mascota = await mascotaModel.buscarPorId(req.body.mascotaId);
  if (!mascota) throw ApiError.badRequest('Esa mascota no existe.');

  const activa = await consultarUna(
    `SELECT id FROM hospitalizaciones WHERE mascota_id = ? AND estado = 'activa'`,
    [mascota.id]
  );
  if (activa) throw ApiError.conflicto(`${mascota.nombre} ya está hospitalizada (nº ${activa.id}).`);

  const veterinarioId = await veterinarioQueFirma(req, req.body.veterinarioId);

  let id;
  try {
    id = await hospModel.ingresar({ ...req.body, veterinarioId }, req.usuario.id);
  } catch (error) {
    // El modelo lanza un Error normal con el motivo de negocio (jaula ocupada).
    throw ApiError.conflicto(error.message);
  }

  const usuarioCliente = await avisos.usuarioDelCliente(mascota.cliente_id);
  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'hospitalizacion_ingreso',
    titulo: `${mascota.nombre} quedó hospitalizada`,
    mensaje: `Motivo: ${req.body.motivo}. Te informaremos de su evolución.`,
    enlace: 'cliente/historia.html',
  });

  res.status(201).json({ ok: true, hospitalizacion: await hospModel.porId(id) });
});

/** POST /api/hospitalizacion/:id/egreso */
const egresar = asyncHandler(async (req, res) => {
  const hosp = await hospitalizacionConAcceso(req, req.params.id);
  exigirActiva(hosp);

  const salio = await hospModel.egresar(hosp.id, req.body, req.usuario.id);
  if (!salio) throw ApiError.conflicto('Este paciente ya había egresado.');

  const usuarioCliente = await avisos.usuarioDelCliente(hosp.cliente_id);
  const titulo = {
    alta: `${hosp.mascota_nombre} salió de alta`,
    remitida: `${hosp.mascota_nombre} fue remitida a otro centro`,
    fallecido: `Información sobre ${hosp.mascota_nombre}`,
  }[req.body.estado];

  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'hospitalizacion_egreso',
    titulo,
    mensaje: 'Puedes consultar la epicrisis completa en la historia clínica.',
    enlace: 'cliente/historia.html',
  });

  res.json({ ok: true, hospitalizacion: await hospModel.porId(hosp.id) });
});

/** PATCH /api/hospitalizacion/:id/habitacion — traslado. */
const trasladar = asyncHandler(async (req, res) => {
  const hosp = await hospitalizacionConAcceso(req, req.params.id);
  exigirActiva(hosp);

  try {
    await hospModel.cambiarHabitacion(hosp.id, req.body.habitacionId ?? null, req.usuario.id);
  } catch (error) {
    throw ApiError.conflicto(error.message);
  }

  res.json({ ok: true, hospitalizacion: await hospModel.porId(hosp.id) });
});

/* ------------------------------------------------------------------
   Seguimiento
   ------------------------------------------------------------------ */

/** POST /api/hospitalizacion/:id/controles */
const registrarControl = asyncHandler(async (req, res) => {
  const hosp = await hospitalizacionConAcceso(req, req.params.id);
  exigirActiva(hosp);

  await hospModel.registrarControl(hosp.id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, controles: await hospModel.controles(hosp.id) });
});

/** POST /api/hospitalizacion/:id/alimentacion */
const registrarAlimentacion = asyncHandler(async (req, res) => {
  const hosp = await hospitalizacionConAcceso(req, req.params.id);
  exigirActiva(hosp);

  await hospModel.registrarAlimentacion(hosp.id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, alimentacion: await hospModel.alimentacion(hosp.id) });
});

/** POST /api/hospitalizacion/:id/medicacion */
const crearMedicacion = asyncHandler(async (req, res) => {
  const hosp = await hospitalizacionConAcceso(req, req.params.id);
  exigirActiva(hosp);

  const veterinarioId = req.usuario.rol === 'veterinario' ? req.usuario.veterinario_id : hosp.veterinario_id;
  await hospModel.crearMedicacion(hosp.id, req.body, veterinarioId);

  res.status(201).json({ ok: true, medicacion: await hospModel.medicacion(hosp.id) });
});

/** POST /api/hospitalizacion/medicacion/:id/toma */
const registrarToma = asyncHandler(async (req, res) => {
  const fila = await hospModel.registrarToma(req.params.id, req.usuario.id);
  if (!fila) throw ApiError.conflicto('Esa pauta no está activa.');

  res.json({ ok: true, medicacion: await hospModel.medicacion(fila.hospitalizacion_id) });
});

/** DELETE /api/hospitalizacion/medicacion/:id */
const suspenderMedicacion = asyncHandler(async (req, res) => {
  const suspendida = await hospModel.suspenderMedicacion(req.params.id);
  if (!suspendida) throw ApiError.conflicto('Esa pauta ya estaba suspendida o finalizada.');

  res.json({ ok: true, mensaje: 'Pauta suspendida.' });
});

/** POST /api/hospitalizacion/:id/visitas */
const registrarVisita = asyncHandler(async (req, res) => {
  const hosp = await hospitalizacionConAcceso(req, req.params.id);
  exigirActiva(hosp);

  await hospModel.registrarVisita(hosp.id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, visitas: await hospModel.visitas(hosp.id) });
});

/** PATCH /api/hospitalizacion/visitas/:id/salida */
const cerrarVisita = asyncHandler(async (req, res) => {
  const cerrada = await hospModel.cerrarVisita(req.params.id);
  if (!cerrada) throw ApiError.conflicto('Esa visita ya estaba cerrada.');

  res.json({ ok: true, mensaje: 'Salida registrada.' });
});

module.exports = {
  habitaciones,
  crearHabitacion,
  cambiarEstadoHabitacion,
  tablero,
  listar,
  detalle,
  ingresar,
  egresar,
  trasladar,
  registrarControl,
  registrarAlimentacion,
  crearMedicacion,
  registrarToma,
  suspenderMedicacion,
  registrarVisita,
  cerrarVisita,
};
