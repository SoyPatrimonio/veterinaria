'use strict';

const rateLimit = require('express-rate-limit');
const { AlmacenCompartido } = require('../services/limiteCompartido');

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
  store: new AlmacenCompartido('auth'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: mensaje('Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.'),
});

/** Límite para crear citas: evita que un cliente sature la agenda. */
const limiteCitas = rateLimit({
  store: new AlmacenCompartido('citas'),
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
  store: new AlmacenCompartido('publico'),
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
  store: new AlmacenCompartido('exportacion'),
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensaje('Has descargado muchos documentos seguidos. Espera un momento.'),
});

/** Límite para subir archivos: cada uno cuesta memoria y espacio en Storage. */
const limiteSubida = rateLimit({
  store: new AlmacenCompartido('subida'),
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensaje('Has subido demasiados archivos seguidos. Espera un momento.'),
});

/*
 * Dónde se cuenta.
 *
 * express-rate-limit cuenta por defecto en la memoria del proceso, y en Vercel
 * cada instancia de la función tiene la suya: con varias despiertas, el tope
 * real es un múltiplo del escrito, y al enfriarse vuelve a cero.
 *
 * Por eso los límites que protegen algo (ingreso, formularios públicos,
 * citas, descargas y subidas) cuentan en la base, en seguridad.limites_tasa,
 * que comparten todas las instancias. Ver services/limiteCompartido.js.
 *
 * El general se queda en memoria a propósito: corre en TODAS las peticiones
 * de la API, y sumarle un viaje a la base a cada una costaría más de lo que
 * protege un tope tan holgado. Contra inundaciones de verdad están las reglas
 * de tasa del firewall de Vercel, que actúan antes de la función.
 */

module.exports = {
  limiteGeneral,
  limiteAuth,
  limiteCitas,
  limitePublico,
  limiteExportacion,
  limiteSubida,
};
