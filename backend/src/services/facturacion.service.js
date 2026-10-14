'use strict';

/**
 * Cuentas de la facturación.
 *
 * Todo lo que hay aquí son funciones puras: reciben líneas y devuelven
 * números. No tocan la base a propósito, porque es la parte donde un error se
 * traduce en dinero mal cobrado y conviene poder probarla sola, sin montar una
 * factura entera.
 *
 * El criterio es el mismo que usa el esquema (subtotal, descuento, impuestos,
 * total): el subtotal es la suma de cantidad × precio sin tocar, el descuento
 * junta el de cada línea con el global, y el total es
 * subtotal − descuento + impuestos.
 */

// Los importes se guardan como NUMERIC(12,2). Redondear en cada paso evita que
// se acumulen decimales que luego no cuadran con lo que ve el cliente.
function redondear(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

function calcularLinea(linea) {
  const cantidad = Number(linea.cantidad ?? 1);
  const precioUnit = Number(linea.precioUnit ?? 0);
  const descuento = Number(linea.descuento ?? 0);
  const impuesto = Number(linea.impuesto ?? 0);

  const bruto = redondear(cantidad * precioUnit);

  return {
    ...linea,
    cantidad,
    precioUnit,
    descuento,
    impuesto,
    bruto,
    totalLinea: redondear(bruto - descuento + impuesto),
  };
}

function sumar(lista, campo) {
  return redondear(lista.reduce((acumulado, item) => acumulado + Number(item[campo] || 0), 0));
}

/**
 * Totales de una factura. Devuelve también las líneas ya calculadas para que
 * quien inserte no tenga que repetir la multiplicación.
 */
function calcularFactura(lineas, descuentoGlobal = 0) {
  const calculadas = (lineas || []).map(calcularLinea);

  const subtotal = sumar(calculadas, 'bruto');
  const impuestos = sumar(calculadas, 'impuesto');
  const descuento = redondear(sumar(calculadas, 'descuento') + Number(descuentoGlobal || 0));
  const total = redondear(subtotal - descuento + impuestos);

  return { lineas: calculadas, subtotal, descuento, impuestos, total };
}

/** Totales de una compra a proveedor: sin descuentos por línea. */
function calcularCompra(lineas, impuestos = 0) {
  const calculadas = (lineas || []).map((linea) => ({
    ...linea,
    cantidad: Number(linea.cantidad || 0),
    precioUnit: Number(linea.precioUnit || 0),
    totalLinea: redondear(Number(linea.cantidad || 0) * Number(linea.precioUnit || 0)),
  }));

  const subtotal = sumar(calculadas, 'totalLinea');

  return {
    lineas: calculadas,
    subtotal,
    impuestos: redondear(impuestos),
    total: redondear(subtotal + Number(impuestos || 0)),
  };
}

/**
 * Cuánto queda por cobrar de una factura. Se calcula aparte del estado porque
 * el estado lo pone un disparador de la base y aquí solo hace falta la cifra.
 */
function saldoPendiente(factura) {
  return redondear(Number(factura.total || 0) - Number(factura.pagado || 0));
}

/**
 * ¿Cabe este pago en la factura? Cobrar de más no es un detalle estético: la
 * factura quedaría marcada como pagada con una diferencia que no cuadra con la
 * caja y que después hay que devolver.
 */
function pagoValido(factura, valor) {
  // Se admite un peso de diferencia por el redondeo de las cuotas.
  const TOLERANCIA = 1;
  return Number(valor) <= saldoPendiente(factura) + TOLERANCIA;
}

module.exports = {
  redondear,
  calcularLinea,
  calcularFactura,
  calcularCompra,
  saldoPendiente,
  pagoValido,
};
