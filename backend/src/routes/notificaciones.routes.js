'use strict';

const { Router } = require('express');
const controlador = require('../controllers/notificaciones.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const puedeVer = requierePermiso('notificaciones.ver');

// Las rutas con nombre van antes de /:id para que no se lean como un id.
router.get(
  '/recordatorios',
  requierePermiso('notificaciones.ver', 'recordatorios.gestionar'),
  validar({ query: esquemas.listarRecordatorios }),
  controlador.listarRecordatorios
);
router.post(
  '/recordatorios',
  requierePermiso('recordatorios.gestionar'),
  validar({ body: esquemas.crearRecordatorio }),
  controlador.crearRecordatorio
);
router.post(
  '/recordatorios/procesar',
  requierePermiso('notificaciones.ver'),
  controlador.procesarRecordatorios
);
router.delete(
  '/recordatorios/:id',
  requierePermiso('recordatorios.gestionar'),
  validar({ params: esquemas.paramsId }),
  controlador.cancelarRecordatorio
);

router.get('/plantillas', requierePermiso('notificaciones.enviar'), controlador.plantillas);

router.get('/', puedeVer, validar({ query: esquemas.listarNotificaciones }), controlador.listar);
router.post(
  '/',
  requierePermiso('notificaciones.enviar'),
  validar({ body: esquemas.enviarNotificacion }),
  controlador.enviar
);
router.post('/leer-todas', puedeVer, controlador.leerTodas);

router.patch('/:id/leida', puedeVer, validar({ params: esquemas.paramsId }), controlador.marcarLeida);
router.delete('/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.eliminar);

module.exports = router;
