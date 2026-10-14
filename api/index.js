'use strict';

/**
 * Punto de entrada de la API en Vercel.
 *
 * Vercel convierte cada archivo de esta carpeta en una función serverless. Aquí
 * solo se reexporta la aplicación de Express: una app de Express ya es una
 * función (req, res), que es justo lo que Vercel espera.
 *
 * El enrutado lo define vercel.json: todo lo que empiece por /api llega aquí,
 * y el resto lo sirve la carpeta estática frontend/.
 */

const app = require('../backend/src/app');

module.exports = (req, res) => {
  // Las rutas de Express están montadas bajo /api. Vercel entrega la ruta
  // original, pero si alguna configuración la recortara, se vuelve a poner el
  // prefijo para que el enrutado no dependa de ese detalle.
  if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url === '/' ? '' : req.url}`;
  }
  return app(req, res);
};
