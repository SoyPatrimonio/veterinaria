'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const teleModel = require('../models/telemedicina.model');
const mascotaModel = require('../models/mascota.model');
const avisos = require('../services/notificaciones.service');
const { alcanceCliente } = require('../middleware/roles');

/**
 * Telemedicina.
 *
 * Dos reglas que no se saltan: sin consentimiento firmado y sin pago la sala
 * no se abre. La primera es de fondo (atender a distancia tiene límites y el
 * propietario tiene que saberlos); la segunda es la que pidió la clínica.
 */

function participa(req, sesion) {
  if (req.usuario.rol === 'admin') return true;
  if (req.usuario.veterinario_id && sesion.veterinario_id === req.usuario.veterinario_id) return true;
  if (req.usuario.cliente_id && sesion.cliente_id === req.usuario.cliente_id) return true;
  return false;
}

async function sesionDeLaQueParticipa(req, id) {
  const sesion = await teleModel.porId(id);
  if (!sesion) throw ApiError.noEncontrado('Esa videoconsulta no existe.');
  if (!participa(req, sesion)) throw ApiError.prohibido('Esa videoconsulta no es tuya.');
  return sesion;
}

/** GET /api/telemedicina */
const listar = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  // Cada quien ve lo suyo: el cliente sus videoconsultas y el veterinario las
  // que atiende. Solo la administración las ve todas. El cliente_id se
  // comprueba en vez de darse por hecho: sin ficha de cliente el filtro salía
  // undefined y el listado llegaba entero.
  if (req.usuario.rol === 'veterinario') {
    if (!req.usuario.veterinario_id) {
      throw ApiError.badRequest('Tu cuenta no está vinculada a un perfil de veterinario.');
    }
    filtros.veterinarioId = req.usuario.veterinario_id;
  } else {
    const clienteId = alcanceCliente(req, 'telemedicina.gestionar', 'telemedicina.atender');
    if (clienteId) filtros.clienteId = clienteId;
  }

  res.json({ ok: true, sesiones: await teleModel.listar(filtros) });
});

/** GET /api/telemedicina/:id */
const detalle = asyncHandler(async (req, res) => {
  const sesion = await sesionDeLaQueParticipa(req, req.params.id);
  const mensajes = await teleModel.mensajes(sesion.id);
  await teleModel.marcarLeidos(sesion.id, req.usuario.id);

  // El enlace solo se entrega cuando ya se puede entrar; así el cliente no lo
  // guarda antes de pagar y se salta el cobro.
  const lista = Boolean(sesion.firma_id) && sesion.pagada === 1;

  res.json({
    ok: true,
    sesion: lista ? sesion : { ...sesion, enlace: null },
    mensajes,
    puedeEntrar: lista,
    faltante: {
      consentimiento: !sesion.firma_id,
      pago: sesion.pagada !== 1,
    },
  });
});

/** POST /api/telemedicina */
const crear = asyncHandler(async (req, res) => {
  const mascota = await mascotaModel.buscarPorId(req.body.mascotaId);
  if (!mascota) throw ApiError.noEncontrado('Esa mascota no existe.');

  const esClinica = ['admin', 'veterinario'].includes(req.usuario.rol);
  if (!esClinica && mascota.cliente_id !== req.usuario.cliente_id) {
    throw ApiError.prohibido('Esa mascota no es tuya.');
  }

  const id = await teleModel.crear({ ...req.body, clienteId: mascota.cliente_id });
  const sesion = await teleModel.porId(id);

  await avisos.avisar({
    usuarioId: sesion.veterinario_usuario_id,
    tipo: 'telemedicina',
    titulo: `Videoconsulta solicitada para ${sesion.mascota_nombre}`,
    mensaje: sesion.motivo || 'Sin motivo indicado.',
    enlace: 'veterinario/telemedicina.html',
  });

  res.status(201).json({ ok: true, sesion });
});

/** POST /api/telemedicina/:id/consentimiento */
const firmarConsentimiento = asyncHandler(async (req, res) => {
  const sesion = await sesionDeLaQueParticipa(req, req.params.id);
  if (sesion.firma_id) throw ApiError.conflicto('El consentimiento ya estaba firmado.');

  const firma = await teleModel.firmarConsentimiento(sesion.id, req.body, req.usuario.id, req.ip);
  if (!firma) throw new ApiError(500, 'No se pudo registrar el consentimiento.');

  res.status(201).json({ ok: true, mensaje: 'Consentimiento registrado.' });
});

/** POST /api/telemedicina/:id/pago — confirma el cobro previo a la consulta. */
const registrarPago = asyncHandler(async (req, res) => {
  const sesion = await sesionDeLaQueParticipa(req, req.params.id);
  await teleModel.marcarPagada(sesion.id, req.body?.facturaId ?? null);

  res.json({ ok: true, mensaje: 'Pago registrado. La sala queda habilitada.' });
});

/** PATCH /api/telemedicina/:id */
const cambiarEstado = asyncHandler(async (req, res) => {
  const sesion = await sesionDeLaQueParticipa(req, req.params.id);

  if (req.body.estado === 'en_curso') {
    if (!sesion.firma_id) throw ApiError.conflicto('Falta el consentimiento de atención remota.');
    if (sesion.pagada !== 1) throw ApiError.conflicto('La videoconsulta todavía no está pagada.');
  }

  if (req.body.estado === 'finalizada' && req.body.registrarEnHistoria) {
    if (!req.usuario.veterinario_id) {
      throw ApiError.prohibido('Solo el veterinario que atiende puede cerrar la consulta.');
    }
    try {
      await teleModel.finalizarConConsulta(sesion, req.body.resumen, req.usuario.id);
    } catch (error) {
      throw ApiError.conflicto(error.message);
    }
  } else {
    await teleModel.cambiarEstado(sesion.id, req.body);
  }

  res.json({ ok: true, sesion: await teleModel.porId(sesion.id) });
});

/** POST /api/telemedicina/:id/mensajes */
const enviarMensaje = asyncHandler(async (req, res) => {
  const sesion = await sesionDeLaQueParticipa(req, req.params.id);
  if (['finalizada', 'cancelada'].includes(sesion.estado)) {
    throw ApiError.conflicto('Esta videoconsulta ya terminó.');
  }

  await teleModel.crearMensaje(sesion.id, req.usuario.id, req.body);

  // Se avisa a la otra parte: el chat no es una sala abierta todo el día.
  const destino = req.usuario.rol === 'cliente' ? sesion.veterinario_usuario_id : sesion.cliente_usuario_id;
  await avisos.avisar({
    usuarioId: destino,
    tipo: 'telemedicina_mensaje',
    titulo: `Mensaje nuevo sobre ${sesion.mascota_nombre}`,
    mensaje: (req.body.texto || 'Adjuntó un archivo.').slice(0, 180),
    enlace: req.usuario.rol === 'cliente' ? 'veterinario/telemedicina.html' : 'cliente/telemedicina.html',
  });

  res.status(201).json({ ok: true, mensajes: await teleModel.mensajes(sesion.id) });
});

module.exports = {
  listar,
  detalle,
  crear,
  firmarConsentimiento,
  registrarPago,
  cambiarEstado,
  enviarMensaje,
};
