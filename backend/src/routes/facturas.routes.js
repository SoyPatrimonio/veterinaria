'use strict';

const { Router } = require('express');
const controlador = require('../controllers/facturas.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

// Igual que en citas: con uno de los dos códigos basta y el controlador
// recorta las filas según el cliente de la sesión.
const puedeVer = requierePermiso('facturas.ver_propias', 'facturas.ver_todas');

// Va antes de /:id para que "resumen" no se lea como un identificador.
router.get('/resumen', requierePermiso('facturas.ver_todas'), controlador.resumen);

router.get('/', puedeVer, validar({ query: esquemas.listarFacturas }), controlador.listar);
router.post('/', requierePermiso('facturas.crear'), validar({ body: esquemas.crearFactura }), controlador.crear);

router.get('/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.detalle);

router.post(
  '/:id/pagos',
  requierePermiso('pagos.registrar'),
  validar({ params: esquemas.paramsId, body: esquemas.registrarPago }),
  controlador.registrarPago
);
router.delete(
  '/:id/pagos/:pagoId',
  requierePermiso('pagos.registrar'),
  validar({ params: esquemas.paramsIdYPago }),
  controlador.anularPago
);

router.post(
  '/:id/anular',
  requierePermiso('facturas.crear'),
  validar({ params: esquemas.paramsId, body: esquemas.anularFactura }),
  controlador.anular
);

router.post(
  '/:id/devoluciones',
  requierePermiso('devoluciones.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.crearDevolucion }),
  controlador.crearDevolucion
);

module.exports = router;
