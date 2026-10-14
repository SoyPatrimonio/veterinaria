'use strict';

/**
 * Numeración de los documentos con serie propia (facturas, recetas, órdenes de
 * laboratorio, pedidos, PQRS…).
 *
 * Se prueba con una conexión de mentira que anota las consultas recibidas: lo
 * que importa aquí no es lo que devuelve PostgreSQL, sino que se pida el
 * bloqueo antes de leer el último número y que el formato de la serie salga
 * bien. Sin el bloqueo, dos cajeros a la vez emitirían la misma factura.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { siguienteNumero, TABLAS } = require('../src/utils/consecutivos');

/** Conexión falsa: guarda lo que se le pide y responde el último número dado. */
function conexionFalsa(ultimo) {
  const consultas = [];

  return {
    consultas,
    async execute(sql, params) {
      consultas.push({ sql, params });
      return [{ rows: [], affectedRows: 0 }, null];
    },
    async consultarUna(sql, params) {
      consultas.push({ sql, params });
      return { siguiente: ultimo };
    },
  };
}

test('el número sale con el prefijo de la tabla, el año y cuatro dígitos', async () => {
  const conexion = conexionFalsa(7);

  assert.equal(await siguienteNumero(conexion, 'facturas', 2026), 'FAC-2026-0007');
  assert.equal(await siguienteNumero(conexionFalsa(12), 'compras', 2026), 'COM-2026-0012');
  assert.equal(await siguienteNumero(conexionFalsa(3), 'devoluciones', 2025), 'DEV-2025-0003');
});

test('el consecutivo pasa de cuatro dígitos sin recortarse', async () => {
  assert.equal(await siguienteNumero(conexionFalsa(12345), 'facturas', 2026), 'FAC-2026-12345');
});

test('primero se pide el bloqueo y después se lee el último número', async () => {
  const conexion = conexionFalsa(1);
  await siguienteNumero(conexion, 'facturas', 2026);

  assert.match(conexion.consultas[0].sql, /pg_advisory_xact_lock/);
  assert.equal(conexion.consultas[0].params[0], 'huellitas.numeracion.FAC-2026');
  assert.match(conexion.consultas[1].sql, /FROM facturas/);
});

test('la búsqueda se limita a la serie del año pedido', async () => {
  const conexion = conexionFalsa(1);
  await siguienteNumero(conexion, 'facturas', 2024);

  assert.equal(conexion.consultas[1].params[0], 'FAC-2024-%');
});

test('una tabla sin serie definida es un error de programación, no un 500 silencioso', async () => {
  await assert.rejects(
    () => siguienteNumero(conexionFalsa(1), 'mascotas', 2026),
    /No hay serie de numeración/
  );
});

// La lista es cerrada a propósito: el nombre de la tabla se interpola en el
// SQL, así que cualquier valor que no esté aquí tiene que fallar en vez de
// llegar a la consulta.
test('solo hay series para las tablas que numeran documentos', () => {
  assert.deepEqual(Object.keys(TABLAS).sort(), [
    'compras',
    'contratos_adopcion',
    'devoluciones',
    'estudios_imagen',
    'facturas',
    'muestras',
    'ordenes_laboratorio',
    'pedidos',
    'recetas',
    'tickets',
  ]);
});

test('las series con prefijo compuesto siguen leyendo bien el consecutivo', async () => {
  // 'PQRS-2026-0007' tiene dos guiones; el consecutivo es lo que va tras el
  // último, no tras el primero.
  const conexion = conexionFalsa(8);
  const numero = await siguienteNumero(conexion, 'tickets', 2026);

  assert.equal(numero, 'PQRS-2026-0008');
  assert.equal(conexion.consultas[1].params[0], 'PQRS-2026-%');
});

test('las muestras numeran sobre su columna codigo, no sobre numero', async () => {
  const conexion = conexionFalsa(3);
  const numero = await siguienteNumero(conexion, 'muestras', 2026);

  assert.equal(numero, 'M-2026-0003');
  assert.match(conexion.consultas[1].sql, /FROM muestras/);
  assert.match(conexion.consultas[1].sql, /codigo LIKE/);
});
