'use strict';

/**
 * Qué se le pide a una contraseña nueva.
 *
 * Vive suelta y no dentro de los esquemas porque la misma lista la usa el
 * navegador (frontend/js/password.js) para la guía en vivo: si cambia una
 * regla aquí, cambia allí también. El servidor es quien decide; el navegador
 * solo avisa antes de enviar.
 *
 * Las reglas se escriben con clases Unicode y no con [A-Za-z]: "Ñandú" lleva
 * mayúscula y "café" lleva minúscula aunque no sean letras inglesas.
 */

const LARGO_MINIMO = 8;

// bcrypt solo mira los primeros 72 BYTES y el resto lo ignora en silencio:
// una contraseña más larga se aceptaría y luego valdría igual que su recorte.
// Se cuentan bytes y no caracteres porque una tilde o un emoji ocupan varios.
const BYTES_MAXIMOS = 72;

const REGLAS = [
  {
    id: 'largo',
    texto: `Al menos ${LARGO_MINIMO} caracteres`,
    cumple: (v) => [...v].length >= LARGO_MINIMO,
  },
  {
    id: 'minuscula',
    texto: 'Una letra minúscula',
    cumple: (v) => /\p{Ll}/u.test(v),
  },
  {
    id: 'mayuscula',
    texto: 'Una letra mayúscula',
    cumple: (v) => /\p{Lu}/u.test(v),
  },
  {
    id: 'numero',
    texto: 'Un número',
    cumple: (v) => /\p{Nd}/u.test(v),
  },
  {
    id: 'especial',
    texto: 'Un carácter especial (! @ # $ …)',
    cumple: (v) => /[^\p{L}\p{N}\s]/u.test(v),
  },
];

/**
 * Contraseñas que no se aceptan por obvias.
 *
 * La lista es corta a propósito: no pretende ser un diccionario, sino cerrar
 * lo que de verdad escribe la gente en el sitio de una veterinaria que se
 * llama Huellitas. Con las reglas de arriba y nada más, "Huellitas1!" cumplía
 * todas y era la primera que probaría cualquiera.
 */
const PROHIBIDAS = [
  'huellitas', 'password', 'contrasena', 'qwerty', 'admin', 'veterinaria',
  'mascota', 'perro', 'gato', 'bienvenido', 'clave',
];

// El nombre de la clínica no vale ni escondido dentro de otra cosa.
const NOMBRE_CLINICA = 'huellitas';

/** Sin mayúsculas ni tildes: así se comparan las palabras. */
function plano(valor) {
  return String(valor).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Deja la contraseña como se compara: plana y sin lo que lleve pegado al
 * final ni al principio.
 *
 * Esa cola es lo importante. Las reglas se cumplen casi siempre pegando
 * cifras y un signo detrás de una palabra, y "Huellitas2026!" no es más
 * difícil de adivinar que "huellitas": quien prueba a mano empieza por ahí.
 */
function nucleo(valor) {
  return plano(valor).replace(/^[^a-z]+/, '').replace(/[^a-z]+$/, '');
}

/** Las reglas de forma que todavía no cumple, en el orden de la lista. */
function reglasFaltantes(valor) {
  const v = String(valor ?? '');
  return REGLAS.filter((r) => !r.cumple(v));
}

function esDemasiadoLarga(valor) {
  return Buffer.byteLength(String(valor), 'utf8') > BYTES_MAXIMOS;
}

/** ¿Es una palabra obvia o lleva el nombre de la clínica dentro? */
function esPredecible(valor) {
  const n = nucleo(valor);
  if (PROHIBIDAS.includes(n) || n.includes(NOMBRE_CLINICA)) return true;

  // "Aaaa1111!" cumple todo y es una tecla apretada: cuatro iguales seguidos
  // no los escribe nadie que esté eligiendo de verdad.
  if (/(.)\1{3,}/u.test(String(valor))) return true;

  return false;
}

/**
 * ¿La contraseña repite datos de la propia cuenta?
 *
 * Se mira el usuario del correo y cada palabra del nombre, de cuatro letras
 * en adelante: con menos, "Ana" dejaría fuera media lengua castellana.
 */
function contieneDatosPersonales(valor, { nombre, email } = {}) {
  const p = plano(valor);
  const piezas = [];

  if (email) piezas.push(plano(String(email).split('@')[0]));
  if (nombre) piezas.push(...plano(nombre).split(/[^a-z0-9]+/));

  return piezas.some((pieza) => pieza.length >= 4 && p.includes(pieza));
}

module.exports = {
  LARGO_MINIMO,
  BYTES_MAXIMOS,
  REGLAS,
  reglasFaltantes,
  esDemasiadoLarga,
  esPredecible,
  contieneDatosPersonales,
};
