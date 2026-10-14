'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const facturaModel = require('../models/factura.model');
const inventarioModel = require('../models/inventario.model');
const { calcularFactura, saldoPendiente, pagoValido } = require('../services/facturacion.service');
const avisos = require('../services/notificaciones.service');
const { consultarUna } = require('../config/database');

/** El cliente solo ve lo suyo; la clínica ve toda la cartera. */
function puedeVer(req, factura) {
  if (req.usuario.rol === 'cliente') return factura.cliente_id === req.usuario.cliente_id;
  return true;
}

async function obtenerConAcceso(req, id) {
  const factura = await facturaModel.porId(id);
  if (!factura) throw ApiError.noEncontrado('Esa factura no existe.');
  if (!puedeVer(req, factura)) throw ApiError.prohibido('No tienes acceso a esta factura.');
  return factura;
}

/** GET /api/facturas */
const listar = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  if (req.usuario.rol === 'cliente') {
    if (!req.usuario.cliente_id) throw ApiError.badRequest('Tu cuenta no tiene ficha de cliente.');
    filtros.clienteId = req.usuario.cliente_id;
  }

  const facturas = await facturaModel.listar(filtros);
  res.json({ ok: true, facturas });
});

/** GET /api/facturas/resumen — contadores de cartera. */
const resumen = asyncHandler(async (req, res) => {
  res.json({ ok: true, resumen: await facturaModel.resumen() });
});

/** GET /api/facturas/:id */
const detalle = asyncHandler(async (req, res) => {
  const factura = await obtenerConAcceso(req, req.params.id);
  const partes = await facturaModel.detalle(factura.id);
  res.json({ ok: true, factura, ...partes });
});

/** POST /api/facturas */
const crear = asyncHandler(async (req, res) => {
  const cliente = await consultarUna(
    `SELECT c.id, c.usuario_id, u.nombre
       FROM clientes c JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id = ?`,
    [req.body.clienteId]
  );
  if (!cliente) throw ApiError.badRequest('Ese cliente no existe.');

  await validarReferencias(req.body);

  const totales = calcularFactura(req.body.lineas, req.body.descuento);
  if (totales.total < 0) {
    throw ApiError.badRequest('El descuento no puede ser mayor que el valor de la factura.');
  }

  // El stock se comprueba antes de abrir la transacción para poder decir qué
  // producto falta; dentro solo quedaría el error genérico de la restricción.
  for (const linea of totales.lineas.filter((l) => l.productoId)) {
    const producto = await inventarioModel.productoPorId(linea.productoId);
    if (!producto) throw ApiError.badRequest(`El producto ${linea.productoId} no existe.`);
    if (Math.ceil(linea.cantidad) > producto.cantidad) {
      throw ApiError.conflicto(
        `No hay stock suficiente de ${producto.nombre}: quedan ${producto.cantidad} ${producto.unidad}(s).`
      );
    }
  }

  const id = await facturaModel.crear(
    { ...req.body, ...totales, sedeId: req.body.sedeId ?? req.usuario.sede_id ?? null },
    req.usuario.id
  );

  const factura = await facturaModel.porId(id);
  const partes = await facturaModel.detalle(id);

  await avisos.avisar({
    usuarioId: cliente.usuario_id,
    tipo: 'factura_emitida',
    titulo: `Factura ${factura.numero}`,
    mensaje: `Se emitió la factura ${factura.numero} por ${formatearPesos(factura.total)}.`,
    enlace: 'cliente/facturas.html',
  });

  // Si la venta dejó algún producto en mínimos, la administración se entera
  // aquí y no cuando alguien vaya a buscarlo a la estantería.
  for (const linea of totales.lineas.filter((l) => l.productoId)) {
    await avisarStock(await inventarioModel.productoPorId(linea.productoId));
  }

  res.status(201).json({ ok: true, factura, ...partes });
});

/** POST /api/facturas/:id/pagos */
const registrarPago = asyncHandler(async (req, res) => {
  const factura = await facturaModel.porId(req.params.id);
  if (!factura) throw ApiError.noEncontrado('Esa factura no existe.');

  if (factura.estado === 'anulada') throw ApiError.conflicto('Esa factura está anulada.');
  if (factura.estado === 'pagada') throw ApiError.conflicto('Esa factura ya está pagada.');
  if (!pagoValido(factura, req.body.valor)) {
    throw ApiError.badRequest(
      `El pago supera el saldo pendiente, que es de ${formatearPesos(saldoPendiente(factura))}.`
    );
  }

  await facturaModel.registrarPago(factura.id, req.body, req.usuario.id);

  // El estado lo deja el disparador de la base, así que se relee.
  const actualizada = await facturaModel.porId(factura.id);
  const partes = await facturaModel.detalle(factura.id);

  const usuarioCliente = await avisos.usuarioDelCliente(factura.cliente_id);
  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'pago_registrado',
    titulo: `Pago recibido — factura ${factura.numero}`,
    mensaje: actualizada.estado === 'pagada'
      ? `Recibimos ${formatearPesos(req.body.valor)}. La factura queda pagada. ¡Gracias!`
      : `Recibimos ${formatearPesos(req.body.valor)}. Queda un saldo de ${formatearPesos(actualizada.saldo)}.`,
    enlace: 'cliente/facturas.html',
  });

  res.status(201).json({ ok: true, factura: actualizada, ...partes });
});

/** DELETE /api/facturas/:id/pagos/:pagoId — anula un pago mal registrado. */
const anularPago = asyncHandler(async (req, res) => {
  const factura = await facturaModel.porId(req.params.id);
  if (!factura) throw ApiError.noEncontrado('Esa factura no existe.');

  const pago = await consultarUna('SELECT id, factura_id, estado FROM pagos WHERE id = ?', [req.params.pagoId]);
  if (!pago || pago.factura_id !== factura.id) throw ApiError.noEncontrado('Ese pago no es de esta factura.');
  if (pago.estado === 'anulado') throw ApiError.conflicto('Ese pago ya estaba anulado.');

  await facturaModel.anularPago(pago.id, req.usuario.id);

  const actualizada = await facturaModel.porId(factura.id);
  const partes = await facturaModel.detalle(factura.id);
  res.json({ ok: true, factura: actualizada, ...partes });
});

/** POST /api/facturas/:id/anular */
const anular = asyncHandler(async (req, res) => {
  const factura = await facturaModel.porId(req.params.id);
  if (!factura) throw ApiError.noEncontrado('Esa factura no existe.');
  if (factura.estado === 'anulada') throw ApiError.conflicto('Esa factura ya estaba anulada.');

  // Con dinero de por medio no se anula: se hace una devolución, que deja
  // constancia de cuánto se reintegró y por qué.
  if (Number(factura.pagado) > 0) {
    throw ApiError.conflicto('Esa factura tiene pagos registrados. Registra una devolución en vez de anularla.');
  }

  await facturaModel.anular(factura.id, req.body.motivo, req.usuario.id);

  const actualizada = await facturaModel.porId(factura.id);
  res.json({ ok: true, factura: actualizada });
});

/** POST /api/facturas/:id/devoluciones */
const crearDevolucion = asyncHandler(async (req, res) => {
  const factura = await facturaModel.porId(req.params.id);
  if (!factura) throw ApiError.noEncontrado('Esa factura no existe.');
  if (factura.estado === 'anulada') throw ApiError.conflicto('Esa factura está anulada.');

  const { lineas } = await facturaModel.detalle(factura.id);
  const idsValidos = new Set(lineas.map((l) => l.id));

  for (const linea of req.body.lineas) {
    if (linea.detalleId && !idsValidos.has(linea.detalleId)) {
      throw ApiError.badRequest('Una de las líneas devueltas no pertenece a esta factura.');
    }
  }

  const totalDevuelto = req.body.lineas.reduce((suma, l) => suma + Number(l.valor || 0), 0);
  if (totalDevuelto > Number(factura.total)) {
    throw ApiError.badRequest('La devolución no puede superar el valor de la factura.');
  }

  await facturaModel.crearDevolucion(factura.id, req.body, req.usuario.id);

  const partes = await facturaModel.detalle(factura.id);
  const actualizada = await facturaModel.porId(factura.id);

  const usuarioCliente = await avisos.usuarioDelCliente(factura.cliente_id);
  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'devolucion_registrada',
    titulo: `Devolución de la factura ${factura.numero}`,
    mensaje: `Se registró una devolución por ${formatearPesos(totalDevuelto)}: ${req.body.motivo}.`,
    enlace: 'cliente/facturas.html',
  });

  res.status(201).json({ ok: true, factura: actualizada, ...partes });
});

/* ------------------------------------------------------------------
   Auxiliares
   ------------------------------------------------------------------ */

/** Las referencias de las líneas tienen que existir antes de facturarlas. */
async function validarReferencias(datos) {
  if (datos.citaId) {
    const cita = await consultarUna('SELECT id, cliente_id FROM citas WHERE id = ?', [datos.citaId]);
    if (!cita) throw ApiError.badRequest('Esa cita no existe.');
    if (cita.cliente_id !== datos.clienteId) {
      throw ApiError.badRequest('La cita seleccionada es de otro cliente.');
    }
  }

  for (const linea of datos.lineas) {
    if (linea.servicioId) {
      const servicio = await consultarUna('SELECT id FROM servicios WHERE id = ?', [linea.servicioId]);
      if (!servicio) throw ApiError.badRequest(`El servicio ${linea.servicioId} no existe.`);
    }
    if (linea.examenId) {
      const examen = await consultarUna('SELECT id FROM examenes WHERE id = ?', [linea.examenId]);
      if (!examen) throw ApiError.badRequest(`El examen ${linea.examenId} no existe.`);
    }
  }
}

async function avisarStock(producto) {
  if (!producto || !producto.stock_bajo) return;
  await avisos.avisar({
    rol: 'admin',
    tipo: 'stock_bajo',
    titulo: 'Producto por agotarse',
    mensaje: `${producto.nombre} quedó en ${producto.cantidad} ${producto.unidad}(s) tras la última venta.`,
    enlace: 'admin/inventario.html',
  });
}

/** Formato corto de pesos para los textos de los avisos. */
function formatearPesos(valor) {
  return `$${Number(valor || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

module.exports = {
  listar,
  resumen,
  detalle,
  crear,
  registrarPago,
  anularPago,
  anular,
  crearDevolucion,
};
