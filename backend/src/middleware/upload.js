'use strict';

const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { uploads } = require('../config/env');

const TIPOS_IMAGEN = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Firma real de cada formato: los primeros bytes del archivo.
 *
 * El `mimetype` que trae multer no lo mira nadie: lo escribe quien envía la
 * petición, en la cabecera de su propia parte del formulario. Es decir, el
 * filtro de abajo solo comprueba lo que el remitente dice que mandó. Con eso
 * basta para evitar que alguien suba un PDF sin darse cuenta, pero no para
 * evitar que suba cualquier cosa poniéndole la etiqueta de una imagen, y esas
 * fotos terminan en un bucket público de Supabase.
 *
 * Estos bytes sí los pone el formato, no el remitente.
 */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const FIRMAS = [
  // JPEG: SOI + comienzo del primer marcador.
  { mime: 'image/jpeg', coincide: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', coincide: (b) => b.subarray(0, 8).equals(PNG) },
  // WebP es un contenedor RIFF: 'RIFF', cuatro bytes de tamaño, y 'WEBP'.
  {
    mime: 'image/webp',
    coincide: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF'
      && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** Qué es el archivo de verdad, o null si no es ninguna de las tres imágenes. */
function tipoReal(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const firma = FIRMAS.find((f) => f.coincide(buffer));
  return firma ? firma.mime : null;
}

/**
 * El archivo se queda en memoria y de ahí pasa a Supabase Storage
 * (services/storage.service.js). No se escribe en disco porque en Vercel el
 * sistema de archivos es de solo lectura y se borra al terminar la petición.
 *
 * El límite de tamaño (3 MB por defecto) evita que un archivo grande llene la
 * memoria de la función.
 */
const recibirFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploads.maxBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    // Corte barato y temprano, antes de leer nada: lo que ni siquiera dice ser
    // una imagen no vale la pena cargarlo en memoria.
    if (!TIPOS_IMAGEN.has(file.mimetype)) {
      return cb(ApiError.badRequest('Solo se aceptan imágenes JPG, PNG o WebP.'));
    }
    cb(null, true);
  },
}).single('foto');

/**
 * Recibe la foto y comprueba que el contenido sea el que dice ser.
 *
 * El tipo que se deja en `req.file.mimetype` es el detectado, no el declarado:
 * es el que Storage guarda como Content-Type y el que decide la extensión del
 * archivo, así que tiene que salir de los bytes.
 *
 * Lo usan por igual la foto de una mascota y la de un producto del inventario:
 * el archivo es el mismo tipo de cosa y solo cambia dónde se guarda después.
 */
function subirFoto(req, res, next) {
  recibirFoto(req, res, (error) => {
    if (error) return next(error);

    // Sin archivo no hay nada que revisar; del error se encarga el controlador,
    // que es quien sabe si la foto era obligatoria en esa ruta.
    if (!req.file) return next();

    const real = tipoReal(req.file.buffer);
    if (!real) {
      return next(ApiError.badRequest('Ese archivo no es una imagen JPG, PNG o WebP.'));
    }

    req.file.mimetype = real;
    next();
  });
}

module.exports = { subirFoto, tipoReal };
