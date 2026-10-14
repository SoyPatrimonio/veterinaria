'use strict';

/**
 * Cuentas de la facturación.
 *
 * Es la parte del proyecto donde una equivocación se convierte en dinero mal
 * cobrado, así que se prueban los tres sitios donde puede torcerse: la suma de
 * una línea, el total de la factura y el control de que un pago no supere el
 * saldo. Todas son funciones puras: no hace falta base de datos.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  redondear,
  calcularLinea,
  calcularFactura,
  calcularCompra,
  saldoPendiente,
  pagoValido,
} = require('../src/services/facturacion.service');

/* ------------------------------------------------------------------
   Líneas
   ------------------------------------------------------------------ */

test('una línea multiplica cantidad por precio y aplica descuento e impuesto', () => {
  const linea = calcularLinea({ cantidad: 3, precioUnit: 12000, descuento: 2000, impuesto: 1900 });

  assert.equal(linea.bruto, 36000);
  assert.equal(linea.totalLinea, 35900, '36000 − 2000 + 1900');
});

test('una línea sin cantidad se cobra como una unidad', () => {
  const linea = calcularLinea({ precioUnit: 60000 });

  assert.equal(linea.cantidad, 1);
  assert.equal(linea.totalLinea, 60000);
});

test('los importes se redondean a dos decimales en cada paso', () => {
  // 0.1 + 0.2 en coma flotante da 0.30000000000000004; sin redondear, esa cola
  // se arrastra hasta el total de la factura.
  assert.equal(redondear(0.1 + 0.2), 0.3);
  assert.equal(calcularLinea({ cantidad: 3, precioUnit: 0.1 }).bruto, 0.3);
});

/* ------------------------------------------------------------------
   Factura completa
   ------------------------------------------------------------------ */

test('el total de la factura es subtotal menos descuentos más impuestos', () => {
  const factura = calcularFactura([
    { cantidad: 1, precioUnit: 60000 },
    { cantidad: 1, precioUnit: 32000, impuesto: 6080 },
  ]);

  assert.equal(factura.subtotal, 92000);
  assert.equal(factura.impuestos, 6080);
  assert.equal(factura.descuento, 0);
  assert.equal(factura.total, 98080, 'el mismo caso que trae el seed de la base');
});

test('el descuento global se suma al de cada línea', () => {
  const factura = calcularFactura(
    [{ cantidad: 2, precioUnit: 10000, descuento: 1000 }],
    5000
  );

  assert.equal(factura.subtotal, 20000);
  assert.equal(factura.descuento, 6000, '1000 de la línea + 5000 global');
  assert.equal(factura.total, 14000);
});

test('un descuento mayor que el valor deja el total en negativo, para que el controlador lo rechace', () => {
  // La función no lanza: su trabajo es calcular. Quien decide qué hacer con un
  // total imposible es la ruta, que responde 400 con un mensaje entendible.
  const factura = calcularFactura([{ cantidad: 1, precioUnit: 10000 }], 15000);

  assert.equal(factura.total, -5000);
});

test('una factura sin líneas suma cero y no rompe', () => {
  const factura = calcularFactura([]);

  assert.equal(factura.subtotal, 0);
  assert.equal(factura.total, 0);
  assert.deepEqual(factura.lineas, []);
});

/* ------------------------------------------------------------------
   Compras
   ------------------------------------------------------------------ */

test('una compra suma sus líneas y añade los impuestos al final', () => {
  const compra = calcularCompra(
    [
      { cantidad: 40, precioUnit: 18000 },
      { cantidad: 8, precioUnit: 24000 },
    ],
    297730
  );

  assert.equal(compra.subtotal, 912000);
  assert.equal(compra.total, 1209730);
  assert.equal(compra.lineas[0].totalLinea, 720000);
});

/* ------------------------------------------------------------------
   Pagos
   ------------------------------------------------------------------ */

test('el saldo pendiente es lo que falta por cobrar', () => {
  assert.equal(saldoPendiente({ total: 98080, pagado: 50000 }), 48080);
  assert.equal(saldoPendiente({ total: 98080, pagado: 98080 }), 0);
});

test('no se admite un pago mayor que el saldo', () => {
  const factura = { total: 100000, pagado: 60000 };

  assert.equal(pagoValido(factura, 40000), true, 'pagar justo lo que falta');
  assert.equal(pagoValido(factura, 10000), true, 'un abono parcial');
  assert.equal(pagoValido(factura, 50000), false, 'cobrar de más deja la caja descuadrada');
});

test('se tolera un peso de diferencia por el redondeo de las cuotas', () => {
  assert.equal(pagoValido({ total: 1000, pagado: 0 }, 1001), true);
  assert.equal(pagoValido({ total: 1000, pagado: 0 }, 1002), false);
});
