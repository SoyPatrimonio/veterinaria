'use strict';

/**
 * Traducción de fallos de PostgreSQL a respuestas con sentido.
 *
 * Es lo que separa un "Ocurrió un error inesperado" de un "Ese horario acaba de
 * ser reservado". Se comprueba a través del middleware completo, con un req y
 * un res de mentira, porque lo que importa no es la función suelta sino el
 * código y el mensaje que termina viendo quien usa la aplicación.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const ApiError = require('../src/utils/ApiError');
const { manejadorErrores } = require('../src/middleware/errorHandler');

/** Petición mínima con lo que lee el registro de errores. */
function peticionFalsa() {
  return {
    method: 'POST',
    originalUrl: '/api/citas',
    get: () => null,
  };
}

/** Respuesta que se queda con el estado y el cuerpo en vez de enviarlos. */
function respuestaFalsa() {
  return {
    codigo: null,
    cuerpo: null,
    status(codigo) { this.codigo = codigo; return this; },
    json(cuerpo) { this.cuerpo = cuerpo; return this; },
  };
}

/**
 * Pasa un error por el middleware y devuelve lo que se habría respondido.
 * Silencia console.error: estos errores se registran a propósito y no hace
 * falta ver la traza cada vez que corren las pruebas.
 */
function responderA(error) {
  const res = respuestaFalsa();
  const original = console.error;
  console.error = () => {};
  try {
    manejadorErrores(error, peticionFalsa(), res, () => {});
  } finally {
    console.error = original;
  }
  return res;
}

test('un choque contra el índice del horario se explica como conflicto', () => {
  const error = Object.assign(new Error('duplicate key'), {
    code: '23505',
    constraint: 'uq_citas_vet_slot',
  });

  const res = responderA(error);

  assert.equal(res.codigo, 409);
  assert.match(res.cuerpo.error, /horario acaba de ser reservado/i);
  assert.equal(res.cuerpo.ok, false);
});

test('un correo repetido se explica como cuenta ya registrada', () => {
  const error = Object.assign(new Error('duplicate key'), {
    code: '23505',
    constraint: 'uq_usuarios_email',
  });

  assert.match(responderA(error).cuerpo.error, /cuenta registrada con ese correo/i);
});

test('una restricción única sin mensaje propio cae en el texto genérico', () => {
  const error = Object.assign(new Error('duplicate key'), {
    code: '23505',
    constraint: 'uq_algo_que_no_está_en_la_lista',
  });

  const res = responderA(error);
  assert.equal(res.codigo, 409);
  assert.match(res.cuerpo.error, /ya existe/i);
});

test('la clave foránea distingue borrar de insertar', () => {
  const alBorrar = Object.assign(new Error('fk'), {
    code: '23503',
    detail: 'Key (id)=(3) is still referenced from table "citas".',
  });
  assert.equal(responderA(alBorrar).codigo, 409);

  const alInsertar = Object.assign(new Error('fk'), {
    code: '23503',
    detail: 'Key (mascota_id)=(99) is not present in table "mascotas".',
  });
  assert.equal(responderA(alInsertar).codigo, 400);
});

test('la base caída responde 503 y no 500', () => {
  // Un 503 dice "vuelve a intentarlo"; un 500 haría pensar que la aplicación
  // tiene un fallo propio.
  for (const code of ['08006', 'ECONNREFUSED', 'ETIMEDOUT', '57P03']) {
    const res = responderA(Object.assign(new Error('sin conexión'), { code }));
    assert.equal(res.codigo, 503, code);
    assert.match(res.cuerpo.error, /no está disponible/i);
  }
});

test('las tablas sin crear piden ejecutar la migración', () => {
  const res = responderA(Object.assign(new Error('relation does not exist'), { code: '42P01' }));

  assert.equal(res.codigo, 503);
  assert.match(res.cuerpo.error, /migración del esquema/i);
});

test('un JSON mal formado se explica como tal', () => {
  const error = new SyntaxError('Unexpected token');
  error.body = '{ roto';

  const res = responderA(error);
  assert.equal(res.codigo, 400);
  assert.match(res.cuerpo.error, /JSON válido/i);
});

test('un error inesperado no filtra el detalle interno', () => {
  const res = responderA(new Error('la contraseña de la base es hunter2'));

  assert.equal(res.codigo, 500);
  assert.match(res.cuerpo.error, /error inesperado/i);
  assert.doesNotMatch(res.cuerpo.error, /hunter2/, 'el mensaje interno no debe salir al cliente');
});

test('un ApiError conserva su código, su mensaje y sus detalles', () => {
  const res = responderA(ApiError.badRequest('Revisa los datos enviados.', [
    { campo: 'email', mensaje: 'Escribe un correo electrónico válido.' },
  ]));

  assert.equal(res.codigo, 400);
  assert.equal(res.cuerpo.error, 'Revisa los datos enviados.');
  assert.equal(res.cuerpo.detalles.length, 1);
});

test('los atajos de ApiError usan el código HTTP que les toca', () => {
  assert.equal(ApiError.noAutorizado().status, 401);
  assert.equal(ApiError.prohibido().status, 403);
  assert.equal(ApiError.noEncontrado().status, 404);
  assert.equal(ApiError.conflicto('x').status, 409);
});
