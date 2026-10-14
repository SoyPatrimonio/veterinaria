'use strict';

/**
 * Utilidades de fecha de la agenda.
 *
 * Se prueban estas antes que nada porque un error aquí no rompe nada de forma
 * visible: simplemente coloca una cita una hora antes o un día después, y eso
 * solo se descubre cuando alguien llega a la clínica a la hora equivocada.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const fechas = require('../src/utils/fechas');

test('esFechaValida acepta una fecha real y rechaza las que no existen', () => {
  assert.equal(fechas.esFechaValida('2026-08-12'), true);

  // El 31 de febrero no existe: `new Date` lo desplazaría al 2 o 3 de marzo en
  // vez de fallar, así que la validación compara el resultado con lo pedido.
  assert.equal(fechas.esFechaValida('2026-02-31'), false);
  assert.equal(fechas.esFechaValida('2026-13-01'), false);
  assert.equal(fechas.esFechaValida('12/08/2026'), false);
  assert.equal(fechas.esFechaValida(''), false);
});

test('esFechaValida acepta el 29 de febrero solo en año bisiesto', () => {
  assert.equal(fechas.esFechaValida('2024-02-29'), true);
  assert.equal(fechas.esFechaValida('2026-02-29'), false);
});

test('esHoraValida exige HH:MM de 24 horas', () => {
  assert.equal(fechas.esHoraValida('00:00'), true);
  assert.equal(fechas.esHoraValida('23:59'), true);
  assert.equal(fechas.esHoraValida('24:00'), false);
  assert.equal(fechas.esHoraValida('09:60'), false);
  assert.equal(fechas.esHoraValida('9:00'), false);
});

test('aFechaISO y aTimestampSQL usan la hora local, no UTC', () => {
  // Este es el error que se quiere evitar: con toISOString(), una cita de las
  // 20:00 en Bogotá se guardaría como el día siguiente a la 01:00.
  const nocheDelDoce = new Date(2026, 7, 12, 20, 30, 0);

  assert.equal(fechas.aFechaISO(nocheDelDoce), '2026-08-12');
  assert.equal(fechas.aTimestampSQL(nocheDelDoce), '2026-08-12 20:30:00');
});

test('combinar arma la fecha y hora local que se guarda en la cita', () => {
  const inicio = fechas.combinar('2026-08-12', '09:30');

  assert.equal(fechas.aTimestampSQL(inicio), '2026-08-12 09:30:00');
});

test('sumarMinutos calcula el fin de la cita y cruza bien la medianoche', () => {
  const inicio = fechas.combinar('2026-08-12', '09:30');
  assert.equal(fechas.aTimestampSQL(fechas.sumarMinutos(inicio, 45)), '2026-08-12 10:15:00');

  const tarde = fechas.combinar('2026-08-12', '23:30');
  assert.equal(fechas.aTimestampSQL(fechas.sumarMinutos(tarde, 60)), '2026-08-13 00:30:00');
});

test('sumarDias respeta el cambio de mes y no muta la fecha original', () => {
  const original = new Date(2026, 7, 30, 12, 0, 0);
  const despues = fechas.sumarDias(original, 5);

  assert.equal(fechas.aFechaISO(despues), '2026-09-04');
  assert.equal(fechas.aFechaISO(original), '2026-08-30', 'la fecha original no debe cambiar');
});

test('horaAMinutos y minutosAHora son inversas', () => {
  assert.equal(fechas.horaAMinutos('09:30'), 570);
  assert.equal(fechas.horaAMinutos('00:00'), 0);
  assert.equal(fechas.minutosAHora(570), '09:30');
  assert.equal(fechas.minutosAHora(0), '00:00');

  // Con segundos, como llegan desde PostgreSQL.
  assert.equal(fechas.horaAMinutos('14:05:00'), 845);
});

test('diaSemana devuelve 0 para domingo, como la columna dia_semana', () => {
  assert.equal(fechas.diaSemana('2026-08-16'), 0, 'domingo');
  assert.equal(fechas.diaSemana('2026-08-12'), 3, 'miércoles');
});

test('nombreDia devuelve texto vacío para un índice fuera de rango', () => {
  assert.equal(fechas.nombreDia(0), 'domingo');
  assert.equal(fechas.nombreDia(6), 'sábado');
  assert.equal(fechas.nombreDia(9), '');
});

test('sumarMeses calcula el refuerzo de una vacuna cambiando el número de mes', () => {
  assert.equal(fechas.sumarMeses('2026-08-12', 6), '2027-02-12');
  assert.equal(fechas.sumarMeses('2026-08-12', 1), '2026-09-12');
  assert.equal(fechas.sumarMeses('2026-12-05', 1), '2027-01-05', 'cambia de año');
  assert.equal(fechas.sumarMeses('2026-08-12', 12), '2027-08-12');
});

test('sumarMeses retrocede al último día cuando el mes destino es más corto', () => {
  // Un año después del 31 de enero sí existe; un mes después, no: febrero se
  // queda en 28 (o 29). Sumar 30 días daría una fecha distinta cada vez.
  assert.equal(fechas.sumarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(fechas.sumarMeses('2024-01-31', 1), '2024-02-29', 'año bisiesto');
  assert.equal(fechas.sumarMeses('2026-08-31', 1), '2026-09-30');
});
