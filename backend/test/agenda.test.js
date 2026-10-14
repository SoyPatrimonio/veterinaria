'use strict';

/**
 * Reglas de la agenda: qué fechas se pueden reservar y cuáles no.
 *
 * Son las de la sección 3 del documento (nada en el pasado, nada fuera de la
 * ventana abierta, nada en un día en que la clínica cierra). Se prueban con
 * fechas relativas a hoy y no fijas, para que las pruebas sigan valiendo el año
 * que viene en vez de empezar a fallar solas.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// La clínica cierra los domingos. Se fija antes de cargar la configuración
// porque dotenv no pisa lo que ya está en el entorno; así se puede comprobar la
// regla del día cerrado, que con los valores por defecto (abre todos los días)
// nunca llegaría a saltar.
process.env.CLINICA_DIAS = '1,2,3,4,5,6';

const agenda = require('../src/services/agenda.service');
const fechas = require('../src/utils/fechas');
const { clinica } = require('../src/config/env');

/** Fecha ISO de dentro de N días, saltando el domingo si cae ahí. */
function enDias(dias) {
  let fecha = fechas.sumarDias(new Date(), dias);
  while (!clinica.diasAbiertos.includes(fecha.getDay())) {
    fecha = fechas.sumarDias(fecha, 1);
  }
  return fechas.aFechaISO(fecha);
}

/** El mensaje de error de validarFecha, o null si la aceptó. */
function motivoDeRechazo(fechaISO) {
  try {
    agenda.validarFecha(fechaISO);
    return null;
  } catch (error) {
    return error.message;
  }
}

test('acepta una fecha próxima dentro del horario de la clínica', () => {
  assert.equal(motivoDeRechazo(enDias(2)), null);
});

test('acepta hoy mismo (la hora la filtra la anticipación mínima, no la fecha)', () => {
  const hoy = fechas.aFechaISO(new Date());

  // Solo se comprueba si hoy es un día en que la clínica abre; un domingo la
  // regla que aplica es otra y ya tiene su propia prueba.
  if (clinica.diasAbiertos.includes(new Date().getDay())) {
    assert.equal(motivoDeRechazo(hoy), null);
  }
});

test('rechaza una fecha pasada', () => {
  const ayer = fechas.aFechaISO(fechas.sumarDias(new Date(), -1));
  assert.match(motivoDeRechazo(ayer), /fechas pasadas/i);
});

test('rechaza una fecha más allá de la ventana abierta', () => {
  const demasiadoLejos = fechas.aFechaISO(fechas.sumarDias(new Date(), clinica.diasMaximos + 5));
  assert.match(motivoDeRechazo(demasiadoLejos), /solo está abierta/i);
});

test('rechaza un día en que la clínica no atiende', () => {
  // El próximo domingo, que es el día que esta prueba dejó cerrado.
  let domingo = new Date();
  do {
    domingo = fechas.sumarDias(domingo, 1);
  } while (domingo.getDay() !== 0);

  const motivo = motivoDeRechazo(fechas.aFechaISO(domingo));
  assert.match(motivo, /no atiende los domingo/i);
});

test('rechaza fechas mal formadas o inexistentes', () => {
  assert.match(motivoDeRechazo('20/08/2026'), /no es válida/i);
  assert.match(motivoDeRechazo('2026-02-31'), /no es válida/i);
  assert.match(motivoDeRechazo(''), /no es válida/i);
});

test('el error de una fecha rechazada es un 400, no un fallo del servidor', () => {
  try {
    agenda.validarFecha('2020-01-01');
    assert.fail('debería haber lanzado');
  } catch (error) {
    // Importa que sea 400: un 500 haría buscar el problema en el servidor
    // cuando en realidad el dato que llegó estaba mal.
    assert.equal(error.status, 400);
  }
});

/* ------------------------------------------------------------------
   Qué parte del día ocupa una cita o un bloqueo

   Es lo que decide si un hueco se ofrece o no. Se prueba aparte porque
   calcularDisponibilidad() necesita la base de datos, y la aritmética de
   los rangos —que es donde estaba el fallo— no.
   ------------------------------------------------------------------ */

test('un rango del mismo día se traduce a los minutos que ocupa', () => {
  assert.deepEqual(
    agenda.rangoEnMinutos('2026-08-11 09:00:00', '2026-08-11 10:30:00', '2026-08-11'),
    { desde: 540, hasta: 630 }
  );
});

test('un rango que viene de la víspera se recorta a la medianoche', () => {
  // Sin recortarlo saldría { desde: 1320, hasta: 540 }: un rango invertido que
  // no se cruza con ningún hueco, así que la mañana entera se ofrecería libre
  // aunque el veterinario la tenga bloqueada.
  assert.deepEqual(
    agenda.rangoEnMinutos('2026-08-10 22:00:00', '2026-08-11 09:00:00', '2026-08-11'),
    { desde: 0, hasta: 540 }
  );
});

test('un rango que sigue al día siguiente se recorta al final del día', () => {
  assert.deepEqual(
    agenda.rangoEnMinutos('2026-08-11 18:00:00', '2026-08-12 08:00:00', '2026-08-11'),
    { desde: 1080, hasta: 1440 }
  );
});

test('acepta los extremos como Date además de como texto', () => {
  assert.deepEqual(
    agenda.rangoEnMinutos(new Date(2026, 7, 11, 9, 0), new Date(2026, 7, 11, 10, 0), '2026-08-11'),
    { desde: 540, hasta: 600 }
  );
});
