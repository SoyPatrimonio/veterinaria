'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const veterinarioModel = require('../models/veterinario.model');
const usuarioModel = require('../models/usuario.model');
const authService = require('../services/auth.service');
const { enTransaccion } = require('../config/database');
const fechasUtil = require('../utils/fechas');

// Cuántos días hacia adelante se listan los bloqueos cuando no se pide un rango.
const DIAS_VENTANA_BLOQUEOS = 60;

/**
 * GET /api/veterinarios — público (sección "Veterinarios" de la web).
 *
 * Sin sesión se responde la ficha recortada: nombre, especialidad, foto,
 * descripción y licencia. El correo y el teléfono del personal solo salen para
 * quien ya entró, que es quien los necesita —el panel de administración los
 * pinta en su tabla—. Antes viajaban en la respuesta abierta, y esa lista de
 * correos es la mitad de cada credencial del equipo.
 */
const listar = asyncHandler(async (req, res) => {
  const incluirInactivos = req.usuario?.rol === 'admin' && req.query.todos === '1';
  const veterinarios = await veterinarioModel.listar({
    soloActivos: !incluirInactivos,
    completo: Boolean(req.usuario),
  });
  res.json({ ok: true, veterinarios });
});

/** GET /api/veterinarios/:id — mismo recorte que el listado. */
const detalle = asyncHandler(async (req, res) => {
  const veterinario = await veterinarioModel.buscarPorId(req.params.id, {
    completo: Boolean(req.usuario),
  });
  if (!veterinario) throw ApiError.noEncontrado('Ese veterinario no existe.');

  const horarios = await veterinarioModel.horariosDe(veterinario.id);
  res.json({ ok: true, veterinario, horarios });
});

/** GET /api/veterinarios/:id/horarios */
const horarios = asyncHandler(async (req, res) => {
  const lista = await veterinarioModel.horariosDe(req.params.id);
  res.json({ ok: true, horarios: lista });
});

/**
 * POST /api/veterinarios — solo admin.
 * Crea la cuenta de usuario con rol veterinario y su ficha profesional en una
 * sola transacción.
 */
const crear = asyncHandler(async (req, res) => {
  const datos = req.body;

  const existente = await usuarioModel.buscarPorEmail(datos.email);
  if (existente) throw ApiError.conflicto('Ya existe una cuenta con ese correo.');

  const rolId = await usuarioModel.idRol('veterinario');
  if (!rolId) throw new ApiError(500, 'Falta el rol "veterinario". Ejecuta database/seed.sql.');

  const passwordHash = await authService.hashear(datos.password);

  const veterinarioId = await enTransaccion(async (conexion) => {
    const usuarioId = await usuarioModel.crear(
      { rolId, nombre: datos.nombre, email: datos.email, telefono: datos.telefono, passwordHash },
      conexion
    );

    const id = await veterinarioModel.crear(
      {
        usuarioId,
        licencia: datos.licencia,
        especialidad: datos.especialidad,
        descripcion: datos.descripcion,
        duracionSlotMin: datos.duracionSlotMin,
      },
      conexion
    );

    for (const h of datos.horarios || []) {
      await conexion.execute(
        `INSERT INTO horarios_veterinarios (veterinario_id, dia_semana, hora_inicio, hora_fin)
         VALUES (?, ?, ?, ?)`,
        [id, h.diaSemana, h.horaInicio, h.horaFin]
      );
    }

    return id;
  });

  const veterinario = await veterinarioModel.buscarPorId(veterinarioId);
  res.status(201).json({ ok: true, veterinario });
});

/** PUT /api/veterinarios/:id — solo admin. */
const actualizar = asyncHandler(async (req, res) => {
  const existente = await veterinarioModel.buscarPorId(req.params.id);
  if (!existente) throw ApiError.noEncontrado('Ese veterinario no existe.');

  await veterinarioModel.actualizar(req.params.id, req.body);
  await usuarioModel.actualizarPerfil(existente.usuario_id, {
    nombre: req.body.nombre,
    telefono: req.body.telefono,
  });

  const veterinario = await veterinarioModel.buscarPorId(req.params.id);
  res.json({ ok: true, veterinario });
});

/** Solo el propio veterinario o un admin tocan la disponibilidad. */
function exigirPropioOAdmin(req, veterinarioId) {
  if (req.usuario.rol === 'admin') return;
  if (req.usuario.rol === 'veterinario' && req.usuario.veterinario_id === Number(veterinarioId)) return;
  throw ApiError.prohibido('Solo el veterinario o un administrador pueden cambiar esta agenda.');
}

/** PUT /api/veterinarios/:id/horarios */
const guardarHorarios = asyncHandler(async (req, res) => {
  const veterinario = await veterinarioModel.buscarPorId(req.params.id);
  if (!veterinario) throw ApiError.noEncontrado('Ese veterinario no existe.');
  exigirPropioOAdmin(req, req.params.id);

  await veterinarioModel.reemplazarHorarios(veterinario.id, req.body.horarios);
  const horariosActualizados = await veterinarioModel.horariosDe(veterinario.id);
  res.json({ ok: true, horarios: horariosActualizados });
});

/** GET /api/veterinarios/:id/bloqueos?desde=&hasta= */
const listarBloqueos = asyncHandler(async (req, res) => {
  const consulta = req.consulta || {};
  const desde = consulta.desde || fechasUtil.aFechaISO(new Date());
  const hasta = consulta.hasta || fechasUtil.aFechaISO(fechasUtil.sumarDias(new Date(), DIAS_VENTANA_BLOQUEOS));

  const bloqueos = await veterinarioModel.bloqueosEntre(
    req.params.id,
    `${desde} 00:00:00`,
    `${hasta} 23:59:59`
  );
  res.json({ ok: true, bloqueos });
});

/** POST /api/veterinarios/:id/bloqueos — bloquear un rango horario. */
const crearBloqueo = asyncHandler(async (req, res) => {
  const veterinario = await veterinarioModel.buscarPorId(req.params.id);
  if (!veterinario) throw ApiError.noEncontrado('Ese veterinario no existe.');
  exigirPropioOAdmin(req, req.params.id);

  const { fecha, horaInicio, horaFin, motivo } = req.body;
  const inicio = fechasUtil.aTimestampSQL(fechasUtil.combinar(fecha, horaInicio));
  const fin = fechasUtil.aTimestampSQL(fechasUtil.combinar(fecha, horaFin));

  const id = await veterinarioModel.crearBloqueo(veterinario.id, { inicio, fin, motivo });
  res.status(201).json({ ok: true, bloqueo: { id, inicio, fin, motivo: motivo ?? null } });
});

/** DELETE /api/veterinarios/:id/bloqueos/:bloqueoId */
const eliminarBloqueo = asyncHandler(async (req, res) => {
  exigirPropioOAdmin(req, req.params.id);

  const eliminado = await veterinarioModel.eliminarBloqueo(req.params.bloqueoId, req.params.id);
  if (!eliminado) throw ApiError.noEncontrado('Ese bloqueo no existe.');

  res.json({ ok: true, mensaje: 'Bloqueo eliminado.' });
});

module.exports = {
  listar,
  detalle,
  horarios,
  crear,
  actualizar,
  guardarHorarios,
  listarBloqueos,
  crearBloqueo,
  eliminarBloqueo,
};
