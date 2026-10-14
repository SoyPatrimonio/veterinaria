'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');
const { siguienteNumero } = require('../utils/consecutivos');

/**
 * Tienda en línea y domicilios.
 *
 * El artículo no repite stock ni precio: apunta al producto del inventario y
 * añade lo propio de la venta en línea. Así vender por la web y vender en el
 * mostrador descuentan del mismo sitio y no hay dos verdades sobre cuántas
 * unidades quedan.
 */

/* ------------------------------------------------------------------
   Catálogo
   ------------------------------------------------------------------ */

function slugificar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 150);
}

async function categorias({ soloActivas = true } = {}) {
  return consultar(
    `SELECT c.*, COUNT(a.id) FILTER (WHERE a.activo = 1) AS articulos
       FROM categorias_tienda c
       LEFT JOIN articulos_tienda a ON a.categoria_id = c.id
      ${soloActivas ? 'WHERE c.activo = 1' : ''}
      GROUP BY c.id
      ORDER BY c.orden, c.nombre`
  );
}

async function crearCategoria(datos) {
  const resultado = await ejecutar(
    `INSERT INTO categorias_tienda (nombre, slug, icono, orden, activo)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [datos.nombre, slugificar(datos.nombre), datos.icono ?? null, datos.orden, datos.activo ? 1 : 0]
  );
  return resultado.insertId;
}

// El precio de venta y las existencias salen del inventario; el artículo solo
// puede sobreescribir el precio con una oferta.
const SELECCION_ARTICULO = `
  a.id, a.producto_id, a.categoria_id, a.nombre, a.slug, a.descripcion, a.imagen,
  a.precio_antes, a.requiere_receta, a.destacado, a.activo,
  COALESCE(a.precio, p.precio_venta) AS precio,
  p.cantidad AS existencias, p.unidad, p.sku,
  (p.cantidad > 0) AS disponible,
  ct.nombre AS categoria, ct.slug AS categoria_slug`;

async function articulos({ categoriaId = null, busqueda = null, destacados = false, soloActivos = true, limite = 60 } = {}) {
  const condiciones = [];
  const params = [];

  if (soloActivos) condiciones.push('a.activo = 1 AND p.activo = 1');
  if (categoriaId) { condiciones.push('a.categoria_id = ?'); params.push(categoriaId); }
  if (destacados) condiciones.push('a.destacado = 1');
  if (busqueda) {
    condiciones.push('(a.nombre ILIKE ? OR a.descripcion ILIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 60, 1), 200);

  return consultar(
    `SELECT ${SELECCION_ARTICULO}
       FROM articulos_tienda a
       JOIN productos p        ON p.id = a.producto_id
       JOIN categorias_tienda ct ON ct.id = a.categoria_id
       ${where}
      ORDER BY a.destacado DESC, a.nombre
      LIMIT ${lim}`,
    params
  );
}

async function articuloPorId(id) {
  return consultarUna(
    `SELECT ${SELECCION_ARTICULO}
       FROM articulos_tienda a
       JOIN productos p        ON p.id = a.producto_id
       JOIN categorias_tienda ct ON ct.id = a.categoria_id
      WHERE a.id = ?`,
    [id]
  );
}

async function crearArticulo(datos) {
  const resultado = await ejecutar(
    `INSERT INTO articulos_tienda
       (producto_id, categoria_id, nombre, slug, descripcion, imagen, precio, precio_antes,
        requiere_receta, destacado, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.productoId,
      datos.categoriaId,
      datos.nombre,
      slugificar(datos.nombre),
      datos.descripcion ?? null,
      datos.imagen ?? null,
      datos.precio ?? null,
      datos.precioAntes ?? null,
      datos.requiereReceta ? 1 : 0,
      datos.destacado ? 1 : 0,
      datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

async function actualizarArticulo(id, datos) {
  const resultado = await ejecutar(
    `UPDATE articulos_tienda
        SET categoria_id = ?, nombre = ?, descripcion = ?, imagen = ?, precio = ?,
            precio_antes = ?, requiere_receta = ?, destacado = ?, activo = ?
      WHERE id = ?`,
    [
      datos.categoriaId,
      datos.nombre,
      datos.descripcion ?? null,
      datos.imagen ?? null,
      datos.precio ?? null,
      datos.precioAntes ?? null,
      datos.requiereReceta ? 1 : 0,
      datos.destacado ? 1 : 0,
      datos.activo ? 1 : 0,
      id,
    ]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Cupones
   ------------------------------------------------------------------ */

async function listarCupones() {
  return consultar('SELECT * FROM cupones ORDER BY activo DESC, codigo');
}

async function crearCupon(datos) {
  const resultado = await ejecutar(
    `INSERT INTO cupones (codigo, descripcion, tipo, valor, minimo_compra, usos_maximos, desde, hasta, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.codigo,
      datos.descripcion ?? null,
      datos.tipo,
      datos.valor,
      datos.minimoCompra,
      datos.usosMaximos ?? null,
      datos.desde ?? null,
      datos.hasta ?? null,
      datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

/** Cupón vigente: activo, dentro de fechas y con usos disponibles. */
async function cuponVigente(codigo) {
  return consultarUna(
    `SELECT * FROM cupones
      WHERE codigo = ? AND activo = 1
        AND (desde IS NULL OR desde <= CURRENT_DATE)
        AND (hasta IS NULL OR hasta >= CURRENT_DATE)
        AND (usos_maximos IS NULL OR usos < usos_maximos)`,
    [codigo]
  );
}

/* ------------------------------------------------------------------
   Carrito
   ------------------------------------------------------------------ */

async function carritoDe(clienteId, { crear = true } = {}) {
  let carrito = await consultarUna(
    `SELECT * FROM carritos WHERE cliente_id = ? AND estado = 'abierto'`,
    [clienteId]
  );

  if (!carrito && crear) {
    await ejecutar('INSERT INTO carritos (cliente_id) VALUES (?)', [clienteId]);
    carrito = await consultarUna(
      `SELECT * FROM carritos WHERE cliente_id = ? AND estado = 'abierto'`,
      [clienteId]
    );
  }

  return carrito;
}

async function itemsCarrito(carritoId) {
  return consultar(
    `SELECT ci.id, ci.articulo_id, ci.cantidad, ci.precio_unit,
            (ci.cantidad * ci.precio_unit) AS total_linea,
            a.nombre, a.imagen, a.requiere_receta,
            p.cantidad AS existencias, p.id AS producto_id
       FROM carrito_items ci
       JOIN articulos_tienda a ON a.id = ci.articulo_id
       JOIN productos p        ON p.id = a.producto_id
      WHERE ci.carrito_id = ?
      ORDER BY ci.id`,
    [carritoId]
  );
}

/** Calcula el resumen del carrito con el cupón aplicado, si lo hay. */
async function resumenCarrito(carrito) {
  const items = await itemsCarrito(carrito.id);
  const subtotal = items.reduce((suma, i) => suma + Number(i.total_linea), 0);

  let cupon = null;
  let descuento = 0;

  if (carrito.cupon_id) {
    cupon = await consultarUna('SELECT * FROM cupones WHERE id = ?', [carrito.cupon_id]);
    if (cupon && subtotal >= Number(cupon.minimo_compra)) {
      if (cupon.tipo === 'porcentaje') descuento = Math.round((subtotal * Number(cupon.valor)) / 100);
      else if (cupon.tipo === 'valor') descuento = Math.min(Number(cupon.valor), subtotal);
    }
  }

  return {
    items,
    subtotal,
    descuento,
    total: Math.max(subtotal - descuento, 0),
    cupon,
    requiereReceta: items.some((i) => i.requiere_receta === 1),
    // Un artículo puede quedarse sin stock mientras el carrito espera.
    sinStock: items.filter((i) => i.cantidad > i.existencias),
  };
}

async function ponerEnCarrito(carritoId, articuloId, cantidad, precio) {
  await ejecutar(
    `INSERT INTO carrito_items (carrito_id, articulo_id, cantidad, precio_unit)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (carrito_id, articulo_id)
     DO UPDATE SET cantidad = carrito_items.cantidad + EXCLUDED.cantidad,
                   precio_unit = EXCLUDED.precio_unit`,
    [carritoId, articuloId, cantidad, precio]
  );
  await ejecutar('UPDATE carritos SET actualizado_en = LOCALTIMESTAMP WHERE id = ?', [carritoId]);
}

async function cambiarCantidad(carritoId, articuloId, cantidad) {
  if (cantidad <= 0) {
    const resultado = await ejecutar(
      'DELETE FROM carrito_items WHERE carrito_id = ? AND articulo_id = ?',
      [carritoId, articuloId]
    );
    return resultado.affectedRows > 0;
  }

  const resultado = await ejecutar(
    'UPDATE carrito_items SET cantidad = ? WHERE carrito_id = ? AND articulo_id = ?',
    [cantidad, carritoId, articuloId]
  );
  return resultado.affectedRows > 0;
}

async function aplicarCupon(carritoId, cuponId) {
  await ejecutar('UPDATE carritos SET cupon_id = ? WHERE id = ?', [cuponId, carritoId]);
}

async function vaciarCarrito(carritoId) {
  await ejecutar('DELETE FROM carrito_items WHERE carrito_id = ?', [carritoId]);
  await ejecutar('UPDATE carritos SET cupon_id = NULL WHERE id = ?', [carritoId]);
}

/* ------------------------------------------------------------------
   Pedidos
   ------------------------------------------------------------------ */

// El nombre y el contacto salen de la cuenta cuando la hay, y de los datos
// que dejó el comprador cuando el pedido se hizo sin cuenta. Quien atiende el
// pedido no tiene por qué saber cuál de los dos casos es.
const SELECCION_PEDIDO = `
  pe.*,
  COALESCE(u.nombre,   pe.invitado_nombre)   AS cliente_nombre,
  COALESCE(u.telefono, pe.invitado_telefono) AS cliente_telefono,
  COALESCE(u.email,    pe.invitado_email)    AS cliente_email,
  (pe.cliente_id IS NULL) AS sin_cuenta,
  s.nombre AS sede_nombre,
  d.id AS domicilio_id, d.estado AS domicilio_estado, d.direccion, d.barrio, d.ciudad,
  d.hora_estimada, d.entregado_en, d.repartidor_id, rp.nombre AS repartidor_nombre,
  (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = pe.id) AS lineas`;

// LEFT JOIN y no JOIN: con el JOIN de antes, un pedido sin cuenta no aparecía
// en ningún listado —ni en el de administración— y nadie lo habría despachado.
const DESDE_PEDIDO = `
  FROM pedidos pe
  LEFT JOIN clientes cl ON cl.id = pe.cliente_id
  LEFT JOIN usuarios u  ON u.id = cl.usuario_id
  LEFT JOIN sedes s      ON s.id = pe.sede_id
  LEFT JOIN domicilios d ON d.pedido_id = pe.id
  LEFT JOIN repartidores rp ON rp.id = d.repartidor_id`;

async function listarPedidos({ clienteId = null, estado = null, estadoPago = null, entrega = null, desde = null, hasta = null, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (clienteId) { condiciones.push('pe.cliente_id = ?'); params.push(clienteId); }
  if (estado) { condiciones.push('pe.estado = ?'); params.push(estado); }
  if (estadoPago) { condiciones.push('pe.estado_pago = ?'); params.push(estadoPago); }
  if (entrega) { condiciones.push('pe.entrega = ?'); params.push(entrega); }
  if (desde) { condiciones.push('pe.creado_en >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('pe.creado_en <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT ${SELECCION_PEDIDO} ${DESDE_PEDIDO} ${where} ORDER BY pe.creado_en DESC LIMIT ${lim}`,
    params
  );
}

async function pedidoPorId(id) {
  return consultarUna(`SELECT ${SELECCION_PEDIDO} ${DESDE_PEDIDO} WHERE pe.id = ?`, [id]);
}

async function itemsPedido(pedidoId) {
  return consultar('SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id', [pedidoId]);
}

async function historialPedido(pedidoId) {
  return consultar(
    `SELECT ph.*, u.nombre AS usuario_nombre
       FROM pedido_historial ph
       LEFT JOIN usuarios u ON u.id = ph.usuario_id
      WHERE ph.pedido_id = ?
      ORDER BY ph.creado_en`,
    [pedidoId]
  );
}

/**
 * Convierte el carrito en pedido.
 *
 * Todo en una transacción y con SELECT … FOR UPDATE sobre los productos: dos
 * clientes comprando la última unidad a la vez tienen que salir uno con el
 * pedido y otro con el aviso de que se agotó, no los dos con el pedido hecho.
 *
 * El stock NO se descuenta aquí: se descuenta al confirmar el pedido, que es
 * cuando la clínica ya sabe que va a despacharlo. Un carrito abandonado no
 * puede dejar producto bloqueado.
 */
async function crearPedido(carrito, resumen, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    for (const item of resumen.items) {
      const producto = await conexion.consultarUna(
        'SELECT id, nombre, cantidad FROM productos WHERE id = ? FOR UPDATE',
        [item.producto_id]
      );
      if (!producto || producto.cantidad < item.cantidad) {
        throw new Error(`Nos quedamos sin "${item.nombre}". Ajusta el carrito e inténtalo de nuevo.`);
      }
    }

    const numero = await siguienteNumero(conexion, 'pedidos');

    const [pedido] = await conexion.execute(
      `INSERT INTO pedidos
         (numero, cliente_id, sede_id, cupon_id, entrega, metodo_pago, subtotal, descuento,
          impuestos, envio, total, receta_url, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
       RETURNING id`,
      [
        numero,
        carrito.cliente_id,
        datos.sedeId ?? null,
        carrito.cupon_id ?? null,
        datos.entrega,
        datos.metodoPago ?? 'efectivo',
        resumen.subtotal,
        resumen.descuento,
        datos.envio ?? 0,
        Math.max(resumen.total + (datos.envio ?? 0), 0),
        datos.recetaUrl ?? null,
        datos.notas ?? null,
      ]
    );

    for (const item of resumen.items) {
      await conexion.execute(
        `INSERT INTO pedido_items (pedido_id, articulo_id, producto_id, descripcion, cantidad, precio_unit, total_linea)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          pedido.insertId,
          item.articulo_id,
          item.producto_id,
          item.nombre,
          item.cantidad,
          item.precio_unit,
          item.total_linea,
        ]
      );
    }

    if (datos.entrega === 'domicilio') {
      await conexion.execute(
        `INSERT INTO domicilios (pedido_id, direccion, barrio, ciudad, latitud, longitud, indicaciones, telefono)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pedido.insertId,
          datos.direccion,
          datos.barrio ?? null,
          datos.ciudad ?? null,
          datos.latitud ?? null,
          datos.longitud ?? null,
          datos.indicaciones ?? null,
          datos.telefono ?? null,
        ]
      );
    }

    if (carrito.cupon_id) {
      await conexion.execute('UPDATE cupones SET usos = usos + 1 WHERE id = ?', [carrito.cupon_id]);
    }

    await conexion.execute(`UPDATE carritos SET estado = 'convertido' WHERE id = ?`, [carrito.id]);

    return { id: pedido.insertId, numero };
  }, usuarioId);
}

/**
 * Crea un pedido con los artículos que vienen en la petición.
 *
 * Es el camino de la tienda de la página pública: ahí el carrito vive en el
 * navegador y quien compra puede no tener cuenta, así que no hay un carrito en
 * la base que convertir. Lo demás es igual que en crearPedido: bloqueo de los
 * productos con FOR UPDATE para que dos personas no se lleven la misma última
 * unidad, y el stock se descuenta al confirmar, no al pedir.
 *
 * `lineas` ya viene con el precio puesto por el servidor. El precio NUNCA sale
 * del navegador: si viniera de ahí, cualquiera compraría una cama por mil pesos.
 */
async function crearPedidoDirecto(datos, lineas, usuarioId) {
  return enTransaccion(async (conexion) => {
    for (const linea of lineas) {
      const producto = await conexion.consultarUna(
        'SELECT id, nombre, cantidad FROM productos WHERE id = ? FOR UPDATE',
        [linea.producto_id]
      );
      if (!producto || producto.cantidad < linea.cantidad) {
        throw new Error(`Nos quedamos sin "${linea.nombre}". Ajusta el carrito e inténtalo de nuevo.`);
      }
    }

    const numero = await siguienteNumero(conexion, 'pedidos');
    const subtotal = lineas.reduce((suma, l) => suma + l.total_linea, 0);

    const [pedido] = await conexion.execute(
      `INSERT INTO pedidos
         (numero, cliente_id, invitado_nombre, invitado_email, invitado_telefono,
          sede_id, entrega, metodo_pago, subtotal, descuento, impuestos, envio, total, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
       RETURNING id`,
      [
        numero,
        datos.clienteId ?? null,
        datos.clienteId ? null : datos.nombre,
        datos.clienteId ? null : (datos.email ?? null),
        datos.clienteId ? null : datos.telefono,
        datos.sedeId ?? null,
        datos.entrega,
        datos.metodoPago,
        subtotal,
        subtotal,
        datos.notas ?? null,
      ]
    );

    for (const linea of lineas) {
      await conexion.execute(
        `INSERT INTO pedido_items (pedido_id, articulo_id, producto_id, descripcion, cantidad, precio_unit, total_linea)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pedido.insertId, linea.articulo_id, linea.producto_id, linea.nombre,
          linea.cantidad, linea.precio_unit, linea.total_linea]
      );
    }

    if (datos.entrega === 'domicilio') {
      await conexion.execute(
        `INSERT INTO domicilios (pedido_id, direccion, barrio, ciudad, indicaciones, telefono)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pedido.insertId, datos.direccion, datos.barrio ?? null, datos.ciudad ?? null,
          datos.indicaciones ?? null, datos.telefono ?? null]
      );
    }

    return { id: pedido.insertId, numero, subtotal };
  }, usuarioId);
}

/**
 * Cambia el estado del pedido y mueve el inventario cuando toca.
 *
 * Confirmar descuenta; cancelar un pedido ya confirmado devuelve. El
 * movimiento va por movimientos_inventario, como todo lo demás, para que el
 * kardex cuente también las ventas en línea.
 */
async function cambiarEstadoPedido(pedido, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const descontaba = ['confirmado', 'preparando', 'enviado', 'entregado'].includes(pedido.estado);
    const descuenta = ['confirmado', 'preparando', 'enviado', 'entregado'].includes(datos.estado);

    if (!descontaba && descuenta) {
      const items = await conexion.consultar('SELECT * FROM pedido_items WHERE pedido_id = ?', [pedido.id]);
      for (const item of items) {
        if (!item.producto_id) continue;
        const producto = await conexion.consultarUna(
          'SELECT id, nombre, cantidad FROM productos WHERE id = ? FOR UPDATE',
          [item.producto_id]
        );
        if (!producto || producto.cantidad < item.cantidad) {
          throw new Error(`No hay existencias suficientes de "${item.descripcion}".`);
        }
        await conexion.execute(
          `INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo, cantidad, motivo, referencia)
           VALUES (?, ?, 'salida', ?, 'Pedido de la tienda', ?)`,
          [item.producto_id, usuarioId ?? null, item.cantidad, pedido.numero]
        );
      }
    } else if (descontaba && datos.estado === 'cancelado') {
      const items = await conexion.consultar('SELECT * FROM pedido_items WHERE pedido_id = ?', [pedido.id]);
      for (const item of items) {
        if (!item.producto_id) continue;
        await conexion.execute(
          `INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo, cantidad, motivo, referencia)
           VALUES (?, ?, 'entrada', ?, 'Pedido cancelado', ?)`,
          [item.producto_id, usuarioId ?? null, item.cantidad, pedido.numero]
        );
      }
    }

    // El disparador trg_pedidos_historial deja el renglón de la bitácora.
    await conexion.execute('UPDATE pedidos SET estado = ? WHERE id = ?', [datos.estado, pedido.id]);

    if (datos.nota) {
      await conexion.execute(
        `UPDATE pedido_historial SET nota = ?
          WHERE id = (SELECT MAX(id) FROM pedido_historial WHERE pedido_id = ?)`,
        [datos.nota, pedido.id]
      );
    }

    return true;
  }, usuarioId);
}

async function marcarPagado(pedidoId, estado = 'pagado') {
  const resultado = await ejecutar('UPDATE pedidos SET estado_pago = ? WHERE id = ?', [estado, pedidoId]);
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Domicilios
   ------------------------------------------------------------------ */

async function repartidores({ soloActivos = true } = {}) {
  return consultar(
    `SELECT r.*, s.nombre AS sede_nombre,
            (SELECT COUNT(*) FROM domicilios d
              WHERE d.repartidor_id = r.id AND d.estado IN ('asignado','recogido','en_ruta')) AS en_ruta
       FROM repartidores r
       LEFT JOIN sedes s ON s.id = r.sede_id
      ${soloActivos ? 'WHERE r.activo = 1' : ''}
      ORDER BY r.nombre`
  );
}

async function crearRepartidor(datos) {
  const resultado = await ejecutar(
    `INSERT INTO repartidores (usuario_id, nombre, documento, telefono, vehiculo, placa, sede_id, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.usuarioId ?? null,
      datos.nombre,
      datos.documento ?? null,
      datos.telefono,
      datos.vehiculo,
      datos.placa ?? null,
      datos.sedeId ?? null,
      datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

async function domicilioPorId(id) {
  return consultarUna(
    `SELECT d.*, pe.numero AS pedido_numero, pe.cliente_id, pe.estado AS pedido_estado,
            r.nombre AS repartidor_nombre, r.telefono AS repartidor_telefono, r.usuario_id AS repartidor_usuario_id
       FROM domicilios d
       JOIN pedidos pe ON pe.id = d.pedido_id
       LEFT JOIN repartidores r ON r.id = d.repartidor_id
      WHERE d.id = ?`,
    [id]
  );
}

async function domicilioDePedido(pedidoId) {
  return consultarUna('SELECT * FROM domicilios WHERE pedido_id = ?', [pedidoId]);
}

async function asignarDomicilio(domicilioId, datos) {
  const resultado = await ejecutar(
    `UPDATE domicilios
        SET repartidor_id = ?, hora_estimada = COALESCE(?, hora_estimada), estado = 'asignado'
      WHERE id = ?`,
    [datos.repartidorId, datos.horaEstimada ?? null, domicilioId]
  );
  return resultado.affectedRows > 0;
}

/** Cada cambio de estado deja un punto en la ruta, con su hora y coordenadas. */
async function actualizarDomicilio(domicilio, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    await conexion.execute(
      `UPDATE domicilios
          SET estado = ?,
              recibido_por = COALESCE(?, recibido_por),
              evidencia = COALESCE(?, evidencia),
              salida_en    = CASE WHEN ? = 'en_ruta'   THEN COALESCE(salida_en, LOCALTIMESTAMP) ELSE salida_en END,
              entregado_en = CASE WHEN ? = 'entregado' THEN COALESCE(entregado_en, LOCALTIMESTAMP) ELSE entregado_en END
        WHERE id = ?`,
      [
        datos.estado,
        datos.recibidoPor ?? null,
        datos.evidencia ?? null,
        datos.estado,
        datos.estado,
        domicilio.id,
      ]
    );

    await conexion.execute(
      `INSERT INTO seguimiento_domicilio (domicilio_id, estado, latitud, longitud, nota)
       VALUES (?, ?, ?, ?, ?)`,
      [domicilio.id, datos.estado, datos.latitud ?? null, datos.longitud ?? null, datos.nota ?? null]
    );

    // Entregar el domicilio cierra también el pedido: son la misma cosa vista
    // desde la calle y desde la tienda.
    if (datos.estado === 'entregado') {
      await conexion.execute(
        `UPDATE pedidos SET estado = 'entregado' WHERE id = ? AND estado <> 'cancelado'`,
        [domicilio.pedido_id]
      );
    }

    return true;
  }, usuarioId);
}

async function seguimientoDe(domicilioId) {
  return consultar(
    'SELECT * FROM seguimiento_domicilio WHERE domicilio_id = ? ORDER BY fecha',
    [domicilioId]
  );
}

module.exports = {
  categorias,
  crearCategoria,
  articulos,
  articuloPorId,
  crearArticulo,
  actualizarArticulo,
  listarCupones,
  crearCupon,
  cuponVigente,
  carritoDe,
  itemsCarrito,
  resumenCarrito,
  ponerEnCarrito,
  cambiarCantidad,
  aplicarCupon,
  vaciarCarrito,
  listarPedidos,
  pedidoPorId,
  itemsPedido,
  historialPedido,
  crearPedido,
  crearPedidoDirecto,
  cambiarEstadoPedido,
  marcarPagado,
  repartidores,
  crearRepartidor,
  domicilioPorId,
  domicilioDePedido,
  asignarDomicilio,
  actualizarDomicilio,
  seguimientoDe,
};
