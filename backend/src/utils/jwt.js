'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { jwt: config } = require('../config/env');

/**
 * Firma un token de sesión.
 *
 * Cada token lleva un `jti` aleatorio. Sin él, dos ingresos del mismo usuario
 * dentro del mismo segundo producirían exactamente el mismo JWT —mismo `sub`,
 * mismo `iat`— y la segunda sesión chocaría contra el índice único de
 * seguridad.sesiones. Con el jti, cada ingreso es una sesión distinta y se
 * puede cerrar una sin tumbar la otra.
 */
// El algoritmo se escribe y se exige a propósito, en los dos sentidos. Aceptar
// "el que venga en el token" es el fallo clásico de JWT: quien manda la
// petición elige cómo se comprueba su propia firma. Con la lista fija, un token
// firmado de otra manera se rechaza aunque el resto cuadre.
const ALGORITMO = 'HS256';

function firmarToken(payload, expiresIn = config.expiresIn) {
  return jwt.sign({ ...payload, jti: crypto.randomBytes(16).toString('hex') }, config.secret, {
    algorithm: ALGORITMO,
    expiresIn,
    issuer: 'huellitas-api',
  });
}

function verificarToken(token) {
  return jwt.verify(token, config.secret, {
    algorithms: [ALGORITMO],
    issuer: 'huellitas-api',
  });
}

/**
 * ¿El fallo viene del token en sí (caducado, firma mala, manipulado)?
 *
 * Sirve para distinguir lo esperado —un token que ya no vale— de lo que no lo
 * es. Un `catch` que se traga todo convertiría una base de datos caída en
 * "usuario no identificado", y el problema real quedaría invisible.
 */
function esErrorDeToken(error) {
  return error instanceof jwt.JsonWebTokenError; // cubre expirado y no-antes-de
}

module.exports = { firmarToken, verificarToken, esErrorDeToken, ALGORITMO };
