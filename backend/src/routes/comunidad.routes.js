'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/comunidad.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth, authOpcional } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const { subirFoto } = require('../middleware/upload');
const { limiteSubida } = require('../middleware/rateLimit');
const { limitePublico } = require('../middleware/rateLimit');
const { antiBots, antiBotsSiAnonimo } = require('../middleware/bots');
const esquemas = require('../utils/esquemas');

const router = Router();

const id = esquemas.paramsId.shape.id;

const paramsToken = z.object({
  token: z.string().trim().min(8, 'Código no válido.').max(32).regex(/^[\w-]+$/, 'Código no válido.'),
});

const filtroPerdidas = z.object({
  estado: z.enum(['perdida', 'encontrada', 'cerrada']).optional().default('perdida'),
  ciudad: z.string().trim().max(80).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const filtroAdopciones = z.object({
  // 'todos' lo usa la clínica para ver también reservados y adoptados; quien
  // entra a adoptar sigue recibiendo solo los disponibles por defecto.
  estado: z.enum(['disponible', 'reservado', 'adoptado', 'retirado', 'todos']).optional().default('disponible'),
  especieId: id.optional(),
  porte: z.enum(['pequeno', 'mediano', 'grande', 'gigante']).optional(),
  sexo: z.enum(['macho', 'hembra', 'desconocido']).optional(),
  busqueda: z.string().trim().max(80).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const filtroTestimonios = z.object({
  limite: z.coerce.number().int().min(1).max(50).optional().default(6),
});

/* ==================================================================
   PÚBLICO — sin sesión
   ==================================================================

   Estas rutas las abre gente que no tiene cuenta: quien escanea la placa de
   un perro que encontró en la calle, quien ve un cartel de mascota perdida o
   quien quiere adoptar. Todas devuelven solo lo que alguien autorizó a
   publicar, y las que escriben van con límite de peticiones.
   ================================================================== */

router.get('/qr/:token', validar({ params: paramsToken }), controlador.perfilPublico);

router.get('/perdidas', validar({ query: filtroPerdidas }), controlador.listarPerdidas);
router.get('/perdidas/:id', validar({ params: esquemas.paramsId }), controlador.detallePerdida);
router.post(
  '/perdidas/:id/avistamientos',
  limitePublico,
  ...antiBots,
  validar({ params: esquemas.paramsId, body: esquemas.crearAvistamiento }),
  controlador.crearAvistamiento
);

router.get('/adopciones', validar({ query: filtroAdopciones }), controlador.listarAdopciones);
router.get(
  '/adopciones/:id',
  authOpcional,
  validar({ params: esquemas.paramsId }),
  controlador.detalleAdopcion
);
// authOpcional va primero a propósito: esta ruta la usan tanto un visitante
// sin cuenta como un cliente desde su panel, y al segundo no se le pide el
// sello del formulario.
router.post(
  '/adopciones/:id/solicitudes',
  limitePublico,
  authOpcional,
  antiBotsSiAnonimo,
  validar({ params: esquemas.paramsId, body: esquemas.solicitarAdopcion }),
  controlador.solicitarAdopcion
);

/* ---- Testimonios ----

   El comentario que deja quien ya vino a la clínica. Se lee sin cuenta —sale
   en la landing— y se escribe sin cuenta, con el mismo freno que los otros
   formularios abiertos: tope de envíos por equipo y sello del formulario para
   quien llega sin sesión. El texto lo revisa el filtro de palabras del
   controlador antes de guardarlo. */

router.get('/testimonios', validar({ query: filtroTestimonios }), controlador.listarTestimonios);
router.post(
  '/testimonios',
  limitePublico,
  authOpcional,
  antiBotsSiAnonimo,
  validar({ body: esquemas.crearTestimonio }),
  controlador.crearTestimonio
);

/* ==================================================================
   CON SESIÓN
   ================================================================== */

router.use(requiereAuth);

/* ---- Identidad digital ---- */

const puedeIdentidad = requierePermiso('identidad.gestionar');

router.get('/identidad/:id', puedeIdentidad, validar({ params: esquemas.paramsId }), controlador.identidad);
router.put(
  '/identidad/:id',
  puedeIdentidad,
  validar({ params: esquemas.paramsId, body: esquemas.configurarIdentidad }),
  controlador.configurarIdentidad
);
router.post(
  '/identidad/:id/token',
  puedeIdentidad,
  validar({ params: esquemas.paramsId }),
  controlador.regenerarToken
);

/* ---- Mascotas perdidas ---- */

router.post(
  '/perdidas',
  requierePermiso('perdidas.reportar', 'perdidas.gestionar'),
  validar({ body: esquemas.reportarPerdida }),
  controlador.reportarPerdida
);
router.patch(
  '/perdidas/:id',
  requierePermiso('perdidas.reportar', 'perdidas.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.actualizarPerdida }),
  controlador.actualizarPerdida
);
router.get(
  '/perdidas/:id/avistamientos',
  requierePermiso('perdidas.reportar', 'perdidas.gestionar'),
  validar({ params: esquemas.paramsId }),
  controlador.avistamientos
);
router.patch(
  '/avistamientos/:id',
  requierePermiso('perdidas.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.estadoAvistamiento }),
  controlador.estadoAvistamiento
);

/* ---- Adopciones ---- */

// Va antes que las rutas de la clínica y con su propio camino: '/solicitudes/mias'
// chocaría con '/solicitudes/:id', que exige un id numérico.
router.get('/mis-solicitudes', requierePermiso('adopciones.solicitar'), controlador.misSolicitudes);

const puedeGestionarAdopciones = requierePermiso('adopciones.gestionar');

router.post('/adopciones', puedeGestionarAdopciones, validar({ body: esquemas.crearPublicacionAdopcion }), controlador.crearPublicacion);
router.put(
  '/adopciones/:id',
  puedeGestionarAdopciones,
  validar({ params: esquemas.paramsId, body: esquemas.crearPublicacionAdopcion }),
  controlador.actualizarPublicacion
);

// La foto va por su propia ruta porque viaja como multipart y no como JSON.
// Quien publica la mascota es quien le pone la foto: el mismo permiso.
router.post(
  '/adopciones/:id/foto',
  puedeGestionarAdopciones,
  limiteSubida,
  validar({ params: esquemas.paramsId }),
  subirFoto,
  controlador.subirFotoAdopcion
);
router.delete(
  '/adopciones/:id/foto',
  puedeGestionarAdopciones,
  validar({ params: esquemas.paramsId }),
  controlador.quitarFotoAdopcion
);

router.get('/seguimientos/pendientes', puedeGestionarAdopciones, controlador.seguimientosPendientes);
router.patch(
  '/seguimientos/:id',
  puedeGestionarAdopciones,
  validar({ params: esquemas.paramsId, body: esquemas.registrarSeguimientoAdopcion }),
  controlador.registrarSeguimiento
);

router.get('/solicitudes/:id', puedeGestionarAdopciones, validar({ params: esquemas.paramsId }), controlador.detalleSolicitud);
router.patch(
  '/solicitudes/:id',
  puedeGestionarAdopciones,
  validar({ params: esquemas.paramsId, body: esquemas.evaluarSolicitudAdopcion }),
  controlador.evaluarSolicitud
);
router.post(
  '/solicitudes/:id/entrevistas',
  puedeGestionarAdopciones,
  validar({ params: esquemas.paramsId, body: esquemas.crearEntrevistaAdopcion }),
  controlador.crearEntrevista
);
router.post(
  '/solicitudes/:id/seguimientos',
  puedeGestionarAdopciones,
  validar({ params: esquemas.paramsId, body: esquemas.crearSeguimientoAdopcion }),
  controlador.crearSeguimiento
);

module.exports = router;
