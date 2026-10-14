'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const soporteModel = require('../models/soporte.model');
const avisos = require('../services/notificaciones.service');

/** Atención al cliente: PQRS, tickets y encuestas de satisfacción. */

function esEquipo(req) {
  return req.permisos.includes('tickets.gestionar') || req.permisos.includes('tickets.ver_todos');
}

async function ticketAlQueAccede(req, id) {
  const ticket = await soporteModel.porId(id);
  if (!ticket) throw ApiError.noEncontrado('Ese caso no existe.');

  if (!esEquipo(req)) {
    const esSuyo = (req.usuario.cliente_id && ticket.cliente_id === req.usuario.cliente_id)
      || ticket.usuario_id === req.usuario.id;
    if (!esSuyo) throw ApiError.prohibido('Ese caso no es tuyo.');
  }

  return ticket;
}

/** GET /api/soporte/tickets */
const listar = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  if (!esEquipo(req)) {
    // Antes se asignaba el cliente_id sin comprobarlo: una cuenta sin ficha de
    // cliente dejaba el filtro en undefined y veía las PQRS de todo el mundo.
    // Sin ficha se filtra por el usuario, que es de quien cuelga el caso.
    if (req.usuario.cliente_id) filtros.clienteId = req.usuario.cliente_id;
    else filtros.usuarioId = req.usuario.id;
  }

  res.json({ ok: true, tickets: await soporteModel.listar(filtros) });
});

/** GET /api/soporte/tickets/:id */
const detalle = asyncHandler(async (req, res) => {
  const ticket = await ticketAlQueAccede(req, req.params.id);
  const mensajes = await soporteModel.mensajes(ticket.id, { incluirInternos: esEquipo(req) });

  res.json({ ok: true, ticket, mensajes });
});

/** POST /api/soporte/tickets */
const crear = asyncHandler(async (req, res) => {
  const ticket = await soporteModel.crear(
    { ...req.body, clienteId: req.usuario.cliente_id ?? null },
    req.usuario.id
  );

  // Una queja o un reclamo se avisan de inmediato: son los que tienen plazo y
  // los que más caro salen si se quedan en la bandeja.
  if (['queja', 'reclamo'].includes(req.body.tipo)) {
    await avisos.avisar({
      rol: 'admin',
      tipo: 'pqrs',
      titulo: `${req.body.tipo === 'queja' ? 'Queja' : 'Reclamo'} ${ticket.numero}`,
      mensaje: req.body.asunto,
      enlace: 'admin/soporte.html',
    });
  }

  res.status(201).json({
    ok: true,
    ticket: await soporteModel.porId(ticket.id),
    mensaje: `Tu caso quedó radicado con el número ${ticket.numero}.`,
  });
});

/** POST /api/soporte/tickets/:id/mensajes */
const responder = asyncHandler(async (req, res) => {
  const ticket = await ticketAlQueAccede(req, req.params.id);

  if (['resuelto', 'cerrado'].includes(ticket.estado) && !esEquipo(req)) {
    throw ApiError.conflicto('Ese caso ya está cerrado. Radica uno nuevo si necesitas algo más.');
  }
  if (req.body.interno && !esEquipo(req)) {
    throw ApiError.prohibido('Las notas internas son solo del equipo.');
  }

  await soporteModel.responder(ticket.id, req.body, req.usuario);

  // Se avisa a la otra parte, salvo cuando es una nota interna.
  if (!req.body.interno) {
    if (esEquipo(req) && ticket.usuario_id) {
      await avisos.avisar({
        usuarioId: ticket.usuario_id,
        tipo: 'pqrs_respuesta',
        titulo: `Respuesta a tu caso ${ticket.numero}`,
        mensaje: req.body.mensaje.slice(0, 180),
        enlace: 'cliente/soporte.html',
      });
    } else if (!esEquipo(req) && ticket.asignado_a) {
      await avisos.avisar({
        usuarioId: ticket.asignado_a,
        tipo: 'pqrs',
        titulo: `Nuevo mensaje en ${ticket.numero}`,
        mensaje: req.body.mensaje.slice(0, 180),
        enlace: 'admin/soporte.html',
      });
    }
  }

  res.status(201).json({
    ok: true,
    mensajes: await soporteModel.mensajes(ticket.id, { incluirInternos: esEquipo(req) }),
  });
});

/** PATCH /api/soporte/tickets/:id */
const actualizar = asyncHandler(async (req, res) => {
  const ticket = await soporteModel.porId(req.params.id);
  if (!ticket) throw ApiError.noEncontrado('Ese caso no existe.');

  await soporteModel.actualizar(ticket.id, req.body, req.usuario.id);

  if (['resuelto', 'cerrado'].includes(req.body.estado) && ticket.usuario_id) {
    await avisos.avisar({
      usuarioId: ticket.usuario_id,
      tipo: 'pqrs_cerrado',
      titulo: `Cerramos tu caso ${ticket.numero}`,
      mensaje: 'Cuéntanos qué tal te pareció la atención.',
      enlace: 'cliente/soporte.html',
    });
  }

  res.json({ ok: true, ticket: await soporteModel.porId(ticket.id) });
});

/** POST /api/soporte/tickets/:id/calificacion */
const calificar = asyncHandler(async (req, res) => {
  const ticket = await ticketAlQueAccede(req, req.params.id);

  const calificado = await soporteModel.calificar(ticket.id, req.body);
  if (!calificado) throw ApiError.conflicto('Solo se puede calificar un caso ya resuelto.');

  res.json({ ok: true, mensaje: 'Gracias por calificarnos.' });
});

/** GET /api/soporte/resumen */
const resumen = asyncHandler(async (req, res) => {
  res.json({ ok: true, resumen: await soporteModel.resumen() });
});

/* ---- Encuestas ----------------------------------------------------- */

/** GET /api/soporte/encuestas */
const encuestas = asyncHandler(async (req, res) => {
  res.json({ ok: true, encuestas: await soporteModel.encuestas(req.consulta || {}) });
});

/** POST /api/soporte/encuestas/respuestas */
const responderEncuesta = asyncHandler(async (req, res) => {
  await soporteModel.guardarRespuesta(req.body, req.usuario.cliente_id ?? null);
  res.status(201).json({ ok: true, mensaje: 'Gracias por tu respuesta.' });
});

/** GET /api/soporte/encuestas/:id/resultados */
const resultadosEncuesta = asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    resultados: await soporteModel.resultadosEncuesta(req.params.id, req.consulta || {}),
  });
});

module.exports = {
  listar,
  detalle,
  crear,
  responder,
  actualizar,
  calificar,
  resumen,
  encuestas,
  responderEncuesta,
  resultadosEncuesta,
};
