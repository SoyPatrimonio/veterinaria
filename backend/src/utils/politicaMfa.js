'use strict';

/**
 * A quién se le exige el segundo factor.
 *
 * Vive suelto y no dentro del servicio de autenticación porque lo consultan
 * dos sitios que no deben depender el uno del otro: el servicio, al armar la
 * sesión, y el middleware, en cada petición. Con la regla escrita en un solo
 * lugar no puede pasar que una parte del sistema lo exija y la otra no.
 */

const { mfa, correo } = require('../config/env');

/** ¿Este rol necesita segundo factor para poder usar el sistema? */
function exigeMfa(rol) {
  return mfa.roles.includes(rol);
}

/**
 * ¿Este rol recibe su código por correo?
 *
 * Es la forma normal desde que hay cuenta de correo configurada: el código se
 * manda al buzón de cada persona en cada ingreso, no hay nada que instalar y
 * nadie se queda fuera por haber cambiado de teléfono.
 */
function codigoPorCorreo(rol) {
  return exigeMfa(rol) && correo.configurado;
}

/**
 * ¿Esta cuenta está obligada a configurar la aplicación de códigos?
 *
 * Solo cuando su rol exige segundo factor y NO hay correo saliente: sin las
 * dos vías la exigencia se quedaría en un aviso, y una sesión de
 * administración sin segundo factor es justo lo que no puede pasar. Con el
 * correo montado no hay nada que configurar, así que deja de pedirse.
 */
function debeConfigurarApp(rol, mfaActivo) {
  return exigeMfa(rol) && mfaActivo !== 1 && !correo.configurado;
}

module.exports = { exigeMfa, codigoPorCorreo, debeConfigurarApp, ROLES_CON_MFA: mfa.roles };
