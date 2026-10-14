'use strict';

const rateLimit = require('express-rate-limit');

const mensaje = (texto) => ({ ok: false, error: texto });

/** Límite general para toda la API. */
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensaje('Demasiadas peticiones. Intenta de nuevo en unos minutos.'),
});

/** Límite estricto para login/registro: frena la fuerza bruta. */
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: mensaje('Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.'),
});

/** Límite para crear citas: evita que un cliente sature la agenda. */
const limiteCitas = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensaje('Has creado demasiadas citas seguidas. Contáctanos por teléfono.'),
});

/**
 * Límite para los formularios abiertos al público sin sesión: avistamiento de
 * una mascota perdida, solicitud de adopción y radicación de una PQRS.
 *
 * Son puertas de entrada sin cuenta, así que sin freno cualquiera puede llenar
 * la bandeja de la clínica de basura. El tope es holgado a propósito: quien
 * avisa de verdad manda un mensaje, no veinte.
 */
const limitePublico = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensaje('Recibimos varios envíos desde este equipo. Espera un momento o llámanos.'),
});

/**
 * Límite para las descargas de documentos clínicos.
 *
 * Un PDF suelto es normal; cien seguidos es alguien vaciando el archivo de la
 * clínica. Cada descarga queda además en `reportes_generados`, así que el
 * límite frena y el registro cuenta lo que pasó.
 */
const limiteExportacion = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensaje('Has descargado muchos documentos seguidos. Espera un momento.'),
});

/** Límite para subir archivos: cada uno cuesta memoria y espacio en Storage. */
const limiteSubida = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensaje('Has subido demasiados archivos seguidos. Espera un momento.'),
});

/*
 * Aviso sobre el alcance real de todo lo de arriba: express-rate-limit cuenta
 * en la memoria del proceso, y en Vercel cada instancia de la función tiene la
 * suya. Con varias instancias despiertas el tope efectivo es un múltiplo del
 * escrito aquí, y al enfriarse la función vuelve a cero. Sirve como primera
 * barrera y contra el abuso torpe; lo que sí cuenta bien es el bloqueo por
 * intentos de `intentos_login` y el tope de recuperaciones, que viven en la
 * base. Para un límite distribuido de verdad hace falta un almacén compartido
 * (Redis) o las reglas de tasa del borde de Vercel.
 */

module.exports = {
  limiteGeneral,
  limiteAuth,
  limiteCitas,
  limitePublico,
  limiteExportacion,
  limiteSubida,
};
