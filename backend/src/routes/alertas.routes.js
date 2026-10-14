'use strict';

const { Router } = require('express');
const controlador = require('../controllers/alertas.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const verAlertas = requierePermiso('alertas.ver', 'alertas.gestionar');
const gestionarAlertas = requierePermiso('alertas.gestionar');

router.get('/reglas', gestionarAlertas, controlador.reglas);
router.patch(
  '/reglas/:id',
  gestionarAlertas,
  validar({ params: esquemas.paramsId, body: esquemas.actualizarReglaAlerta }),
  controlador.actualizarRegla
);

router.post('/recalcular', verAlertas, controlador.recalcular);

router.get('/', verAlertas, validar({ query: esquemas.listarAlertas }), controlador.listar);
router.patch(
  '/:id',
  verAlertas,
  validar({ params: esquemas.paramsId, body: esquemas.resolverAlerta }),
  controlador.resolver
);

module.exports = router;
