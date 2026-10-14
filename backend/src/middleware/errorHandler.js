'use strict';

const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { esProduccion } = require('../config/env');

/** 404 para rutas de API que no existen. */
function noEncontrado(req, res, next) {
  next(ApiError.noEncontrado(`La ruta ${req.method} ${req.originalUrl} no existe.`));
}

// Mensaje propio para cada restricción única del esquema. PostgreSQL expone el
// nombre en error.constraint, así que no hace falta leer el texto del error.
const MENSAJE_UNICO = {
  uq_citas_vet_slot: 'Ese horario acaba de ser reservado por otra persona. Elige otro.',
  uq_usuarios_email: 'Ya existe una cuenta registrada con ese correo.',
  uq_mascotas_microchip: 'Ya hay una mascota registrada con ese número de microchip.',
  uq_veterinarios_licencia: 'Ya existe un veterinario con ese número de licencia.',
  uq_clientes_documento: 'Ya existe un cliente con ese documento.',
  uq_servicios_slug: 'Ya existe un servicio con ese nombre.',
  uq_proveedores_nit: 'Ya existe un proveedor con ese NIT.',
  uq_productos_sku: 'Ya existe un producto con ese SKU.',
};

// Mensajes claros para los errores más comunes de PostgreSQL.
// Los códigos son los SQLSTATE estándar.
function traducirErrorPostgres(error) {
  switch (error.code) {
    case '23505': // unique_violation
      return ApiError.conflicto(MENSAJE_UNICO[error.constraint] || 'Ese registro ya existe.');

    case '23503': // foreign_key_violation
      // PostgreSQL distingue los dos sentidos en el detalle del error:
      // "is still referenced from" al borrar, "is not present in" al insertar.
      return /still referenced/i.test(error.detail || '')
        ? ApiError.conflicto('No se puede eliminar: hay registros que dependen de este.')
        : ApiError.badRequest('Uno de los datos relacionados no existe (mascota, servicio o veterinario).');

    case '23514': // check_violation
      return ApiError.badRequest('Alguno de los valores está fuera del rango permitido.');

    case '23502': // not_null_violation
      return ApiError.badRequest('Falta un dato obligatorio.');

    case '22001': // string_data_right_truncation
      return ApiError.badRequest('Uno de los campos supera la longitud permitida.');

    case '22P02': // invalid_text_representation
    case '22007': // invalid_datetime_format
      return ApiError.badRequest('Alguno de los datos enviados no tiene el formato esperado.');

    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return ApiError.conflicto('La operación chocó con otra en curso. Vuelve a intentarlo.');

    case '42P01': // undefined_table
      return new ApiError(503, 'La base de datos aún no tiene las tablas. Ejecuta la migración del esquema.');

    case '28P01': // invalid_password
    case '3D000': // invalid_catalog_name
    case '08006': // connection_failure
    case '08001':
    case '57P03': // cannot_connect_now
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'ETIMEDOUT':
      return new ApiError(503, 'La base de datos no está disponible en este momento.');

    default:
      return null;
  }
}

/**
 * Registra un fallo con el contexto de la petición que lo provocó.
 *
 * Un `console.error(error)` a secas deja el mensaje sin decir en qué ruta pasó,
 * con qué usuario ni desde qué origen, y en un registro con muchas peticiones
 * eso obliga a adivinar. Con estos cuatro datos el fallo se ubica de una vez.
 */
function registrar(req, error) {
  const quien = req.usuario ? `usuario ${req.usuario.id} (${req.usuario.rol})` : 'sin sesión';
  const origen = req.get('origin') || 'sin Origin';
  console.error(`[error] ${req.method} ${req.originalUrl} · ${quien} · ${origen}`);
  console.error(error);
}

// Los cuatro parámetros son obligatorios aunque `next` no se use: Express
// reconoce los middleware de error por la aridad, y con tres dejaría de
// llamarlo. La configuración de ESLint contempla ese `next`.
function manejadorErrores(error, req, res, next) {
  let fallo = error;

  if (!(fallo instanceof ApiError)) {
    if (fallo instanceof multer.MulterError) {
      fallo = fallo.code === 'LIMIT_FILE_SIZE'
        ? ApiError.badRequest('El archivo es demasiado grande.')
        : ApiError.badRequest('No se pudo procesar el archivo enviado.');
    } else if (fallo instanceof SyntaxError && 'body' in fallo) {
      fallo = ApiError.badRequest('El cuerpo de la petición no es JSON válido.');
    } else if (fallo && fallo.code) {
      fallo = traducirErrorPostgres(fallo) || fallo;
    }
  }

  if (!(fallo instanceof ApiError)) {
    // Error inesperado: se registra completo en el servidor y se responde
    // con un mensaje genérico para no filtrar detalles internos.
    registrar(req, error);
    fallo = new ApiError(500, 'Ocurrió un error inesperado. Inténtalo de nuevo.');
  } else if (fallo.status >= 500) {
    registrar(req, error);
  }

  const cuerpo = { ok: false, error: fallo.message };
  if (fallo.codigo) cuerpo.codigo = fallo.codigo;
  if (fallo.detalles) cuerpo.detalles = fallo.detalles;
  if (!esProduccion && fallo.status >= 500) cuerpo.stack = error.stack;

  res.status(fallo.status).json(cuerpo);
}

module.exports = { noEncontrado, manejadorErrores };
