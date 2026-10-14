'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/farmacia.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const id = esquemas.paramsId.shape.id;

const puedeVerRecetas = requierePermiso('recetas.ver_propias', 'recetas.ver_todas');
const puedeDispensar = requierePermiso('farmacia.dispensar');
const puedeGestionar = requierePermiso('farmacia.gestionar');

const verificacion = z.object({
  mascotaId: id.optional().nullable(),
  medicamentos: z.array(id).min(1, 'Indica al menos un medicamento.').max(30),
});

const anulacion = z.object({ motivo: z.string().trim().min(3, 'Escribe el motivo de la anulación.').max(255) });

const filtroFechas = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  clienteId: id.optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const filtroInventario = z.object({ criticos: z.coerce.boolean().optional().default(false) });

/* ---- Recetas ---- */

router.get('/recetas', puedeVerRecetas, validar({ query: esquemas.listarRecetas }), controlador.listarRecetas);
router.post('/recetas', requierePermiso('recetas.crear'), validar({ body: esquemas.crearReceta }), controlador.crearReceta);
router.get('/recetas/:id', puedeVerRecetas, validar({ params: esquemas.paramsId }), controlador.detalleReceta);
router.delete(
  '/recetas/:id',
  requierePermiso('recetas.crear'),
  validar({ params: esquemas.paramsId, body: anulacion }),
  controlador.anularReceta
);

// Comprobación previa mientras se escribe la receta.
router.post('/verificar', requierePermiso('recetas.crear', 'farmacia.dispensar'), validar({ body: verificacion }), controlador.verificar);

/* ---- Dispensación ---- */

router.get('/dispensaciones', puedeDispensar, validar({ query: filtroFechas }), controlador.listarDispensaciones);
router.post('/dispensaciones', puedeDispensar, validar({ body: esquemas.dispensarReceta }), controlador.dispensar);
router.get('/dispensaciones/:id', puedeDispensar, validar({ params: esquemas.paramsId }), controlador.detalleDispensacion);

router.get('/devoluciones', puedeGestionar, validar({ query: filtroFechas }), controlador.listarDevoluciones);
router.post('/devoluciones', puedeGestionar, validar({ body: esquemas.devolverMedicamento }), controlador.devolver);

/* ---- Catálogos e inventario ---- */

router.get('/inventario', requierePermiso('farmacia.dispensar', 'inventario.ver'), validar({ query: filtroInventario }), controlador.inventario);
router.get('/interacciones', requierePermiso('recetas.crear', 'farmacia.gestionar', 'farmacia.dispensar'), controlador.interacciones);
router.post('/interacciones', puedeGestionar, validar({ body: esquemas.crearInteraccion }), controlador.crearInteraccion);

router.get('/historial/:id', puedeVerRecetas, validar({ params: esquemas.paramsId }), controlador.historial);
router.get('/restringidos', puedeGestionar, validar({ query: filtroFechas }), controlador.restringidos);

module.exports = router;
