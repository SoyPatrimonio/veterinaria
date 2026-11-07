'use strict';

const crypto = require('node:crypto');

/**
 * ¿La contraseña aparece en filtraciones públicas?
 *
 * Se consulta Have I Been Pwned con su modelo de k-anonimato: se calcula el
 * SHA-1 de la contraseña y solo viajan sus 5 primeros caracteres. El servicio
 * devuelve todos los sufijos que empiezan así (cientos) y la comparación se
 * hace aquí. Ni la contraseña ni su hash completo salen nunca del servidor.
 * Con `Add-Padding` la respuesta trae relleno para que su tamaño no delate
 * cuántos sufijos coincidían.
 *
 * Si el servicio no responde a tiempo se deja pasar la contraseña: que un
 * tercero esté caído no puede impedir que alguien se registre o recupere su
 * cuenta. Las reglas de forma (politicaPassword.js) se aplican igual.
 *
 * Se apaga con VERIFICAR_FILTRADAS=0, y no corre en las pruebas.
 */

const URL_BASE = 'https://api.pwnedpasswords.com/range/';
const ESPERA_MS = 2500;

// A partir de cuántas apariciones se rechaza. Una sola ya significa que está
// en las listas que se prueban primero en un ataque de diccionario.
const MINIMO_APARICIONES = 1;

function activa() {
  if (process.env.VERIFICAR_FILTRADAS === '0') return false;
  // node --test pone NODE_TEST_CONTEXT en cada archivo de pruebas: así no
  // hace falta acordarse de una variable para que las pruebas no salgan a
  // internet.
  if (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) return false;
  return true;
}

/**
 * Cuántas veces aparece en filtraciones, o null si no se pudo saber.
 * `pedir` se puede sustituir en las pruebas para no salir a internet.
 */
async function apariciones(password, { pedir = fetch } = {}) {
  const sha1 = crypto.createHash('sha1').update(String(password), 'utf8').digest('hex').toUpperCase();
  const prefijo = sha1.slice(0, 5);
  const sufijo = sha1.slice(5);

  try {
    const respuesta = await pedir(URL_BASE + prefijo, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'huellitas-de-amor' },
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (!respuesta.ok) throw new Error(`respuesta ${respuesta.status}`);

    const texto = await respuesta.text();
    for (const linea of texto.split('\n')) {
      const [candidato, veces] = linea.trim().split(':');
      if (candidato === sufijo) return Number(veces) || 0;
    }
    return 0;
  } catch (error) {
    console.warn(`[seguridad] no se pudo consultar contraseñas filtradas: ${error.message}`);
    return null;
  }
}

/** ¿Hay que rechazarla? Falso también cuando no se pudo comprobar. */
async function estaFiltrada(password, opciones) {
  if (!activa() && !(opciones && opciones.forzar)) return false;
  const veces = await apariciones(password, opciones);
  return veces !== null && veces >= MINIMO_APARICIONES;
}

module.exports = { apariciones, estaFiltrada };
