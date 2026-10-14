'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/personal.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const id = esquemas.paramsId.shape.id;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.');

const verPersonal = requierePermiso('personal.ver', 'personal.gestionar');
const gestionarPersonal = requierePermiso('personal.gestionar');

const filtroTurnos = z.object({
  sedeId: id.optional(),
  soloActivos: z.coerce.boolean().optional().default(true),
});

const rangoPersonal = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  usuarioId: id.optional(),
  sedeId: id.optional(),
});

const filtroAusencias = z.object({
  usuarioId: id.optional(),
  estado: z.enum(['solicitada', 'aprobada', 'rechazada', 'cancelada']).optional(),
  desde: fecha.optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

const filtroComisiones = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  usuarioId: id.optional(),
  estado: z.enum(['pendiente', 'liquidada', 'anulada']).optional(),
});

const filtroCertificaciones = z.object({
  usuarioId: id.optional(),
  porVencer: z.coerce.boolean().optional().default(false),
});

/* Turnos */
router.get('/turnos', verPersonal, validar({ query: filtroTurnos }), controlador.turnos);
router.post('/turnos', gestionarPersonal, validar({ body: esquemas.crearTurno }), controlador.crearTurno);

router.get('/asignaciones', verPersonal, validar({ query: rangoPersonal }), controlador.asignaciones);
router.post('/asignaciones', gestionarPersonal, validar({ body: esquemas.asignarTurno }), controlador.asignarTurno);
router.delete(
  '/asignaciones/:id',
  gestionarPersonal,
  validar({ params: esquemas.paramsId }),
  controlador.quitarAsignacion
);

/* Asistencia */
router.get('/asistencia', verPersonal, validar({ query: rangoPersonal }), controlador.asistencia);
router.post(
  '/asistencia',
  gestionarPersonal,
  validar({ body: esquemas.registrarAsistencia }),
  controlador.registrarAsistencia
);

/* Ausencias */
router.get(
  '/ausencias',
  requierePermiso('ausencias.solicitar', 'ausencias.aprobar'),
  validar({ query: filtroAusencias }),
  controlador.ausencias
);
router.post(
  '/ausencias',
  requierePermiso('ausencias.solicitar', 'ausencias.aprobar'),
  validar({ body: esquemas.solicitarAusencia }),
  controlador.solicitarAusencia
);
router.patch(
  '/ausencias/:id',
  requierePermiso('ausencias.aprobar'),
  validar({ params: esquemas.paramsId, body: esquemas.resolverAusencia }),
  controlador.resolverAusencia
);

/* Comisiones — las rutas fijas van antes que /:id para que no las capture */
router.get('/comisiones/reglas', requierePermiso('comisiones.gestionar'), controlador.reglasComision);
router.post(
  '/comisiones/reglas',
  requierePermiso('comisiones.gestionar'),
  validar({ body: esquemas.crearReglaComision }),
  controlador.crearReglaComision
);
router.post(
  '/comisiones/calcular',
  requierePermiso('comisiones.gestionar'),
  validar({ body: esquemas.liquidarComisiones }),
  controlador.calcularComisiones
);
router.post(
  '/comisiones/liquidar',
  requierePermiso('comisiones.gestionar'),
  validar({ body: esquemas.liquidarComisiones }),
  controlador.liquidarComisiones
);
router.get(
  '/comisiones',
  requierePermiso('comisiones.ver', 'comisiones.gestionar'),
  validar({ query: filtroComisiones }),
  controlador.comisiones
);

/* Certificaciones y productividad */
router.get(
  '/certificaciones',
  requierePermiso('personal.ver', 'personal.gestionar', 'perfil.ver'),
  validar({ query: filtroCertificaciones }),
  controlador.certificaciones
);
router.post(
  '/certificaciones',
  gestionarPersonal,
  validar({ body: esquemas.crearCertificacion }),
  controlador.crearCertificacion
);

router.get(
  '/productividad',
  requierePermiso('reportes.ver', 'personal.gestionar'),
  validar({ query: rangoPersonal }),
  controlador.productividad
);

module.exports = router;
