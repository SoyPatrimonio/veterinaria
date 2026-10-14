'use strict';

const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

/**
 * Valida body / params / query con esquemas de zod y reemplaza el valor
 * original por el ya parseado (números convertidos, strings recortados…).
 *
 *   router.post('/', validar({ body: esquemaCrearMascota }), controlador)
 */
function validar(esquemas) {
  return function (req, res, next) {
    try {
      for (const parte of ['body', 'params', 'query']) {
        if (!esquemas[parte]) continue;
        const resultado = esquemas[parte].parse(req[parte]);
        if (parte === 'query') {
          // req.query es de solo lectura en Express 5; se guarda aparte.
          req.consulta = resultado;
        } else {
          req[parte] = resultado;
        }
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const detalles = error.issues.map((i) => ({
          campo: i.path.join('.') || '(raíz)',
          mensaje: i.message,
        }));
        return next(ApiError.badRequest('Revisa los datos enviados.', detalles));
      }
      next(error);
    }
  };
}

module.exports = { validar };
