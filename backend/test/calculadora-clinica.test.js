'use strict';

/**
 * Calculadora clínica (frontend/js/calculadora-clinica.js).
 *
 * Es aritmética, pero aritmética con la que se medica a un paciente: un
 * factor 60 o 1000 mal puesto es una sobredosis. Cada caso se comprueba
 * contra la cuenta hecha a mano.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cargar() {
  const ventana = { Huella: {} };
  const codigo = fs.readFileSync(path.join(__dirname, '../../frontend/js/calculadora-clinica.js'), 'utf8');
  vm.runInNewContext(codigo, { window: ventana });
  return ventana.Huella.calculadora;
}

const { calcular, fraccion } = cargar();

test('dosis: mg, mL y tabletas para un perro de 24 kg', () => {
  // 24 kg × 5 mg/kg = 120 mg; 120 ÷ 50 mg/mL = 2,4 mL; 120 ÷ 50 mg/tab = 2,4 tab ≈ 2½.
  const r = calcular.dosis({ pesoKg: '24', dosisMgKg: '5', concentracionMgMl: '50', mgPorTableta: '50' });
  assert.equal(r.mg, 120);
  assert.equal(r.ml, 2.4);
  assert.equal(r.tabletas, 2.4);
  assert.equal(r.tabletasPartidas, 2.5);
  assert.ok(r.avisos.some((a) => /cuarto/.test(a)), 'avisa que el redondeo cambia la dosis');
});

test('dosis: acepta coma decimal, como se escribe en Colombia', () => {
  const r = calcular.dosis({ pesoKg: '3,5', dosisMgKg: '0,2', concentracionMgMl: '1' });
  assert.equal(r.mg, 0.7);
  assert.equal(r.ml, 0.7);
});

test('dosis: sin concentración ni tableta da solo los mg', () => {
  const r = calcular.dosis({ pesoKg: 10, dosisMgKg: 2 });
  assert.deepEqual(Object.keys(r).sort(), ['avisos', 'mg']);
});

test('dosis: rechaza vacíos, ceros, negativos y texto', () => {
  assert.throws(() => calcular.dosis({ pesoKg: '', dosisMgKg: 5 }), /peso/);
  assert.throws(() => calcular.dosis({ pesoKg: 0, dosisMgKg: 5 }), /peso/);
  assert.throws(() => calcular.dosis({ pesoKg: 10, dosisMgKg: -1 }), /dosis/);
  assert.throws(() => calcular.dosis({ pesoKg: 'diez', dosisMgKg: 1 }), /peso/);
});

test('dosis: avisa de pesos imposibles y volúmenes que no se pueden medir', () => {
  assert.ok(calcular.dosis({ pesoKg: 250, dosisMgKg: 1 }).avisos.some((a) => /100 kg/.test(a)));
  assert.ok(calcular.dosis({ pesoKg: 0.02, dosisMgKg: 1 }).avisos.some((a) => /50 g/.test(a)));
  assert.ok(calcular.dosis({ pesoKg: 1, dosisMgKg: 0.01, concentracionMgMl: 10 }).avisos.some((a) => /diluir/.test(a)));
});

test('infusión: µg/kg/min se pasa a mg/kg/h multiplicando por 60 y dividiendo por 1000', () => {
  // 10 µg/kg/min = 0,6 mg/kg/h; × 20 kg = 12 mg/h; ÷ 20 mg/mL = 0,6 mL/h.
  const r = calcular.infusion({ pesoKg: 20, dosis: 10, unidad: 'ug/kg/min', concentracionMgMl: 20 });
  assert.equal(r.mgKgH, 0.6);
  assert.equal(r.mgH, 12);
  assert.equal(r.mlH, 0.6);
});

test('infusión: en mg/kg/h no se convierte nada', () => {
  const r = calcular.infusion({ pesoKg: 5, dosis: 2, unidad: 'mg/kg/h', concentracionMgMl: 10 });
  assert.equal(r.mgH, 10);
  assert.equal(r.mlH, 1);
});

test('infusión: cuánto añadir a la bolsa de fluidos', () => {
  // 12 mg/h a 50 mL/h en bolsa de 500 mL → 120 mg en la bolsa = 6 mL de 20 mg/mL; dura 10 h.
  const r = calcular.infusion({
    pesoKg: 20, dosis: 10, unidad: 'ug/kg/min', concentracionMgMl: 20, ritmoFluidosMlH: 50, volumenBolsaMl: 500,
  });
  assert.equal(r.mgEnBolsa, 120);
  assert.equal(r.mlFarmacoEnBolsa, 6);
  assert.equal(r.horasBolsa, 10);
  assert.equal(r.avisos.length, 0, 'el fármaco ocupa poco de la bolsa');
});

test('infusión: pide ritmo y bolsa juntos, y una unidad conocida', () => {
  assert.throws(() => calcular.infusion({ pesoKg: 5, dosis: 1, unidad: 'mg/kg/h', concentracionMgMl: 1, ritmoFluidosMlH: 10 }), /bolsa/);
  assert.throws(() => calcular.infusion({ pesoKg: 5, dosis: 1, unidad: 'mg/kg/día', concentracionMgMl: 1 }), /unidad/);
});

test('infusión: avisa si el fármaco ocupa mucho volumen de la bolsa', () => {
  const r = calcular.infusion({
    pesoKg: 30, dosis: 5, unidad: 'mg/kg/h', concentracionMgMl: 10, ritmoFluidosMlH: 20, volumenBolsaMl: 250,
  });
  assert.ok(r.avisos.some((a) => /10 %/.test(a)));
});

test('goteo: 100 mL/h con equipo de 20 gotas/mL son 33,3 gotas/min', () => {
  const r = calcular.goteo({ mlH: 100, factorGotasMl: 20 });
  assert.equal(r.gotasMin, 33.3);
  assert.equal(r.segundosPorGota, 1.8);
});

test('goteo: el ritmo también sale de volumen y horas', () => {
  // 500 mL en 8 h = 62,5 mL/h; con microgoteo 60 gotas/mL = 62,5 gotas/min.
  const r = calcular.goteo({ volumenMl: 500, horas: 8, factorGotasMl: 60 });
  assert.equal(r.mlH, 62.5);
  assert.equal(r.gotasMin, 62.5);
});

test('goteo: avisa cuando ya no se puede contar a ojo', () => {
  assert.ok(calcular.goteo({ mlH: 500, factorGotasMl: 20 }).avisos.length > 0);
});

test('las tabletas se escriben como se parten', () => {
  assert.equal(fraccion(0.25), '¼ tableta');
  assert.equal(fraccion(1), '1 tableta');
  assert.equal(fraccion(2.5), '2 ½ tabletas');
  assert.equal(fraccion(3), '3 tabletas');
});
