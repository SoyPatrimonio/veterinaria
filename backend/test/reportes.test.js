'use strict';

/**
 * Ventana de fechas de los reportes.
 *
 * Es la única lógica del módulo que no es SQL, y la que decide si la consulta
 * es razonable o barre años enteros de facturas. Los dos casos que se le
 * escapan a cualquiera son el rango al revés —que devuelve cero filas y parece
 * que no hubo actividad— y el rango gigante, que agota el tiempo de la función.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolverRango } = require('../src/controllers/reportes.controller');
const { aFechaISO, sumarDias } = require('../src/utils/fechas');

test('sin fechas toma los últimos 30 días hasta hoy', () => {
  const rango = resolverRango({});
  const hoy = aFechaISO(new Date());

  assert.equal(rango.hasta, hoy);
  assert.equal(rango.desde, aFechaISO(sumarDias(new Date(), -30)));
  assert.equal(rango.dias, 30);
});

test('con solo la fecha final, cuenta 30 días hacia atrás desde ella', () => {
  const rango = resolverRango({ hasta: '2026-03-31' });

  assert.equal(rango.desde, '2026-03-01');
  assert.equal(rango.hasta, '2026-03-31');
});

test('respeta las dos fechas cuando vienen dadas', () => {
  const rango = resolverRango({ desde: '2026-01-01', hasta: '2026-01-31' });

  assert.equal(rango.desde, '2026-01-01');
  assert.equal(rango.hasta, '2026-01-31');
  assert.equal(rango.dias, 30);
});

test('un rango al revés se rechaza en vez de devolver una tabla vacía', () => {
  assert.throws(
    () => resolverRango({ desde: '2026-05-01', hasta: '2026-04-01' }),
    (error) => error.status === 400 && /no puede ser posterior/.test(error.message)
  );
});

test('el rango tiene tope de dos años', () => {
  assert.doesNotThrow(() => resolverRango({ desde: '2024-04-01', hasta: '2026-03-31' }));
  assert.throws(
    () => resolverRango({ desde: '2020-01-01', hasta: '2026-01-01' }),
    (error) => error.status === 400 && /dos años/.test(error.message)
  );
});

test('un solo día es un rango válido', () => {
  const rango = resolverRango({ desde: '2026-08-12', hasta: '2026-08-12' });

  assert.equal(rango.dias, 0);
});
