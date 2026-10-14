'use strict';

const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');
const usuarioModel = require('../models/usuario.model');
const seguridad = require('../models/seguridad.model');
const mfaModel = require('../models/mfa.model');
const { exigeMfa, debeConfigurarApp } = require('../utils/politicaMfa');
const { esProduccion } = require('../config/env');
const { consultarUna, enTransaccion } = require('../config/database');

/**
 * POST /api/auth/registro — alta pública.
 *
 * Sin código de acceso sale un cliente; con el código de la clínica, un
 * veterinario. Quién decide eso está en el servicio, no aquí.
 */
const registro = asyncHandler(async (req, res) => {
  const sesion = await authService.registrar(req.body, req);
  res.status(201).json({ ok: true, ...sesion });
});

/**
 * POST /api/auth/login
 *
 * Con segundo factor activo la respuesta no trae token: trae el desafío para
 * el segundo paso. Se responde 200 igual porque la contraseña sí era correcta;
 * lo que falta es la otra mitad del ingreso.
 */
const login = asyncHandler(async (req, res) => {
  const sesion = await authService.login(req.body, req);
  res.json({ ok: true, ...sesion });
});

/** POST /api/auth/mfa/verificar — segundo paso del ingreso. */
const verificarMfa = asyncHandler(async (req, res) => {
  const sesion = await authService.completarMfa(req.body, req);
  res.json({ ok: true, ...sesion });
});

/* ------------------------------------------------------------------
   Configuración del segundo factor
   ------------------------------------------------------------------ */

/** GET /api/auth/mfa — cómo lo tiene esta cuenta. */
const estadoMfa = asyncHandler(async (req, res) => {
  const estado = await mfaModel.estadoDe(req.usuario.id);

  res.json({
    ok: true,
    activo: Boolean(estado && estado.activo === 1),
    obligatorio: exigeMfa(req.usuario.rol),
    codigosDisponibles: estado ? estado.codigos_disponibles : 0,
    confirmadoEn: estado ? estado.confirmado_en : null,
  });
});

/** POST /api/auth/mfa/iniciar — genera el secreto y la dirección otpauth. */
const iniciarMfa = asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await authService.prepararMfa(req.usuario)) });
});

/**
 * POST /api/auth/mfa/activar
 * Los códigos de recuperación se devuelven una sola vez, aquí.
 */
const activarMfa = asyncHandler(async (req, res) => {
  const { codigos } = await authService.activarMfa(req.usuario, req.body.codigo, req);

  res.json({
    ok: true,
    codigos,
    mensaje: 'Segundo factor activo. Guarda estos códigos: no se vuelven a mostrar.',
  });
});

/** DELETE /api/auth/mfa — pide la contraseña otra vez. */
const desactivarMfa = asyncHandler(async (req, res) => {
  await authService.desactivarMfa(req.usuario, req.body.password, req);
  res.json({ ok: true, mensaje: 'Segundo factor desactivado.' });
});

/** POST /api/auth/mfa/codigos — cambia los de recuperación por otros. */
const renovarCodigosMfa = asyncHandler(async (req, res) => {
  const { codigos } = await authService.renovarCodigosMfa(req.usuario, req.body.password, req);

  res.json({
    ok: true,
    codigos,
    mensaje: 'Códigos nuevos. Los anteriores dejaron de servir.',
  });
});

/** GET /api/auth/me — perfil de la sesión actual, con sus permisos. */
const yo = asyncHandler(async (req, res) => {
  const extra = req.usuario.cliente_id
    ? await consultarUna(
        'SELECT documento, tipo_documento, direccion, ciudad FROM clientes WHERE id = ?',
        [req.usuario.cliente_id]
      )
    : null;

  res.json({
    ok: true,
    permisos: req.permisos,
    debeCambiarPassword: req.usuario.debe_cambiar_password === 1,
    debeConfigurarMfa: debeConfigurarApp(req.usuario.rol, req.usuario.mfa_activo),
    usuario: authService.usuarioPublico(req.usuario, {
      clienteId: req.usuario.cliente_id,
      veterinarioId: req.usuario.veterinario_id,
      permisos: req.permisos,
      ...(extra || {}),
    }),
  });
});

/** PUT /api/auth/perfil */
const actualizarPerfil = asyncHandler(async (req, res) => {
  const { nombre, telefono, direccion, ciudad, documento } = req.body;
  const antes = { nombre: req.usuario.nombre, telefono: req.usuario.telefono };

  // Las dos tablas se escriben juntas. Por separado, un fallo en la fila de
  // clientes dejaría el nombre ya cambiado y la dirección no, y la respuesta
  // diría igualmente que el perfil se guardó entero.
  await enTransaccion(async (conexion) => {
    await usuarioModel.actualizarPerfil(req.usuario.id, { nombre, telefono }, conexion);

    if (req.usuario.cliente_id) {
      await conexion.execute(
        'UPDATE clientes SET direccion = ?, ciudad = ?, documento = ? WHERE id = ?',
        [direccion, ciudad, documento, req.usuario.cliente_id]
      );
    }
  });

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: req.usuario.id, modulo: 'usuarios', tabla: 'usuarios',
    registroId: req.usuario.id, accion: 'actualizar',
    descripcion: 'Actualizó su propio perfil',
    antes, despues: { nombre, telefono }, ip,
  });

  const actualizado = await usuarioModel.buscarPorId(req.usuario.id);
  res.json({ ok: true, usuario: authService.usuarioPublico(actualizado) });
});

/** PUT /api/auth/password */
const cambiarPassword = asyncHandler(async (req, res) => {
  await authService.cambiarPassword(req.usuario.id, req.body, req);
  res.json({
    ok: true,
    mensaje: 'Contraseña actualizada. Vuelve a iniciar sesión.',
    sesionCerrada: true,
  });
});

/**
 * POST /api/auth/logout
 * Cierra la sesión en la base: a partir de aquí el token deja de servir aunque
 * el JWT siga vigente por tiempo.
 */
const logout = asyncHandler(async (req, res) => {
  await authService.cerrarSesion(req);

  // Se le pide al navegador que suelte lo que guardó de este sitio. El
  // frontend ya borra el token al salir, pero eso depende de que el JavaScript
  // llegue a ejecutarse: si la pestaña se cierra en ese momento, o si el script
  // falló, el token se quedaba en localStorage con la sesión ya cerrada en el
  // servidor. Con esto lo borra el propio navegador.
  //
  // Alcanza al origen que respondió, así que en producción —frontend y API en
  // el mismo dominio— limpia lo del sitio. Con el frontend en otro puerto, en
  // desarrollo, no llega: allí lo borra el frontend, como siempre.
  res.setHeader('Clear-Site-Data', '"storage"');

  res.json({ ok: true, mensaje: 'Sesión cerrada.' });
});

/**
 * POST /api/auth/recuperar
 * Siempre responde lo mismo, exista o no el correo.
 */
const recuperar = asyncHandler(async (req, res) => {
  const { token } = await authService.solicitarRecuperacion(req.body, req);

  res.json({
    ok: true,
    mensaje: 'Si el correo está registrado, enviamos las instrucciones para restablecer la contraseña.',
    // Sin servicio de correo configurado, en desarrollo se devuelve el token
    // para poder terminar la prueba desde el navegador.
    ...(!esProduccion && token ? { token } : {}),
  });
});

/** POST /api/auth/restablecer */
const restablecer = asyncHandler(async (req, res) => {
  await authService.restablecerPassword(req.body, req);
  res.json({ ok: true, mensaje: 'Contraseña restablecida. Ya puedes iniciar sesión.' });
});

module.exports = {
  registro,
  login,
  yo,
  actualizarPerfil,
  cambiarPassword,
  logout,
  recuperar,
  restablecer,
  verificarMfa,
  estadoMfa,
  iniciarMfa,
  activarMfa,
  desactivarMfa,
  renovarCodigosMfa,
};
