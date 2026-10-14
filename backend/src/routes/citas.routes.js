'use strict';

const { Router } = require('express');
const controlador = require('../controllers/citas.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const { limiteCitas } = require('../middleware/rateLimit');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

// Con dos códigos basta con tener uno: el cliente ve lo suyo (citas.ver_propias)
// y la clínica lo ve todo (citas.ver_todas). Quién ve qué filas concretas lo
// decide el controlador con el cliente_id / veterinario_id de la sesión.
const puedeVer = requierePermiso('citas.ver_propias', 'citas.ver_todas');

// Va antes de /:id para que "disponibilidad" no se interprete como un id.
router.get(
  '/disponibilidad',
  requierePermiso('citas.crear'),
  validar({ query: esquemas.disponibilidad }),
  controlador.disponibilidad
);

router.get('/', puedeVer, validar({ query: esquemas.listarCitas }), controlador.listar);
router.post('/', requierePermiso('citas.crear'), limiteCitas, validar({ body: esquemas.crearCita }), controlador.crear);

router.get('/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.detalle);
router.patch(
  '/:id/estado',
  requierePermiso('citas.confirmar', 'citas.cancelar'),
  validar({ params: esquemas.paramsId, body: esquemas.cambiarEstadoCita }),
  controlador.cambiarEstado
);
router.delete(
  '/:id',
  requierePermiso('citas.cancelar'),
  validar({ params: esquemas.paramsId }),
  controlador.cancelar
);

module.exports = router;
