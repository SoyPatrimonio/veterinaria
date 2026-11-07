'use strict';

/**
 * Armazón de los PDF (membrete, contenido y pie numerado).
 *
 * El pie se escribe dentro del margen inferior; pdfkit, si no se le quita el
 * margen, abre una página nueva para él y cada documento salía con una hoja
 * en blanco al final. Se cuentan las páginas del archivo generado.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Sin base de datos: los datos de la clínica se sustituyen antes de cargar.
const rutaClinica = require.resolve('../src/services/clinica.service');
require.cache[rutaClinica] = {
  id: rutaClinica, filename: rutaClinica, loaded: true,
  exports: { datosClinica: async () => ({ nombre: 'Huellitas de Amor', nit: '900', sede: { direccion: 'Cra. 11', ciudad: 'Sogamoso' } }) },
};
const { generar, tabla } = require(path.join(__dirname, '../src/services/pdf.service'));

/** Genera el PDF y devuelve su texto (los PDF de pdfkit sin comprimir se leen). */
async function crear(contenido) {
  const doc = await generar({ titulo: 'Prueba', generadoPor: 'Daniela' }, contenido);
  const trozos = [];
  doc.on('data', (t) => trozos.push(t));
  await new Promise((r) => doc.on('end', r));
  return Buffer.concat(trozos).toString('latin1');
}

const paginas = (pdf) => (pdf.match(/\/Type \/Page\b/g) || []).length;

test('un documento corto es una sola página, con el pie en ella', async () => {
  const pdf = await crear((doc) => { doc.text('Contenido breve.'); });
  assert.equal(paginas(pdf), 1);
});

test('un documento largo no gana hojas en blanco al ponerle el pie', async () => {
  const filas = Array.from({ length: 120 }, (_, i) => ({ a: `Fila ${i + 1}`, b: 'Dato' }));
  let antesDelPie = 0;
  const pdf = await crear((doc) => {
    tabla(doc, [{ titulo: 'A', campo: 'a', ancho: 0.5 }, { titulo: 'B', campo: 'b', ancho: 0.5 }], filas);
    antesDelPie = doc.bufferedPageRange().count;
  });
  assert.ok(antesDelPie >= 2, `la tabla debería ocupar varias páginas (${antesDelPie})`);
  assert.equal(paginas(pdf), antesDelPie, 'el pie se escribe en las páginas que ya hay, sin agregar otras');
});
