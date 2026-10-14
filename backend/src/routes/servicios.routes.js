'use strict';

const { Router } = require('express');
const controlador = require('../controllers/servicios.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth, authOpcional } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

// Lectura pública: la landing muestra los servicios sin iniciar sesión.
router.get('/', authOpcional, controlador.listar);
router.get('/:id', authOpcional, validar({ params: esquemas.paramsId }), controlador.detalle);
router.get('/:id/veterinarios', authOpcional, validar({ params: esquemas.paramsId }), controlador.veterinarios);

// Escritura: solo quien tenga el permiso de gestionar servicios.
router.post(
  '/',
  requiereAuth,
  requierePermiso('servicios.gestionar'),
  validar({ body: esquemas.crearServicio }),
  controlador.crear
);
router.put(
  '/:id',
  requiereAuth,
  requierePermiso('servicios.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.crearServicio }),
  controlador.actualizar
);
router.delete(
  '/:id',
  requiereAuth,
  requierePermiso('servicios.gestionar'),
  validar({ params: esquemas.paramsId }),
  controlador.desactivar
);

module.exports = router;
