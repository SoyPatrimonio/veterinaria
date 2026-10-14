'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/fidelizacion.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const id = esquemas.paramsId.shape.id;

const verPlanes = requierePermiso('planes.ver', 'planes.gestionar');
const gestionarPlanes = requierePermiso('planes.gestionar');
const verPuntos = requierePermiso('puntos.ver', 'puntos.gestionar');
const gestionarPuntos = requierePermiso('puntos.gestionar');

const filtroPlanes = z.object({ todos: z.coerce.boolean().optional().default(false) });
const filtroCliente = z.object({ clienteId: id.optional() });
const filtroSuscripciones = z.object({
  clienteId: id.optional(),
  estado: z.enum(['activa', 'vencida', 'cancelada', 'suspendida']).optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});
const filtroRecompensas = z.object({ todas: z.coerce.boolean().optional().default(false) });
const canjeCliente = z.object({ clienteId: id.optional().nullable() });

const paramsCodigo = z.object({
  codigo: z.string().trim().length(10, 'Código de canje no válido.').regex(/^[A-F0-9]+$/i, 'Código no válido.'),
});

/* Planes */
router.get('/planes', verPlanes, validar({ query: filtroPlanes }), controlador.planes);
router.post('/planes', gestionarPlanes, validar({ body: esquemas.crearPlanSalud }), controlador.crearPlan);
router.put(
  '/planes/:id',
  gestionarPlanes,
  validar({ params: esquemas.paramsId, body: esquemas.crearPlanSalud }),
  controlador.actualizarPlan
);

/* Suscripciones */
router.get(
  '/suscripciones',
  verPlanes,
  validar({ query: filtroSuscripciones }),
  controlador.suscripciones
);
router.post(
  '/suscripciones',
  requierePermiso('planes.suscribir', 'planes.gestionar'),
  validar({ body: esquemas.suscribirPlan }),
  controlador.suscribir
);
router.delete(
  '/suscripciones/:id',
  requierePermiso('planes.suscribir', 'planes.gestionar'),
  validar({ params: esquemas.paramsId }),
  controlador.cancelarSuscripcion
);
router.post(
  '/suscripciones/:id/consumo',
  gestionarPlanes,
  validar({ params: esquemas.paramsId, body: esquemas.consumirBeneficio }),
  controlador.consumirBeneficio
);

router.get('/beneficios', verPlanes, validar({ query: filtroCliente }), controlador.beneficios);

/* Puntos */
router.get('/puntos', verPuntos, validar({ query: filtroCliente }), controlador.puntos);
router.post('/puntos', gestionarPuntos, validar({ body: esquemas.ajustarPuntos }), controlador.ajustarPuntos);

/* Recompensas */
router.get('/recompensas', verPuntos, validar({ query: filtroRecompensas }), controlador.recompensas);
router.post('/recompensas', gestionarPuntos, validar({ body: esquemas.crearRecompensa }), controlador.crearRecompensa);
router.post(
  '/recompensas/:id/canjear',
  verPuntos,
  validar({ params: esquemas.paramsId, body: canjeCliente }),
  controlador.canjear
);
router.post('/canjes/:codigo/usar', gestionarPuntos, validar({ params: paramsCodigo }), controlador.usarCanje);

/* Promociones */
router.get('/promociones', requierePermiso('promociones.gestionar'), controlador.promociones);
router.post(
  '/promociones',
  requierePermiso('promociones.gestionar'),
  validar({ body: esquemas.crearPromocion }),
  controlador.crearPromocion
);
router.post(
  '/promociones/:id/enviar',
  requierePermiso('promociones.gestionar'),
  validar({ params: esquemas.paramsId }),
  controlador.enviarPromocion
);

module.exports = router;
