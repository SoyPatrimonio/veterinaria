'use strict';

/**
 * Seguridad clínica (frontend/js/seguridad-clinica.js).
 *
 * Son los avisos que ve el veterinario mientras registra una consulta. Un
 * falso negativo es recetar amoxicilina a un alérgico a la penicilina sin que
 * nada lo diga; un falso positivo constante hace que nadie lea los avisos.
 * Se prueban las dos cosas.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cargar() {
  const ventana = { Huella: {} };
  const codigo = fs.readFileSync(path.join(__dirname, '../../frontend/js/seguridad-clinica.js'), 'utf8');
  vm.runInNewContext(codigo, { window: ventana });
  // Lo que sale de otro contexto de vm tiene otro Array.prototype y deepEqual
  // lo distingue; se pasa por JSON para comparar solo los datos.
  const plano = (fn) => (...args) => JSON.parse(JSON.stringify(fn(...args)));
  const c = ventana.Huella.clinica;
  return {
    evaluarSignos: plano(c.evaluarSignos),
    revisarMedicamento: plano(c.revisarMedicamento),
    interacciones: plano(c.interacciones),
    familiasDe: plano(c.familiasDe),
  };
}

const { evaluarSignos, revisarMedicamento, interacciones, familiasDe } = cargar();

// Del catálogo del seed.
const AMOXICILINA = { id: 1, nombre: 'Amoxicilina', principio_activo: 'Amoxicilina + ácido clavulánico', via: 'oral' };
const MELOXICAM = { id: 2, nombre: 'Meloxicam', principio_activo: 'Meloxicam', via: 'oral' };
const IVERMECTINA = { id: 3, nombre: 'Ivermectina', principio_activo: 'Ivermectina', via: 'subcutanea' };
const PREDNISOLONA = { id: 5, nombre: 'Prednisolona', principio_activo: 'Prednisolona', via: 'oral' };
const CONDROITINA = { id: 7, nombre: 'Condroitina', principio_activo: 'Sulfato de condroitina + glucosamina', via: 'oral' };

/* ---------------- Signos vitales ---------------- */

test('signos: temperatura normal, alta y crítica en un perro', () => {
  const perro = { especie: 'Perro', edadMeses: 36 };
  assert.equal(evaluarSignos(perro, { temperaturaC: 38.5 }).temperaturaC.nivel, 'ok');
  assert.equal(evaluarSignos(perro, { temperaturaC: '39,8' }).temperaturaC.nivel, 'aviso', 'acepta coma decimal');
  const golpeDeCalor = evaluarSignos(perro, { temperaturaC: 41.6 }).temperaturaC;
  assert.equal(golpeDeCalor.nivel, 'critico');
  assert.match(golpeDeCalor.texto, /encima/);
  assert.equal(evaluarSignos(perro, { temperaturaC: 35 }).temperaturaC.nivel, 'critico');
});

test('signos: la frecuencia cardíaca normal depende de la especie y la edad', () => {
  // 180 lpm es taquicardia en un perro adulto, normal en un cachorro y en un gato.
  assert.equal(evaluarSignos({ especie: 'Perro', edadMeses: 48 }, { frecCardiaca: 180 }).frecCardiaca.nivel, 'aviso');
  assert.equal(evaluarSignos({ especie: 'Perro', edadMeses: 3 }, { frecCardiaca: 180 }).frecCardiaca.nivel, 'ok');
  assert.equal(evaluarSignos({ especie: 'Gato', edadMeses: 48 }, { frecCardiaca: 180 }).frecCardiaca.nivel, 'ok');
  assert.equal(evaluarSignos({ especie: 'Gato', edadMeses: 48 }, { frecCardiaca: 120 }).frecCardiaca.nivel, 'aviso', 'bradicardia en gato');
});

test('signos: sin rango para especies muy variables, y los campos vacíos no opinan', () => {
  const ave = evaluarSignos({ especie: 'Ave' }, { temperaturaC: 41, frecCardiaca: '' });
  assert.equal(ave.temperaturaC.nivel, 'ok');
  assert.match(ave.temperaturaC.texto, /Sin rango/);
  assert.equal(ave.frecCardiaca, undefined);
  assert.deepEqual(Object.keys(evaluarSignos({ especie: 'Perro' }, {})), []);
});

test('signos: la condición corporal se traduce y se marca fuera del ideal', () => {
  const perro = { especie: 'Perro' };
  assert.equal(evaluarSignos(perro, { condicionCorporal: 5 }).condicionCorporal.nivel, 'ok');
  assert.match(evaluarSignos(perro, { condicionCorporal: 7 }).condicionCorporal.texto, /Sobrepeso/);
  assert.equal(evaluarSignos(perro, { condicionCorporal: 7 }).condicionCorporal.nivel, 'aviso');
  assert.equal(evaluarSignos(perro, { condicionCorporal: 1 }).condicionCorporal.nivel, 'critico');
  assert.equal(evaluarSignos(perro, { condicionCorporal: 12 }).condicionCorporal, undefined);
});

test('signos: el peso se compara con la última medición', () => {
  const perro = { especie: 'Perro' };
  const anterior = { peso_kg: '18.40', fecha: '2026-08-01T00:00:00' };
  assert.equal(evaluarSignos(perro, { pesoKg: 18.6 }, anterior).pesoKg.nivel, 'ok');
  const bajo = evaluarSignos(perro, { pesoKg: 16 }, anterior).pesoKg;
  assert.equal(bajo.nivel, 'aviso');
  assert.match(bajo.texto, /Bajó 13 %/);
  assert.match(bajo.texto, /2026-08-01/);
  assert.equal(evaluarSignos(perro, { pesoKg: 14 }, anterior).pesoKg.nivel, 'critico', 'más del 20 %');
  assert.equal(evaluarSignos(perro, { pesoKg: 14 }).pesoKg, undefined, 'sin peso anterior no hay comparación');
});

/* ---------------- Alergias ---------------- */

const ROCKY = {
  especie: 'Perro', raza: 'Criollo',
  alergias: [{ nombre: 'Penicilina', tipo: 'medicamento', severidad: 'grave' }],
};

test('alergia: amoxicilina en un alérgico a la penicilina es peligro (caso del seed)', () => {
  const avisos = revisarMedicamento(AMOXICILINA, ROCKY);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].nivel, 'peligro');
  assert.match(avisos[0].texto, /Penicilina \(grave\).*misma familia \(penicilinas\)/);
});

test('alergia: una cefalosporina avisa de reactividad cruzada, sin bloquear', () => {
  const avisos = revisarMedicamento({ id: 9, nombre: 'Cefalexina' }, ROCKY);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].nivel, 'aviso');
  assert.match(avisos[0].texto, /cruzada/);
});

test('alergia: lo que no tiene relación no avisa', () => {
  assert.deepEqual(revisarMedicamento(MELOXICAM, ROCKY), []);
  assert.deepEqual(revisarMedicamento(PREDNISOLONA, ROCKY), []);
});

test('alergia: el nombre exacto, en plural o sin tildes, también cuenta', () => {
  const ctx = { especie: 'Gato', alergias: [{ nombre: 'AINEs', tipo: 'medicamento' }] };
  assert.equal(revisarMedicamento(MELOXICAM, ctx)[0].nivel, 'peligro');
  const ctx2 = { especie: 'Perro', alergias: [{ nombre: 'meloxicam', tipo: 'medicamento' }] };
  assert.equal(revisarMedicamento(MELOXICAM, ctx2)[0].nivel, 'peligro');
});

test('alergia: "sulfa" no salta con el sulfato de condroitina', () => {
  const ctx = { especie: 'Perro', alergias: [{ nombre: 'Sulfas', tipo: 'medicamento' }] };
  assert.deepEqual(revisarMedicamento(CONDROITINA, ctx), []);
  assert.equal(revisarMedicamento({ id: 8, nombre: 'Trimetoprim-sulfametoxazol' }, ctx)[0].nivel, 'peligro');
});

test('alergia: las alergias a alimentos o al ambiente no tocan los medicamentos', () => {
  const ctx = { especie: 'Perro', alergias: [{ nombre: 'Pollo', tipo: 'alimento' }, { nombre: 'Pulgas', tipo: 'ambiental' }] };
  assert.deepEqual(revisarMedicamento(AMOXICILINA, ctx), []);
});

test('reacción previa: al mismo medicamento o a uno de su familia', () => {
  const ctx = { especie: 'Perro', reacciones: [{ medicamento_id: 2, medicamento: 'Meloxicam', descripcion: 'Vómito con sangre', severidad: 'grave', fecha: '2026-03-02' }] };
  const mismo = revisarMedicamento(MELOXICAM, ctx);
  assert.equal(mismo[0].nivel, 'peligro');
  assert.match(mismo[0].texto, /Ya tuvo una reacción a Meloxicam el 2026-03-02: Vómito con sangre/);

  const pariente = revisarMedicamento({ id: 20, nombre: 'Carprofeno' }, ctx);
  assert.equal(pariente.length, 1);
  assert.match(pariente[0].texto, /misma familia/);

  const leve = { especie: 'Perro', reacciones: [{ medicamento_id: 2, medicamento: 'Meloxicam', descripcion: 'Decaimiento', severidad: 'leve' }] };
  assert.equal(revisarMedicamento(MELOXICAM, leve)[0].nivel, 'aviso');
});

/* ---------------- Especie y raza ---------------- */

test('especie: permetrina y paracetamol en un gato son peligro; en un perro, la permetrina no', () => {
  const permetrina = { id: 30, nombre: 'Pipeta antipulgas', principio_activo: 'Permetrina 65%' };
  assert.equal(revisarMedicamento(permetrina, { especie: 'Gato' })[0].nivel, 'peligro');
  assert.deepEqual(revisarMedicamento(permetrina, { especie: 'Perro' }), []);
  assert.match(revisarMedicamento({ nombre: 'Acetaminofén' }, { especie: 'gato' })[0].texto, /paracetamol/i);
});

test('especie: antibióticos orales en conejos, pero no inyectados', () => {
  assert.equal(revisarMedicamento(AMOXICILINA, { especie: 'Conejo' })[0].nivel, 'peligro');
  assert.deepEqual(revisarMedicamento({ ...AMOXICILINA, via: 'intramuscular' }, { especie: 'Conejo' }), []);
});

test('raza: ivermectina en un collie avisa de la mutación MDR1', () => {
  const collie = revisarMedicamento(IVERMECTINA, { especie: 'Perro', raza: 'Border Collie' });
  assert.equal(collie[0].nivel, 'peligro');
  assert.match(collie[0].texto, /MDR1/);
  assert.deepEqual(revisarMedicamento(IVERMECTINA, { especie: 'Perro', raza: 'Labrador Retriever' }), []);
  assert.deepEqual(revisarMedicamento(IVERMECTINA, { especie: 'Perro' }), [], 'sin raza no se adivina');
});

/* ---------------- Interacciones ---------------- */

test('interacciones: AINE con corticoide en la misma receta', () => {
  const avisos = interacciones([MELOXICAM, AMOXICILINA, PREDNISOLONA]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].texto, /Meloxicam \+ Prednisolona: .*úlcera/);
});

test('interacciones: dos AINE y el mismo medicamento repetido', () => {
  assert.match(interacciones([MELOXICAM, { id: 20, nombre: 'Carprofeno' }])[0].texto, /Dos AINE/);
  assert.match(interacciones([AMOXICILINA, AMOXICILINA])[0].texto, /dos veces/);
  assert.deepEqual(interacciones([AMOXICILINA, MELOXICAM]), []);
  assert.deepEqual(interacciones([]), []);
});

test('familias: el principio activo cuenta aunque el nombre comercial no diga nada', () => {
  assert.deepEqual(familiasDe({ nombre: 'Clavamox', principio_activo: 'Amoxicilina + ácido clavulánico' }), ['penicilinas']);
  assert.deepEqual(familiasDe({ nombre: 'Rimadyl', principio_activo: 'Carprofeno' }), ['aines']);
  assert.deepEqual(familiasDe({ nombre: 'Omeprazol' }), []);
});
