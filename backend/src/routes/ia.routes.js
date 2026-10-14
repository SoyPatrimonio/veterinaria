'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/alertas.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

/**
 * Asistente interno de IA.
 *
 * Comparte controlador con las alertas porque hacen lo mismo desde dos
 * ángulos: avisar de lo que se está pasando por alto. Lo que las separa es que
 * la alerta es una regla determinista y la sugerencia de IA es una propuesta
 * que un veterinario tiene que revisar antes de que cuente.
 */

const router = Router();

router.use(requiereAuth);

const filtroSugerencias = z.object({
  estado: z.enum(['propuesta', 'aceptada', 'descartada']).optional().default('propuesta'),
  mascotaId: esquemas.paramsId.shape.id.optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const filtroRegistro = z.object({
  tipo: z.enum(esquemas.tiposSolicitudIa).optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

router.post(
  '/consultar',
  requierePermiso('ia.usar'),
  validar({ body: esquemas.solicitarIa }),
  controlador.consultar
);

router.get(
  '/sugerencias',
  requierePermiso('ia.usar', 'ia.revisar'),
  validar({ query: filtroSugerencias }),
  controlador.sugerencias
);

// Aceptar o descartar exige permiso propio y deja nombre y fecha: el CHECK de
// la base impide que una sugerencia quede aprobada sin revisor.
router.patch(
  '/sugerencias/:id',
  requierePermiso('ia.revisar'),
  validar({ params: esquemas.paramsId, body: esquemas.revisarSugerencia }),
  controlador.revisarSugerencia
);

router.get(
  '/registro',
  requierePermiso('ia.ver_registro'),
  validar({ query: filtroRegistro }),
  controlador.registro
);

module.exports = router;
