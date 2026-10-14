'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/urgencias.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

// Ver la sala de urgencias y atenderla son permisos distintos: recepción
// necesita ver el tablero para saber a quién le toca, pero no medica.
const puedeVer = requierePermiso('urgencias.ver', 'urgencias.gestionar');
const puedeAtender = requierePermiso('urgencias.gestionar');

const filtroSede = z.object({ sedeId: esquemas.paramsId.shape.id.optional() });

router.get('/salas',   puedeVer, validar({ query: filtroSede }), controlador.salas);
router.get('/tablero', puedeVer, validar({ query: filtroSede }), controlador.tablero);

router.get('/', puedeVer, validar({ query: esquemas.listarUrgencias }), controlador.listar);

router.post(
  '/',
  puedeAtender,
  validar({ body: esquemas.registrarUrgencia }),
  controlador.registrar
);

router.get(
  '/:id',
  puedeVer,
  validar({ params: esquemas.paramsId }),
  controlador.detalle
);

router.patch(
  '/:id',
  puedeAtender,
  validar({ params: esquemas.paramsId, body: esquemas.actualizarUrgencia }),
  controlador.actualizar
);

router.patch(
  '/:id/triage',
  puedeAtender,
  validar({ params: esquemas.paramsId, body: esquemas.triageUrgencia }),
  controlador.triage
);

router.post(
  '/:id/eventos',
  puedeAtender,
  validar({ params: esquemas.paramsId, body: esquemas.eventoUrgencia }),
  controlador.crearEvento
);

router.post(
  '/:id/signos',
  puedeAtender,
  validar({ params: esquemas.paramsId, body: esquemas.signosVitales }),
  controlador.registrarSignos
);

router.post(
  '/:id/medicacion',
  puedeAtender,
  validar({ params: esquemas.paramsId, body: esquemas.medicacionUrgencia }),
  controlador.registrarMedicacion
);

router.post(
  '/:id/procedimientos',
  puedeAtender,
  validar({ params: esquemas.paramsId, body: esquemas.procedimientoUrgencia }),
  controlador.registrarProcedimiento
);

module.exports = router;
