'use strict';

/**
 * Consulta de contraseñas filtradas (Have I Been Pwned).
 *
 * No sale a internet: se le pasa un `pedir` falso que hace de servicio. Lo
 * que importa probar es lo que viaja —solo cinco caracteres del hash— y que
 * un servicio caído no bloquee a nadie.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { apariciones, estaFiltrada } = require('../src/services/passwordFiltrada.service');

const sha1 = (texto) => crypto.createHash('sha1').update(texto).digest('hex').toUpperCase();

/** Un servicio de mentira que responde con estos sufijos y anota qué le pidieron. */
function servicio(lineas, { status = 200 } = {}) {
  const pedidos = [];
  const pedir = async (url, opciones) => {
    pedidos.push({ url, opciones });
    return { ok: status === 200, status, text: async () => lineas.join('\r\n') };
  };
  return { pedir, pedidos };
}

test('solo viajan los cinco primeros caracteres del hash, nunca la contraseña', async () => {
  const password = 'Cliente#123';
  const { pedir, pedidos } = servicio([]);
  await apariciones(password, { pedir });

  assert.equal(pedidos.length, 1);
  const url = pedidos[0].url;
  assert.ok(url.endsWith(`/range/${sha1(password).slice(0, 5)}`), url);
  assert.ok(!url.includes(password));
  assert.ok(!url.includes(sha1(password).slice(5)), 'el resto del hash no sale');
  assert.equal(pedidos[0].opciones.headers['Add-Padding'], 'true');
});

test('cuenta las apariciones del sufijo que coincide', async () => {
  const sufijo = sha1('P@ssw0rd').slice(5);
  const { pedir } = servicio(['0018A45C4D1DEF81644B54AB7F969B88D65:3', `${sufijo}:52579`, 'FFFFF:0']);

  assert.equal(await apariciones('P@ssw0rd', { pedir }), 52579);
  assert.equal(await estaFiltrada('P@ssw0rd', { pedir, forzar: true }), true);
});

test('una contraseña que no está en la lista pasa', async () => {
  const { pedir } = servicio(['0018A45C4D1DEF81644B54AB7F969B88D65:3']);
  assert.equal(await apariciones('Rq7!mZp2#Lw9xT4v', { pedir }), 0);
  assert.equal(await estaFiltrada('Rq7!mZp2#Lw9xT4v', { pedir, forzar: true }), false);
});

test('el relleno con cero apariciones no cuenta como filtrada', async () => {
  const sufijo = sha1('Lluvia#Gris7').slice(5);
  const { pedir } = servicio([`${sufijo}:0`]);
  assert.equal(await estaFiltrada('Lluvia#Gris7', { pedir, forzar: true }), false);
});

test('si el servicio falla o no responde, no se bloquea a nadie', async () => {
  const caido = servicio([], { status: 503 });
  assert.equal(await apariciones('Cliente#123', { pedir: caido.pedir }), null);
  assert.equal(await estaFiltrada('Cliente#123', { pedir: caido.pedir, forzar: true }), false);

  const sinRed = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  assert.equal(await estaFiltrada('Cliente#123', { pedir: sinRed, forzar: true }), false);
});

test('dentro de las pruebas la consulta está apagada y no sale a internet', async () => {
  const { pedir, pedidos } = servicio([]);
  assert.equal(await estaFiltrada('Cliente#123', { pedir }), false);
  assert.equal(pedidos.length, 0);
});
