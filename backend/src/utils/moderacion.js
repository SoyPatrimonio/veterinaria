'use strict';

/**
 * Filtro de palabras para lo que se publica en la página.
 *
 * Los testimonios de la landing los escribe cualquiera y salen publicados sin
 * que nadie los revise antes, así que esto es lo único que hay entre lo que
 * alguien escribe y lo que lee el resto. No juzga opiniones —quien salió
 * descontento puede decirlo— sino groserías e insultos directos.
 *
 * Comparar contra una lista tal cual no alcanza: "PUTA", "púta", "put4",
 * "putaaaa" y "p u t a" son la misma palabra escrita para esquivar el filtro.
 * Por eso el texto se normaliza antes de compararlo.
 *
 * Dos cuidados que son propios de una veterinaria:
 *
 *   - la ñ se conserva. Si se quitara como una tilde más, "coño" quedaría
 *     escrito igual que "cono", y el cono isabelino aparece en cualquier
 *     testimonio de una cirugía;
 *   - no están "perra", "zorra", "cerdo", "chucha" ni "sapo". Como insulto lo
 *     son; en esta página son animales, y rechazar a quien cuenta que le
 *     operaron a su perra sería peor que dejar pasar el insulto.
 */

/**
 * Groserías e insultos. La lista se queda en eso a propósito: una crítica
 * ("me atendieron tarde", "me pareció caro") no es una grosería y tiene que
 * poder publicarse.
 *
 * Van en su forma normalizada —minúsculas y sin tildes, salvo la ñ—, porque
 * es contra el texto ya normalizado que se comparan. El plural se contempla
 * solo al comparar, así que aquí va el singular.
 */
const PALABRAS = [
  // Colombia y español general
  'puta', 'puto', 'putada', 'putazo', 'putear', 'hijueputa', 'hijoputa', 'jueputa', 'hpta',
  'malparido', 'malparida', 'malnacido', 'gonorrea', 'marica', 'maricon', 'maricona',
  'mariconada', 'pirobo', 'piroba', 'gueva', 'guevon', 'huevon', 'huevonada',
  'chimba', 'carechimba', 'careverga', 'caremonda', 'monda',
  'cabron', 'cabrona', 'pendejo', 'pendeja', 'pendejada', 'imbecil', 'idiota',
  'estupido', 'estupida', 'estupidez', 'tarado', 'tarada', 'baboso', 'babosa',
  'cretino', 'cretina', 'zoquete', 'subnormal', 'mongolico', 'energumeno', 'escoria',
  'bastardo', 'boludo', 'pelotudo', 'cojudo',
  'mierda', 'mierdero', 'cagada', 'cagon', 'joder', 'jodido', 'jodida', 'jodete',
  'carajo', 'coño', 'cojones', 'gilipollas', 'capullo',
  'culo', 'culero', 'culiado', 'culiao', 'verga', 'vergazo', 'pinga',
  'chingar', 'chingada', 'chingado', 'follar', 'follada',
  // Inglés, que también se escribe
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit',
  'bitch', 'asshole', 'cunt', 'whore', 'slut',
];

/** Números y símbolos que se usan para escribir una letra sin escribirla. */
const IMITACIONES = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };

/**
 * El límite de palabra no puede ser \b: para JavaScript la ñ no es letra, así
 * que "coño" terminaría en un límite en medio de la palabra. Con estos dos se
 * compara contra el mismo alfabeto que produce normalizar().
 */
const EXPRESION = new RegExp(`(?<![a-zñ])(?:${PALABRAS.join('|')})(?:s|es)?(?![a-zñ])`);

/**
 * Deja el texto en el alfabeto contra el que se compara: minúsculas, sin
 * tildes (menos la ñ), sin números que imiten letras, sin letras estiradas y
 * sin letras sueltas separadas a mano.
 */
function normalizar(texto) {
  const base = String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    // La ñ se descompone en n + tilde. Se vuelve a juntar antes de barrer las
    // tildes, que si no acabaría convertida en una n.
    .replace(/n\u0303/g, '\u00f1')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0134578@$]/g, (caracter) => IMITACIONES[caracter] || ' ')
    // Todo lo que no sea letra separa palabras: así "hijue-puta" y "hijue.puta"
    // quedan en dos, y "put*a" no se cuela por el asterisco.
    .replace(/[^a-zñ]+/g, ' ')
    // "putaaaa" -> "puta". Tres repeticiones o más, porque en español no hay
    // ninguna palabra con la misma letra tres veces seguidas y sí muchas con
    // dos (perro, calle, acción).
    .replace(/([a-zñ])\1{2,}/g, '$1')
    .trim();

  // "p u t a" -> "puta". Solo carreras de tres letras sueltas o más: dos
  // seguidas ("y a", "de a") son normales al escribir.
  return base.replace(/(?<![a-zñ])(?:[a-zñ] ){2,}[a-zñ](?![a-zñ])/g, (trozo) => trozo.replace(/ /g, ''));
}

/** La primera grosería que encuentra, ya normalizada, o null si no hay ninguna. */
function revisar(texto) {
  const encontrada = EXPRESION.exec(normalizar(texto));
  return encontrada ? encontrada[0] : null;
}

/** ¿Se puede publicar tal cual? */
function esLimpio(texto) {
  return revisar(texto) === null;
}

module.exports = { PALABRAS, normalizar, revisar, esLimpio };
