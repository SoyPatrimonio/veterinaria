'use strict';

/**
 * Códigos de un solo uso por tiempo (TOTP, RFC 6238).
 *
 * Es lo que leen Google Authenticator, Aegis, 1Password y cualquier otra app
 * de códigos: un HMAC del reloj partido en bloques de treinta segundos. Va
 * escrito aquí y no con una librería porque son cuarenta líneas sobre
 * `crypto`, que ya viene con Node, y añadir una dependencia a un proyecto que
 * no tiene ninguna para esto significaría una pieza más que auditar y
 * actualizar.
 *
 * El algoritmo es SHA-1 a propósito: no es una elección de seguridad sino de
 * compatibilidad. Es lo que implementan las aplicaciones de autenticación, y
 * aquí no protege un secreto en reposo sino que deriva un código de seis
 * cifras que vive treinta segundos.
 */

const crypto = require('crypto');

// Segundos que dura cada código. Treinta es lo que esperan las apps.
const PASO_SEGUNDOS = 30;

// Cifras del código.
const DIGITOS = 6;

/**
 * Cuántos pasos hacia atrás y hacia adelante se aceptan.
 *
 * Uno a cada lado da minuto y medio de margen, que cubre el reloj desajustado
 * del teléfono y el tiempo que tarda alguien en teclear. Más ventana que esa
 * alarga la vida de un código robado sin ganar comodidad.
 */
const VENTANA = 1;

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/* ------------------------------------------------------------------
   Base32

   Las apps de autenticación reciben el secreto en base32, no en hexadecimal
   ni en base64: es el formato del estándar y el único que se puede teclear a
   mano sin equivocarse, porque no distingue mayúsculas ni tiene caracteres
   que se confundan entre sí.
   ------------------------------------------------------------------ */

function aBase32(buffer) {
  let bits = 0;
  let valor = 0;
  let salida = '';

  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];

  return salida;
}

function desdeBase32(texto) {
  let bits = 0;
  let valor = 0;
  const bytes = [];

  // Se ignoran espacios, guiones y el relleno: la gente copia el secreto de la
  // pantalla y lo pega con separadores.
  for (const caracter of String(texto).toUpperCase().replace(/[\s-=]/g, '')) {
    const indice = ALFABETO_BASE32.indexOf(caracter);
    if (indice === -1) throw new Error('El secreto no es base32 válido.');

    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/* ------------------------------------------------------------------
   Códigos
   ------------------------------------------------------------------ */

/** Secreto nuevo. 20 bytes es lo que recomienda el RFC para SHA-1. */
function generarSecreto() {
  return aBase32(crypto.randomBytes(20));
}

/** El contador de un instante: cuántos bloques de 30 s van desde 1970. */
function contadorDe(instanteMs = Date.now()) {
  return Math.floor(instanteMs / 1000 / PASO_SEGUNDOS);
}

/** Código de seis cifras para un contador concreto. */
function codigoPara(secreto, contador) {
  const clave = desdeBase32(secreto);

  // El contador viaja como entero de 64 bits en orden de red.
  const bloque = Buffer.alloc(8);
  bloque.writeBigUInt64BE(BigInt(contador));

  const hmac = crypto.createHmac('sha1', clave).update(bloque).digest();

  // Truncado dinámico del RFC: los últimos cuatro bits dicen desde dónde leer.
  const desplazamiento = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[desplazamiento] & 0x7f) << 24) |
    ((hmac[desplazamiento + 1] & 0xff) << 16) |
    ((hmac[desplazamiento + 2] & 0xff) << 8) |
    (hmac[desplazamiento + 3] & 0xff);

  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/** El código que toca ahora mismo. */
function codigoActual(secreto, instanteMs = Date.now()) {
  return codigoPara(secreto, contadorDe(instanteMs));
}

/**
 * Comprueba un código y devuelve el contador con el que casó, o null.
 *
 * Devuelve el contador y no un booleano a propósito: quien llama tiene que
 * guardarlo para no aceptar dos veces el mismo código. Sin eso, un código
 * interceptado sirve durante todo su minuto y medio de ventana, que es
 * justamente lo que un segundo factor debería impedir.
 *
 * La comparación es de tiempo constante: comparar con === filtra por cuántas
 * cifras coinciden, y eso, repetido muchas veces, se puede medir.
 */
function verificar(secreto, codigo, { instanteMs = Date.now(), ventana = VENTANA } = {}) {
  const limpio = String(codigo || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return null;

  const ahora = contadorDe(instanteMs);

  for (let salto = -ventana; salto <= ventana; salto += 1) {
    const contador = ahora + salto;
    const esperado = Buffer.from(codigoPara(secreto, contador));

    if (crypto.timingSafeEqual(Buffer.from(limpio), esperado)) return contador;
  }

  return null;
}

/**
 * Dirección otpauth:// que las aplicaciones leen del QR.
 *
 * Sirve igual pegada a mano en las que dejan añadir una cuenta por dirección,
 * y es lo que se le enseña a quien no puede escanear.
 */
function direccionOtpauth(secreto, cuenta, emisor = 'Huellitas de Amor') {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  const parametros = new URLSearchParams({
    secret: secreto,
    issuer: emisor,
    algorithm: 'SHA1',
    digits: String(DIGITOS),
    period: String(PASO_SEGUNDOS),
  });
  return `otpauth://totp/${etiqueta}?${parametros.toString()}`;
}

module.exports = {
  PASO_SEGUNDOS,
  DIGITOS,
  VENTANA,
  aBase32,
  desdeBase32,
  generarSecreto,
  contadorDe,
  codigoPara,
  codigoActual,
  verificar,
  direccionOtpauth,
};
