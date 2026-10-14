'use strict';

/**
 * Cifrado simétrico para los datos que el servidor necesita poder volver a
 * leer en claro.
 *
 * La mayoría de lo delicado de este sistema no se cifra: se hashea, que es
 * mejor, porque nadie —ni el servidor— necesita recuperar el original. Así
 * están las contraseñas (bcrypt), los tokens de sesión, los de recuperación y
 * los códigos de respaldo del segundo factor.
 *
 * Queda un caso que no admite ese trato: el secreto TOTP. El servidor tiene
 * que recalcular con él un código de seis cifras en cada ingreso, así que
 * hashearlo lo dejaría inservible. Guardarlo tal cual significa que una copia
 * de la base —un volcado, una consulta de más, un respaldo mal guardado—
 * entrega el segundo factor de todas las cuentas de administración. Ahí entra
 * esto: en la base queda cifrado, y la llave vive en el entorno, que es otro
 * sitio.
 *
 * AES-256-GCM y no AES-CBC: GCM autentica además de cifrar, así que un valor
 * alterado en la base falla al descifrar en vez de devolver basura silenciosa.
 */

const crypto = require('crypto');
const { cifrado: config } = require('../config/env');

const ALGORITMO = 'aes-256-gcm';

// GCM trabaja con un nonce de 12 bytes; es el tamaño para el que está
// diseñado y el que mejor rendimiento da.
const BYTES_IV = 12;
const BYTES_TAG = 16;

// Marca de versión. Sirve para dos cosas: distinguir un valor cifrado de uno
// que quedó en claro de antes, y poder cambiar de algoritmo más adelante sin
// tener que adivinar qué es cada fila.
const MARCA = 'v1';

/**
 * La llave de 32 bytes, derivada una sola vez.
 *
 * `scrypt` y no un simple hash porque la variable de entorno puede ser una
 * frase corta escrita a mano; el derivado le da el coste que le falta. La sal
 * es fija a propósito: si cambiara, la llave cambiaría y lo ya cifrado dejaría
 * de poder leerse.
 */
let llaveCache = null;

function llave() {
  if (llaveCache) return llaveCache;
  llaveCache = crypto.scryptSync(config.clave, 'huellitas-cifrado-v1', 32);
  return llaveCache;
}

/** ¿Este valor ya está cifrado por aquí? */
function estaCifrado(valor) {
  return typeof valor === 'string' && valor.startsWith(`${MARCA}:`);
}

/**
 * Cifra un texto. Devuelve 'v1:<base64url>', con el nonce y la etiqueta de
 * autenticación dentro del propio bloque: así una sola columna guarda todo lo
 * necesario para descifrar y no hay que añadir campos a la tabla.
 */
function cifrar(texto) {
  if (texto === null || texto === undefined || texto === '') return texto;
  if (estaCifrado(texto)) return texto;

  const iv = crypto.randomBytes(BYTES_IV);
  const cifrador = crypto.createCipheriv(ALGORITMO, llave(), iv);
  const cuerpo = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();

  return `${MARCA}:${Buffer.concat([iv, etiqueta, cuerpo]).toString('base64url')}`;
}

/**
 * Descifra lo que produjo `cifrar`.
 *
 * Un valor que no lleva la marca se devuelve tal cual, y eso es deliberado:
 * las filas escritas antes de que esto existiera están en claro, y hacerlas
 * fallar dejaría sin poder entrar a quien ya tenía el segundo factor puesto.
 * Se vuelven a guardar cifradas en cuanto se tocan.
 *
 * Lo que sí falla es un valor con la marca que no cuadra con la llave: eso no
 * es una fila vieja, es la llave equivocada o la fila alterada, y las dos
 * cosas hay que verlas en vez de taparlas.
 */
function descifrar(valor) {
  if (valor === null || valor === undefined || valor === '') return valor;
  if (!estaCifrado(valor)) return valor;

  const bloque = Buffer.from(String(valor).slice(MARCA.length + 1), 'base64url');
  const iv = bloque.subarray(0, BYTES_IV);
  const etiqueta = bloque.subarray(BYTES_IV, BYTES_IV + BYTES_TAG);
  const cuerpo = bloque.subarray(BYTES_IV + BYTES_TAG);

  const descifrador = crypto.createDecipheriv(ALGORITMO, llave(), iv);
  descifrador.setAuthTag(etiqueta);
  return Buffer.concat([descifrador.update(cuerpo), descifrador.final()]).toString('utf8');
}

module.exports = { cifrar, descifrar, estaCifrado };
