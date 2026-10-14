'use strict';

const { consultar, consultarUna, enTransaccion } = require('../config/database');
const { siguienteNumero } = require('../utils/consecutivos');

/**
 * Facturación: facturas, líneas, pagos y devoluciones.
 *
 * El estado de la factura (pendiente / parcial / pagada) no se escribe desde
 * aquí: lo recalcula el disparador trg_pagos_factura cada vez que se toca un
 * pago. Así no hay forma de que un pago quede registrado y la factura siga
 * diciendo que no se ha cobrado nada.
 */

const SELECT_FACTURA = `
  SELECT f.id, f.numero, f.sede_id, f.cliente_id, f.cita_id, f.consulta_id, f.usuario_id,
         f.fecha, f.subtotal, f.descuento, f.impuestos, f.total, f.pagado, f.estado,
         f.observaciones, f.creado_en,
         (f.total - f.pagado) AS saldo,
         uc.nombre AS cliente_nombre, uc.email AS cliente_email, uc.telefono AS cliente_telefono,
         u.nombre AS emitida_por,
         s.nombre AS sede_nombre,
         m.nombre AS mascota_nombre
    FROM facturas f
    JOIN clientes cl      ON cl.id = f.cliente_id
    JOIN usuarios uc      ON uc.id = cl.usuario_id
    LEFT JOIN usuarios u  ON u.id = f.usuario_id
    LEFT JOIN sedes s     ON s.id = f.sede_id
    LEFT JOIN citas c     ON c.id = f.cita_id
    LEFT JOIN mascotas m  ON m.id = c.mascota_id`;

async function listar({ estado, clienteId, desde, hasta, busqueda, limite = 100 }) {
  const condiciones = [];
  const params = [];

  if (estado) { condiciones.push('f.estado = ?'); params.push(estado); }
  if (clienteId) { condiciones.push('f.cliente_id = ?'); params.push(clienteId); }
  if (desde) { condiciones.push('f.fecha >= ?::date'); params.push(desde); }
  if (hasta) { condiciones.push('f.fecha <= ?::date'); params.push(hasta); }
  if (busqueda) {
    condiciones.push('(f.numero ILIKE ? OR uc.nombre ILIKE ?)');
    const patron = `%${busqueda}%`;
    params.push(patron, patron);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 200);

  return consultar(`${SELECT_FACTURA} ${where} ORDER BY f.fecha DESC, f.id DESC LIMIT ${lim}`, params);
}

async function porId(id) {
  return consultarUna(`${SELECT_FACTURA} WHERE f.id = ?`, [id]);
}

async function detalle(id) {
  const [lineas, pagos, devoluciones] = await Promise.all([
    consultar(
      `SELECT df.*, s.nombre AS servicio, p.nombre AS producto, te.nombre AS examen
         FROM detalle_facturas df
         LEFT JOIN servicios s     ON s.id = df.servicio_id
         LEFT JOIN productos p     ON p.id = df.producto_id
         LEFT JOIN examenes e      ON e.id = df.examen_id
         LEFT JOIN tipos_examen te ON te.id = e.tipo_examen_id
        WHERE df.factura_id = ?
        ORDER BY df.id`,
      [id]
    ),
    consultar(
      `SELECT pg.*, u.nombre AS registrado_por
         FROM pagos pg
         LEFT JOIN usuarios u ON u.id = pg.usuario_id
        WHERE pg.factura_id = ?
        ORDER BY pg.fecha`,
      [id]
    ),
    consultar(
      `SELECT d.*, u.nombre AS registrada_por
         FROM devoluciones d
         LEFT JOIN usuarios u ON u.id = d.usuario_id
        WHERE d.factura_id = ?
        ORDER BY d.fecha DESC`,
      [id]
    ),
  ]);

  return { lineas, pagos, devoluciones };
}

/**
 * Emite la factura y descuenta del inventario lo que se haya vendido, en una
 * sola transacción: si el stock no alcanza no debe quedar una factura cobrando
 * un producto que no salió de la bodega.
 */
async function crear(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const numero = await siguienteNumero(conexion, 'facturas');

    const [cabecera] = await conexion.execute(
      `INSERT INTO facturas (numero, sede_id, cliente_id, cita_id, consulta_id, usuario_id,
                             subtotal, descuento, impuestos, total, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        numero,
        datos.sedeId ?? null,
        datos.clienteId,
        datos.citaId ?? null,
        datos.consultaId ?? null,
        usuarioId ?? null,
        datos.subtotal,
        datos.descuento,
        datos.impuestos,
        datos.total,
        datos.observaciones ?? null,
      ]
    );
    const facturaId = cabecera.insertId;

    for (const linea of datos.lineas) {
      await conexion.execute(
        `INSERT INTO detalle_facturas (factura_id, servicio_id, producto_id, examen_id,
                                       descripcion, cantidad, precio_unit, descuento, impuesto, total_linea)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          facturaId,
          linea.servicioId ?? null,
          linea.productoId ?? null,
          linea.examenId ?? null,
          linea.descripcion,
          linea.cantidad,
          linea.precioUnit,
          linea.descuento,
          linea.impuesto,
          linea.totalLinea,
        ]
      );

      // Vender un producto lo saca del inventario. La cantidad se redondea
      // hacia arriba porque el stock son unidades enteras y media caja de
      // gasas que salió de la bodega ya no está.
      if (linea.productoId) {
        await conexion.execute(
          `INSERT INTO movimientos_inventario (producto_id, ubicacion_id, usuario_id,
                                               tipo, cantidad, motivo, referencia)
           VALUES (?, ?, ?, 'salida', ?, 'Venta facturada', ?)`,
          [
            linea.productoId,
            datos.ubicacionId ?? null,
            usuarioId ?? null,
            Math.ceil(Number(linea.cantidad)),
            numero,
          ]
        );
      }
    }

    return facturaId;
  }, usuarioId);
}

async function registrarPago(facturaId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `INSERT INTO pagos (factura_id, usuario_id, metodo, valor, referencia)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`,
      [facturaId, usuarioId ?? null, datos.metodo, datos.valor, datos.referencia ?? null]
    );
    return resultado.insertId;
  }, usuarioId);
}

async function anularPago(pagoId, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `UPDATE pagos SET estado = 'anulado' WHERE id = ? AND estado = 'registrado'`,
      [pagoId]
    );
    return resultado.affectedRows > 0;
  }, usuarioId);
}

/**
 * Anula la factura y devuelve al inventario los productos que llevaba: la
 * venta no ocurrió, así que la mercancía nunca salió de la bodega.
 */
async function anular(facturaId, motivo, usuarioId) {
  return enTransaccion(async (conexion) => {
    const lineas = await conexion.consultar(
      'SELECT producto_id, cantidad FROM detalle_facturas WHERE factura_id = ? AND producto_id IS NOT NULL',
      [facturaId]
    );

    const factura = await conexion.consultarUna('SELECT numero FROM facturas WHERE id = ?', [facturaId]);

    for (const linea of lineas) {
      await conexion.execute(
        `INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo, cantidad, motivo, referencia)
         VALUES (?, ?, 'entrada', ?, 'Anulación de factura', ?)`,
        [linea.producto_id, usuarioId ?? null, Math.ceil(Number(linea.cantidad)), factura.numero]
      );
    }

    const [resultado] = await conexion.execute(
      `UPDATE facturas
          SET estado = 'anulada',
              observaciones = LEFT(COALESCE(observaciones || ' · ', '') || ?, 255)
        WHERE id = ? AND estado <> 'anulada'`,
      [`Anulada: ${motivo}`, facturaId]
    );

    return resultado.affectedRows > 0;
  }, usuarioId);
}

async function crearDevolucion(facturaId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const numero = await siguienteNumero(conexion, 'devoluciones');
    const total = datos.lineas.reduce((suma, linea) => suma + Number(linea.valor || 0), 0);

    const [cabecera] = await conexion.execute(
      `INSERT INTO devoluciones (factura_id, usuario_id, numero, motivo, total)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`,
      [facturaId, usuarioId ?? null, numero, datos.motivo, total]
    );

    for (const linea of datos.lineas) {
      await conexion.execute(
        `INSERT INTO detalle_devoluciones (devolucion_id, detalle_id, descripcion, cantidad, valor, reingresa_stock)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          cabecera.insertId,
          linea.detalleId ?? null,
          linea.descripcion,
          linea.cantidad,
          linea.valor,
          linea.reingresaStock ? 1 : 0,
        ]
      );

      // Solo vuelve al inventario lo que se puede volver a vender, y solo si
      // la línea original era de un producto: un servicio devuelto no repone
      // nada en la bodega.
      if (linea.reingresaStock && linea.detalleId) {
        const original = await conexion.consultarUna(
          'SELECT producto_id FROM detalle_facturas WHERE id = ?',
          [linea.detalleId]
        );
        if (original && original.producto_id) {
          await conexion.execute(
            `INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo, cantidad, motivo, referencia)
             VALUES (?, ?, 'entrada', ?, 'Devolución de cliente', ?)`,
            [original.producto_id, usuarioId ?? null, Math.ceil(Number(linea.cantidad)), numero]
          );
        }
      }
    }

    return cabecera.insertId;
  }, usuarioId);
}

/** Contadores de la cartera para el panel de administración. */
async function resumen() {
  return consultarUna(
    `SELECT
        COUNT(*) FILTER (WHERE estado = 'pendiente')                       AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'parcial')                         AS parciales,
        COUNT(*) FILTER (WHERE estado = 'pagada')                          AS pagadas,
        COUNT(*) FILTER (WHERE fecha = CURRENT_DATE AND estado <> 'anulada') AS hoy,
        COALESCE(SUM(total - pagado) FILTER (WHERE estado IN ('pendiente','parcial')), 0) AS por_cobrar,
        COALESCE(SUM(pagado) FILTER (WHERE estado <> 'anulada'
                                       AND fecha >= date_trunc('month', CURRENT_DATE)), 0) AS cobrado_mes
       FROM facturas`
  );
}

/** Facturas de un cliente pendientes de pago, para avisarle. */
async function pendientesDeCliente(clienteId) {
  return consultar(
    `SELECT id, numero, fecha, total, pagado, (total - pagado) AS saldo, estado
       FROM facturas
      WHERE cliente_id = ? AND estado IN ('pendiente','parcial')
      ORDER BY fecha`,
    [clienteId]
  );
}

module.exports = {
  listar,
  porId,
  detalle,
  crear,
  registrarPago,
  anularPago,
  anular,
  crearDevolucion,
  resumen,
  pendientesDeCliente,
};
