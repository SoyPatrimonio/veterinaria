'use strict';

const { Router } = require('express');
const controlador = require('../controllers/mascotas.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const { subirFoto } = require('../middleware/upload');
const { limiteSubida } = require('../middleware/rateLimit');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

// El cliente tiene mascotas.ver_propias y la clínica mascotas.ver_todas; el
// controlador es el que limita las filas según cuál de los dos sea.
const puedeVer = requierePermiso('mascotas.ver_propias', 'mascotas.ver_todas');

router.get('/', puedeVer, validar({ query: esquemas.paginacion }), controlador.listar);
router.post('/', requierePermiso('mascotas.crear'), validar({ body: esquemas.crearMascota }), controlador.crear);

router.get('/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.detalle);
router.put(
  '/:id',
  requierePermiso('mascotas.editar'),
  validar({ params: esquemas.paramsId, body: esquemas.actualizarMascota }),
  controlador.actualizar
);
router.delete(
  '/:id',
  requierePermiso('mascotas.eliminar'),
  validar({ params: esquemas.paramsId }),
  controlador.desactivar
);

router.post(
  '/:id/foto',
  requierePermiso('mascotas.editar'),
  limiteSubida,
  validar({ params: esquemas.paramsId }),
  subirFoto,
  controlador.subirFoto
);

module.exports = router;
