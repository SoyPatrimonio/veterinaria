'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const inventarioModel = require('../models/inventario.model');
const { calcularCompra } = require('../services/facturacion.service');
const avisos = require('../services/notificaciones.service');
const almacenamiento = require('../services/storage.service');
const { consultarUna } = require('../config/database');

/** GET /api/inventario/productos */
const listarProductos = asyncHandler(async (req, res) => {
  const productos = await inventarioModel.listarProductos(req.consulta || {});
  res.json({ ok: true, productos });
});

/** GET /api/inventario/productos/:id */
const detalleProducto = asyncHandler(async (req, res) => {
  const producto = await inventarioModel.productoPorId(req.params.id);
  if (!producto) throw ApiError.noEncontrado('Ese producto no existe.');

  const [existencias, movimientos] = await Promise.all([
    inventarioModel.existenciasDeProducto(producto.id),
    inventarioModel.listarMovimientos({ productoId: producto.id, limite: 30 }),
  ]);

  res.json({ ok: true, producto, existencias, movimientos });
});

/** POST /api/inventario/productos */
const crearProducto = asyncHandler(async (req, res) => {
  await validarCategoriaYProveedor(req.body);

  const id = await inventarioModel.crearProducto(req.body);
  const producto = await inventarioModel.productoPorId(id);
  res.status(201).json({ ok: true, producto });
});

/** PUT /api/inventario/productos/:id */
const actualizarProducto = asyncHandler(async (req, res) => {
  const producto = await inventarioModel.productoPorId(req.params.id);
  if (!producto) throw ApiError.noEncontrado('Ese producto no existe.');

  await validarCategoriaYProveedor(req.body);
  await inventarioModel.actualizarProducto(producto.id, req.body);

  const actualizado = await inventarioModel.productoPorId(producto.id);
  res.json({ ok: true, producto: actualizado });
});

/** DELETE /api/inventario/productos/:id — desactiva, no borra. */
const desactivarProducto = asyncHandler(async (req, res) => {
  const producto = await inventarioModel.productoPorId(req.params.id);
  if (!producto) throw ApiError.noEncontrado('Ese producto no existe.');

  await inventarioModel.desactivarProducto(producto.id);
  res.json({ ok: true, mensaje: 'Producto desactivado.' });
});

/**
 * POST /api/inventario/productos/:id/foto
 *
 * La foto llega en su propia petición y no con el resto del formulario: el
 * producto se crea primero con sus datos y la imagen se sube después, que es
 * lo que permite cambiarla sin volver a tocar precios ni existencias.
 */
const subirFotoProducto = asyncHandler(async (req, res) => {
  const producto = await inventarioModel.productoPorId(req.params.id);
  if (!producto) throw ApiError.noEncontrado('Ese producto no existe.');
  if (!req.file) throw ApiError.badRequest('No se recibió ninguna imagen.');

  const url = await almacenamiento.guardarFoto(req.file, 'productos');
  await inventarioModel.actualizarImagen(producto.id, url);

  // La anterior se borra después de guardar la nueva: si el borrado falla, el
  // producto ya tiene su foto actualizada y solo queda un archivo suelto, así
  // que no se hace fallar la petición. Pero se registra: si el borrado dejara
  // de funcionar, el único síntoma sería el bucket creciendo sin explicación.
  try {
    await almacenamiento.borrarFoto(producto.imagen);
  } catch (error) {
    console.warn(
      `[inventario] quedó sin borrar la foto anterior del producto ${producto.id}: ${error.message}`
    );
  }

  res.json({ ok: true, imagen: url });
});

/** DELETE /api/inventario/productos/:id/foto — deja el producto sin imagen. */
const quitarFotoProducto = asyncHandler(async (req, res) => {
  const producto = await inventarioModel.productoPorId(req.params.id);
  if (!producto) throw ApiError.noEncontrado('Ese producto no existe.');

  // Primero la base y después el archivo, por lo mismo que al subir: si el
  // bucket falla, el producto ya quedó sin foto y no se ve una imagen rota.
  await inventarioModel.actualizarImagen(producto.id, null);

  try {
    await almacenamiento.borrarFoto(producto.imagen);
  } catch (error) {
    console.warn(
      `[inventario] quedó sin borrar la foto del producto ${producto.id}: ${error.message}`
    );
  }

  res.json({ ok: true, mensaje: 'Foto quitada.' });
});

/**
 * POST /api/inventario/movimientos
 *
 * El stock lo mueve el disparador de la base a partir de esta fila. Aquí solo
 * se comprueba que la salida no deje el inventario en negativo, que es el
 * único caso que la base no puede rechazar por sí sola sin dejar el registro
 * a medias.
 */
const registrarMovimiento = asyncHandler(async (req, res) => {
  const producto = await inventarioModel.productoPorId(req.body.productoId);
  if (!producto) throw ApiError.badRequest('Ese producto no existe.');

  if (req.body.tipo === 'salida' && req.body.cantidad > producto.cantidad) {
    throw ApiError.conflicto(
      `No hay stock suficiente: quedan ${producto.cantidad} ${producto.unidad}(s) de ${producto.nombre}.`
    );
  }

  if (req.body.loteId) {
    const lote = await consultarUna('SELECT id, producto_id FROM lotes WHERE id = ?', [req.body.loteId]);
    if (!lote) throw ApiError.badRequest('Ese lote no existe.');
    if (lote.producto_id !== producto.id) throw ApiError.badRequest('El lote no es de ese producto.');
  }

  await inventarioModel.registrarMovimiento(req.body, req.usuario.id);

  const actualizado = await inventarioModel.productoPorId(producto.id);
  await avisarSiQuedoBajo(actualizado);

  res.status(201).json({ ok: true, producto: actualizado });
});

/** GET /api/inventario/movimientos */
const listarMovimientos = asyncHandler(async (req, res) => {
  const movimientos = await inventarioModel.listarMovimientos(req.consulta || {});
  res.json({ ok: true, movimientos });
});

/** GET /api/inventario/catalogos */
const catalogos = asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await inventarioModel.catalogos()) });
});

/** GET /api/inventario/alertas */
const alertas = asyncHandler(async (req, res) => {
  const dias = Math.min(Math.max(Number.parseInt(req.query.dias, 10) || 60, 1), 365);
  res.json({ ok: true, dias, ...(await inventarioModel.alertas(dias)) });
});

/* ------------------------------------------------------------------
   Proveedores
   ------------------------------------------------------------------ */

/** GET /api/inventario/proveedores */
const listarProveedores = asyncHandler(async (req, res) => {
  const proveedores = await inventarioModel.listarProveedores(Boolean(req.query.todos));
  res.json({ ok: true, proveedores });
});

/** POST /api/inventario/proveedores */
const crearProveedor = asyncHandler(async (req, res) => {
  const id = await inventarioModel.crearProveedor(req.body);
  const proveedores = await inventarioModel.listarProveedores(true);
  res.status(201).json({ ok: true, proveedor: proveedores.find((p) => p.id === id) });
});

/** PUT /api/inventario/proveedores/:id */
const actualizarProveedor = asyncHandler(async (req, res) => {
  const existe = await consultarUna('SELECT id FROM proveedores WHERE id = ?', [req.params.id]);
  if (!existe) throw ApiError.noEncontrado('Ese proveedor no existe.');

  await inventarioModel.actualizarProveedor(req.params.id, req.body);
  const proveedores = await inventarioModel.listarProveedores(true);
  res.json({ ok: true, proveedor: proveedores.find((p) => p.id === Number(req.params.id)) });
});

/* ------------------------------------------------------------------
   Compras
   ------------------------------------------------------------------ */

/** GET /api/inventario/compras */
const listarCompras = asyncHandler(async (req, res) => {
  const compras = await inventarioModel.listarCompras(req.query.limite);
  res.json({ ok: true, compras });
});

/** GET /api/inventario/compras/:id */
const detalleCompra = asyncHandler(async (req, res) => {
  const compra = await inventarioModel.compraPorId(req.params.id);
  if (!compra) throw ApiError.noEncontrado('Esa compra no existe.');

  const lineas = await inventarioModel.detalleCompra(compra.id);
  res.json({ ok: true, compra, lineas });
});

/** POST /api/inventario/compras — entra la mercancía y sube el stock. */
const crearCompra = asyncHandler(async (req, res) => {
  const proveedor = await consultarUna(
    'SELECT id, nombre FROM proveedores WHERE id = ? AND activo = 1',
    [req.body.proveedorId]
  );
  if (!proveedor) throw ApiError.badRequest('Ese proveedor no existe o está inactivo.');

  // Se comprueban todos los productos antes de abrir la transacción: así una
  // referencia mal escrita se responde con un mensaje claro en vez de con el
  // error de clave foránea de la base.
  for (const linea of req.body.lineas) {
    const producto = await inventarioModel.productoPorId(linea.productoId);
    if (!producto) throw ApiError.badRequest(`El producto ${linea.productoId} no existe.`);
    if (producto.requiere_lote && !linea.lote) {
      throw ApiError.badRequest(`"${producto.nombre}" se maneja por lotes: indica el número de lote.`);
    }
  }

  const totales = calcularCompra(req.body.lineas, req.body.impuestos);

  const id = await inventarioModel.crearCompra(
    { ...req.body, ...totales },
    req.usuario.id
  );

  const compra = await inventarioModel.compraPorId(id);
  const lineas = await inventarioModel.detalleCompra(id);

  res.status(201).json({ ok: true, compra, lineas });
});

/* ------------------------------------------------------------------
   Auxiliares
   ------------------------------------------------------------------ */

async function validarCategoriaYProveedor({ categoriaId, proveedorId }) {
  const categoria = await consultarUna('SELECT id FROM categorias_productos WHERE id = ?', [categoriaId]);
  if (!categoria) throw ApiError.badRequest('Esa categoría no existe.');

  if (proveedorId) {
    const proveedor = await consultarUna('SELECT id FROM proveedores WHERE id = ?', [proveedorId]);
    if (!proveedor) throw ApiError.badRequest('Ese proveedor no existe.');
  }
}

/**
 * Avisa a la administración cuando un movimiento deja el producto en mínimos.
 * Se manda al rol y no a una persona: quien reponga será quien esté de turno.
 */
async function avisarSiQuedoBajo(producto) {
  if (!producto || !producto.stock_bajo) return;

  await avisos.avisar({
    rol: 'admin',
    tipo: 'stock_bajo',
    titulo: 'Producto por agotarse',
    mensaje: `${producto.nombre} quedó en ${producto.cantidad} ${producto.unidad}(s), `
      + `por debajo del mínimo de ${producto.stock_minimo}.`,
    enlace: 'admin/inventario.html',
  });
}

module.exports = {
  listarProductos,
  detalleProducto,
  crearProducto,
  actualizarProducto,
  desactivarProducto,
  subirFotoProducto,
  quitarFotoProducto,
  registrarMovimiento,
  listarMovimientos,
  catalogos,
  alertas,
  listarProveedores,
  crearProveedor,
  actualizarProveedor,
  listarCompras,
  detalleCompra,
  crearCompra,
  avisarSiQuedoBajo,
};
