'use strict';

const ics = require('../utils/ics');
const { zonaHoraria, appUrl } = require('../config/env');
const { datosClinica } = require('./clinica.service');

/**
 * Citas → archivo de calendario (.ics).
 *
 * Cada quien recibe el evento escrito para sí: el dueño ve a qué lleva a su
 * mascota y con quién; el veterinario, a quién atiende y de quién es. El
 * evento no lleva datos clínicos más allá del motivo de la cita, porque el
 * calendario personal suele estar sincronizado en el teléfono y compartido
 * con otras aplicaciones.
 */

// Avisos por defecto: el día anterior y dos horas antes.
const ALARMAS_MIN = [24 * 60, 120];

// La secuencia sube con el estado para que, al volver a importar, las
// aplicaciones reemplacen el evento (pendiente → confirmada → cancelada).
const SECUENCIA = { pendiente: 0, confirmada: 1, atendida: 1, no_asistio: 1, cancelada: 2 };

const PAGINA_CITAS = {
  cliente: 'cliente/citas.html',
  veterinario: 'veterinario/agenda.html',
  admin: 'admin/citas.html',
};

/** Dominio del UID: el del sitio si está configurado; si no, uno fijo. */
function dominio() {
  try {
    return appUrl ? new URL(appUrl).hostname : 'huellitas-de-amor';
  } catch {
    return 'huellitas-de-amor';
  }
}

function lugarDe(clinica) {
  const { sede = {} } = clinica;
  const direccion = [sede.direccion, sede.ciudad].filter(Boolean).join(', ');
  return [clinica.nombre, direccion].filter(Boolean).join(' — ');
}

/** El VEVENT de una cita, contado desde el punto de vista de `rol`. */
function eventoDeCita(cita, rol, clinica) {
  const servicio = cita.servicio_nombre || 'Cita';
  const esCliente = rol === 'cliente';

  const titulo = esCliente
    ? `${servicio} para ${cita.mascota_nombre} · ${clinica.nombre}`
    : `${servicio} · ${cita.mascota_nombre}${cita.cliente_nombre ? ` (${cita.cliente_nombre})` : ''}`;

  const detalle = [
    esCliente
      ? cita.veterinario_nombre && `Te atiende: ${cita.veterinario_nombre}`
      : cita.especie && `Paciente: ${cita.mascota_nombre} (${cita.especie})`,
    !esCliente && cita.cliente_telefono && `Teléfono del dueño: ${cita.cliente_telefono}`,
    cita.motivo && `Motivo: ${cita.motivo}`,
    cita.estado === 'pendiente' && 'Pendiente de confirmar por la clínica.',
    esCliente && clinica.sede && clinica.sede.telefono && `¿Necesitas cambiarla? Llama al ${clinica.sede.telefono}.`,
  ].filter(Boolean).join('\n');

  return {
    uid: `cita-${cita.id}@${dominio()}`,
    inicio: cita.inicio,
    fin: cita.fin,
    titulo,
    descripcion: detalle,
    lugar: lugarDe(clinica),
    estado: cita.estado,
    secuencia: SECUENCIA[cita.estado] ?? 0,
    alarmas: ALARMAS_MIN,
    url: appUrl ? `${appUrl}/${PAGINA_CITAS[rol] || PAGINA_CITAS.cliente}` : undefined,
  };
}

/** El .ics con las citas dadas. `clinica` se puede pasar en las pruebas. */
async function deCitas(citas, rol, { clinica, ahora } = {}) {
  const datos = clinica || (await datosClinica());
  return ics.calendario({
    nombre: rol === 'cliente' ? `Citas en ${datos.nombre}` : `Agenda · ${datos.nombre}`,
    eventos: citas.map((c) => eventoDeCita(c, rol, datos)),
    zona: zonaHoraria,
    ahora,
  });
}

module.exports = { deCitas, eventoDeCita };
