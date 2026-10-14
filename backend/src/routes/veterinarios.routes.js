'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/veterinarios.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth, authOpcional } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

const paramsBloqueo = z.object({
  id: z.coerce.number().int().positive(),
  bloqueoId: z.coerce.number().int().positive(),
});

// Lectura pública: la sección "Nuestro equipo" y el paso 3 del agendamiento.
router.get('/', authOpcional, controlador.listar);
router.get('/:id', authOpcional, validar({ params: esquemas.paramsId }), controlador.detalle);
router.get('/:id/horarios', authOpcional, validar({ params: esquemas.paramsId }), controlador.horarios);

router.post(
  '/',
  requiereAuth,
  requierePermiso('veterinarios.gestionar'),
  validar({ body: esquemas.crearVeterinario }),
  controlador.crear
);
router.put(
  '/:id',
  requiereAuth,
  requierePermiso('veterinarios.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.actualizarVeterinario }),
  controlador.actualizar
);

// Disponibilidad: hace falta el permiso de gestionar agenda, y además el
// controlador comprueba que sea la agenda propia salvo que sea administración.
router.put(
  '/:id/horarios',
  requiereAuth,
  requierePermiso('agenda.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.horariosVeterinario }),
  controlador.guardarHorarios
);

router.get(
  '/:id/bloqueos',
  requiereAuth,
  requierePermiso('agenda.gestionar'),
  validar({ params: esquemas.paramsId, query: esquemas.rangoBloqueos }),
  controlador.listarBloqueos
);
router.post(
  '/:id/bloqueos',
  requiereAuth,
  requierePermiso('agenda.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.crearBloqueo }),
  controlador.crearBloqueo
);
router.delete(
  '/:id/bloqueos/:bloqueoId',
  requiereAuth,
  requierePermiso('agenda.gestionar'),
  validar({ params: paramsBloqueo }),
  controlador.eliminarBloqueo
);

module.exports = router;
