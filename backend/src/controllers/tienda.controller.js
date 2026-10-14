'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const tiendaModel = require('../models/tienda.model');
const avisos = require('../services/notificaciones.service');
const { alcanceCliente } = require('../middleware/roles');

/**
 * Tienda en línea y domicilios.
 *
 * El catálogo es público; el carrito y los pedidos exigen sesión de cliente.
 * Los medicamentos marcados como "requiere receta" no se despachan sin fórmula
 * adjunta: la tienda no puede convertirse en un mostrador de venta libre de
 * antibióticos.
 */

// El método de pago va en el aviso a la clínica porque cambia lo que hay que
// preparar: un pedido en efectivo a domicilio significa salir con cambio.
const COBRO = {
  efectivo: 'Cobrar en efectivo',
  transferencia: 'Transferencia por confirmar',
  tarjeta: 'Tarjeta',
  en_linea: 'Pago en línea',
};

function exigeCliente(req) {
  if (!req.usuario.cliente_id) {
    throw ApiError.prohibido('Solo las cuentas de cliente pueden comprar en la tienda.');
  }
  return req.usuario.cliente_id;
}

/* ---- Catálogo (público) ------------------------------------------- */

/** GET /api/tienda/categorias */
const categorias = asyncHandler(async (req, res) => {
  res.json({ ok: true, categorias: await tiendaModel.categorias() });
});

/** GET /api/tienda/articulos */
const articulos = asyncHandler(async (req, res) => {
  res.json({ ok: true, articulos: await tiendaModel.articulos(req.consulta || {}) });
});

/** GET /api/tienda/articulos/:id */
const detalleArticulo = asyncHandler(async (req, res) => {
  const articulo = await tiendaModel.articuloPorId(req.params.id);
  if (!articulo || !articulo.activo) throw ApiError.noEncontrado('Ese producto no está disponible.');

  res.json({ ok: true, articulo });
});

/* ---- Gestión del catálogo ----------------------------------------- */

/** POST /api/tienda/categorias */
const crearCategoria = asyncHandler(async (req, res) => {
  await tiendaModel.crearCategoria(req.body);
  res.status(201).json({ ok: true, categorias: await tiendaModel.categorias({ soloActivas: false }) });
});

/** POST /api/tienda/articulos */
const crearArticulo = asyncHandler(async (req, res) => {
  const id = await tiendaModel.crearArticulo(req.body);
  res.status(201).json({ ok: true, articulo: await tiendaModel.articuloPorId(id) });
});

/** PUT /api/tienda/articulos/:id */
const actualizarArticulo = asyncHandler(async (req, res) => {
  const articulo = await tiendaModel.articuloPorId(req.params.id);
  if (!articulo) throw ApiError.noEncontrado('Ese artículo no existe.');

  await tiendaModel.actualizarArticulo(articulo.id, req.body);
  res.json({ ok: true, articulo: await tiendaModel.articuloPorId(articulo.id) });
});

/** GET /api/tienda/cupones */
const cupones = asyncHandler(async (req, res) => {
  res.json({ ok: true, cupones: await tiendaModel.listarCupones() });
});

/** POST /api/tienda/cupones */
const crearCupon = asyncHandler(async (req, res) => {
  await tiendaModel.crearCupon(req.body);
  res.status(201).json({ ok: true, cupones: await tiendaModel.listarCupones() });
});

/* ---- Carrito ------------------------------------------------------- */

/** GET /api/tienda/carrito */
const verCarrito = asyncHandler(async (req, res) => {
  const carrito = await tiendaModel.carritoDe(exigeCliente(req));
  res.json({ ok: true, carrito: await tiendaModel.resumenCarrito(carrito) });
});

/** POST /api/tienda/carrito */
const agregarAlCarrito = asyncHandler(async (req, res) => {
  const clienteId = exigeCliente(req);
  const articulo = await tiendaModel.articuloPorId(req.body.articuloId);

  if (!articulo || !articulo.activo) throw ApiError.badRequest('Ese producto no está disponible.');
  if (articulo.existencias < req.body.cantidad) {
    throw ApiError.conflicto(
      articulo.existencias > 0
        ? `Solo quedan ${articulo.existencias} unidades de "${articulo.nombre}".`
        : `"${articulo.nombre}" está agotado.`
    );
  }

  const carrito = await tiendaModel.carritoDe(clienteId);
  await tiendaModel.ponerEnCarrito(carrito.id, articulo.id, req.body.cantidad, articulo.precio);

  res.status(201).json({ ok: true, carrito: await tiendaModel.resumenCarrito(carrito) });
});

/** PATCH /api/tienda/carrito/:id — :id es el artículo, no la línea. */
const cambiarCantidad = asyncHandler(async (req, res) => {
  const carrito = await tiendaModel.carritoDe(exigeCliente(req), { crear: false });
  if (!carrito) throw ApiError.noEncontrado('No tienes un carrito abierto.');

  await tiendaModel.cambiarCantidad(carrito.id, req.params.id, req.body.cantidad);
  res.json({ ok: true, carrito: await tiendaModel.resumenCarrito(carrito) });
});

/** POST /api/tienda/carrito/cupon */
const aplicarCupon = asyncHandler(async (req, res) => {
  const carrito = await tiendaModel.carritoDe(exigeCliente(req));
  const cupon = await tiendaModel.cuponVigente(req.body.codigo);

  if (!cupon) throw ApiError.badRequest('Ese cupón no existe, ya venció o se agotó.');

  const resumen = await tiendaModel.resumenCarrito(carrito);
  if (resumen.subtotal < Number(cupon.minimo_compra)) {
    throw ApiError.badRequest(`Ese cupón aplica desde $${Number(cupon.minimo_compra).toLocaleString('es-CO')}.`);
  }

  await tiendaModel.aplicarCupon(carrito.id, cupon.id);
  res.json({ ok: true, carrito: await tiendaModel.resumenCarrito(await tiendaModel.carritoDe(carrito.cliente_id)) });
});

/** DELETE /api/tienda/carrito */
const vaciarCarrito = asyncHandler(async (req, res) => {
  const carrito = await tiendaModel.carritoDe(exigeCliente(req), { crear: false });
  if (carrito) await tiendaModel.vaciarCarrito(carrito.id);

  res.json({ ok: true, mensaje: 'Carrito vacío.' });
});

/* ---- Pedidos ------------------------------------------------------- */

/** GET /api/tienda/pedidos */
const listarPedidos = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  // Quien solo tiene pedidos.ver_propios ve los suyos; y si su cuenta no tiene
  // ficha de cliente no ve ninguno, en vez de verlos todos por quedarse el
  // filtro vacío.
  const clienteId = alcanceCliente(req, 'pedidos.ver_todos', 'pedidos.gestionar');
  if (clienteId) filtros.clienteId = clienteId;

  res.json({ ok: true, pedidos: await tiendaModel.listarPedidos(filtros) });
});

/** GET /api/tienda/pedidos/:id */
const detallePedido = asyncHandler(async (req, res) => {
  const pedido = await tiendaModel.pedidoPorId(req.params.id);
  if (!pedido) throw ApiError.noEncontrado('Ese pedido no existe.');

  if (req.usuario.rol === 'cliente' && pedido.cliente_id !== req.usuario.cliente_id) {
    throw ApiError.prohibido('Ese pedido no es tuyo.');
  }

  const [items, historial, seguimiento] = await Promise.all([
    tiendaModel.itemsPedido(pedido.id),
    tiendaModel.historialPedido(pedido.id),
    pedido.domicilio_id ? tiendaModel.seguimientoDe(pedido.domicilio_id) : Promise.resolve([]),
  ]);

  res.json({ ok: true, pedido, items, historial, seguimiento });
});

/** POST /api/tienda/pedidos — convierte el carrito en pedido. */
const crearPedido = asyncHandler(async (req, res) => {
  const clienteId = exigeCliente(req);
  const carrito = await tiendaModel.carritoDe(clienteId, { crear: false });
  if (!carrito) throw ApiError.badRequest('Tu carrito está vacío.');

  const resumen = await tiendaModel.resumenCarrito(carrito);
  if (!resumen.items.length) throw ApiError.badRequest('Tu carrito está vacío.');

  if (resumen.sinStock.length) {
    const nombres = resumen.sinStock.map((i) => `"${i.nombre}"`).join(', ');
    throw ApiError.conflicto(`Nos quedamos sin existencias de ${nombres}. Ajusta el carrito.`);
  }

  // Fórmula obligatoria cuando el pedido lleva medicamentos de control.
  if (resumen.requiereReceta && !req.body.recetaUrl) {
    throw ApiError.badRequest(
      'Tu pedido incluye medicamentos con fórmula. Adjunta la receta del veterinario para poder despacharlo.'
    );
  }

  let pedido;
  try {
    pedido = await tiendaModel.crearPedido(carrito, resumen, req.body, req.usuario.id);
  } catch (error) {
    throw ApiError.conflicto(error.message);
  }

  await avisos.avisar({
    rol: 'admin',
    tipo: 'pedido_nuevo',
    titulo: `Pedido ${pedido.numero}`,
    mensaje: `${resumen.items.length} artículos · ${req.body.entrega === 'domicilio' ? 'A domicilio' : 'Recoge en sede'}`
      + ` · ${COBRO[req.body.metodoPago] || COBRO.efectivo}`,
    enlace: 'admin/tienda.html',
  });

  res.status(201).json({ ok: true, pedido: await tiendaModel.pedidoPorId(pedido.id) });
});

/**
 * POST /api/tienda/pedidos/directo — el pedido de la tienda de la landing.
 *
 * Es la única ruta de pedidos que se puede llamar sin sesión, porque comprar
 * un juguete no tiene por qué obligar a abrir una cuenta. Lo que sí exige:
 *
 *   - Los precios los pone el servidor, leídos del catálogo. Lo único que se
 *     acepta del navegador es qué artículo y cuántos.
 *   - Nada de medicamentos con fórmula: sin receta adjunta no se despachan, y
 *     en la página pública no hay dónde adjuntarla. Se piden desde el portal.
 *   - Pagar en línea sí necesita cuenta: la transacción va contra la pasarela
 *     a nombre de alguien y se sigue desde el portal. Contra entrega y
 *     transferencia los cobra la clínica a mano, y para eso basta el teléfono.
 */
const crearPedidoDirecto = asyncHandler(async (req, res) => {
  const datos = req.body;
  const clienteId = req.usuario ? req.usuario.cliente_id ?? null : null;

  if (!clienteId && ['tarjeta', 'en_linea'].includes(datos.metodoPago)) {
    throw ApiError.badRequest(
      'Para pagar en línea necesitas una cuenta. Sin cuenta puedes pagar en efectivo o por transferencia.'
    );
  }

  const lineas = [];

  for (const item of datos.items) {
    const articulo = await tiendaModel.articuloPorId(item.articuloId);

    if (!articulo || !articulo.activo) throw ApiError.badRequest('Uno de los productos ya no está disponible.');
    if (articulo.requiere_receta) {
      throw ApiError.badRequest(
        `"${articulo.nombre}" necesita fórmula del veterinario: se pide desde el portal, adjuntando la receta.`
      );
    }
    if (articulo.existencias < item.cantidad) {
      throw ApiError.conflicto(
        articulo.existencias > 0
          ? `Solo quedan ${articulo.existencias} unidades de "${articulo.nombre}".`
          : `"${articulo.nombre}" está agotado.`
      );
    }

    const precio = Number(articulo.precio);
    lineas.push({
      articulo_id: articulo.id,
      producto_id: articulo.producto_id,
      nombre: articulo.nombre,
      cantidad: item.cantidad,
      precio_unit: precio,
      total_linea: precio * item.cantidad,
    });
  }

  let pedido;
  try {
    pedido = await tiendaModel.crearPedidoDirecto(
      { ...datos, clienteId },
      lineas,
      req.usuario ? req.usuario.id : null
    );
  } catch (error) {
    throw ApiError.conflicto(error.message);
  }

  await avisos.avisar({
    rol: 'admin',
    tipo: 'pedido_nuevo',
    titulo: `Pedido ${pedido.numero}`,
    mensaje: `${lineas.length} artículos · ${datos.entrega === 'domicilio' ? 'A domicilio' : 'Recoge en sede'}`
      + ` · ${COBRO[datos.metodoPago] || COBRO.efectivo}`
      + `${clienteId ? '' : ` · Sin cuenta: ${datos.nombre}, ${datos.telefono}`}`,
    enlace: 'admin/tienda.html',
  });

  res.status(201).json({ ok: true, pedido: await tiendaModel.pedidoPorId(pedido.id) });
});

/** PATCH /api/tienda/pedidos/:id */
const cambiarEstadoPedido = asyncHandler(async (req, res) => {
  const pedido = await tiendaModel.pedidoPorId(req.params.id);
  if (!pedido) throw ApiError.noEncontrado('Ese pedido no existe.');
  if (pedido.estado === 'entregado') throw ApiError.conflicto('Ese pedido ya se entregó.');

  try {
    await tiendaModel.cambiarEstadoPedido(pedido, req.body, req.usuario.id);
  } catch (error) {
    throw ApiError.conflicto(error.message);
  }

  const usuarioCliente = await avisos.usuarioDelCliente(pedido.cliente_id);
  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'pedido_estado',
    titulo: `Tu pedido ${pedido.numero}`,
    mensaje: `Pasó a: ${req.body.estado}.`,
    enlace: 'cliente/pedidos.html',
  });

  res.json({ ok: true, pedido: await tiendaModel.pedidoPorId(pedido.id) });
});

/** POST /api/tienda/pedidos/:id/pago */
const registrarPagoPedido = asyncHandler(async (req, res) => {
  const pedido = await tiendaModel.pedidoPorId(req.params.id);
  if (!pedido) throw ApiError.noEncontrado('Ese pedido no existe.');

  await tiendaModel.marcarPagado(pedido.id, 'pagado');
  res.json({ ok: true, mensaje: 'Pago registrado.' });
});

/* ---- Domicilios ---------------------------------------------------- */

/** GET /api/tienda/repartidores */
const repartidores = asyncHandler(async (req, res) => {
  res.json({ ok: true, repartidores: await tiendaModel.repartidores({ soloActivos: false }) });
});

/** POST /api/tienda/repartidores */
const crearRepartidor = asyncHandler(async (req, res) => {
  await tiendaModel.crearRepartidor(req.body);
  res.status(201).json({ ok: true, repartidores: await tiendaModel.repartidores({ soloActivos: false }) });
});

/** POST /api/tienda/pedidos/:id/domicilio */
const asignarDomicilio = asyncHandler(async (req, res) => {
  const domicilio = await tiendaModel.domicilioDePedido(req.params.id);
  if (!domicilio) throw ApiError.badRequest('Ese pedido no es a domicilio.');

  await tiendaModel.asignarDomicilio(domicilio.id, req.body);
  res.json({ ok: true, domicilio: await tiendaModel.domicilioPorId(domicilio.id) });
});

/** PATCH /api/tienda/domicilios/:id */
const actualizarDomicilio = asyncHandler(async (req, res) => {
  const domicilio = await tiendaModel.domicilioPorId(req.params.id);
  if (!domicilio) throw ApiError.noEncontrado('Ese domicilio no existe.');

  // El repartidor solo toca los suyos; la administración, cualquiera.
  const esGestor = req.permisos.includes('domicilios.gestionar');
  if (!esGestor && domicilio.repartidor_usuario_id !== req.usuario.id) {
    throw ApiError.prohibido('Ese domicilio no está asignado a ti.');
  }

  await tiendaModel.actualizarDomicilio(domicilio, req.body, req.usuario.id);

  const usuarioCliente = await avisos.usuarioDelCliente(domicilio.cliente_id);
  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'domicilio',
    titulo: `Tu pedido ${domicilio.pedido_numero}`,
    mensaje: req.body.estado === 'entregado' ? 'Fue entregado. ¡Gracias!' : `Estado: ${req.body.estado}.`,
    enlace: 'cliente/pedidos.html',
  });

  res.json({ ok: true, domicilio: await tiendaModel.domicilioPorId(domicilio.id) });
});

module.exports = {
  categorias,
  articulos,
  detalleArticulo,
  crearCategoria,
  crearArticulo,
  actualizarArticulo,
  cupones,
  crearCupon,
  verCarrito,
  agregarAlCarrito,
  cambiarCantidad,
  aplicarCupon,
  vaciarCarrito,
  listarPedidos,
  detallePedido,
  crearPedido,
  crearPedidoDirecto,
  cambiarEstadoPedido,
  registrarPagoPedido,
  repartidores,
  crearRepartidor,
  asignarDomicilio,
  actualizarDomicilio,
};
