'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const usuarioModel = require('../models/usuario.model');
const seguridad = require('../models/seguridad.model');
const authService = require('../services/auth.service');
const { consultar, enTransaccion } = require('../config/database');

/** GET /api/usuarios — solo admin. */
const listar = asyncHandler(async (req, res) => {
  const { rol, estado, busqueda, limite, desplazamiento } = req.consulta || {};
  const { filas, total } = await usuarioModel.listar({ rol, estado, busqueda, limite, desplazamiento });
  res.json({ ok: true, usuarios: filas, total });
});

/** GET /api/usuarios/:id — solo admin. */
const detalle = asyncHandler(async (req, res) => {
  const usuario = await usuarioModel.buscarPorId(req.params.id);
  if (!usuario) throw ApiError.noEncontrado('Ese usuario no existe.');
  res.json({ ok: true, usuario });
});

/** POST /api/usuarios — alta manual de cliente o administrador. */
const crear = asyncHandler(async (req, res) => {
  const { nombre, email, telefono, password, rol } = req.body;

  if (rol === 'veterinario') {
    throw ApiError.badRequest('Para crear veterinarios usa POST /api/veterinarios, que además pide licencia y horarios.');
  }

  const existente = await usuarioModel.buscarPorEmail(email);
  if (existente) throw ApiError.conflicto('Ya existe una cuenta con ese correo.');

  const rolId = await usuarioModel.idRol(rol);
  if (!rolId) throw ApiError.badRequest('Ese rol no existe.');

  const passwordHash = await authService.hashear(password);

  const usuarioId = await enTransaccion(async (conexion) => {
    // La contraseña la elige quien crea la cuenta, no su dueño: se marca para
    // que la cambie al entrar. Si no, la que escribió la administración —y que
    // suele repetirse entre altas— se queda puesta para siempre.
    const id = await usuarioModel.crear(
      { rolId, nombre, email, telefono, passwordHash, debeCambiarPassword: true },
      conexion
    );
    if (rol === 'cliente') {
      await conexion.execute('INSERT INTO clientes (usuario_id) VALUES (?)', [id]);
    }
    return id;
  });

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: req.usuario.id, modulo: 'seguridad', tabla: 'usuarios', registroId: usuarioId,
    accion: 'crear', descripcion: `Creó la cuenta ${email} con rol ${rol}`, ip,
  });

  const usuario = await usuarioModel.buscarPorId(usuarioId);
  res.status(201).json({
    ok: true,
    usuario,
    mensaje: 'Cuenta creada. Al entrar por primera vez tendrá que cambiar la contraseña.',
  });
});

/** PATCH /api/usuarios/:id/estado — activar o desactivar. */
const cambiarEstado = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  if (id === req.usuario.id) {
    throw ApiError.badRequest('No puedes desactivar tu propia cuenta.');
  }

  const antes = await usuarioModel.buscarPorId(id);
  const cambiado = await usuarioModel.cambiarEstado(id, req.body.estado);
  if (!cambiado) throw ApiError.noEncontrado('Ese usuario no existe.');

  // Desactivar o bloquear tiene que echar fuera al usuario ya mismo, no cuando
  // se le venza el token.
  if (req.body.estado !== 'activo') {
    await seguridad.cerrarSesionesDe(id, `cuenta_${req.body.estado}`);
  }

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: req.usuario.id, modulo: 'seguridad', tabla: 'usuarios', registroId: id,
    accion: 'cambiar_estado',
    descripcion: `Cambió el estado de ${antes ? antes.email : id} a ${req.body.estado}`,
    antes: antes ? { estado: antes.estado } : null,
    despues: { estado: req.body.estado }, ip,
  });

  res.json({ ok: true, mensaje: `Usuario ${req.body.estado}.` });
});

/** PATCH /api/usuarios/:id/rol */
const cambiarRol = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  if (id === req.usuario.id) {
    throw ApiError.badRequest('No puedes cambiar tu propio rol.');
  }

  const rolId = await usuarioModel.idRol(req.body.rol);
  if (!rolId) throw ApiError.badRequest('Ese rol no existe.');

  // Pasar a veterinario exige ficha profesional con licencia, así que se hace
  // desde el módulo de veterinarios y no con un simple cambio de rol.
  if (req.body.rol === 'veterinario') {
    throw ApiError.badRequest('Crea el perfil desde el módulo de veterinarios para registrar su licencia.');
  }

  const antes = await usuarioModel.buscarPorId(id);
  const cambiado = await usuarioModel.cambiarRol(id, rolId);
  if (!cambiado) throw ApiError.noEncontrado('Ese usuario no existe.');

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: req.usuario.id, modulo: 'seguridad', tabla: 'usuarios', registroId: id,
    accion: 'cambiar_rol',
    descripcion: `Cambió el rol de ${antes ? antes.email : id} a ${req.body.rol}`,
    antes: antes ? { rol: antes.rol } : null,
    despues: { rol: req.body.rol }, ip,
  });

  res.json({ ok: true, mensaje: 'Rol actualizado.' });
});

/** GET /api/clientes — lista corta para los selectores del personal. */
const listarClientes = asyncHandler(async (req, res) => {
  const { busqueda } = req.consulta || {};
  const params = [];
  let where = "WHERE u.estado = 'activo'";

  if (busqueda) {
    where += ' AND (u.nombre ILIKE ? OR u.email ILIKE ? OR u.telefono ILIKE ?)';
    const patron = `%${busqueda}%`;
    params.push(patron, patron, patron);
  }

  const clientes = await consultar(
    `SELECT c.id AS cliente_id, u.id AS usuario_id, u.nombre, u.email, u.telefono,
            c.documento, c.direccion, c.ciudad,
            (SELECT COUNT(*) FROM mascotas m WHERE m.cliente_id = c.id AND m.activo = 1) AS mascotas
       FROM clientes c
       JOIN usuarios u ON u.id = c.usuario_id
       ${where}
      ORDER BY u.nombre
      LIMIT 200`,
    params
  );

  res.json({ ok: true, clientes });
});

module.exports = { listar, detalle, crear, cambiarEstado, cambiarRol, listarClientes };
