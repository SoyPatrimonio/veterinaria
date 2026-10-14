'use strict';

/**
 * Traducción de placeholders `?` (estilo MySQL) a `$1, $2…` (PostgreSQL).
 *
 * Por aquí pasa absolutamente toda consulta de la aplicación, así que un fallo
 * no rompe una pantalla: las rompe todas, o peor, desplaza los parámetros y
 * guarda un dato en la columna de al lado. El caso delicado es un `?` que
 * forme parte de un texto o de un comentario: si se tradujera, los parámetros
 * siguientes quedarían corridos.
 *
 * Se prueba la función sola, sin tocar la base: es pura y no necesita conexión.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { traducirPlaceholders } = require('../src/config/database');

test('numera los parámetros en orden', () => {
  assert.equal(
    traducirPlaceholders('SELECT * FROM citas WHERE id = ? AND estado = ?'),
    'SELECT * FROM citas WHERE id = $1 AND estado = $2'
  );
});

test('devuelve la consulta intacta si no hay parámetros', () => {
  const sql = 'SELECT COUNT(*) FROM usuarios';
  assert.equal(traducirPlaceholders(sql), sql);
});

test('no toca un signo de interrogación dentro de una cadena', () => {
  assert.equal(
    traducirPlaceholders("SELECT '¿seguro?' AS pregunta WHERE id = ?"),
    "SELECT '¿seguro?' AS pregunta WHERE id = $1"
  );
});

test('respeta las comillas simples escapadas dentro de una cadena', () => {
  // '' es la forma de escribir una comilla dentro de un literal en SQL. Si el
  // recorrido la tomara como cierre, saldría de la cadena a mitad de camino y
  // traduciría los `?` del texto que viene después.
  assert.equal(
    traducirPlaceholders("SELECT 'no sé si ''?'' cuenta' WHERE id = ?"),
    "SELECT 'no sé si ''?'' cuenta' WHERE id = $1"
  );
});

test('no toca un signo de interrogación dentro de un identificador entrecomillado', () => {
  assert.equal(
    traducirPlaceholders('SELECT "columna?rara" FROM t WHERE id = ?'),
    'SELECT "columna?rara" FROM t WHERE id = $1'
  );
});

test('no toca los comentarios de línea', () => {
  assert.equal(
    traducirPlaceholders('SELECT 1 -- ¿esto cuenta?\nWHERE id = ?'),
    'SELECT 1 -- ¿esto cuenta?\nWHERE id = $1'
  );
});

test('no toca los comentarios de bloque', () => {
  assert.equal(
    traducirPlaceholders('SELECT 1 /* ¿y esto? */ WHERE id = ?'),
    'SELECT 1 /* ¿y esto? */ WHERE id = $1'
  );
});

test('un comentario sin cerrar no se lleva por delante el resto de la consulta', () => {
  const sql = 'SELECT 1 /* sin cerrar ? ';
  assert.equal(traducirPlaceholders(sql), sql);
});

test('mantiene el orden con varios parámetros repartidos entre texto y comentarios', () => {
  const sql = `INSERT INTO accesos (usuario_id, tipo, ip) -- ¿ip real?
               VALUES (?, 'entrada?', ?)`;

  assert.equal(
    traducirPlaceholders(sql),
    `INSERT INTO accesos (usuario_id, tipo, ip) -- ¿ip real?
               VALUES ($1, 'entrada?', $2)`
  );
});

test('traduce los parámetros de una consulta real del proyecto', () => {
  // La de abrirSesion(), que es la que más parámetros encadena.
  const sql = `INSERT INTO sesiones (usuario_id, token_hash, ip, agente, expira_en)
               VALUES (?, ?, ?, ?, ?)`;

  assert.equal(
    traducirPlaceholders(sql),
    `INSERT INTO sesiones (usuario_id, token_hash, ip, agente, expira_en)
               VALUES ($1, $2, $3, $4, $5)`
  );
});
