'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/telemedicina.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

// Con uno de los tres basta: el dueño entra a las suyas, el veterinario a las
// que atiende y la administración las gestiona todas. Qué sesión concreta ve
// cada quien lo decide el controlador.
const participante = requierePermiso(
  'telemedicina.ver_propias',
  'telemedicina.atender',
  'telemedicina.gestionar'
);

const filtro = z.object({
  estado: z.enum(['programada', 'en_curso', 'finalizada', 'cancelada']).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const pagoSesion = z.object({
  facturaId: esquemas.paramsId.shape.id.optional().nullable(),
});

router.get('/', participante, validar({ query: filtro }), controlador.listar);
router.post(
  '/',
  requierePermiso('telemedicina.ver_propias', 'telemedicina.gestionar'),
  validar({ body: esquemas.crearSesionTelemedicina }),
  controlador.crear
);

router.get('/:id', participante, validar({ params: esquemas.paramsId }), controlador.detalle);

router.post(
  '/:id/consentimiento',
  participante,
  validar({ params: esquemas.paramsId, body: esquemas.consentimientoTelemedicina }),
  controlador.firmarConsentimiento
);

// Dar por pagada la videoconsulta habilita la sala, así que lo hace el personal
// tras comprobar el cobro. Con 'pagos.en_linea' —que tiene todo cliente— el
// propio paciente podía marcarla y saltarse el pago que esta regla protege. El
// cliente paga por /api/integraciones/pagos, que confirma la pasarela.
router.post(
  '/:id/pago',
  requierePermiso('telemedicina.gestionar', 'pagos.registrar'),
  validar({ params: esquemas.paramsId, body: pagoSesion }),
  controlador.registrarPago
);

router.patch(
  '/:id',
  participante,
  validar({ params: esquemas.paramsId, body: esquemas.estadoSesionTelemedicina }),
  controlador.cambiarEstado
);

router.post(
  '/:id/mensajes',
  participante,
  validar({ params: esquemas.paramsId, body: esquemas.mensajeTelemedicina }),
  controlador.enviarMensaje
);

module.exports = router;
