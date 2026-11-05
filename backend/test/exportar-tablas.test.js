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
