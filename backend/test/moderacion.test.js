'use strict';

/**
 * Filtro de groserías de los testimonios de la landing.
 *
 * Lo que se prueba son las dos formas de fallar que tiene un filtro así: dejar
 * pasar la grosería escrita a propósito para esquivarlo, y rechazar a quien
 * escribió bien. La segunda importa más en una veterinaria, donde el
 * vocabulario normal —perra, cono, chucha— se parece al que se filtra.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { revisar, esLimpio } = require('../src/utils/moderacion');

test('rechaza la grosería escrita tal cual', () => {
  assert.equal(revisar('el veterinario es un idiota'), 'idiota');
  assert.equal(revisar('QUÉ MIERDA DE SERVICIO'), 'mierda');
  assert.equal(revisar('son unos malparidos'), 'malparidos');
});

test('rechaza la grosería disfrazada', () => {
  assert.ok(revisar('son unos put4s'), 'números por letras');
  assert.ok(revisar('mierdaaaaa'), 'letras estiradas');
  assert.ok(revisar('p u t a'), 'letras sueltas');
  assert.ok(revisar('hijue-puta'), 'partida con un guion');
  assert.ok(revisar('MaRiCaS'), 'mayúsculas mezcladas');
});

test('la ñ no se confunde con la n', () => {
  // Si "coño" se normalizara como "cono", el cono isabelino de cualquier
  // cirugía haría rebotar el testimonio.
  assert.ok(revisar('qué coño'), 'coño sí es grosería');
  assert.ok(esLimpio('le pusieron el cono isabelino y quedó feliz'), 'cono no lo es');
});

test('deja pasar el vocabulario de una veterinaria', () => {
  assert.ok(esLimpio('Operaron a mi perra Luna y quedó perfecta'));
  assert.ok(esLimpio('Rescatamos una chucha herida y la atendieron igual'));
  assert.ok(esLimpio('Vacunaron al gato, al perro y hasta al cerdo de la finca'));
});

test('una crítica sin groserías se publica', () => {
  assert.ok(esLimpio('Me atendieron tarde y me pareció caro, pero curaron a mi gata'));
  assert.ok(esLimpio('No me gustó la espera de dos horas'));
});
