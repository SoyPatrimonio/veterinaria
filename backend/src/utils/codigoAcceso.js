'use strict';

/**
 * Los códigos de acceso del personal.
 *
 * El registro público crea clientes. Un veterinario puede además darse de alta
 * con el código de veterinario, que entrega la administración. Las cuentas de
 * administración no salen de aquí: las crea otro administrador desde el panel
 * de usuarios.
 *
 * Son códigos fijos y de larga vida, así que se tratan como lo que son:
 *
 *   - doce caracteres de un alfabeto de 27 dan unos 57 bits. Adivinarlo a
 *     ciegas no es alcanzable ni sin límite de intentos, y con el límite por
 *     IP de la base por delante, menos;
 *   - el alfabeto deja fuera las parejas que se confunden al dictarlo por
 *     teléfono o al copiarlo de un papel (0/O, 1/I/L, 5/S, 2/Z);
 *   - la comparación no se corta en el primer carácter distinto, para no
 *     filtrar por el tiempo de respuesta cuánto se acertó.
 */

const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHJKMNPQRTUVWXY346789';
const GRUPOS = 3;
const LARGO_GRUPO = 4;

/**
 * Qué rol lleva cada prefijo.
 *
 * 'cliente' no está y no es un olvido: esa es la puerta abierta del sitio,
 * la que no necesita que nadie te dé nada.
 *
 * 'admin' tampoco está, y esa sí conviene explicarla. Un código de
 * administración es una cadena fija, que no caduca, y que por sí sola
 * —escrita en un formulario abierto a internet— fabricaba una cuenta con
 * acceso a usuarios, facturación e historias clínicas, sin que ningún
 * administrador existente se enterara. Para eso basta con que el código se
 * reenvíe por WhatsApp, se quede en un papel del mostrador o se lea de una
 * pantalla. La entropía y el límite de intentos protegen contra adivinarlo,
 * pero no contra que se filtre, que es lo que de verdad les pasa a los
 * códigos que circulan.
 *
 * Ahora esas cuentas se crean desde el panel, donde quien las crea ya está
 * identificado, tiene el permiso `usuarios.crear` y vuelve a escribir su
 * contraseña antes de que se guarde nada.
 */
const PREFIJOS = {
  veterinario: 'VET',
};

const ROLES_CON_CODIGO = Object.keys(PREFIJOS);

/** Un código nuevo para ese rol, con la forma VET-XXXX-XXXX-XXXX. */
function generar(rol) {
  const prefijo = PREFIJOS[rol];
  if (!prefijo) throw new Error(`El rol "${rol}" no lleva código de acceso.`);

  const grupos = [];
  for (let g = 0; g < GRUPOS; g += 1) {
    let grupo = '';
    // randomInt y no Math.random(): esto es un secreto, no un número de
    // ejemplo, y el generador de JavaScript es predecible.
    for (let i = 0; i < LARGO_GRUPO; i += 1) grupo += ALFABETO[crypto.randomInt(ALFABETO.length)];
    grupos.push(grupo);
  }

  return `${prefijo}-${grupos.join('-')}`;
}

/**
 * Deja el código como se compara: en mayúsculas y sin separadores.
 *
 * Quien lo recibe por WhatsApp lo pega con espacios, sin guiones o en
 * minúsculas, y las tres formas son el mismo código. Rechazarlas solo haría
 * que volviera a escribirlo hasta acertar con el formato.
 */
function normalizar(codigo) {
  return String(codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * ¿El código escrito es el vigente?
 *
 * Se comparan los resúmenes y no los textos: timingSafeEqual exige que las dos
 * partes midan lo mismo, y con el hash siempre miden 32 bytes venga lo que
 * venga del formulario.
 */
function coincide(escrito, vigente) {
  const uno = normalizar(escrito);
  const otro = normalizar(vigente);
  if (!uno || !otro) return false;

  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(uno).digest(),
    crypto.createHash('sha256').update(otro).digest()
  );
}

/**
 * Cómo se enseña en el panel mientras nadie pulse "Mostrar": el prefijo y las
 * dos últimas cifras, lo justo para reconocer de un vistazo si el que tiene
 * alguien apuntado sigue siendo el bueno.
 *
 * El prefijo sale del propio código y no del rol: así lo tapado sigue diciendo
 * de qué código se trata aunque se pase suelto, sin su rol al lado.
 */
function enmascarar(codigo) {
  const limpio = normalizar(codigo);
  if (!limpio) return '';

  const largoPrefijo = 3;
  const prefijo = limpio.slice(0, largoPrefijo);
  const cuerpo = limpio.slice(largoPrefijo);
  const oculto = '•'.repeat(Math.max(cuerpo.length - 2, 0)) + cuerpo.slice(-2);

  // Se vuelve a agrupar de cuatro en cuatro para que ocupe lo mismo que el
  // código de verdad y el recuadro no cambie de tamaño al mostrarlo.
  return `${prefijo}-${(oculto.match(/.{1,4}/g) || []).join('-')}`;
}

module.exports = { generar, normalizar, coincide, enmascarar, PREFIJOS, ROLES_CON_CODIGO, ALFABETO };
