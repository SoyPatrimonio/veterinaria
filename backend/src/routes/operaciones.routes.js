'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/operaciones.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const id = esquemas.paramsId.shape.id;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.');

const verEquipos = requierePermiso('equipos.ver', 'equipos.gestionar');
const gestionarEquipos = requierePermiso('equipos.gestionar');
const verBio = requierePermiso('bioseguridad.ver', 'bioseguridad.registrar', 'bioseguridad.gestionar');
const registrarBio = requierePermiso('bioseguridad.registrar', 'bioseguridad.gestionar');
const gestionarBio = requierePermiso('bioseguridad.gestionar');
const operarCaja = requierePermiso('caja.operar', 'caja.gestionar');

const filtroEquipos = z.object({
  sedeId: id.optional(),
  estado: z.enum(['operativo', 'mantenimiento', 'reparacion', 'fuera_servicio', 'dado_baja']).optional(),
  mantenimientoVencido: z.coerce.boolean().optional().default(false),
});

const filtroProtocolos = z.object({
  categoria: z.enum(['limpieza', 'desinfeccion', 'esterilizacion', 'residuos', 'proteccion', 'emergencia']).optional(),
  soloActivos: z.coerce.boolean().optional().default(true),
});

const filtroRegistrosBio = z.object({
  protocoloId: id.optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

const filtroResiduos = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  tipo: z.enum([
    'anatomopatologico', 'cortopunzante', 'biosanitario', 'quimico', 'farmaco', 'ordinario', 'reciclable',
  ]).optional(),
});

const filtroIncidentes = z.object({
  estado: z.enum(['abierto', 'en_seguimiento', 'cerrado']).optional(),
  gravedad: z.enum(['leve', 'moderada', 'grave']).optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

const filtroEpp = z.object({
  usuarioId: id.optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

const filtroCajas = z.object({ sedeId: id.optional() });

const historialCajas = z.object({
  sedeId: id.optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(60),
});

/* ---- Equipos médicos ---- */
router.get('/equipos', verEquipos, validar({ query: filtroEquipos }), controlador.equipos);
router.post('/equipos', gestionarEquipos, validar({ body: esquemas.crearEquipo }), controlador.crearEquipo);
router.get('/equipos/:id', verEquipos, validar({ params: esquemas.paramsId }), controlador.detalleEquipo);
router.put(
  '/equipos/:id',
  gestionarEquipos,
  validar({ params: esquemas.paramsId, body: esquemas.crearEquipo }),
  controlador.actualizarEquipo
);
router.post(
  '/equipos/:id/mantenimientos',
  gestionarEquipos,
  validar({ params: esquemas.paramsId, body: esquemas.registrarMantenimiento }),
  controlador.registrarMantenimiento
);

/* ---- Bioseguridad ---- */
router.get('/protocolos', verBio, validar({ query: filtroProtocolos }), controlador.protocolos);
router.post('/protocolos', gestionarBio, validar({ body: esquemas.crearProtocolo }), controlador.crearProtocolo);

router.get('/bioseguridad', verBio, validar({ query: filtroRegistrosBio }), controlador.registrosBioseguridad);
router.post(
  '/bioseguridad',
  registrarBio,
  validar({ body: esquemas.registrarProtocolo }),
  controlador.registrarProtocolo
);

router.get('/residuos', verBio, validar({ query: filtroResiduos }), controlador.residuos);
router.post('/residuos', registrarBio, validar({ body: esquemas.registrarResiduos }), controlador.registrarResiduos);

router.get('/incidentes', verBio, validar({ query: filtroIncidentes }), controlador.incidentes);
router.post(
  '/incidentes',
  registrarBio,
  validar({ body: esquemas.registrarIncidente }),
  controlador.registrarIncidente
);
router.patch(
  '/incidentes/:id',
  gestionarBio,
  validar({ params: esquemas.paramsId, body: esquemas.cerrarIncidente }),
  controlador.cerrarIncidente
);

router.get('/epp', verBio, validar({ query: filtroEpp }), controlador.elementosProteccion);
router.post(
  '/epp',
  gestionarBio,
  validar({ body: esquemas.crearElementoProteccion }),
  controlador.crearElementoProteccion
);
router.post('/epp/entregas', registrarBio, validar({ body: esquemas.entregarEpp }), controlador.entregarEpp);

/* ---- Caja ---- */
router.get('/cajas/historial', operarCaja, validar({ query: historialCajas }), controlador.historialCajas);
router.post('/cajas/apertura', operarCaja, validar({ body: esquemas.abrirCaja }), controlador.abrirCaja);
router.get(
  '/cajas/apertura/:id',
  operarCaja,
  validar({ params: esquemas.paramsId }),
  controlador.detalleApertura
);
router.post(
  '/cajas/apertura/:id/movimientos',
  operarCaja,
  validar({ params: esquemas.paramsId, body: esquemas.movimientoCaja }),
  controlador.registrarMovimiento
);
router.post(
  '/cajas/apertura/:id/cierre',
  operarCaja,
  validar({ params: esquemas.paramsId, body: esquemas.cerrarCaja }),
  controlador.cerrarCaja
);
router.get('/cajas', operarCaja, validar({ query: filtroCajas }), controlador.cajas);
router.post('/cajas', requierePermiso('caja.gestionar'), validar({ body: esquemas.crearCaja }), controlador.crearCaja);

module.exports = router;
