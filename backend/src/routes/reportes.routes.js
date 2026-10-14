'use strict';

const { Router } = require('express');
const controlador = require('../controllers/reportes.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

router.get(
  '/',
  requierePermiso('reportes.ver'),
  validar({ query: esquemas.consultaReportes }),
  controlador.resumen
);

module.exports = router;
