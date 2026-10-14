'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/laboratorio.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const id = esquemas.paramsId.shape.id;

// El dueño ve los resultados de sus mascotas con historia.ver_propia; el resto
// de la bandeja es del laboratorio.
const puedeVer = requierePermiso('laboratorio.ver', 'laboratorio.procesar', 'historia.ver_propia');
const puedeProcesar = requierePermiso('laboratorio.procesar');
const puedeValidar = requierePermiso('laboratorio.validar');

const nuevoParametro = z.object({
  tipoExamenId: id,
  codigo: z.string().trim().max(30).optional().nullable(),
  nombre: z.string().trim().min(1).max(120),
  unidad: z.string().trim().max(30).optional().nullable(),
  orden: z.coerce.number().int().min(0).max(999).optional().default(0),
  decimales: z.coerce.number().int().min(0).max(6).optional().default(2),
});

const nuevoRango = z.object({
  parametroId: id,
  especieId: id.optional().nullable(),
  sexo: z.enum(['macho', 'hembra']).optional().nullable(),
  edadMinMeses: z.coerce.number().int().min(0).max(400).optional().nullable(),
  edadMaxMeses: z.coerce.number().int().min(0).max(400).optional().nullable(),
  valorMin: z.coerce.number().optional().nullable(),
  valorMax: z.coerce.number().optional().nullable(),
  texto: z.string().trim().max(60).optional().nullable(),
});

const consultaEvolucion = z.object({ mascotaId: id, parametroId: id });

/* ---- Bandeja y catálogo (antes de /:id) ---- */

router.get('/bandeja', puedeProcesar, controlador.bandeja);
router.get('/evolucion', puedeVer, validar({ query: consultaEvolucion }), controlador.evolucion);
router.get('/parametros/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.parametros);
router.post('/parametros', puedeProcesar, validar({ body: nuevoParametro }), controlador.crearParametro);
router.post('/rangos', puedeProcesar, validar({ body: nuevoRango }), controlador.crearRango);

/* ---- Muestras ---- */

router.patch(
  '/muestras/:id',
  puedeProcesar,
  validar({ params: esquemas.paramsId, body: esquemas.estadoMuestra }),
  controlador.cambiarEstadoMuestra
);

/* ---- Exámenes ---- */

router.get('/examenes/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.detalleExamen);
router.put(
  '/examenes/:id/resultados',
  puedeProcesar,
  validar({ params: esquemas.paramsId, body: esquemas.cargarResultadosLaboratorio }),
  controlador.cargarResultados
);
router.post(
  '/examenes/:id/validar',
  puedeValidar,
  validar({ params: esquemas.paramsId, body: esquemas.validarResultado }),
  controlador.validar
);

/* ---- Órdenes ---- */

router.get('/ordenes', puedeVer, validar({ query: esquemas.listarOrdenesLaboratorio }), controlador.listar);
router.post(
  '/ordenes',
  requierePermiso('laboratorio.ordenar'),
  validar({ body: esquemas.crearOrdenLaboratorio }),
  controlador.crearOrden
);
router.get('/ordenes/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.detalle);
router.delete(
  '/ordenes/:id',
  requierePermiso('laboratorio.ordenar'),
  validar({ params: esquemas.paramsId }),
  controlador.anularOrden
);
router.post(
  '/ordenes/:id/muestras',
  puedeProcesar,
  validar({ params: esquemas.paramsId, body: esquemas.registrarMuestra }),
  controlador.registrarMuestra
);

module.exports = router;
