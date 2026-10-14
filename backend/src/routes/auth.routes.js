'use strict';

const { Router } = require('express');
const controlador = require('../controllers/auth.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { limiteAuth } = require('../middleware/rateLimit');
const { antiBots } = require('../middleware/bots');
const esquemas = require('../utils/esquemas');

const router = Router();

// El registro y la recuperación son las dos puertas que se abren sin cuenta y
// dejan rastro: una crea usuarios, la otra manda correos. Van con el freno
// completo contra robots, además del límite por IP.
router.post('/registro', limiteAuth, ...antiBots, validar({ body: esquemas.registro }), controlador.registro);
router.post('/login', limiteAuth, validar({ body: esquemas.login }), controlador.login);
router.post('/logout', requiereAuth, controlador.logout);

// Recuperación de contraseña: mismo límite estricto que el login, porque son
// endpoints públicos que aceptan un correo cualquiera.
router.post('/recuperar', limiteAuth, ...antiBots, validar({ body: esquemas.solicitarRecuperacion }), controlador.recuperar);
router.post('/restablecer', limiteAuth, validar({ body: esquemas.restablecerPassword }), controlador.restablecer);

router.get('/me', requiereAuth, controlador.yo);
router.put('/perfil', requiereAuth, validar({ body: esquemas.actualizarPerfil }), controlador.actualizarPerfil);
router.put('/password', requiereAuth, validar({ body: esquemas.cambioPassword }), controlador.cambiarPassword);

/* ---- Segundo factor ------------------------------------------------
   La verificación es pública —todavía no hay sesión, solo el desafío que
   dejó el login— y lleva el mismo límite estricto que el propio login.
   El resto exige sesión: son la configuración de la propia cuenta.
   ------------------------------------------------------------------- */

router.post('/mfa/verificar', limiteAuth, validar({ body: esquemas.verificarMfa }), controlador.verificarMfa);

router.get('/mfa', requiereAuth, controlador.estadoMfa);
router.post('/mfa/iniciar', requiereAuth, controlador.iniciarMfa);
router.post('/mfa/activar', requiereAuth, validar({ body: esquemas.activarMfa }), controlador.activarMfa);
router.post('/mfa/codigos', requiereAuth, validar({ body: esquemas.confirmarConPassword }), controlador.renovarCodigosMfa);

// Quitar el segundo factor lleva la contraseña en el cuerpo, así que va por
// POST: un DELETE con cuerpo lo descartan algunos proxies por el camino.
router.post('/mfa/desactivar', requiereAuth, validar({ body: esquemas.confirmarConPassword }), controlador.desactivarMfa);

module.exports = router;
