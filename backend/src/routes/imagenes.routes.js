'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/imagenes.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const puedeVer = requierePermiso('imagenes.ver', 'imagenes.gestionar', 'historia.ver_propia');
const puedeGestionar = requierePermiso('imagenes.gestionar');

// El archivo se sube antes a Storage con /api/mascotas/:id/foto o el
// equivalente del panel; aquí solo se guarda la referencia.
const archivoEstudio = z.object({
  titulo: z.string().trim().min(1, 'Ponle un título al archivo.').max(150),
  archivo: z.string().trim().min(1, 'Falta la URL del archivo.').max(255),
  miniatura: z.string().trim().max(255).optional().nullable(),
  mime: z.string().trim().max(100).optional().nullable(),
  tamanoBytes: z.coerce.number().int().min(0).optional().nullable(),
  orden: z.coerce.number().int().min(0).max(999).optional().default(0),
});

router.delete(
  '/archivos/:id',
  puedeGestionar,
  validar({ params: esquemas.paramsId }),
  controlador.eliminarArchivo
);

router.get('/mascota/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.galeria);

router.get('/', puedeVer, validar({ query: esquemas.listarEstudiosImagen }), controlador.listar);
router.post('/', puedeGestionar, validar({ body: esquemas.crearEstudioImagen }), controlador.crear);

router.get('/:id', puedeVer, validar({ params: esquemas.paramsId }), controlador.detalle);
router.delete('/:id', puedeGestionar, validar({ params: esquemas.paramsId }), controlador.anular);

router.post(
  '/:id/archivos',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: archivoEstudio }),
  controlador.agregarArchivo
);

router.put(
  '/:id/informe',
  requierePermiso('imagenes.informar'),
  validar({ params: esquemas.paramsId, body: esquemas.crearInformeImagen }),
  controlador.guardarInforme
);

module.exports = router;
