'use strict';

/**
 * Los códigos de acceso del personal.
 *
 * Lo que se comprueba aquí es lo que decide si alguien entra o no con un rol
 * de clínica. Cuatro cosas:
 *
 *   - que cada rol tenga su prefijo y su forma, porque de ahí sale toda la
 *     resistencia a que lo adivinen;
 *   - que se acepte escrito como llega en la vida real —en minúsculas, con
 *     espacios, sin guiones— y NO se acepte uno distinto;
 *   - que el código de un rol no valga como el de otro;
 *   - que la versión tapada no deje ver el código.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const codigo = require('../src/utils/codigoAcceso');

test('cada rol tiene su prefijo y su forma', () => {
  const formas = {
    veterinario: /^VET-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
  };

  assert.deepEqual(codigo.ROLES_CON_CODIGO, Object.keys(formas));

  for (const [rol, forma] of Object.entries(formas)) {
    for (let i = 0; i < 25; i += 1) assert.match(codigo.generar(rol), forma);
  }
});

test('un rol sin código no genera nada', () => {
  // 'cliente' es la puerta abierta del sitio: pedirle un código sería un error
  // de programación, no un caso a tratar en silencio.
  assert.throws(() => codigo.generar('cliente'), /no lleva código/);
  assert.throws(() => codigo.generar('inventado'), /no lleva código/);
});

test('la administración ya no tiene código de acceso', () => {
  // Es la prueba de que la puerta se cerró de verdad y no solo en el
  // formulario: sin prefijo no hay código que generar, sin código que generar
  // no hay nada contra qué comparar, y el registro no tiene con qué crear un
  // administrador aunque alguien llame a la API directamente.
  assert.ok(!codigo.ROLES_CON_CODIGO.includes('admin'));
  assert.equal(codigo.PREFIJOS.admin, undefined);
  assert.throws(() => codigo.generar('admin'), /no lleva código/);
});

test('no usa los caracteres que se confunden al dictarlo', () => {
  // 0/O, 1/I/L, 5/S y 2/Z son las parejas que se copian mal de un papel.
  const prohibidos = /[0O1IL5S2Z]/;

  for (const rol of codigo.ROLES_CON_CODIGO) {
    for (let i = 0; i < 100; i += 1) {
      const generado = codigo.generar(rol).slice(4);
      assert.ok(!prohibidos.test(generado), `salió un carácter ambiguo: ${generado}`);
    }
  }
});

test('dos códigos seguidos no salen iguales', () => {
  const vistos = new Set();
  for (let i = 0; i < 500; i += 1) vistos.add(codigo.generar('veterinario'));
  assert.equal(vistos.size, 500);
});

test('se acepta como lo escribe la gente', () => {
  const real = 'VET-ABCD-EFGH-JKMN';

  for (const escrito of [
    real,
    real.toLowerCase(),
    real.replace(/-/g, ''),
    real.replace(/-/g, ' '),
    `  ${real.toLowerCase()}  `,
  ]) {
    assert.ok(codigo.coincide(escrito, real), `debería aceptar «${escrito}»`);
  }
});

test('no se acepta otro código, ni uno vacío, ni uno a medias', () => {
  const real = 'VET-ABCD-EFGH-JKMN';

  for (const escrito of ['VET-ABCD-EFGH-JKMP', 'VET-ABCD-EFGH', '', null, undefined, 'VET']) {
    assert.ok(!codigo.coincide(escrito, real), `no debería aceptar «${escrito}»`);
  }

  // Y sin código vigente no entra nadie, ni escribiendo nada.
  assert.ok(!codigo.coincide('', ''));
  assert.ok(!codigo.coincide('VET-ABCD-EFGH-JKMN', null));
});

test('un código con otro prefijo no pasa por el de veterinario', () => {
  // Mismo cuerpo, distinto prefijo: la comparación tiene que verlos distintos.
  // Importa sobre todo para los códigos ADM que la clínica todavía tenga
  // apuntados de antes: ninguno vale ahora como código de veterinario.
  const vet = 'VET-ABCD-EFGH-JKMN';
  const admin = 'ADM-ABCD-EFGH-JKMN';

  assert.ok(!codigo.coincide(vet, admin));
  assert.ok(!codigo.coincide(admin, vet));
});

test('el código tapado no deja ver más que las dos últimas cifras', () => {
  assert.equal(codigo.enmascarar('VET-ABCD-EFGH-JKMN'), 'VET-••••-••••-••MN');
  assert.equal(codigo.enmascarar('ADM-ABCD-EFGH-JKMN'), 'ADM-••••-••••-••MN');

  // Y lo tapado no puede servir para entrar.
  assert.ok(!codigo.coincide(codigo.enmascarar('VET-ABCD-EFGH-JKMN'), 'VET-ABCD-EFGH-JKMN'));
  assert.equal(codigo.enmascarar(''), '');
});
