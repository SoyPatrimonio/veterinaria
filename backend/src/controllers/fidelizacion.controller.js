'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const fidelizacionModel = require('../models/fidelizacion.model');
const avisos = require('../services/notificaciones.service');
const { alcanceCliente } = require('../middleware/roles');

/** Planes de salud, puntos, recompensas y promociones. */

function clienteDeLaPeticion(req, clienteIdPedido) {
  // Un cliente solo consulta lo suyo; la clínica puede mirar el de cualquiera.
  if (req.usuario.rol === 'cliente') {
    if (!req.usuario.cliente_id) throw ApiError.prohibido('Tu cuenta no tiene ficha de cliente.');
    return req.usuario.cliente_id;
  }
  if (!clienteIdPedido) throw ApiError.badRequest('Indica de qué cliente.');
  return clienteIdPedido;
}

/* ---- Planes -------------------------------------------------------- */

/** GET /api/fidelizacion/planes */
const planes = asyncHandler(async (req, res) => {
  const todos = req.permisos.includes('planes.gestionar') && req.consulta?.todos;
  res.json({ ok: true, planes: await fidelizacionModel.planes({ soloActivos: !todos }) });
});

/** POST /api/fidelizacion/planes */
const crearPlan = asyncHandler(async (req, res) => {
  const id = await fidelizacionModel.crearPlan(req.body);
  res.status(201).json({ ok: true, plan: await fidelizacionModel.planPorId(id) });
});

/** PUT /api/fidelizacion/planes/:id */
const actualizarPlan = asyncHandler(async (req, res) => {
  const plan = await fidelizacionModel.planPorId(req.params.id);
  if (!plan) throw ApiError.noEncontrado('Ese plan no existe.');

  await fidelizacionModel.actualizarPlan(plan.id, req.body);
  res.json({ ok: true, plan: await fidelizacionModel.planPorId(plan.id) });
});

/* ---- Suscripciones ------------------------------------------------- */

/** GET /api/fidelizacion/suscripciones */
const suscripciones = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  // Igual que en el resto de listados de "lo mío": el cliente_id se comprueba,
  // no se supone. Sin ficha de cliente el filtro quedaba vacío y se devolvían
  // las suscripciones de todos.
  const clienteId = alcanceCliente(req, 'planes.gestionar');
  if (clienteId) filtros.clienteId = clienteId;

  res.json({ ok: true, suscripciones: await fidelizacionModel.suscripciones(filtros) });
});

/** POST /api/fidelizacion/suscripciones */
const suscribir = asyncHandler(async (req, res) => {
  const clienteId = clienteDeLaPeticion(req, req.body.clienteId);

  const id = await fidelizacionModel.suscribir({ ...req.body, clienteId });
  if (!id) throw ApiError.badRequest('Ese plan no existe o está inactivo.');

  res.status(201).json({ ok: true, suscripcion: await fidelizacionModel.suscripcionPorId(id) });
});

/** DELETE /api/fidelizacion/suscripciones/:id */
const cancelarSuscripcion = asyncHandler(async (req, res) => {
  const suscripcion = await fidelizacionModel.suscripcionPorId(req.params.id);
  if (!suscripcion) throw ApiError.noEncontrado('Esa suscripción no existe.');

  if (req.usuario.rol === 'cliente' && suscripcion.cliente_id !== req.usuario.cliente_id) {
    throw ApiError.prohibido('Esa suscripción no es tuya.');
  }

  const cancelada = await fidelizacionModel.cancelarSuscripcion(suscripcion.id);
  if (!cancelada) throw ApiError.conflicto('Esa suscripción ya no estaba activa.');

  res.json({ ok: true, mensaje: 'Suscripción cancelada. Sigue vigente hasta la fecha de fin.' });
});

/** GET /api/fidelizacion/beneficios */
const beneficios = asyncHandler(async (req, res) => {
  const clienteId = clienteDeLaPeticion(req, req.consulta?.clienteId);
  res.json({ ok: true, beneficios: await fidelizacionModel.beneficiosDisponibles(clienteId) });
});

/** POST /api/fidelizacion/suscripciones/:id/consumo */
const consumirBeneficio = asyncHandler(async (req, res) => {
  const suscripcion = await fidelizacionModel.suscripcionPorId(req.params.id);
  if (!suscripcion) throw ApiError.noEncontrado('Esa suscripción no existe.');

  try {
    await fidelizacionModel.consumirBeneficio(suscripcion.id, req.body, req.usuario.id);
  } catch (error) {
    throw ApiError.conflicto(error.message);
  }

  res.status(201).json({
    ok: true,
    beneficios: await fidelizacionModel.beneficiosDisponibles(suscripcion.cliente_id),
  });
});

/* ---- Puntos -------------------------------------------------------- */

/** GET /api/fidelizacion/puntos */
const puntos = asyncHandler(async (req, res) => {
  const clienteId = clienteDeLaPeticion(req, req.consulta?.clienteId);
  const cuenta = await fidelizacionModel.cuentaDe(clienteId);

  const [movimientos, canjes, niveles] = await Promise.all([
    fidelizacionModel.movimientosPuntos(cuenta.id),
    fidelizacionModel.canjesDe(cuenta.id),
    fidelizacionModel.niveles(),
  ]);

  // Cuánto le falta para el siguiente nivel: es lo que hace que el programa
  // sirva de algo en pantalla.
  const siguiente = niveles.find((n) => n.puntos_minimos > cuenta.puntos_historicos) || null;

  res.json({
    ok: true,
    cuenta,
    movimientos,
    canjes,
    niveles,
    siguienteNivel: siguiente,
    faltanParaSiguiente: siguiente ? siguiente.puntos_minimos - cuenta.puntos_historicos : 0,
  });
});

/** POST /api/fidelizacion/puntos — ajuste manual desde administración. */
const ajustarPuntos = asyncHandler(async (req, res) => {
  const cuenta = await fidelizacionModel.cuentaDe(req.body.clienteId);
  if (!cuenta) throw ApiError.noEncontrado('Ese cliente no existe.');

  await fidelizacionModel.moverPuntos(cuenta.id, {
    tipo: 'ajuste',
    puntos: req.body.puntos,
    motivo: req.body.motivo,
    facturaId: req.body.facturaId ?? null,
    venceEn: req.body.venceEn ?? null,
    usuarioId: req.usuario.id,
  });

  res.status(201).json({ ok: true, cuenta: await fidelizacionModel.cuentaDe(req.body.clienteId) });
});

/* ---- Recompensas y canjes ------------------------------------------ */

/** GET /api/fidelizacion/recompensas */
const recompensas = asyncHandler(async (req, res) => {
  const todas = req.permisos.includes('puntos.gestionar') && req.consulta?.todas;
  res.json({ ok: true, recompensas: await fidelizacionModel.recompensas({ soloActivas: !todas }) });
});

/** POST /api/fidelizacion/recompensas */
const crearRecompensa = asyncHandler(async (req, res) => {
  await fidelizacionModel.crearRecompensa(req.body);
  res.status(201).json({ ok: true, recompensas: await fidelizacionModel.recompensas({ soloActivas: false }) });
});

/** POST /api/fidelizacion/recompensas/:id/canjear */
const canjear = asyncHandler(async (req, res) => {
  const clienteId = clienteDeLaPeticion(req, req.body?.clienteId);
  const cuenta = await fidelizacionModel.cuentaDe(clienteId);

  let canje;
  try {
    canje = await fidelizacionModel.canjear(cuenta.id, req.params.id, req.usuario.id);
  } catch (error) {
    throw ApiError.conflicto(error.message);
  }

  res.status(201).json({
    ok: true,
    canje,
    mensaje: `Canje listo. Presenta el código ${canje.codigo} en la clínica.`,
  });
});

/** POST /api/fidelizacion/canjes/:codigo/usar */
const usarCanje = asyncHandler(async (req, res) => {
  const usado = await fidelizacionModel.usarCanje(req.params.codigo);
  if (!usado) throw ApiError.conflicto('Ese código no existe, ya se usó o venció.');

  res.json({ ok: true, mensaje: 'Canje aplicado.' });
});

/* ---- Promociones --------------------------------------------------- */

/** GET /api/fidelizacion/promociones */
const promociones = asyncHandler(async (req, res) => {
  res.json({ ok: true, promociones: await fidelizacionModel.promociones() });
});

/** POST /api/fidelizacion/promociones */
const crearPromocion = asyncHandler(async (req, res) => {
  const id = await fidelizacionModel.crearPromocion(req.body);
  const destinatarios = await fidelizacionModel.clientesDelSegmento(req.body.segmento);

  res.status(201).json({
    ok: true,
    promocionId: id,
    // Se dice a cuánta gente alcanzaría antes de enviar nada: mandar una
    // campaña a ciegas es la forma rápida de molestar a toda la base.
    alcance: destinatarios.length,
  });
});

/** POST /api/fidelizacion/promociones/:id/enviar */
const enviarPromocion = asyncHandler(async (req, res) => {
  const lista = await fidelizacionModel.promociones();
  const promocion = lista.find((p) => p.id === Number(req.params.id));

  if (!promocion) throw ApiError.noEncontrado('Esa promoción no existe.');
  if (!promocion.activo) throw ApiError.conflicto('Esa promoción está desactivada.');

  const destinatarios = await fidelizacionModel.clientesDelSegmento(promocion.segmento);

  for (const cliente of destinatarios) {
    await avisos.avisar({
      usuarioId: cliente.usuario_id,
      tipo: 'promocion',
      titulo: promocion.nombre,
      mensaje: promocion.cupon_codigo
        ? `${promocion.descripcion || ''} Usa el código ${promocion.cupon_codigo}.`.trim()
        : promocion.descripcion,
      enlace: 'cliente/dashboard.html',
    });
  }

  res.json({ ok: true, enviados: destinatarios.length });
});

module.exports = {
  planes,
  crearPlan,
  actualizarPlan,
  suscripciones,
  suscribir,
  cancelarSuscripcion,
  beneficios,
  consumirBeneficio,
  puntos,
  ajustarPuntos,
  recompensas,
  crearRecompensa,
  canjear,
  usarCanje,
  promociones,
  crearPromocion,
  enviarPromocion,
};
