'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const alertaModel = require('../models/alerta.model');
const ia = require('../services/ia.service');
const mascotaModel = require('../models/mascota.model');

/**
 * Alertas críticas y asistente de IA.
 *
 * Van en el mismo controlador porque hacen lo mismo desde dos ángulos: avisar
 * de lo que se está pasando por alto. La diferencia es que la alerta es una
 * regla determinista y la sugerencia de IA es una propuesta que alguien tiene
 * que revisar antes de que cuente.
 */

/* ==================================================================
   ALERTAS
   ================================================================== */

/** GET /api/alertas */
const listar = asyncHandler(async (req, res) => {
  const [alertas, resumen] = await Promise.all([
    alertaModel.listar(req.consulta || {}),
    alertaModel.resumen(),
  ]);

  res.json({ ok: true, alertas, resumen });
});

/**
 * POST /api/alertas/recalcular
 *
 * En Vercel no hay proceso en segundo plano —la función solo vive mientras
 * atiende una petición—, así que es el propio uso del panel el que hace de
 * reloj, igual que con los recordatorios.
 */
const recalcular = asyncHandler(async (req, res) => {
  const resultado = await alertaModel.recalcular();
  res.json({ ok: true, ...resultado, resumen: await alertaModel.resumen() });
});

/** PATCH /api/alertas/:id */
const resolver = asyncHandler(async (req, res) => {
  const alerta = await alertaModel.porId(req.params.id);
  if (!alerta) throw ApiError.noEncontrado('Esa alerta no existe.');

  const resuelta = await alertaModel.resolver(alerta.id, req.body, req.usuario.id);
  if (!resuelta) throw ApiError.conflicto('Esa alerta ya estaba cerrada.');

  res.json({ ok: true, resumen: await alertaModel.resumen() });
});

/** GET /api/alertas/reglas */
const reglas = asyncHandler(async (req, res) => {
  res.json({ ok: true, reglas: await alertaModel.reglas() });
});

/** PATCH /api/alertas/reglas/:id */
const actualizarRegla = asyncHandler(async (req, res) => {
  const actualizada = await alertaModel.actualizarRegla(req.params.id, req.body);
  if (!actualizada) throw ApiError.noEncontrado('Esa regla no existe.');

  res.json({ ok: true, reglas: await alertaModel.reglas() });
});

/* ==================================================================
   IA ASISTENTE
   ================================================================== */

async function mascotaConAcceso(req, mascotaId) {
  const mascota = await mascotaModel.buscarPorId(mascotaId);
  if (!mascota) throw ApiError.noEncontrado('Esa mascota no existe.');
  return mascota;
}

/**
 * POST /api/ia/consultar
 *
 * Las peticiones que se pueden responder con datos exactos se responden con
 * datos exactos: los datos faltantes y las interacciones salen de consultas,
 * no de un modelo. Devolver una respuesta inventada sobre un medicamento sería
 * peor que no responder.
 */
const consultar = asyncHandler(async (req, res) => {
  const inicio = Date.now();
  const { tipo, mascotaId, consulta } = req.body;
  let resultado;

  if (tipo === 'datos_faltantes') {
    await mascotaConAcceso(req, mascotaId);
    resultado = await ia.datosFaltantes(mascotaId);
  } else if (tipo === 'interacciones') {
    await mascotaConAcceso(req, mascotaId);
    resultado = await ia.revisarInteracciones(mascotaId, req.body.medicamentoIds || []);
  } else if (tipo === 'resumen_historia' || tipo === 'resumen_consultas') {
    await mascotaConAcceso(req, mascotaId);
    resultado = await ia.resumirHistoria(mascotaId);
  } else if (tipo === 'busqueda') {
    if (!consulta) throw ApiError.badRequest('Escribe qué quieres buscar.');
    resultado = await ia.buscar(consulta);
  } else {
    // Lo que sí requiere redactar necesita proveedor. Sin él se dice, en vez de
    // devolver un texto vacío que parezca una respuesta.
    if (!ia.hayProveedor()) {
      throw ApiError.conflicto(
        'Ese tipo de asistencia necesita un modelo de lenguaje configurado (ANTHROPIC_API_KEY). ' +
        'Mientras tanto están disponibles: resumen de historia, datos faltantes, interacciones y búsqueda.'
      );
    }
    throw new ApiError(501, 'Ese tipo de asistencia todavía no está conectado.');
  }

  await ia.registrarSolicitud({
    usuarioId: req.usuario.id,
    tipo,
    mascotaId: mascotaId ?? null,
    entidad: req.body.entidad ?? null,
    entidadId: req.body.entidadId ?? null,
    entrada: consulta ?? null,
    respuesta: JSON.stringify(resultado).slice(0, 4000),
    modelo: 'deterministico',
    duracionMs: Date.now() - inicio,
  });

  res.json({ ok: true, tipo, resultado });
});

/** GET /api/ia/sugerencias */
const sugerencias = asyncHandler(async (req, res) => {
  res.json({ ok: true, sugerencias: await ia.sugerencias(req.consulta || {}) });
});

/**
 * PATCH /api/ia/sugerencias/:id
 *
 * Aceptar o descartar exige nombre y fecha; la base lo obliga con un CHECK.
 * Una sugerencia clínica no puede quedar aprobada "por el sistema".
 */
const revisarSugerencia = asyncHandler(async (req, res) => {
  const revisada = await ia.revisarSugerencia(req.params.id, req.body, req.usuario.id);
  if (!revisada) throw ApiError.conflicto('Esa sugerencia no existe o ya fue revisada.');

  res.json({ ok: true, mensaje: `Sugerencia ${req.body.estado}.` });
});

/** GET /api/ia/registro */
const registro = asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    proveedorConectado: ia.hayProveedor(),
    modelo: ia.hayProveedor() ? ia.MODELO : null,
    solicitudes: await ia.registro(req.consulta || {}),
  });
});

module.exports = {
  listar,
  recalcular,
  resolver,
  reglas,
  actualizarRegla,
  consultar,
  sugerencias,
  revisarSugerencia,
  registro,
};
