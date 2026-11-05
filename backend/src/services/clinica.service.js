'use strict';

const { consultar, consultarUna } = require('../config/database');

/**
 * Nombre, NIT y sede principal de la clínica.
 *
 * Salen de la base (configuraciones y sedes), no del código: cambiar la
 * dirección o el nombre comercial es una edición de datos, no un despliegue.
 * Lo usan los PDFs y los calendarios, que tienen que decir lo mismo.
 */
async function datosClinica() {
  const filas = await consultar(
    `SELECT clave, valor FROM configuraciones WHERE clave IN ('clinica.nombre','clinica.nit')`
  );
  const mapa = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));

  const sede = await consultarUna(
    `SELECT nombre, direccion, ciudad, telefono, email FROM sedes
      WHERE activo = 1 ORDER BY principal DESC LIMIT 1`
  );

  return {
    nombre: mapa['clinica.nombre'] || 'Huellitas de Amor',
    nit: mapa['clinica.nit'] || '',
    sede: sede || {},
  };
}

module.exports = { datosClinica };
