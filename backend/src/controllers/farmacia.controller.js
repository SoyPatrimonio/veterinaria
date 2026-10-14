'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const farmaciaModel = require('../models/farmacia.model');
const mascotaModel = require('../models/mascota.model');
const avisos = require('../services/notificaciones.service');
const { alcanceCliente } = require('../middleware/roles');
const { consultarUna } = require('../config/database');

/**
 * Farmacia.
 *
 * Las comprobaciones de interacción y alergia AVISAN, no bloquean. El
 * veterinario puede tener una razón para recetar algo que el sistema marca:
 * lo que no puede pasar es que nadie se lo diga. Por eso la receta se crea
 * igual y los avisos viajan en la respuesta.
 */

async function mascotaConAcceso(req, mascotaId) {
  const mascota = await mascotaModel.buscarPorId(mascotaId);
  if (!mascota) throw ApiError.noEncontrado('Esa mascota no existe.');

  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';
  const esDueno = req.usuario.cliente_id && mascota.cliente_id === req.usuario.cliente_id;

  if (!esClinica && !esDueno) throw ApiError.prohibido('Esa mascota no es tuya.');
  return mascota;
}

async function recetaConAcceso(req, id) {
  const receta = await farmaciaModel.porId(id);
  if (!receta) throw ApiError.noEncontrado('Esa receta no existe.');

  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';
  const esDueno = req.usuario.cliente_id && receta.cliente_id === req.usuario.cliente_id;

  if (!esClinica && !esDueno) throw ApiError.prohibido('Esa receta no es tuya.');
  return receta;
}

/* ------------------------------------------------------------------
   Recetas
   ------------------------------------------------------------------ */

/** GET /api/farmacia/recetas */
const listarRecetas = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  // El cliente solo ve las suyas, diga lo que diga en la query. Antes se leía
  // su cliente_id sin comprobarlo: una cuenta de cliente sin ficha en la tabla
  // `clientes` dejaba el filtro en undefined, y sin filtro se devolvían las
  // recetas de toda la clínica.
  const clienteId = alcanceCliente(req, 'recetas.ver_todas');
  if (clienteId) filtros.clienteId = clienteId;

  res.json({ ok: true, recetas: await farmaciaModel.listar(filtros) });
});

/** GET /api/farmacia/recetas/:id */
const detalleReceta = asyncHandler(async (req, res) => {
  const receta = await recetaConAcceso(req, req.params.id);
  const items = await farmaciaModel.itemsDeReceta(receta.id);

  // Los avisos se recalculan al abrirla: puede que la alergia se registrara
  // después de emitir la receta.
  const medicamentoIds = items.map((i) => i.medicamento_id);
  const [interacciones, alergias] = await Promise.all([
    farmaciaModel.interaccionesEntre(medicamentoIds),
    farmaciaModel.alergiasQueChocan(receta.mascota_id, medicamentoIds),
  ]);

  res.json({ ok: true, receta, items, avisos: { interacciones, alergias } });
});

/** POST /api/farmacia/recetas */
const crearReceta = asyncHandler(async (req, res) => {
  const mascota = await mascotaConAcceso(req, req.body.mascotaId);

  if (req.usuario.rol !== 'veterinario' && !req.usuario.veterinario_id) {
    throw ApiError.badRequest('Solo un veterinario puede firmar una receta.');
  }
  const veterinarioId = req.usuario.veterinario_id;

  const medicamentoIds = req.body.items.map((i) => i.medicamentoId);
  const existentes = await consultarUna(
    `SELECT COUNT(*) AS total FROM medicamentos WHERE id = ANY (?::int[]) AND activo = 1`,
    [`{${medicamentoIds.join(',')}}`]
  );
  if (Number(existentes.total) !== new Set(medicamentoIds).size) {
    throw ApiError.badRequest('Alguno de los medicamentos no existe o está inactivo.');
  }

  const id = await farmaciaModel.crear(
    { ...req.body, clienteId: mascota.cliente_id, veterinarioId },
    req.usuario.id
  );

  const [interacciones, alergias] = await Promise.all([
    farmaciaModel.interaccionesEntre(medicamentoIds),
    farmaciaModel.alergiasQueChocan(mascota.id, medicamentoIds),
  ]);

  const usuarioCliente = await avisos.usuarioDelCliente(mascota.cliente_id);
  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'receta_emitida',
    titulo: `Nueva fórmula para ${mascota.nombre}`,
    // El portal del cliente todavía no tiene una vista propia de recetas de
    // farmacia; el tratamiento con su prescripción ya se ve en la consulta
    // dentro de la historia clínica, así que se enlaza ahí y no a una página
    // que no existe.
    mensaje: 'Revisa el tratamiento de esta consulta en tu historia clínica.',
    enlace: `cliente/historia.html?mascota=${mascota.id}`,
  });

  res.status(201).json({
    ok: true,
    receta: await farmaciaModel.porId(id),
    items: await farmaciaModel.itemsDeReceta(id),
    avisos: { interacciones, alergias },
  });
});

/** DELETE /api/farmacia/recetas/:id */
const anularReceta = asyncHandler(async (req, res) => {
  const receta = await farmaciaModel.porId(req.params.id);
  if (!receta) throw ApiError.noEncontrado('Esa receta no existe.');

  // Una receta la anula quien la firmó, o la administración. Un veterinario no
  // deshace la decisión clínica de otro sin que quede claro que fue una
  // decisión administrativa.
  if (req.usuario.rol !== 'admin' && receta.veterinario_id !== req.usuario.veterinario_id) {
    throw ApiError.prohibido('Solo el veterinario que la firmó puede anular esta receta.');
  }

  const anulada = await farmaciaModel.anular(receta.id, req.body.motivo);
  if (!anulada) throw ApiError.conflicto('Esa receta ya está dispensada o anulada.');

  res.json({ ok: true, mensaje: 'Receta anulada.' });
});

/**
 * POST /api/farmacia/verificar
 *
 * Comprobación previa: la usa el formulario de receta para avisar mientras el
 * veterinario todavía está escribiendo, antes de guardar nada.
 */
const verificar = asyncHandler(async (req, res) => {
  const { mascotaId, medicamentos } = req.body;
  if (mascotaId) await mascotaConAcceso(req, mascotaId);

  const [interacciones, alergias] = await Promise.all([
    farmaciaModel.interaccionesEntre(medicamentos),
    mascotaId ? farmaciaModel.alergiasQueChocan(mascotaId, medicamentos) : Promise.resolve([]),
  ]);

  res.json({ ok: true, interacciones, alergias });
});

/* ------------------------------------------------------------------
   Dispensación
   ------------------------------------------------------------------ */

/** GET /api/farmacia/dispensaciones */
const listarDispensaciones = asyncHandler(async (req, res) => {
  res.json({ ok: true, dispensaciones: await farmaciaModel.listarDispensaciones(req.consulta || {}) });
});

/** GET /api/farmacia/dispensaciones/:id */
const detalleDispensacion = asyncHandler(async (req, res) => {
  const dispensacion = await farmaciaModel.dispensacionPorId(req.params.id);
  if (!dispensacion) throw ApiError.noEncontrado('Esa dispensación no existe.');

  res.json({ ok: true, dispensacion });
});

/** POST /api/farmacia/dispensaciones */
const dispensar = asyncHandler(async (req, res) => {
  if (req.body.recetaId) {
    const receta = await farmaciaModel.porId(req.body.recetaId);
    if (!receta) throw ApiError.badRequest('Esa receta no existe.');
    if (receta.estado === 'anulada') throw ApiError.conflicto('Esa receta está anulada.');
    if (receta.estado === 'dispensada') throw ApiError.conflicto('Esa receta ya se entregó completa.');
    if (receta.caducada) throw ApiError.conflicto('Esa receta está vencida. Pide una nueva al veterinario.');
  }

  // Los medicamentos de control especial exigen receta y constancia de quién
  // se los lleva: es el requisito del libro de restringidos.
  const restringidos = await consultarUna(
    `SELECT COUNT(*) AS total
       FROM medicamentos med
      WHERE med.restringido = 1 AND med.producto_id = ANY (?::int[])`,
    [`{${req.body.items.map((i) => i.productoId).join(',')}}`]
  );

  if (Number(restringidos.total) > 0) {
    if (!req.body.recetaId) {
      throw ApiError.badRequest('Estos medicamentos son de control especial: no se entregan sin receta.');
    }
    if (!req.body.recibe || !req.body.documentoRecibe) {
      throw ApiError.badRequest(
        'Para un medicamento de control especial hay que anotar el nombre y el documento de quien lo recibe.'
      );
    }
  }

  let id;
  try {
    id = await farmaciaModel.dispensar(req.body, req.usuario.id);
  } catch (error) {
    // El modelo lanza Error normal cuando falta stock o no existe el producto.
    throw ApiError.conflicto(error.message);
  }

  res.status(201).json({ ok: true, dispensacion: await farmaciaModel.dispensacionPorId(id) });
});

/** POST /api/farmacia/devoluciones */
const devolver = asyncHandler(async (req, res) => {
  const id = await farmaciaModel.devolver(req.body, req.usuario.id);
  res.status(201).json({ ok: true, devolucionId: id });
});

/** GET /api/farmacia/devoluciones */
const listarDevoluciones = asyncHandler(async (req, res) => {
  res.json({ ok: true, devoluciones: await farmaciaModel.listarDevoluciones(req.consulta || {}) });
});

/* ------------------------------------------------------------------
   Catálogos e inventario
   ------------------------------------------------------------------ */

/** GET /api/farmacia/inventario */
const inventario = asyncHandler(async (req, res) => {
  const soloCriticos = Boolean(req.consulta?.criticos);
  res.json({ ok: true, productos: await farmaciaModel.inventarioFarmacia({ soloCriticos }) });
});

/** GET /api/farmacia/interacciones */
const interacciones = asyncHandler(async (req, res) => {
  res.json({ ok: true, interacciones: await farmaciaModel.listarInteracciones() });
});

/** POST /api/farmacia/interacciones */
const crearInteraccion = asyncHandler(async (req, res) => {
  const id = await farmaciaModel.crearInteraccion(req.body);
  res.status(201).json({ ok: true, id });
});

/** GET /api/farmacia/historial/:id — lo que ha tomado una mascota. */
const historial = asyncHandler(async (req, res) => {
  const mascota = await mascotaConAcceso(req, req.params.id);
  res.json({ ok: true, historial: await farmaciaModel.historialPorMascota(mascota.id) });
});

/** GET /api/farmacia/restringidos — libro de control especial. */
const restringidos = asyncHandler(async (req, res) => {
  res.json({ ok: true, movimientos: await farmaciaModel.movimientosRestringidos(req.consulta || {}) });
});

module.exports = {
  listarRecetas,
  detalleReceta,
  crearReceta,
  anularReceta,
  verificar,
  listarDispensaciones,
  detalleDispensacion,
  dispensar,
  devolver,
  listarDevoluciones,
  inventario,
  interacciones,
  crearInteraccion,
  historial,
  restringidos,
};
