'use strict';

const notificacionModel = require('../models/notificacion.model');
const { consultarUna } = require('../config/database');

/**
 * Aviso interno de la clínica.
 *
 * Todas las funciones de este archivo son "de cortesía": avisar de algo nunca
 * puede tumbar la acción que lo provocó. Si la notificación falla, la cita
 * queda igual de confirmada y la factura igual de emitida; lo que no puede
 * pasar es que el error se pierda, así que se registra en consola.
 */

/** Rellena las marcas {{clave}} de una plantilla con los valores dados. */
function rellenar(texto, variables = {}) {
  return String(texto ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (marca, clave) => {
    const valor = variables[clave];
    return valor === undefined || valor === null ? marca : String(valor);
  });
}

/** Crea la notificación y devuelve su id, o null si no se pudo. */
async function avisar({ usuarioId, rol, tipo, titulo, mensaje, enlace, canal, plantillaId }) {
  try {
    if (rol) {
      return await notificacionModel.crearParaRol(rol, { tipo, titulo, mensaje, enlace, canal });
    }
    if (!usuarioId) return null;
    return await notificacionModel.crear({ usuarioId, plantillaId, tipo, titulo, mensaje, enlace, canal });
  } catch (error) {
    console.warn(`[notificaciones] no se pudo avisar (${tipo}): ${error.message}`);
    return null;
  }
}

/**
 * Manda un aviso a partir de una plantilla de la base. Si la plantilla no
 * existe se usa el título de respaldo: es preferible un aviso escueto a que el
 * cliente no se entere de nada porque alguien borró una fila del catálogo.
 */
async function avisarConPlantilla(codigo, { usuarioId, variables = {}, enlace, tituloRespaldo }) {
  try {
    const plantilla = await notificacionModel.plantillaPorCodigo(codigo);

    return await avisar({
      usuarioId,
      plantillaId: plantilla?.id ?? null,
      tipo: codigo,
      titulo: plantilla ? rellenar(plantilla.asunto, variables) : (tituloRespaldo || codigo),
      mensaje: plantilla ? rellenar(plantilla.cuerpo, variables) : null,
      enlace,
    });
  } catch (error) {
    console.warn(`[notificaciones] falló la plantilla ${codigo}: ${error.message}`);
    return null;
  }
}

/** El usuario dueño de un cliente, que es a quien se le avisa. */
async function usuarioDelCliente(clienteId) {
  if (!clienteId) return null;
  const fila = await consultarUna('SELECT usuario_id FROM clientes WHERE id = ?', [clienteId]);
  return fila ? fila.usuario_id : null;
}

async function programar(datos) {
  try {
    return await notificacionModel.crearRecordatorio(datos);
  } catch (error) {
    console.warn(`[notificaciones] no se pudo programar el recordatorio: ${error.message}`);
    return null;
  }
}

/**
 * Convierte en notificaciones los recordatorios cuya hora ya pasó.
 *
 * No hay proceso en segundo plano —en Vercel la función solo vive mientras
 * atiende una petición—, así que lo dispara el panel de la clínica al abrirse
 * y el endpoint de recordatorios. Cada recordatorio se marca como enviado en
 * cuanto se entrega, de modo que dos llamadas seguidas no lo duplican.
 */
async function procesarPendientes() {
  let entregados = 0;

  try {
    const pendientes = await notificacionModel.pendientesVencidos();

    for (const recordatorio of pendientes) {
      const titulo = {
        cita: 'Recordatorio de cita',
        vacuna: 'Refuerzo de vacuna',
        control: 'Control programado',
        tratamiento: 'Tratamiento en curso',
        otro: 'Recordatorio',
      }[recordatorio.tipo] || 'Recordatorio';

      const enlace = recordatorio.cita_id ? 'cliente/citas.html' : 'cliente/mascotas.html';

      await notificacionModel.crear({
        usuarioId: recordatorio.usuario_id,
        tipo: `recordatorio_${recordatorio.tipo}`,
        titulo,
        mensaje: recordatorio.mensaje
          || `${recordatorio.mascota_nombre || 'Tu mascota'} tiene un aviso programado.`,
        enlace,
      });

      await notificacionModel.marcarEnviado(recordatorio.id);
      entregados += 1;
    }
  } catch (error) {
    console.warn(`[notificaciones] no se pudieron procesar los recordatorios: ${error.message}`);
  }

  return entregados;
}

module.exports = {
  rellenar,
  avisar,
  avisarConPlantilla,
  usuarioDelCliente,
  programar,
  procesarPendientes,
};
