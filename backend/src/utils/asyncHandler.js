'use strict';

/**
 * Envuelve un controlador async para que los rechazos de promesa lleguen al
 * middleware de errores en vez de quedar como unhandled rejection.
 */
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
