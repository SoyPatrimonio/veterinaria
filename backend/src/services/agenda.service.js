'use strict';

const ApiError = require('../utils/ApiError');
const { clinica } = require('../config/env');
const { enTransaccion, consultarUna } = require('../config/database');
const fechas = require('../utils/fechas');
const veterinarioModel = require('../models/veterinario.model');
const servicioModel = require('../models/servicio.model');
const citaModel = require('../models/cita.model');

// Cada cuántos minutos empieza un hueco cuando el veterinario no tiene una
// duración propia configurada. Media hora es el valor que trae el esquema.
const DURACION_SLOT_POR_DEFECTO_MIN = 30;

const MS_POR_MINUTO = 60 * 1000;
const MINUTOS_POR_HORA = 60;
const MINUTOS_POR_DIA = 24 * MINUTOS_POR_HORA;

// Dónde empieza y termina la parte 'HH:mm' dentro de un 'YYYY-MM-DD HH:mm:ss',
// dónde termina la parte 'YYYY-MM-DD', y cuánto mide ese literal completo (se
// usa para recortar los fraccionarios de segundo que a veces trae PostgreSQL).
const INICIO_HORA = 11;
const FIN_HORA = 16;
const LARGO_FECHA = 10;
const LARGO_TIMESTAMP = 19;

/* ------------------------------------------------------------------
   Reglas de la sección 3 del documento:
   - no se reservan horarios ocupados
   - no se reservan fechas pasadas
   - no se crean citas fuera del horario de atención
   - un veterinario no puede tener dos citas simultáneas
   ------------------------------------------------------------------ */

/** Comprueba que la fecha pedida esté dentro de la ventana agendable. */
function validarFecha(fechaISO) {
  if (!fechas.esFechaValida(fechaISO)) {
    throw ApiError.badRequest('La fecha no es válida.');
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(`${fechaISO}T00:00:00`);

  if (objetivo < hoy) {
    throw ApiError.badRequest('No se pueden agendar citas en fechas pasadas.');
  }

  const limite = fechas.sumarDias(hoy, clinica.diasMaximos);
  if (objetivo > limite) {
    throw ApiError.badRequest(`La agenda solo está abierta hasta ${clinica.diasMaximos} días adelante.`);
  }

  const dia = fechas.diaSemana(fechaISO);
  if (!clinica.diasAbiertos.includes(dia)) {
    throw ApiError.badRequest(`La clínica no atiende los ${fechas.nombreDia(dia)}.`);
  }

  return objetivo;
}

/** Intersección entre el horario del veterinario y el de la clínica. */
function ventanasDelDia(horariosVet) {
  const aperturaClinica = fechas.horaAMinutos(clinica.apertura);
  const cierreClinica = fechas.horaAMinutos(clinica.cierre);

  return horariosVet
    .map((h) => ({
      desde: Math.max(fechas.horaAMinutos(h.hora_inicio), aperturaClinica),
      hasta: Math.min(fechas.horaAMinutos(h.hora_fin), cierreClinica),
    }))
    .filter((v) => v.hasta > v.desde)
    .sort((a, b) => a.desde - b.desde);
}

function seSolapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && finA > inicioB;
}

/** 'YYYY-MM-DD HH:mm:ss', venga el valor como texto de PostgreSQL o como Date. */
function aTimestampTexto(valor) {
  return valor instanceof Date
    ? fechas.aTimestampSQL(valor)
    : String(valor).slice(0, LARGO_TIMESTAMP);
}

/**
 * Qué parte del día `fechaISO` ocupa un rango, en minutos desde la medianoche.
 *
 * Los extremos se recortan al día consultado. Un bloqueo puede empezar la
 * víspera y terminar a la mañana siguiente: sin recortarlo se leería solo el
 * 'HH:mm' de cada extremo y saldría un rango invertido —de 22:00 a 09:00— que
 * no se cruza con ningún hueco. El efecto era que la agenda ofrecía horas
 * bloqueadas y la reserva se rechazaba después, al confirmar.
 */
function rangoEnMinutos(inicio, fin, fechaISO) {
  const desde = aTimestampTexto(inicio);
  const hasta = aTimestampTexto(fin);
  const enMinutos = (texto) => fechas.horaAMinutos(texto.slice(INICIO_HORA, FIN_HORA));

  return {
    desde: desde.slice(0, LARGO_FECHA) < fechaISO ? 0 : enMinutos(desde),
    hasta: hasta.slice(0, LARGO_FECHA) > fechaISO ? MINUTOS_POR_DIA : enMinutos(hasta),
  };
}

/**
 * Devuelve los horarios libres de un veterinario para un servicio y una fecha.
 * Nunca incluye huecos que se crucen con otra cita, con un bloqueo o con el
 * cierre de la clínica.
 */
async function calcularDisponibilidad({ veterinarioId, servicioId, fecha }) {
  validarFecha(fecha);

  const servicio = await servicioModel.buscarPorId(servicioId);
  if (!servicio || !servicio.activo) throw ApiError.badRequest('El servicio seleccionado no está disponible.');

  const veterinario = await veterinarioModel.buscarPorId(veterinarioId);
  if (!veterinario || !veterinario.activo || veterinario.estado_usuario !== 'activo') {
    throw ApiError.badRequest('El veterinario seleccionado no está disponible.');
  }

  await validarVeterinarioAtiendeServicio(servicioId, veterinarioId);

  const dia = fechas.diaSemana(fecha);
  const horarios = await veterinarioModel.horariosDelDia(veterinarioId, dia);
  if (!horarios.length) {
    return { fecha, servicio, veterinario, slots: [], mensaje: `Este veterinario no atiende los ${fechas.nombreDia(dia)}.` };
  }

  const ocupadas = await citaModel.ocupadasDelDia(veterinarioId, fecha);
  const bloqueos = await veterinarioModel.bloqueosEntre(
    veterinarioId,
    `${fecha} 00:00:00`,
    `${fecha} 23:59:59`
  );

  const paso = veterinario.duracion_slot_min || DURACION_SLOT_POR_DEFECTO_MIN;
  const duracion = servicio.duracion_min;

  // Con cuánta anticipación mínima se acepta una reserva de hoy.
  const ahora = new Date();
  const esHoy = fecha === fechas.aFechaISO(ahora);
  const minutoMinimo = esHoy
    ? ahora.getHours() * MINUTOS_POR_HORA + ahora.getMinutes() + clinica.anticipacionMinutos
    : -1;

  const ocupadasMin = ocupadas.map((c) => rangoEnMinutos(c.inicio, c.fin, fecha));
  const bloqueosMin = bloqueos.map((b) => rangoEnMinutos(b.inicio, b.fin, fecha));

  const slots = [];
  for (const ventana of ventanasDelDia(horarios)) {
    for (let inicio = ventana.desde; inicio + duracion <= ventana.hasta; inicio += paso) {
      const fin = inicio + duracion;

      if (inicio < minutoMinimo) continue;
      if (ocupadasMin.some((o) => seSolapan(inicio, fin, o.desde, o.hasta))) continue;
      if (bloqueosMin.some((b) => seSolapan(inicio, fin, b.desde, b.hasta))) continue;

      slots.push({ hora: fechas.minutosAHora(inicio), horaFin: fechas.minutosAHora(fin) });
    }
  }

  return {
    fecha,
    servicio: { id: servicio.id, nombre: servicio.nombre, duracionMin: duracion, precio: servicio.precio },
    veterinario: { id: veterinario.id, nombre: veterinario.nombre, especialidad: veterinario.especialidad },
    slots,
    mensaje: slots.length ? null : 'No quedan horarios libres para ese día.',
  };
}

/** Si el servicio tiene veterinarios asignados, solo esos pueden atenderlo. */
async function validarVeterinarioAtiendeServicio(servicioId, veterinarioId) {
  const asignados = await consultarUna(
    'SELECT COUNT(*) AS total FROM veterinario_servicios WHERE servicio_id = ?',
    [servicioId]
  );
  if (!asignados || asignados.total === 0) return; // servicio abierto a todo el equipo

  const coincide = await consultarUna(
    'SELECT 1 AS ok FROM veterinario_servicios WHERE servicio_id = ? AND veterinario_id = ?',
    [servicioId, veterinarioId]
  );
  if (!coincide) {
    throw ApiError.badRequest('Ese veterinario no atiende el servicio seleccionado.');
  }
}

/**
 * Crea la cita aplicando todas las validaciones. La comprobación final de
 * solapamiento se hace dentro de una transacción con SELECT … FOR UPDATE, y
 * el índice único (veterinario_id, slot_ocupado) queda como última red: si dos
 * reservas simultáneas piden exactamente el mismo horario, la segunda choca
 * contra el índice y el manejador de errores la traduce a un 409.
 */
async function agendarCita({ clienteId, mascotaId, servicioId, veterinarioId, fecha, hora, motivo, creadoPor }) {
  validarFecha(fecha);

  if (!fechas.esHoraValida(hora)) throw ApiError.badRequest('La hora no es válida.');

  const servicio = await servicioModel.buscarPorId(servicioId);
  if (!servicio || !servicio.activo) throw ApiError.badRequest('El servicio seleccionado no está disponible.');

  const veterinario = await veterinarioModel.buscarPorId(veterinarioId);
  if (!veterinario || !veterinario.activo || veterinario.estado_usuario !== 'activo') {
    throw ApiError.badRequest('El veterinario seleccionado no está disponible.');
  }

  await validarVeterinarioAtiendeServicio(servicioId, veterinarioId);

  const mascota = await consultarUna(
    'SELECT id, cliente_id, nombre, activo FROM mascotas WHERE id = ?',
    [mascotaId]
  );
  if (!mascota) throw ApiError.badRequest('La mascota no existe.');
  if (!mascota.activo) throw ApiError.badRequest('Esa mascota está dada de baja.');
  if (mascota.cliente_id !== clienteId) {
    throw ApiError.prohibido('Esa mascota pertenece a otro cliente.');
  }

  const inicioFecha = fechas.combinar(fecha, hora);
  const finFecha = fechas.sumarMinutos(inicioFecha, servicio.duracion_min);

  const inicioMin = fechas.horaAMinutos(hora);
  const finMin = inicioMin + servicio.duracion_min;

  // Fuera del horario de atención de la clínica o del veterinario.
  const horarios = await veterinarioModel.horariosDelDia(veterinarioId, fechas.diaSemana(fecha));
  const ventanas = ventanasDelDia(horarios);
  const cabeEnAlguna = ventanas.some((v) => inicioMin >= v.desde && finMin <= v.hasta);
  if (!cabeEnAlguna) {
    throw ApiError.badRequest(
      `Ese horario está fuera de la atención del veterinario (clínica: ${clinica.apertura}–${clinica.cierre}).`
    );
  }

  // Anticipación mínima para las citas de hoy.
  const ahora = new Date();
  const minimo = new Date(ahora.getTime() + clinica.anticipacionMinutos * MS_POR_MINUTO);
  if (inicioFecha < minimo) {
    throw ApiError.badRequest(
      `Las citas se reservan con al menos ${clinica.anticipacionMinutos} minutos de anticipación.`
    );
  }

  const bloqueos = await veterinarioModel.bloqueosEntre(
    veterinarioId,
    fechas.aTimestampSQL(inicioFecha),
    fechas.aTimestampSQL(finFecha)
  );
  if (bloqueos.length) {
    throw ApiError.conflicto('El veterinario tiene ese horario bloqueado.');
  }

  const inicioSQL = fechas.aTimestampSQL(inicioFecha);
  const finSQL = fechas.aTimestampSQL(finFecha);

  const citaId = await enTransaccion(async (conexion) => {
    const ocupadas = await citaModel.ocupadasDelDiaBloqueando(conexion, veterinarioId, fecha);

    // Los TIMESTAMP llegan como 'YYYY-MM-DD HH:mm:ss', así que comparar los
    // strings equivale a comparar los instantes.
    const choca = ocupadas.some((c) =>
      seSolapan(inicioSQL, finSQL, aTimestampTexto(c.inicio), aTimestampTexto(c.fin))
    );
    if (choca) {
      throw ApiError.conflicto('Ese horario ya está ocupado. Elige otro.');
    }

    return citaModel.crear(conexion, {
      clienteId,
      mascotaId,
      veterinarioId,
      servicioId,
      inicio: inicioSQL,
      fin: finSQL,
      motivo,
      creadoPor,
    });
  });

  return citaModel.buscarPorId(citaId);
}

module.exports = {
  calcularDisponibilidad,
  agendarCita,
  validarFecha,
  validarVeterinarioAtiendeServicio,
  rangoEnMinutos,
};
