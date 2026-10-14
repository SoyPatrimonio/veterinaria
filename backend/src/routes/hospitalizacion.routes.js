'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/hospitalizacion.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const id = esquemas.paramsId.shape.id;

// Ver incluye al dueño, que consulta cómo va su mascota; gestionar es de la
// clínica y es lo que hace falta para escribir cualquier cosa.
const puedeVer = requierePermiso('hospitalizacion.ver', 'hospitalizacion.gestionar', 'historia.ver_propia');
const puedeGestionar = requierePermiso('hospitalizacion.gestionar');

const filtroTablero = z.object({ sedeId: id.optional() });

const filtroHabitaciones = z.object({
  sedeId: id.optional(),
  libres: z.coerce.boolean().optional().default(false),
});

const filtroListado = z.object({
  mascotaId: id.optional(),
  estado: z.enum(['activa', 'alta', 'remitida', 'fallecido']).optional(),
  sedeId: id.optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const traslado = z.object({ habitacionId: id.optional().nullable() });

/* ---- Habitaciones ---- */

router.get(
  '/habitaciones',
  puedeVer,
  validar({ query: filtroHabitaciones }),
  controlador.habitaciones
);
router.post(
  '/habitaciones',
  requierePermiso('habitaciones.gestionar'),
  validar({ body: esquemas.crearHabitacion }),
  controlador.crearHabitacion
);
router.patch(
  '/habitaciones/:id',
  requierePermiso('habitaciones.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.estadoHabitacion }),
  controlador.cambiarEstadoHabitacion
);

/* ---- Medicación y visitas (van antes de /:id para que no se las trague) ---- */

router.post(
  '/medicacion/:id/toma',
  puedeGestionar,
  validar({ params: esquemas.paramsId }),
  controlador.registrarToma
);
router.delete(
  '/medicacion/:id',
  puedeGestionar,
  validar({ params: esquemas.paramsId }),
  controlador.suspenderMedicacion
);
router.patch(
  '/visitas/:id/salida',
  puedeGestionar,
  validar({ params: esquemas.paramsId }),
  controlador.cerrarVisita
);

/* ---- Pacientes ---- */

router.get('/tablero', puedeVer, validar({ query: filtroTablero }), controlador.tablero);
router.get('/', puedeVer, validar({ query: filtroListado }), controlador.listar);

router.post(
  '/',
  puedeGestionar,
  validar({ body: esquemas.ingresarHospitalizacion }),
  controlador.ingresar
);

router.get('/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.detalle);

router.post(
  '/:id/egreso',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: esquemas.egresarHospitalizacion }),
  controlador.egresar
);
router.patch(
  '/:id/habitacion',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: traslado }),
  controlador.trasladar
);
router.post(
  '/:id/controles',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: esquemas.controlHospitalizacion }),
  controlador.registrarControl
);
router.post(
  '/:id/alimentacion',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: esquemas.alimentacionHospitalizacion }),
  controlador.registrarAlimentacion
);
router.post(
  '/:id/medicacion',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: esquemas.medicacionHospitalizacion }),
  controlador.crearMedicacion
);
router.post(
  '/:id/visitas',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: esquemas.visitaHospitalizacion }),
  controlador.registrarVisita
);

module.exports = router;
