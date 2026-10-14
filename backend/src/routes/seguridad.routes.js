'use strict';

const { Router } = require('express');
const controlador = require('../controllers/seguridad.controller');
const { requiereAuth, reautenticar } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const { validar } = require('../middleware/validation');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

// Cualquier sesión puede preguntar por sus propios permisos: es lo que usa el
// frontend para decidir qué menús y botones muestra.
router.get('/permisos', controlador.misPermisos);

router.get('/roles', requierePermiso('roles.ver'), controlador.roles);

router.get('/sesiones', requierePermiso('sesiones.ver'), controlador.sesiones);

// Echar fuera a alguien también pide la contraseña: es la forma rápida de
// dejar sin acceso a quien podría estar dándose cuenta de lo que pasa.
router.post(
  '/sesiones/:id/cerrar',
  requierePermiso('sesiones.cerrar'),
  reautenticar,
  validar({ params: esquemas.paramsId }),
  controlador.cerrarSesionesDeUsuario
);

/* ---- Códigos de acceso del personal --------------------------------
   Van con 'usuarios.crear' y no con un permiso propio: estos códigos son
   exactamente la otra forma de dar de alta a un veterinario o a un
   administrador, así que quien puede crear cuentas puede verlos, y quien
   no, no.

   Cambiar uno pide además la contraseña. Deja fuera de golpe a todo el que
   tuviera el anterior apuntado y todavía no se haya registrado, que no es
   algo que deba poder hacer una sesión encontrada abierta.
   ------------------------------------------------------------------- */

router.get('/codigo-acceso', requierePermiso('usuarios.crear'), controlador.verCodigoAcceso);
router.post(
  '/codigo-acceso/rotar',
  requierePermiso('usuarios.crear'),
  reautenticar,
  validar({ body: esquemas.rotarCodigoAcceso }),
  controlador.rotarCodigoAcceso
);

// Estado de la base: mismo permiso que el resto de la vigilancia, porque es
// lo mismo que hace —mirar cómo se está usando el sistema— solo que del lado
// de las consultas en vez de las personas.
router.get('/consultas', requierePermiso('auditoria.ver'), controlador.consultas);

router.get('/accesos',   requierePermiso('auditoria.ver'), controlador.accesos);
router.get('/intentos',  requierePermiso('auditoria.ver'), controlador.intentos);
router.get(
  '/auditoria',
  requierePermiso('auditoria.ver'),
  validar({ query: esquemas.consultaAuditoria }),
  controlador.auditoria
);

module.exports = router;
