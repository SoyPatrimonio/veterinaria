'use strict';

/**
 * Utilidades de fecha para la agenda.
 *
 * Todo se maneja en hora local del servidor y se guarda en PostgreSQL como
 * TIMESTAMP sin zona ('YYYY-MM-DD HH:mm:ss'), que es como trabaja la clínica.
 * La zona del proceso y la de la base se fijan en config/env.js y en el
 * esquema, para que ambas coincidan.
 */

const ApiError = require('./ApiError');

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MS_POR_MINUTO = 60 * 1000;
const MINUTOS_POR_HORA = 60;

function esFechaValida(texto) {
  if (!RE_FECHA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00`);
  return !Number.isNaN(d.getTime()) && aFechaISO(d) === texto;
}

function esHoraValida(texto) {
  return RE_HORA.test(texto);
}

/** Date -> 'YYYY-MM-DD' en hora local. */
function aFechaISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Date -> 'YYYY-MM-DD HH:mm:ss', el literal que entiende TIMESTAMP. */
function aTimestampSQL(fecha) {
  const hh = String(fecha.getHours()).padStart(2, '0');
  const mm = String(fecha.getMinutes()).padStart(2, '0');
  const ss = String(fecha.getSeconds()).padStart(2, '0');
  return `${aFechaISO(fecha)} ${hh}:${mm}:${ss}`;
}

/** 'YYYY-MM-DD' + 'HH:mm' -> Date local. */
function combinar(fechaISO, hora) {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

function sumarMinutos(fecha, minutos) {
  return new Date(fecha.getTime() + minutos * MS_POR_MINUTO);
}

function sumarDias(fecha, dias) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

/**
 * 'YYYY-MM-DD' + meses -> 'YYYY-MM-DD'. Lo usa el refuerzo de las vacunas.
 *
 * Se calcula sobre el número de mes y no sumando días porque los meses no
 * duran lo mismo: "seis meses después del 31 de agosto" tiene que caer en
 * febrero o marzo, no 180 días más tarde. Cuando el día no existe en el mes
 * destino (31 de enero + 1 mes) se retrocede al último día de ese mes, que es
 * lo que espera cualquiera al leer la fecha del carné.
 */
function sumarMeses(fechaISO, meses) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const total = (anio * 12) + (mes - 1) + Number(meses);
  const anioDestino = Math.floor(total / 12);
  const mesDestino = (total % 12) + 1;

  const diasDelMes = new Date(anioDestino, mesDestino, 0).getDate();
  const diaDestino = Math.min(dia, diasDelMes);

  return `${anioDestino}-${String(mesDestino).padStart(2, '0')}-${String(diaDestino).padStart(2, '0')}`;
}

/** 'HH:mm' o 'HH:mm:ss' -> minutos desde medianoche. */
function horaAMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  return h * MINUTOS_POR_HORA + m;
}

/** minutos desde medianoche -> 'HH:mm'. */
function minutosAHora(minutos) {
  const h = Math.floor(minutos / MINUTOS_POR_HORA);
  const m = minutos % MINUTOS_POR_HORA;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 0=domingo … 6=sábado, igual que la columna dia_semana. */
function diaSemana(fechaISO) {
  return new Date(`${fechaISO}T00:00:00`).getDay();
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function nombreDia(indice) {
  return NOMBRES_DIA[indice] ?? '';
}

// Ventana por defecto de los tableros: el mes corrido hacia atrás, que es lo
// que suele mirarse al abrir sin filtrar nada.
const DIAS_POR_DEFECTO = 30;

// Un rango muy largo con agrupación diaria devuelve cientos de puntos que no
// caben en una gráfica ni dicen nada. Dos años es el tope razonable.
const DIAS_MAXIMOS = 730;

/**
 * Resuelve la ventana de fechas de un reporte o tablero.
 *
 * Se saca aquí porque es la parte que se equivoca sola: sin tope, una consulta
 * con `desde` en 2015 recorre toda la tabla y la función se queda sin tiempo;
 * sin orden, `desde` posterior a `hasta` devuelve cero filas y parece que no
 * hubo actividad en vez de un filtro mal puesto.
 *
 * Lanza ApiError porque quien la llama siempre es una ruta, y el mensaje va
 * dirigido a quien puso mal el filtro.
 */
function resolverRango({ desde, hasta } = {}) {
  const fin = hasta || aFechaISO(new Date());
  const inicio = desde || aFechaISO(sumarDias(new Date(`${fin}T00:00:00`), -DIAS_POR_DEFECTO));

  if (inicio > fin) {
    throw ApiError.badRequest('La fecha inicial no puede ser posterior a la final.');
  }

  const dias = Math.round(
    (new Date(`${fin}T00:00:00`) - new Date(`${inicio}T00:00:00`)) / (24 * 60 * 60 * 1000)
  );
  if (dias > DIAS_MAXIMOS) {
    throw ApiError.badRequest('El rango no puede superar dos años. Agrupa por mes o acorta las fechas.');
  }

  return { desde: inicio, hasta: fin, dias };
}

module.exports = {
  esFechaValida,
  esHoraValida,
  aFechaISO,
  aTimestampSQL,
  combinar,
  sumarMinutos,
  sumarDias,
  sumarMeses,
  horaAMinutos,
  minutosAHora,
  diaSemana,
  nombreDia,
  resolverRango,
  DIAS_POR_DEFECTO,
  DIAS_MAXIMOS,
};
