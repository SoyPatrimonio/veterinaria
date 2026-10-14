'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/integraciones.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

const verIntegraciones = requierePermiso('integraciones.ver', 'integraciones.gestionar');
const gestionarIntegraciones = requierePermiso('integraciones.gestionar');

const paramsReferencia = z.object({
  referencia: z.string().trim().min(8).max(60).regex(/^[\w-]+$/, 'Referencia no válida.'),
});

const filtroFacturasE = z.object({
  estado: z.enum(['pendiente', 'enviada', 'aceptada', 'rechazada', 'anulada']).optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

const filtroTransacciones = z.object({
  estado: z.enum(['iniciada', 'pendiente', 'aprobada', 'rechazada', 'expirada', 'reversada']).optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

const filtroMensajes = z.object({
  canal: z.enum(['email', 'sms', 'whatsapp', 'push']).optional(),
  estado: z.enum(['pendiente', 'enviado', 'entregado', 'leido', 'fallido']).optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

router.get('/estado', verIntegraciones, controlador.estado);

/* Facturación electrónica DIAN */
router.get('/dian', verIntegraciones, controlador.proveedoresDian);
router.put(
  '/dian',
  gestionarIntegraciones,
  validar({ body: esquemas.configurarProveedorDian }),
  controlador.guardarProveedorDian
);
router.get(
  '/dian/facturas',
  verIntegraciones,
  validar({ query: filtroFacturasE }),
  controlador.facturasElectronicas
);
router.post(
  '/dian/facturas/:id',
  requierePermiso('facturacion_electronica.enviar'),
  validar({ params: esquemas.paramsId }),
  controlador.enviarFacturaElectronica
);

/* Pasarelas y pagos */
router.get('/pasarelas', verIntegraciones, controlador.pasarelas);
router.put(
  '/pasarelas',
  gestionarIntegraciones,
  validar({ body: esquemas.configurarPasarela }),
  controlador.guardarPasarela
);

// Los métodos disponibles los consulta el cliente al ir a pagar: no expone
// secretos, solo qué botones tiene sentido mostrar.
router.get('/pagos/metodos', requierePermiso('pagos.en_linea', 'integraciones.ver'), controlador.metodosDisponibles);

router.post(
  '/pagos',
  requierePermiso('pagos.en_linea', 'pagos.registrar'),
  validar({ body: esquemas.iniciarPago }),
  controlador.iniciarPago
);
router.post(
  '/pagos/:referencia/confirmar',
  requierePermiso('pagos.registrar', 'integraciones.gestionar'),
  validar({ params: paramsReferencia, body: esquemas.confirmarPago }),
  controlador.confirmarPago
);
router.get('/pagos', verIntegraciones, validar({ query: filtroTransacciones }), controlador.transacciones);

/* Mensajería y automatización */
router.get('/mensajes', verIntegraciones, validar({ query: filtroMensajes }), controlador.mensajes);

router.get('/automatizacion', requierePermiso('automatizacion.gestionar'), controlador.reglasAutomaticas);
router.put(
  '/automatizacion',
  requierePermiso('automatizacion.gestionar'),
  validar({ body: esquemas.crearReglaAutomatica }),
  controlador.guardarReglaAutomatica
);

module.exports = router;
