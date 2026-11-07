'use strict';

/**
 * Calendarios iCalendar (RFC 5545): el formato que entienden Google
 * Calendar, Apple Calendar y Outlook.
 *
 * La base guarda las citas en hora local de la clínica, sin zona. Aquí se
 * pasan a UTC (sufijo Z) con la zona de la clínica en vez de mandar un TZID:
 * Outlook solo respeta un TZID si va acompañado de su definición completa
 * (VTIMEZONE), mientras que una hora en UTC la entienden todos igual y cada
 * aplicación la muestra en la hora de quien la mira.
 *
 * Funciones puras: no tocan la base ni el reloj si no se les pasa.
 */

/**
 * Cuántos minutos va la zona por delante de UTC en ese instante.
 * Bogotá da -300; con horario de verano el valor cambia según la fecha, y
 * por eso se calcula para cada instante en lugar de fijarlo.
 */
function desfaseMinutos(instanteMs, zona) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(instanteMs)).map((p) => [p.type, p.value])
  );
  const comoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second);
  return Math.round((comoUtc - instanteMs) / 60000);
}

/** 'YYYY-MM-DD HH:mm[:ss]' en hora de `zona` → Date (instante real). */
function localAUtc(texto, zona) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(texto));
  if (!m) throw new Error(`Fecha no reconocida: ${texto}`);
  const comoUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  // Dos pasadas: el desfase de la primera estimación puede ser el del otro
  // lado de un cambio de horario.
  let instante = comoUtc - desfaseMinutos(comoUtc, zona) * 60000;
  instante = comoUtc - desfaseMinutos(instante, zona) * 60000;
  return new Date(instante);
}

/** Date → 20261104T150000Z */
function formatoUtc(fecha) {
  return fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Texto de una propiedad: se escapan \ ; , y los saltos de línea. */
function escapar(texto) {
  return String(texto ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Corta la línea en trozos de 75 bytes como pide el estándar; las siguientes
 * empiezan con un espacio. Se cuentan bytes UTF-8 y no se parte nunca un
 * carácter por la mitad: una tilde cortada en dos rompe la importación.
 */
function plegar(linea) {
  const trozos = [];
  let actual = '';
  let bytes = 0;
  for (const caracter of linea) {
    const tam = Buffer.byteLength(caracter, 'utf8');
    const limite = trozos.length ? 74 : 75; // el espacio inicial cuenta
    if (bytes + tam > limite) {
      trozos.push(actual);
      actual = '';
      bytes = 0;
    }
    actual += caracter;
    bytes += tam;
  }
  trozos.push(actual);
  return trozos.join('\r\n ');
}

const ESTADO_ICS = {
  pendiente: 'TENTATIVE',
  confirmada: 'CONFIRMED',
  cancelada: 'CANCELLED',
};

/**
 * Arma el VEVENT de un evento.
 *
 * - uid: estable para cada cita. Importar otra vez el mismo archivo
 *   actualiza el evento en vez de duplicarlo.
 * - secuencia: sube cuando la cita cambia; sin ella, algunas aplicaciones
 *   ignoran la versión nueva de un evento que ya tienen.
 * - alarmas: minutos antes del inicio en que avisar.
 */
function evento({ uid, inicio, fin, titulo, descripcion, lugar, estado, secuencia = 0, alarmas = [], url }, { zona, ahora }) {
  const lineas = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatoUtc(ahora)}`,
    `DTSTART:${formatoUtc(localAUtc(inicio, zona))}`,
    `DTEND:${formatoUtc(localAUtc(fin, zona))}`,
    `SUMMARY:${escapar(titulo)}`,
  ];
  if (descripcion) lineas.push(`DESCRIPTION:${escapar(descripcion)}`);
  if (lugar) lineas.push(`LOCATION:${escapar(lugar)}`);
  if (url) lineas.push(`URL:${url}`);
  if (ESTADO_ICS[estado]) lineas.push(`STATUS:${ESTADO_ICS[estado]}`);
  lineas.push(`SEQUENCE:${Math.max(0, Math.floor(secuencia))}`);

  // Una cita cancelada no avisa: el aviso de algo que no va a pasar confunde.
  if (estado !== 'cancelada') {
    for (const minutos of alarmas) {
      lineas.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapar(titulo)}`,
        `TRIGGER:-PT${Math.floor(minutos)}M`,
        'END:VALARM'
      );
    }
  }
  lineas.push('END:VEVENT');
  return lineas;
}

/** El archivo .ics completo, con CRLF como exige el estándar. */
function calendario({ nombre, eventos, zona, ahora = new Date() }) {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Huellitas de Amor//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(nombre)}`,
    ...eventos.flatMap((e) => evento(e, { zona, ahora })),
    'END:VCALENDAR',
  ];
  return `${lineas.map(plegar).join('\r\n')}\r\n`;
}

module.exports = { calendario, localAUtc, formatoUtc, escapar, plegar, desfaseMinutos };
