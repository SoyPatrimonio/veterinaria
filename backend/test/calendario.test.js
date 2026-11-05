'use strict';

/**
 * Calendarios .ics de las citas.
 *
 * Lo que más importa: que la hora sea la correcta en cualquier aplicación
 * (la base guarda hora local sin zona), que el archivo no se rompa con
 * tildes, comas o saltos de línea, y que cada rol vea el evento contado
 * para él sin datos que no le tocan.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const ics = require('../src/utils/ics');
const { deCitas, eventoDeCita } = require('../src/services/calendario.service');

const CLINICA = {
  nombre: 'Huellitas de Amor',
  sede: { direccion: 'Calle 10 # 5-20', ciudad: 'Bogotá', telefono: '601 555 0101' },
};

const CITA = {
  id: 42,
  inicio: '2026-11-20 15:30:00',
  fin: '2026-11-20 16:00:00',
  estado: 'confirmada',
  motivo: 'Vacuna anual, revisar oído',
  mascota_nombre: 'Luna',
  especie: 'Perro',
  cliente_nombre: 'Daniela Ríos',
  cliente_telefono: '300 123 4567',
  veterinario_nombre: 'Dra. Valentina Gómez',
  servicio_nombre: 'Vacunación',
};

const AHORA = new Date('2026-11-04T12:00:00Z');

/** Deshace el plegado de líneas para poder buscar propiedades completas. */
const desplegar = (texto) => texto.replace(/\r\n /g, '');

test('la hora local de la clínica se convierte a UTC', () => {
  // Bogotá es UTC-5 todo el año.
  assert.equal(ics.formatoUtc(ics.localAUtc('2026-11-20 15:30:00', 'America/Bogota')), '20261120T203000Z');
  // Madrid cambia de horario: -1 h en invierno, -2 h en verano.
  assert.equal(ics.formatoUtc(ics.localAUtc('2026-01-15 10:00', 'Europe/Madrid')), '20260115T090000Z');
  assert.equal(ics.formatoUtc(ics.localAUtc('2026-07-15 10:00', 'Europe/Madrid')), '20260715T080000Z');
});

test('escapa los caracteres que el formato reserva', () => {
  assert.equal(ics.escapar('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne');
});

test('pliega las líneas largas sin partir una tilde', () => {
  const linea = `DESCRIPTION:${'ñ'.repeat(60)}`;
  const plegada = ics.plegar(linea);
  for (const trozo of plegada.split('\r\n')) {
    assert.ok(Buffer.byteLength(trozo, 'utf8') <= 75, `trozo de ${Buffer.byteLength(trozo)} bytes`);
  }
  assert.equal(plegada.replace(/\r\n /g, ''), linea, 'al desplegar queda igual');
  assert.ok(!plegada.includes('�'));
});

test('el archivo tiene la estructura que piden Google, Apple y Outlook', async () => {
  const texto = await deCitas([CITA], 'cliente', { clinica: CLINICA, ahora: AHORA });

  assert.ok(texto.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(texto.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(texto), 'todas las líneas terminan en CRLF');

  const plano = desplegar(texto);
  assert.match(plano, /DTSTART:20261120T203000Z/);
  assert.match(plano, /DTEND:20261120T210000Z/);
  assert.match(plano, /DTSTAMP:20261104T120000Z/);
  assert.match(plano, /UID:cita-42@/);
  assert.match(plano, /STATUS:CONFIRMED/);
  assert.match(plano, /LOCATION:Huellitas de Amor — Calle 10 # 5-20\\, Bogotá/);
  assert.equal((plano.match(/BEGIN:VALARM/g) || []).length, 2, 'avisa el día antes y dos horas antes');
  assert.match(plano, /TRIGGER:-PT1440M/);
  assert.match(plano, /TRIGGER:-PT120M/);
});

test('el cliente ve a quién lleva y con quién, sin datos de otros', () => {
  const e = eventoDeCita(CITA, 'cliente', CLINICA);
  assert.equal(e.titulo, 'Vacunación para Luna · Huellitas de Amor');
  assert.match(e.descripcion, /Te atiende: Dra\. Valentina Gómez/);
  assert.match(e.descripcion, /Llama al 601 555 0101/);
  assert.doesNotMatch(e.descripcion, /300 123 4567/, 'su propio teléfono no hace falta');
});

test('el veterinario ve al paciente, al dueño y cómo contactarlo', () => {
  const e = eventoDeCita(CITA, 'veterinario', CLINICA);
  assert.equal(e.titulo, 'Vacunación · Luna (Daniela Ríos)');
  assert.match(e.descripcion, /Paciente: Luna \(Perro\)/);
  assert.match(e.descripcion, /Teléfono del dueño: 300 123 4567/);
});

test('una cita pendiente se marca como provisional y avisa que falta confirmar', async () => {
  const texto = desplegar(await deCitas([{ ...CITA, estado: 'pendiente' }], 'cliente', { clinica: CLINICA, ahora: AHORA }));
  assert.match(texto, /STATUS:TENTATIVE/);
  assert.match(texto, /Pendiente de confirmar/);
});

test('una cita cancelada reemplaza a la anterior y no suena', async () => {
  const texto = desplegar(await deCitas([{ ...CITA, estado: 'cancelada' }], 'cliente', { clinica: CLINICA, ahora: AHORA }));
  assert.match(texto, /STATUS:CANCELLED/);
  assert.match(texto, /SEQUENCE:2/, 'secuencia mayor que la de la confirmada');
  assert.doesNotMatch(texto, /BEGIN:VALARM/);
});

test('un motivo con comas, punto y coma y saltos no rompe el archivo', async () => {
  const motivo = 'Vómito; no come, decaído\nDesde ayer';
  const texto = desplegar(await deCitas([{ ...CITA, motivo }], 'cliente', { clinica: CLINICA, ahora: AHORA }));
  assert.match(texto, /Motivo: Vómito\\; no come\\, decaído\\nDesde ayer/);
});
