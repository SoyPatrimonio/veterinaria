'use strict';

/**
 * La política de contraseñas vive dos veces: en el servidor, que decide, y en
 * el navegador (frontend/js/password.js), que la enseña mientras se escribe.
 * Si las dos copias se separan, el formulario dice "todo bien" y el servidor
 * rebota, o al revés. Esta prueba carga la del navegador y las compara.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const esquemas = require('../src/utils/esquemas');

function cargarNavegador() {
  const ventana = { Huella: {}, crypto: webcrypto };
  const codigo = fs.readFileSync(path.join(__dirname, '../../frontend/js/password.js'), 'utf8');
  vm.runInNewContext(codigo, { window: ventana, TextEncoder });
  return ventana.Huella.password;
}

const navegador = cargarNavegador();

const MUESTRAS = [
  '', 'a', 'Cliente#123', 'Cliente123', 'cliente#123', 'CLIENTE#123', 'Cliente#abc',
  'Ñandú.2026', 'Huellitas2026!', '#1Password', 'MisHuellitas#1', 'Aaaa1111!',
  'Lluvia#Gris7', 'Gato!1234', 'clave', `Ab#1${'xy'.repeat(34)}`, `Ab#1${'ñé'.repeat(20)}`,
  'Con espacio 1!A', '   Ab1!   ', 'Émile_Zola9', '😀Perrito9x', 'Daniela#2026',
];

test('el navegador y el servidor aceptan y rechazan las mismas contraseñas', () => {
  for (const valor of MUESTRAS) {
    const servidor = esquemas.cambioPassword.safeParse({ actual: '--otra--', nueva: valor }).success;
    const cliente = navegador.validar(valor) === null;
    assert.equal(cliente, servidor, `discrepan con ${JSON.stringify(valor)}`);
  }
});

test('el navegador y el servidor coinciden en los datos personales', () => {
  const datos = { nombre: 'Daniela Ríos', email: 'drios84@correo.com' };
  for (const password of ['Daniela#2026', 'Mi.drios84!X', 'Rios#Perro9', 'Lluvia#Gris7']) {
    const servidor = esquemas.registro.safeParse({ ...datos, telefono: null, password }).success;
    const cliente = navegador.validar(password, datos) === null;
    assert.equal(cliente, servidor, `discrepan con ${password}`);
  }
});

test('las contraseñas generadas cumplen la política del servidor', () => {
  for (let i = 0; i < 200; i++) {
    const generada = navegador.generar();
    assert.ok(
      esquemas.cambioPassword.safeParse({ actual: '--otra--', nueva: generada }).success,
      `el servidor rechazó ${generada}`
    );
  }
});

test('el medidor solo llega a "aceptable" cuando la contraseña es válida', () => {
  assert.equal(navegador.fuerza(''), 0);
  assert.ok(navegador.fuerza('Cliente123') < 2, 'sin carácter especial no es aceptable');
  assert.equal(navegador.fuerza('Cliente#123'), 2);
  assert.ok(navegador.fuerza('Rq7!mZp2#Lw9xT4v') >= 3);
});
