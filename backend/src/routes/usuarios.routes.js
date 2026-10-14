'use strict';

const { Router } = require('express');
const controlador = require('../controllers/usuarios.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth, reautenticar } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

router.get('/', requierePermiso('usuarios.ver'), validar({ query: esquemas.listarUsuarios }), controlador.listar);
router.get('/:id', requierePermiso('usuarios.ver'), validar({ params: esquemas.paramsId }), controlador.detalle);

/* ------------------------------------------------------------------
   Acciones críticas

   Las tres crean o mueven cuentas, que es la puerta de entrada a todo lo
   demás. Además del permiso, se vuelve a pedir la contraseña: el permiso
   dice que el ROL puede hacerlo, la contraseña dice que quien está al
   teclado es el dueño de la cuenta y no alguien que se encontró la
   sesión abierta en el computador de recepción.

   `reautenticar` va antes de `validar`: zod descarta las claves que no
   declara, así que al revés encontraría el campo ya borrado. Lo consume y
   lo quita del cuerpo, y `validar` sigue viendo exactamente lo que
   espera.
   ------------------------------------------------------------------ */

router.post(
  '/',
  requierePermiso('usuarios.crear'),
  reautenticar,
  validar({ body: esquemas.crearUsuario }),
  controlador.crear
);
router.patch(
  '/:id/estado',
  requierePermiso('usuarios.estado'),
  reautenticar,
  validar({ params: esquemas.paramsId, body: esquemas.cambiarEstadoUsuario }),
  controlador.cambiarEstado
);
router.patch(
  '/:id/rol',
  requierePermiso('roles.asignar'),
  reautenticar,
  validar({ params: esquemas.paramsId, body: esquemas.cambiarRolUsuario }),
  controlador.cambiarRol
);

module.exports = router;
