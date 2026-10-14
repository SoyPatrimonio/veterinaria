'use strict';

/**
 * Error de negocio con código HTTP. Cualquier error que no sea ApiError se
 * trata como 500 y no expone detalles al cliente.
 *
 * `codigo` es opcional y es para el cliente: un identificador estable que le
 * permite reaccionar a un caso concreto sin comparar el texto del mensaje.
 * Los mensajes se reescriben —se corrigen, se traducen, se suavizan— y una
 * interfaz que dependa de la cadena exacta se rompe en silencio el día que
 * alguien cambia una coma.
 */
class ApiError extends Error {
  constructor(status, mensaje, detalles = null, codigo = null) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.detalles = detalles;
    this.codigo = codigo;
  }

  static badRequest(mensaje, detalles) { return new ApiError(400, mensaje, detalles); }
  static noAutorizado(mensaje = 'Debes iniciar sesión.') { return new ApiError(401, mensaje); }
  static prohibido(mensaje = 'No tienes permisos para esta acción.', codigo = null) {
    return new ApiError(403, mensaje, null, codigo);
  }
  static noEncontrado(mensaje = 'No encontramos el recurso solicitado.') { return new ApiError(404, mensaje); }
  static conflicto(mensaje, detalles) { return new ApiError(409, mensaje, detalles); }
}

module.exports = ApiError;
