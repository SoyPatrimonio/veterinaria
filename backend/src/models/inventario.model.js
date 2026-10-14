'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');
const { siguienteNumero } = require('../utils/consecutivos');

/**
 * Inventario: productos, lotes, existencias, movimientos y compras.
 *
 * El stock nunca se escribe a mano. Todo pasa por movimientos_inventario y es
 * el disparador trg_movimiento_stock el que ajusta productos.cantidad y la
 * existencia de cada ubicación. Así el kardex y el stock no pueden decir cosas
 * distintas: uno es la causa del otro.
 */

const SELECT_PRODUCTO = `
  SELECT p.id, p.categoria_id, p.proveedor_id, p.nombre, p.sku, p.descripcion, p.imagen,
         p.unidad, p.cantidad, p.stock_minimo, p.precio_compra, p.precio_venta,
         p.requiere_lote, p.activo, p.creado_en,
         cp.nombre AS categoria, cp.tipo AS categoria_tipo,
         pr.nombre AS proveedor,
         (p.cantidad <= p.stock_minimo) AS stock_bajo,
         (SELECT MIN(l.fecha_vencimiento) FROM lotes l
           WHERE l.producto_id = p.id AND l.fecha_vencimiento >= CURRENT_DATE) AS proximo_vencimiento
    FROM productos p
    JOIN categorias_productos cp ON cp.id = p.categoria_id
    LEFT JOIN proveedores pr     ON pr.id = p.proveedor_id`;

async function listarProductos({ busqueda, categoriaId, soloStockBajo, incluirInactivos, limite = 100 }) {
  const condiciones = [];
  const params = [];

  if (!incluirInactivos) condiciones.push('p.activo = 1');
  if (categoriaId) { condiciones.push('p.categoria_id = ?'); params.push(categoriaId); }
  if (soloStockBajo) condiciones.push('p.cantidad <= p.stock_minimo');
  if (busqueda) {
    condiciones.push('(p.nombre ILIKE ? OR p.sku ILIKE ? OR pr.nombre ILIKE ?)');
    const patron = `%${busqueda}%`;
    params.push(patron, patron, patron);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 200);

  return consultar(`${SELECT_PRODUCTO} ${where} ORDER BY p.nombre LIMIT ${lim}`, params);
}

async function productoPorId(id) {
  return consultarUna(`${SELECT_PRODUCTO} WHERE p.id = ?`, [id]);
}

async function crearProducto(datos) {
  const resultado = await ejecutar(
    `INSERT INTO productos (categoria_id, proveedor_id, nombre, sku, descripcion, unidad,
                            stock_minimo, precio_compra, precio_venta, requiere_lote, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.categoriaId,
      datos.proveedorId ?? null,
      datos.nombre,
      datos.sku ?? null,
      datos.descripcion ?? null,
      datos.unidad || 'unidad',
      datos.stockMinimo ?? 0,
      datos.precioCompra ?? 0,
      datos.precioVenta ?? 0,
      datos.requiereLote ? 1 : 0,
      datos.activo === false ? 0 : 1,
    ]
  );
  return resultado.insertId;
}

/**
 * La cantidad no se toca aquí a propósito: cambiarla con un UPDATE dejaría el
 * stock distinto de la suma del kardex. Para corregir existencias está el
 * movimiento de tipo 'ajuste'.
 */
async function actualizarProducto(id, datos) {
  const resultado = await ejecutar(
    `UPDATE productos
        SET categoria_id = ?, proveedor_id = ?, nombre = ?, sku = ?, descripcion = ?,
            unidad = ?, stock_minimo = ?, precio_compra = ?, precio_venta = ?,
            requiere_lote = ?, activo = ?
      WHERE id = ?`,
    [
      datos.categoriaId,
      datos.proveedorId ?? null,
      datos.nombre,
      datos.sku ?? null,
      datos.descripcion ?? null,
      datos.unidad || 'unidad',
      datos.stockMinimo ?? 0,
      datos.precioCompra ?? 0,
      datos.precioVenta ?? 0,
      datos.requiereLote ? 1 : 0,
      datos.activo === false ? 0 : 1,
      id,
    ]
  );
  return resultado.affectedRows > 0;
}

/**
 * La foto va aparte del resto del formulario porque llega por su propia
 * petición (multipart) y no por el JSON del producto. Con `null` se quita.
 */
async function actualizarImagen(id, url) {
  const resultado = await ejecutar('UPDATE productos SET imagen = ? WHERE id = ?', [url, id]);
  return resultado.affectedRows > 0;
}

async function desactivarProducto(id) {
  const resultado = await ejecutar('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Movimientos
   ------------------------------------------------------------------ */

async function listarMovimientos({ productoId, tipo, desde, hasta, limite = 100 }) {
  const condiciones = [];
  const params = [];

  if (productoId) { condiciones.push('mi.producto_id = ?'); params.push(productoId); }
  if (tipo) { condiciones.push('mi.tipo = ?'); params.push(tipo); }
  if (desde) { condiciones.push('mi.creado_en >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('mi.creado_en <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT mi.*, p.nombre AS producto, p.unidad,
            ui.nombre AS ubicacion, l.codigo AS lote, u.nombre AS usuario
       FROM movimientos_inventario mi
       JOIN productos p                    ON p.id = mi.producto_id
       LEFT JOIN ubicaciones_inventario ui ON ui.id = mi.ubicacion_id
       LEFT JOIN lotes l                   ON l.id = mi.lote_id
       LEFT JOIN usuarios u                ON u.id = mi.usuario_id
       ${where}
      ORDER BY mi.creado_en DESC, mi.id DESC
      LIMIT ${lim}`,
    params
  );
}

async function registrarMovimiento(datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO movimientos_inventario (producto_id, ubicacion_id, lote_id, usuario_id,
                                         tipo, cantidad, motivo, referencia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.productoId,
      datos.ubicacionId ?? null,
      datos.loteId ?? null,
      usuarioId ?? null,
      datos.tipo,
      datos.cantidad,
      datos.motivo ?? null,
      datos.referencia ?? null,
    ]
  );
  return resultado.insertId;
}

/** Salida de stock desde otra operación (una factura, una consulta). */
async function salidaEnTransaccion(conexion, { productoId, ubicacionId, cantidad, motivo, referencia, usuarioId }) {
  await conexion.execute(
    `INSERT INTO movimientos_inventario (producto_id, ubicacion_id, usuario_id, tipo, cantidad, motivo, referencia)
     VALUES (?, ?, ?, 'salida', ?, ?, ?)`,
    [productoId, ubicacionId ?? null, usuarioId ?? null, cantidad, motivo ?? null, referencia ?? null]
  );
}

/** Entrada de stock desde otra operación (una devolución). */
async function entradaEnTransaccion(conexion, { productoId, ubicacionId, cantidad, motivo, referencia, usuarioId }) {
  await conexion.execute(
    `INSERT INTO movimientos_inventario (producto_id, ubicacion_id, usuario_id, tipo, cantidad, motivo, referencia)
     VALUES (?, ?, ?, 'entrada', ?, ?, ?)`,
    [productoId, ubicacionId ?? null, usuarioId ?? null, cantidad, motivo ?? null, referencia ?? null]
  );
}

async function existenciasDeProducto(productoId) {
  return consultar(
    `SELECT ex.cantidad, ex.actualizado_en,
            ui.nombre AS ubicacion, ui.tipo AS ubicacion_tipo,
            s.nombre AS sede, l.codigo AS lote, l.fecha_vencimiento
       FROM existencias ex
       JOIN ubicaciones_inventario ui ON ui.id = ex.ubicacion_id
       LEFT JOIN sedes s ON s.id = ui.sede_id
       LEFT JOIN lotes l ON l.id = ex.lote_id
      WHERE ex.producto_id = ? AND ex.cantidad > 0
      ORDER BY ui.nombre`,
    [productoId]
  );
}

/* ------------------------------------------------------------------
   Proveedores, catálogos y compras
   ------------------------------------------------------------------ */

async function listarProveedores(incluirInactivos = false) {
  const filtro = incluirInactivos ? '' : 'WHERE activo = 1';
  return consultar(`SELECT * FROM proveedores ${filtro} ORDER BY nombre`);
}

async function crearProveedor(datos) {
  const resultado = await ejecutar(
    `INSERT INTO proveedores (nombre, nit, contacto, telefono, email, direccion, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.nombre,
      datos.nit ?? null,
      datos.contacto ?? null,
      datos.telefono ?? null,
      datos.email ?? null,
      datos.direccion ?? null,
      datos.activo === false ? 0 : 1,
    ]
  );
  return resultado.insertId;
}

async function actualizarProveedor(id, datos) {
  const resultado = await ejecutar(
    `UPDATE proveedores
        SET nombre = ?, nit = ?, contacto = ?, telefono = ?, email = ?, direccion = ?, activo = ?
      WHERE id = ?`,
    [
      datos.nombre,
      datos.nit ?? null,
      datos.contacto ?? null,
      datos.telefono ?? null,
      datos.email ?? null,
      datos.direccion ?? null,
      datos.activo === false ? 0 : 1,
      id,
    ]
  );
  return resultado.affectedRows > 0;
}

async function catalogos() {
  const [categorias, proveedores, ubicaciones] = await Promise.all([
    consultar('SELECT id, nombre, tipo FROM categorias_productos ORDER BY nombre'),
    consultar('SELECT id, nombre, nit, telefono FROM proveedores WHERE activo = 1 ORDER BY nombre'),
    consultar(
      `SELECT ui.id, ui.nombre, ui.tipo, ui.sede_id, s.nombre AS sede
         FROM ubicaciones_inventario ui
         LEFT JOIN sedes s ON s.id = ui.sede_id
        WHERE ui.activo = 1
        ORDER BY s.nombre, ui.nombre`
    ),
  ]);

  return { categorias, proveedores, ubicaciones };
}

async function listarCompras(limite = 50) {
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);
  return consultar(
    `SELECT c.*, pr.nombre AS proveedor, u.nombre AS usuario, s.nombre AS sede,
            (SELECT COUNT(*) FROM detalle_compras d WHERE d.compra_id = c.id) AS lineas
       FROM compras c
       JOIN proveedores pr  ON pr.id = c.proveedor_id
       LEFT JOIN usuarios u ON u.id = c.usuario_id
       LEFT JOIN sedes s    ON s.id = c.sede_id
      ORDER BY c.fecha DESC, c.id DESC
      LIMIT ${lim}`
  );
}

async function detalleCompra(id) {
  return consultar(
    `SELECT dc.*, p.nombre AS producto, p.unidad, l.codigo AS lote, l.fecha_vencimiento
       FROM detalle_compras dc
       JOIN productos p  ON p.id = dc.producto_id
       LEFT JOIN lotes l ON l.id = dc.lote_id
      WHERE dc.compra_id = ?
      ORDER BY dc.id`,
    [id]
  );
}

async function compraPorId(id) {
  return consultarUna(
    `SELECT c.*, pr.nombre AS proveedor, u.nombre AS usuario
       FROM compras c
       JOIN proveedores pr  ON pr.id = c.proveedor_id
       LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id = ?`,
    [id]
  );
}

/**
 * Registra la compra completa: cabecera, líneas, lotes y las entradas de
 * stock. Va en una transacción porque una compra a medias —con las líneas
 * escritas pero sin los movimientos— dejaría el inventario contando menos
 * unidades de las que llegaron a la bodega.
 */
async function crearCompra(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const fecha = datos.fecha || null;
    const anio = fecha ? Number(fecha.slice(0, 4)) : new Date().getFullYear();
    const numero = datos.numero || (await siguienteNumero(conexion, 'compras', anio));

    const [cabecera] = await conexion.execute(
      `INSERT INTO compras (proveedor_id, sede_id, usuario_id, numero, fecha, subtotal, impuestos, total, notas)
       VALUES (?, ?, ?, ?, COALESCE(?::date, CURRENT_DATE), ?, ?, ?, ?)
       RETURNING id`,
      [
        datos.proveedorId,
        datos.sedeId ?? null,
        usuarioId ?? null,
        numero,
        fecha,
        datos.subtotal,
        datos.impuestos ?? 0,
        datos.total,
        datos.notas ?? null,
      ]
    );
    const compraId = cabecera.insertId;

    for (const linea of datos.lineas) {
      let loteId = null;

      // Un mismo código de lote puede llegar en dos compras distintas; se
      // reutiliza la fila en vez de chocar contra el índice único.
      if (linea.lote) {
        const [lote] = await conexion.execute(
          `INSERT INTO lotes (producto_id, codigo, fecha_vencimiento, precio_compra)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (producto_id, codigo) DO UPDATE
             SET fecha_vencimiento = COALESCE(EXCLUDED.fecha_vencimiento, lotes.fecha_vencimiento),
                 precio_compra = EXCLUDED.precio_compra
           RETURNING id`,
          [linea.productoId, linea.lote, linea.fechaVencimiento ?? null, linea.precioUnit ?? 0]
        );
        loteId = lote.insertId;
      }

      await conexion.execute(
        `INSERT INTO detalle_compras (compra_id, producto_id, lote_id, cantidad, precio_unit, total_linea)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [compraId, linea.productoId, loteId, linea.cantidad, linea.precioUnit ?? 0, linea.totalLinea]
      );

      await conexion.execute(
        `INSERT INTO movimientos_inventario (producto_id, ubicacion_id, lote_id, usuario_id,
                                             tipo, cantidad, motivo, referencia)
         VALUES (?, ?, ?, ?, 'entrada', ?, 'Compra a proveedor', ?)`,
        [linea.productoId, datos.ubicacionId ?? null, loteId, usuarioId ?? null, linea.cantidad, numero]
      );

      // El precio de compra del producto se refresca con el de la última
      // entrada: es el que usa el margen que se ve en el listado.
      if (linea.precioUnit) {
        await conexion.execute('UPDATE productos SET precio_compra = ? WHERE id = ?', [
          linea.precioUnit,
          linea.productoId,
        ]);
      }
    }

    return compraId;
  }, usuarioId);
}

/* ------------------------------------------------------------------
   Alertas
   ------------------------------------------------------------------ */

async function alertas(diasVencimiento = 60) {
  const [stockBajo, porVencer, contadores] = await Promise.all([
    consultar(
      `SELECT p.id, p.nombre, p.sku, p.cantidad, p.stock_minimo, p.unidad, cp.nombre AS categoria
         FROM productos p
         JOIN categorias_productos cp ON cp.id = p.categoria_id
        WHERE p.activo = 1 AND p.cantidad <= p.stock_minimo
        ORDER BY (p.cantidad - p.stock_minimo), p.nombre`
    ),
    consultar(
      `SELECT l.id, l.codigo, l.fecha_vencimiento, p.id AS producto_id, p.nombre AS producto,
              (l.fecha_vencimiento - CURRENT_DATE) AS dias,
              COALESCE((SELECT SUM(ex.cantidad) FROM existencias ex WHERE ex.lote_id = l.id), 0) AS cantidad
         FROM lotes l
         JOIN productos p ON p.id = l.producto_id
        WHERE l.fecha_vencimiento IS NOT NULL
          AND l.fecha_vencimiento <= CURRENT_DATE + ?::int
          AND p.activo = 1
        ORDER BY l.fecha_vencimiento`,
      [diasVencimiento]
    ),
    consultarUna(
      `SELECT
          COUNT(*) FILTER (WHERE activo = 1)                          AS productos,
          COUNT(*) FILTER (WHERE activo = 1 AND cantidad <= stock_minimo) AS bajos,
          COUNT(*) FILTER (WHERE activo = 1 AND cantidad = 0)          AS agotados,
          COALESCE(SUM(cantidad * precio_compra) FILTER (WHERE activo = 1), 0) AS valor_inventario
         FROM productos`
    ),
  ]);

  return { stockBajo, porVencer, contadores };
}

module.exports = {
  listarProductos,
  productoPorId,
  crearProducto,
  actualizarProducto,
  actualizarImagen,
  desactivarProducto,
  listarMovimientos,
  registrarMovimiento,
  salidaEnTransaccion,
  entradaEnTransaccion,
  existenciasDeProducto,
  listarProveedores,
  crearProveedor,
  actualizarProveedor,
  catalogos,
  listarCompras,
  detalleCompra,
  compraPorId,
  crearCompra,
  alertas,
};
