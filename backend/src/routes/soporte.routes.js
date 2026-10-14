'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/soporte.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const puedeVer = requierePermiso('tickets.ver_propios', 'tickets.ver_todos', 'tickets.gestionar');
const puedeGestionar = requierePermiso('tickets.gestionar');

const filtroEncuestas = z.object({
  momento: z.enum(['post_cita', 'post_pedido', 'post_ticket', 'general']).optional(),
});

const rangoResultados = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/* Encuestas — antes de /tickets/:id para que no choquen las rutas. */
router.get('/encuestas', validar({ query: filtroEncuestas }), controlador.encuestas);
router.post(
  '/encuestas/respuestas',
  requierePermiso('encuestas.responder', 'encuestas.gestionar'),
  validar({ body: esquemas.responderEncuesta }),
  controlador.responderEncuesta
);
router.get(
  '/encuestas/:id/resultados',
  requierePermiso('encuestas.gestionar'),
  validar({ params: esquemas.paramsId, query: rangoResultados }),
  controlador.resultadosEncuesta
);

router.get('/resumen', requierePermiso('tickets.ver_todos', 'tickets.gestionar'), controlador.resumen);

/* PQRS */
router.get('/tickets', puedeVer, validar({ query: esquemas.listarTickets }), controlador.listar);
router.post(
  '/tickets',
  requierePermiso('tickets.crear', 'tickets.gestionar'),
  validar({ body: esquemas.crearTicket }),
  controlador.crear
);
router.get('/tickets/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.detalle);
router.post(
  '/tickets/:id/mensajes',
  puedeVer,
  validar({ params: esquemas.paramsId, body: esquemas.responderTicket }),
  controlador.responder
);
router.patch(
  '/tickets/:id',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: esquemas.actualizarTicket }),
  controlador.actualizar
);
router.post(
  '/tickets/:id/calificacion',
  puedeVer,
  validar({ params: esquemas.paramsId, body: esquemas.calificarTicket }),
  controlador.calificar
);

module.exports = router;
