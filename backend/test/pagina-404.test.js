'use strict';

/**
 * Páginas que no existen: 404 de verdad (no la portada con un 200) y, si
 * quien pide es un navegador, la página propia en vez de texto plano.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');

function pedir(ruta, aceptar) {
  return new Promise((resolver, rechazar) => {
    const servidor = app.listen(0, async () => {
      try {
        const { port } = servidor.address();
        const r = await fetch(`http://127.0.0.1:${port}${ruta}`, { headers: { Accept: aceptar } });
        resolver({ status: r.status, tipo: r.headers.get('content-type') || '', cuerpo: await r.text() });
      } catch (error) {
        rechazar(error);
      } finally {
        servidor.close();
      }
    });
  });
}

test('un navegador recibe la página 404 propia con estado 404', async () => {
  const r = await pedir('/esta/pagina/no-existe', 'text/html');
  assert.equal(r.status, 404);
  assert.match(r.tipo, /text\/html/);
  assert.match(r.cuerpo, /Esta página no existe/);
});

test('un cliente que no pide HTML recibe texto plano', async () => {
  const r = await pedir('/no-existe', 'text/plain');
  assert.equal(r.status, 404);
  assert.match(r.cuerpo, /No existe la página \/no-existe/);
});

test('las rutas de la API siguen respondiendo JSON', async () => {
  const r = await pedir('/api/no-existe', 'text/html');
  assert.equal(r.status, 404);
  assert.match(r.tipo, /application\/json/);
});
