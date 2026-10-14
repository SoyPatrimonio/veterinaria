'use strict';

/**
 * Reglas de alerta.
 *
 * El catálogo de reglas vive en la base (seed.sql) y el detector que las evalúa
 * vive en el código. Si un código no coincide, `DETECTORES[regla.codigo]` sale
 * undefined y la regla se salta EN SILENCIO: la clínica creería que está
 * vigilando algo que en realidad nadie mira. Esta prueba compara las dos listas.
 *
 * No necesita base de datos: lee el archivo de datos iniciales.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { DETECTORES } = require('../src/models/alerta.model');

const SEED = path.resolve(__dirname, '../../database/supabase/seed.sql');

/**
 * Fin de la sentencia SQL que empieza en `desde`.
 *
 * No vale buscar el primer ';': las descripciones de las reglas llevan punto y
 * coma dentro del texto ("...registrada; se avisa al abrir su historia"). Hay
 * que saltarse lo que va entre comillas simples.
 */
function finDeSentencia(sql, desde) {
  let dentroDeTexto = false;

  for (let i = desde; i < sql.length; i += 1) {
    if (sql[i] === "'") {
      // '' escapado dentro de un literal: sigue siendo el mismo texto.
      if (dentroDeTexto && sql[i + 1] === "'") { i += 1; continue; }
      dentroDeTexto = !dentroDeTexto;
    } else if (sql[i] === ';' && !dentroDeTexto) {
      return i;
    }
  }
  return sql.length;
}

/** Códigos del INSERT INTO alertas.reglas_alerta de seed.sql. */
function codigosSembrados() {
  const sql = fs.readFileSync(SEED, 'utf8');

  const inicio = sql.indexOf('INSERT INTO alertas.reglas_alerta');
  assert.notEqual(inicio, -1, 'seed.sql ya no siembra alertas.reglas_alerta');

  const bloque = sql.slice(inicio, finDeSentencia(sql, inicio));
  return [...bloque.matchAll(/\(\s*'([a-z_]+)',/g)].map((m) => m[1]);
}

test('el lector de seed.sql encuentra las reglas sembradas', () => {
  // Si esto sale vacío, las dos pruebas de coincidencia pasarían sin comparar
  // nada y no servirían para lo que están.
  assert.ok(codigosSembrados().length >= 10, 'no se leyeron las reglas de seed.sql');
});

test('cada regla sembrada tiene su detector en el código', () => {
  const sinDetector = codigosSembrados().filter((codigo) => !DETECTORES[codigo]);

  assert.deepEqual(
    sinDetector,
    [],
    `Estas reglas están en seed.sql pero ningún detector las evalúa: ${sinDetector.join(', ')}`
  );
});

test('cada detector del código está sembrado como regla', () => {
  const sembrados = codigosSembrados();
  const huerfanos = Object.keys(DETECTORES).filter((codigo) => !sembrados.includes(codigo));

  assert.deepEqual(
    huerfanos,
    [],
    `Estos detectores no tienen fila en seed.sql y nunca se ejecutarán: ${huerfanos.join(', ')}`
  );
});

test('todos los detectores declaran categoría, severidad, consulta y parámetros', () => {
  for (const [codigo, detector] of Object.entries(DETECTORES)) {
    assert.ok(detector.categoria, `${codigo} no declara categoría`);
    assert.ok(detector.severidad, `${codigo} no declara severidad`);
    assert.ok(detector.sql, `${codigo} no tiene consulta`);
    assert.equal(typeof detector.params, 'function', `${codigo} no declara params()`);
  }
});

test('la consulta de cada detector devuelve las columnas que espera el insert', () => {
  // recalcular() lee estas columnas de cada fila; si a un detector le falta una,
  // la alerta se crearía con campos en null y sin clave de deduplicación, y se
  // repetiría en cada recálculo.
  const columnas = ['clave', 'entidad_id', 'entidad', 'mascota_id', 'sede_id', 'titulo', 'mensaje', 'enlace'];

  for (const [codigo, detector] of Object.entries(DETECTORES)) {
    // La columna puede venir con alias explícito (`... AS titulo`) o heredar el
    // nombre de la tabla (`h.mascota_id`); las dos formas son válidas.
    //
    // El corte busca el FROM que abre su propia línea, no cualquier FROM: hay
    // consultas con `EXTRACT(EPOCH FROM ...)` en la lista de columnas, y cortar
    // ahí dejaría fuera la mitad del SELECT.
    const finSelect = detector.sql.search(/\n\s*FROM\b/);
    const seleccion = detector.sql.slice(0, finSelect === -1 ? undefined : finSelect);

    for (const columna of columnas) {
      assert.match(
        seleccion,
        new RegExp(`(AS ${columna}\\b|\\.${columna}\\b)`),
        `El detector "${codigo}" no devuelve la columna ${columna}`
      );
    }
  }
});

test('params() devuelve tantos valores como marcadores tiene la consulta', () => {
  for (const [codigo, detector] of Object.entries(DETECTORES)) {
    // Los '?' solo aparecen como marcadores en estas consultas; no hay literales
    // de texto con signos de interrogación.
    const marcadores = (detector.sql.match(/\?/g) || []).length;
    const valores = detector.params({}).length;

    assert.equal(
      valores,
      marcadores,
      `El detector "${codigo}" tiene ${marcadores} marcadores y params() devuelve ${valores} valores`
    );
  }
});

test('los umbrales por defecto no son cero ni negativos', () => {
  // Un umbral en cero convierte la regla en ruido permanente: alertaría de todo.
  for (const [codigo, detector] of Object.entries(DETECTORES)) {
    for (const valor of detector.params({})) {
      if (typeof valor === 'number') {
        assert.ok(valor > 0, `El detector "${codigo}" tiene un umbral por defecto de ${valor}`);
      }
    }
  }
});
