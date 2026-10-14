'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const laboratorioModel = require('../models/laboratorio.model');
const mascotaModel = require('../models/mascota.model');
const avisos = require('../services/notificaciones.service');
const { alcanceCliente } = require('../middleware/roles');
const { consultar, consultarUna } = require('../config/database');

/**
 * Laboratorio.
 *
 * La regla que sostiene todo el módulo: al propietario se le avisa cuando el
 * resultado está VALIDADO, nunca antes. Un valor mal digitado que llega al
 * dueño por correo antes de que nadie lo mire es muy difícil de recoger.
 */

async function mascotaConAcceso(req, mascotaId) {
  const mascota = await mascotaModel.buscarPorId(mascotaId);
  if (!mascota) throw ApiError.noEncontrado('Esa mascota no existe.');

  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';
  const esDueno = req.usuario.cliente_id && mascota.cliente_id === req.usuario.cliente_id;

  if (!esClinica && !esDueno) throw ApiError.prohibido('Esa mascota no es tuya.');
  return mascota;
}

async function ordenExistente(id) {
  const orden = await laboratorioModel.porId(id);
  if (!orden) throw ApiError.noEncontrado('Esa orden de laboratorio no existe.');
  return orden;
}

/** Edad en meses, que es lo que decide qué rango de referencia aplica. */
function edadEnMeses(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(`${String(fechaNacimiento).slice(0, 10)}T00:00:00`);
  const hoy = new Date();
  return (hoy.getFullYear() - nacimiento.getFullYear()) * 12 + (hoy.getMonth() - nacimiento.getMonth());
}

/* ------------------------------------------------------------------
   Órdenes
   ------------------------------------------------------------------ */

/** GET /api/laboratorio/ordenes */
const listar = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  // La ruta deja pasar historia.ver_propia para que el dueño consulte lo de sus
  // mascotas; sin recorte, pedir el listado sin mascotaId devolvía la bandeja
  // entera del laboratorio con los nombres de todos los clientes.
  const clienteId = alcanceCliente(req, 'laboratorio.ver', 'laboratorio.procesar');
  if (clienteId) filtros.clienteId = clienteId;

  if (filtros.mascotaId) await mascotaConAcceso(req, filtros.mascotaId);

  res.json({ ok: true, ordenes: await laboratorioModel.listar(filtros) });
});

/** GET /api/laboratorio/ordenes/:id */
const detalle = asyncHandler(async (req, res) => {
  const orden = await ordenExistente(req.params.id);
  await mascotaConAcceso(req, orden.mascota_id);

  const [items, muestras] = await Promise.all([
    laboratorioModel.itemsDeOrden(orden.id),
    laboratorioModel.muestrasDeOrden(orden.id),
  ]);

  res.json({ ok: true, orden, items, muestras });
});

/** POST /api/laboratorio/ordenes */
const crearOrden = asyncHandler(async (req, res) => {
  const mascota = await mascotaConAcceso(req, req.body.mascotaId);

  let veterinarioId = req.usuario.veterinario_id;
  if (!veterinarioId) {
    if (!req.body.veterinarioId) throw ApiError.badRequest('Indica el veterinario que ordena (veterinarioId).');
    const existe = await consultarUna('SELECT id FROM veterinarios WHERE id = ? AND activo = 1', [req.body.veterinarioId]);
    if (!existe) throw ApiError.badRequest('Ese veterinario no existe o está inactivo.');
    veterinarioId = req.body.veterinarioId;
  }

  const tipos = await consultar(
    `SELECT id FROM tipos_examen WHERE id = ANY (?::int[]) AND activo = 1`,
    [`{${req.body.tipos.join(',')}}`]
  );
  if (tipos.length !== new Set(req.body.tipos).size) {
    throw ApiError.badRequest('Alguno de los exámenes no existe o está inactivo.');
  }

  const { id } = await laboratorioModel.crearOrden({ ...req.body, veterinarioId }, req.usuario.id);

  // Una orden urgente no puede quedarse esperando a que alguien mire la
  // bandeja del laboratorio.
  if (req.body.prioridad === 'urgente') {
    await avisos.avisar({
      rol: 'veterinario',
      tipo: 'laboratorio_urgente',
      titulo: `Orden urgente de laboratorio: ${mascota.nombre}`,
      mensaje: req.body.indicaciones || 'Hay una orden de laboratorio marcada como urgente.',
      enlace: 'veterinario/laboratorio.html',
    });
  }

  res.status(201).json({
    ok: true,
    orden: await laboratorioModel.porId(id),
    items: await laboratorioModel.itemsDeOrden(id),
  });
});

/** DELETE /api/laboratorio/ordenes/:id */
const anularOrden = asyncHandler(async (req, res) => {
  const orden = await ordenExistente(req.params.id);
  if (orden.estado === 'completada') {
    throw ApiError.conflicto('Una orden ya completada no se anula.');
  }

  // La anula quien la ordenó, o la administración.
  if (req.usuario.rol !== 'admin' && orden.veterinario_id !== req.usuario.veterinario_id) {
    throw ApiError.prohibido('Solo el veterinario que ordenó los exámenes puede anular esta orden.');
  }

  await laboratorioModel.cambiarEstadoOrden(orden.id, 'anulada');
  res.json({ ok: true, mensaje: 'Orden anulada.' });
});

/* ------------------------------------------------------------------
   Muestras
   ------------------------------------------------------------------ */

/** POST /api/laboratorio/ordenes/:id/muestras */
const registrarMuestra = asyncHandler(async (req, res) => {
  const orden = await ordenExistente(req.params.id);
  if (orden.estado === 'anulada') throw ApiError.conflicto('Esa orden está anulada.');

  await laboratorioModel.registrarMuestra(orden.id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, muestras: await laboratorioModel.muestrasDeOrden(orden.id) });
});

/** PATCH /api/laboratorio/muestras/:id */
const cambiarEstadoMuestra = asyncHandler(async (req, res) => {
  const muestra = await laboratorioModel.muestraPorId(req.params.id);
  if (!muestra) throw ApiError.noEncontrado('Esa muestra no existe.');

  await laboratorioModel.cambiarEstadoMuestra(muestra.id, req.body);

  // Rechazar una muestra hay que decírselo a quien pidió el examen: si no, se
  // queda esperando un resultado que no va a llegar.
  if (req.body.estado === 'rechazada') {
    const orden = await laboratorioModel.porId(muestra.orden_id);
    await avisos.avisar({
      rol: 'veterinario',
      tipo: 'muestra_rechazada',
      titulo: `Muestra rechazada: ${orden.mascota_nombre}`,
      mensaje: `Orden ${orden.numero} — ${req.body.motivoRechazo}. Hay que repetir la toma.`,
      enlace: 'veterinario/laboratorio.html',
    });
  }

  res.json({ ok: true, muestras: await laboratorioModel.muestrasDeOrden(muestra.orden_id) });
});

/* ------------------------------------------------------------------
   Resultados
   ------------------------------------------------------------------ */

/** GET /api/laboratorio/examenes/:id — con la plantilla de parámetros y rangos. */
const detalleExamen = asyncHandler(async (req, res) => {
  const examen = await laboratorioModel.examenPorId(req.params.id);
  if (!examen) throw ApiError.noEncontrado('Ese examen no existe.');
  await mascotaConAcceso(req, examen.mascota_id);

  const [resultados, plantilla] = await Promise.all([
    laboratorioModel.resultadosDe(examen.id),
    examen.tipo_examen_id
      ? laboratorioModel.rangosPara(examen.tipo_examen_id, {
        especieId: examen.especie_id,
        sexo: examen.sexo === 'desconocido' ? null : examen.sexo,
        edadMeses: edadEnMeses(examen.fecha_nacimiento),
      })
      : Promise.resolve([]),
  ]);

  res.json({ ok: true, examen, resultados, plantilla });
});

/** PUT /api/laboratorio/examenes/:id/resultados */
const cargarResultados = asyncHandler(async (req, res) => {
  const examen = await laboratorioModel.examenPorId(req.params.id);
  if (!examen) throw ApiError.noEncontrado('Ese examen no existe.');
  if (examen.estado === 'anulado') throw ApiError.conflicto('Ese examen está anulado.');

  // Volver a cargar sobre un examen ya validado lo devuelve a "listo": cambiar
  // un valor invalida la revisión anterior y hay que volver a firmarlo.
  await laboratorioModel.guardarResultados(examen.id, req.body, req.usuario.id);

  res.json({
    ok: true,
    examen: await laboratorioModel.examenPorId(examen.id),
    resultados: await laboratorioModel.resultadosDe(examen.id),
  });
});

/** POST /api/laboratorio/examenes/:id/validar */
const validar = asyncHandler(async (req, res) => {
  const examen = await laboratorioModel.examenPorId(req.params.id);
  if (!examen) throw ApiError.noEncontrado('Ese examen no existe.');

  const validado = await laboratorioModel.validar(examen.id, req.body, req.usuario.id);
  if (!validado) {
    throw ApiError.conflicto('Solo se puede validar un examen que tenga resultados cargados.');
  }

  if (req.body.avisarPropietario) {
    const usuarioCliente = await avisos.usuarioDelCliente(examen.cliente_id);
    await avisos.avisarConPlantilla('resultado_listo', {
      usuarioId: usuarioCliente,
      variables: { examen: examen.tipo_examen || 'tu examen', mascota: examen.mascota_nombre },
      enlace: 'cliente/historia.html',
      tituloRespaldo: `Resultado de ${examen.mascota_nombre} disponible`,
    });
    await laboratorioModel.marcarAvisado(examen.id);
  }

  // Al veterinario que lo pidió siempre se le avisa, pida o no avisar al dueño.
  await avisos.avisar({
    rol: 'veterinario',
    tipo: 'resultado_validado',
    titulo: `Resultado listo: ${examen.mascota_nombre}`,
    mensaje: `${examen.tipo_examen || 'Examen'} validado.`,
    enlace: 'veterinario/laboratorio.html',
  });

  res.json({ ok: true, examen: await laboratorioModel.examenPorId(examen.id) });
});

/** GET /api/laboratorio/evolucion — la curva de un parámetro en el tiempo. */
const evolucion = asyncHandler(async (req, res) => {
  const { mascotaId, parametroId } = req.consulta;
  await mascotaConAcceso(req, mascotaId);

  res.json({ ok: true, serie: await laboratorioModel.evolucionParametro(mascotaId, parametroId) });
});

/* ------------------------------------------------------------------
   Catálogo
   ------------------------------------------------------------------ */

/** GET /api/laboratorio/parametros/:id — los de un tipo de examen. */
const parametros = asyncHandler(async (req, res) => {
  res.json({ ok: true, parametros: await laboratorioModel.parametrosDe(req.params.id) });
});

/** POST /api/laboratorio/parametros */
const crearParametro = asyncHandler(async (req, res) => {
  const id = await laboratorioModel.crearParametro(req.body);
  res.status(201).json({ ok: true, id });
});

/** POST /api/laboratorio/rangos */
const crearRango = asyncHandler(async (req, res) => {
  const id = await laboratorioModel.crearRango(req.body);
  res.status(201).json({ ok: true, id });
});

/**
 * GET /api/laboratorio/bandeja
 *
 * Lo que el laboratorio tiene por delante: lo que está en proceso, lo urgente
 * sin empezar y lo que lleva demasiado tiempo pedido sin resultado.
 */
const bandeja = asyncHandler(async (req, res) => {
  const [pendientes, urgentes, sinResultado] = await Promise.all([
    laboratorioModel.listar({ estado: 'en_proceso', limite: 100 }),
    laboratorioModel.listar({ prioridad: 'urgente', estado: 'solicitada', limite: 50 }),
    laboratorioModel.pendientesAntiguos(5),
  ]);

  res.json({ ok: true, pendientes, urgentes, sinResultado });
});

module.exports = {
  listar,
  detalle,
  crearOrden,
  anularOrden,
  registrarMuestra,
  cambiarEstadoMuestra,
  detalleExamen,
  cargarResultados,
  validar,
  evolucion,
  parametros,
  crearParametro,
  crearRango,
  bandeja,
};
