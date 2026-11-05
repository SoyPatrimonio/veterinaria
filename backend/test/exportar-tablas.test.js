'use strict';

/**
 * Exportar tablas a CSV (frontend/js/panel-herramientas.js).
 *
 * Lo delicado no es armar el CSV sino lo que Excel hace al abrirlo: un texto
 * que empieza por "=" se ejecuta como fórmula. En la clínica, quien escribe
 * los nombres de las mascotas o las direcciones es el público.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cargar() {
  const ventana = { Huella: { escapar: String }, document: {}, navigator: {} };
  const codigo = fs.readFileSync(path.join(__dirname, '../../frontend/js/panel-herramientas.js'), 'utf8');
  vm.runInNewContext(codigo, { window: ventana });
  return ventana.Huella.herramientas;
}

const { aCsv, celdaCsv } = cargar();

test('el CSV abre bien en Excel en español: BOM, punto y coma y CRLF', () => {
  const csv = aCsv([['Mascota', 'Peso'], ['Luna', '24,5']]);
  assert.ok(csv.startsWith('﻿'), 'BOM para que respete las tildes');
  assert.equal(csv, '﻿"Mascota";"Peso"\r\n"Luna";"24,5"\r\n');
});

test('comillas, punto y coma y saltos de línea no rompen las columnas', () => {
  assert.equal(celdaCsv('Dice "hola"; adiós'), '"Dice ""hola""; adiós"');
  assert.equal(celdaCsv('Calle 10\n  # 5-20'), '"Calle 10 # 5-20"');
});

test('neutraliza lo que Excel ejecutaría como fórmula', () => {
  assert.equal(celdaCsv('=HYPERLINK("http://malo.example","clic")'), '"\'=HYPERLINK(""http://malo.example"",""clic"")"');
  assert.equal(celdaCsv('+57 300'), '"\'+57 300"');
  assert.equal(celdaCsv('@SUM(A1)'), '"\'@SUM(A1)"');
  assert.equal(celdaCsv('-cmd|calc'), '"\'-cmd|calc"');
});

test('los números negativos siguen siendo números', () => {
  assert.equal(celdaCsv('-15000'), '"-15000"');
  assert.equal(celdaCsv('-1.250,50'), '"-1.250,50"');
});

test('las celdas vacías o nulas quedan vacías', () => {
  assert.equal(celdaCsv(null), '""');
  assert.equal(celdaCsv(undefined), '""');
  assert.equal(celdaCsv('   '), '""');
});

/* ------------------------------------------------------------------
   Ordenar y filtrar
   ------------------------------------------------------------------ */

const { claveOrden, compararCeldas, coincideFiltro } = cargar();
const ordenar = (lista) => [...lista].sort(compararCeldas);

test('los montos en pesos se ordenan por su valor, no como texto', () => {
  assert.deepEqual(
    ordenar(['$ 10.000', '$ 9.000', '$ 1.250.000', '$ 500']),
    ['$ 500', '$ 9.000', '$ 10.000', '$ 1.250.000']
  );
});

test('decimales con coma, unidades y negativos', () => {
  assert.equal(claveOrden('24,5 kg').valor, 24.5);
  assert.equal(claveOrden('-1.250,50').valor, -1250.5);
  assert.deepEqual(ordenar(['3,2 kg', '24,5 kg', '12 kg']), ['3,2 kg', '12 kg', '24,5 kg']);
});

test('las fechas como las escribe el panel se ordenan por calendario', () => {
  assert.deepEqual(
    ordenar(['2 mar 2026', '10 ene 2026', '20 dic 2025', '1 sept 2026']),
    ['20 dic 2025', '10 ene 2026', '2 mar 2026', '1 sept 2026']
  );
  assert.deepEqual(ordenar(['2026-11-04', '2025-01-30']), ['2025-01-30', '2026-11-04']);
});

test('el texto se ordena en español: tildes y ñ en su sitio, números naturales', () => {
  assert.deepEqual(ordenar(['Ñandú', 'Nube', 'Álvaro', 'Zeus']), ['Álvaro', 'Nube', 'Ñandú', 'Zeus']);
  assert.deepEqual(ordenar(['Jaula 10', 'Jaula 2', 'Jaula 1']), ['Jaula 1', 'Jaula 2', 'Jaula 10']);
});

test('las celdas vacías van al final', () => {
  assert.deepEqual(ordenar(['—', 'Luna', '', 'Ares']), ['Ares', 'Luna', '—', '']);
});

test('el filtro encuentra sin tildes ni mayúsculas y exige todas las palabras', () => {
  assert.equal(coincideFiltro('Daniela Ríos daniela@correo.com Cliente', 'rios cliente'), true);
  assert.equal(coincideFiltro('Daniela Ríos', 'RÍOS'), true);
  assert.equal(coincideFiltro('Daniela Ríos Cliente', 'rios admin'), false);
  assert.equal(coincideFiltro('lo que sea', '   '), true, 'un filtro vacío deja todo');
});
