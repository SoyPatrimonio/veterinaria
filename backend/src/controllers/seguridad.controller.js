'use strict';

/**
 * Pantalla de seguridad del administrador: matriz de roles y permisos,
 * sesiones abiertas, intentos de login, accesos y rastro de auditoría.
 */

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const seguridad = require('../models/seguridad.model');
const codigoAcceso = require('../services/codigoAcceso.service');
const { enmascarar } = require('../utils/codigoAcceso');
const { consultarUna, estadisticasConsultas } = require('../config/database');

/** GET /api/seguridad/roles — roles con su conteo de permisos y usuarios. */
const roles = asyncHandler(async (req, res) => {
  const [lista, permisos] = await Promise.all([
    seguridad.listarRoles(),
    seguridad.catalogoPermisos(),
  ]);

  // Se agrupa por módulo para que el panel pueda pintarlo por secciones.
  const porModulo = permisos.reduce((acumulado, permiso) => {
    (acumulado[permiso.modulo] = acumulado[permiso.modulo] || []).push(permiso);
    return acumulado;
  }, {});

  res.json({ ok: true, roles: lista, permisos, porModulo });
});

/** GET /api/seguridad/permisos — permisos de la sesión actual. */
const misPermisos = asyncHandler(async (req, res) => {
  res.json({ ok: true, rol: req.usuario.rol, permisos: req.permisos });
});

/** GET /api/seguridad/sesiones */
const sesiones = asyncHandler(async (req, res) => {
  res.json({ ok: true, sesiones: await seguridad.sesionesAbiertas(req.query.limite) });
});

/** DELETE /api/seguridad/sesiones/:id — cierre forzado de las sesiones de un usuario. */
const cerrarSesionesDeUsuario = asyncHandler(async (req, res) => {
  const usuarioId = Number(req.params.id);

  if (usuarioId === req.usuario.id) {
    throw ApiError.badRequest('Para cerrar tu propia sesión usa el botón de salir.');
  }

  const objetivo = await consultarUna('SELECT id, email FROM usuarios WHERE id = ?', [usuarioId]);
  if (!objetivo) throw ApiError.noEncontrado('Ese usuario no existe.');

  const cerradas = await seguridad.cerrarSesionesDe(usuarioId, 'admin');

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: req.usuario.id, modulo: 'seguridad', tabla: 'sesiones',
    registroId: usuarioId, accion: 'cerrar_sesiones',
    descripcion: `Cerró ${cerradas} sesión(es) de ${objetivo.email}`, ip,
  });

  res.json({ ok: true, cerradas, mensaje: `Se cerraron ${cerradas} sesión(es).` });
});

/** GET /api/seguridad/accesos */
const accesos = asyncHandler(async (req, res) => {
  res.json({ ok: true, accesos: await seguridad.accesosRecientes(req.query.limite) });
});

/** GET /api/seguridad/intentos */
const intentos = asyncHandler(async (req, res) => {
  res.json({ ok: true, intentos: await seguridad.intentosRecientes(req.query.limite) });
});

/** GET /api/seguridad/auditoria */
const auditoria = asyncHandler(async (req, res) => {
  const registros = await seguridad.listarAuditoria({
    modulo: req.query.modulo || null,
    usuarioId: req.query.usuarioId || null,
    limite: req.query.limite,
  });
  res.json({ ok: true, registros });
});

/* ------------------------------------------------------------------
   Códigos de acceso del personal

   Uno por rol: el que se escribe en el registro para que la cuenta nazca
   como veterinario o como administrador en vez de como cliente. No
   caducan; lo que los retira de circulación es cambiarlos por otros.
   ------------------------------------------------------------------ */

/**
 * GET /api/seguridad/codigo-acceso
 *
 * Devuelve los códigos en claro, y eso es deliberado: quien llega aquí tiene
 * el permiso de crear usuarios, o sea que ya podía dar de alta un veterinario
 * o un administrador desde su panel sin ningún código. Enseñárselos no le da
 * nada que no tuviera. Quien no tiene ese permiso no pasa del middleware.
 *
 * También devuelve la versión tapada, que es la que el panel pinta mientras
 * nadie pulse "Mostrar": la pantalla de un computador de recepción la ve
 * cualquiera que pase por delante.
 *
 * La consulta queda auditada. La pestaña se carga solo cuando se abre, así
 * que cada línea del rastro es alguien que fue a mirarlos a propósito.
 */
const verCodigoAcceso = asyncHandler(async (req, res) => {
  const codigos = await codigoAcceso.todos();

  const { ip } = seguridad.datosPeticion(req);
  const generados = codigos.filter((c) => c.activo).map((c) => c.rol);
  await seguridad.auditar({
    usuarioId: req.usuario.id, modulo: 'seguridad', tabla: 'configuraciones',
    registroId: null, accion: 'ver_codigo_acceso',
    descripcion: generados.length
      ? `Consultó los códigos de acceso del personal (${generados.join(', ')})`
      : 'Consultó los códigos de acceso del personal (todavía no hay ninguno)',
    ip,
  });

  res.json({
    ok: true,
    codigos: codigos.map((c) => ({
      ...c,
      enmascarado: c.codigo ? enmascarar(c.codigo) : null,
    })),
  });
});

/**
 * POST /api/seguridad/codigo-acceso/rotar
 *
 * Cambia el código de un rol. Genera el nuevo —o el primero— y deja dicho en
 * la auditoría en qué terminaba el anterior, para que se sepa cuál dejó de
 * servir sin volver a escribirlo entero en ningún lado.
 */
const rotarCodigoAcceso = asyncHandler(async (req, res) => {
  const { rol } = req.body;

  const anterior = await codigoAcceso.vigenteDe(rol);
  const nuevo = await codigoAcceso.rotar(rol);

  const { ip } = seguridad.datosPeticion(req);
  await seguridad.auditar({
    usuarioId: req.usuario.id, modulo: 'seguridad', tabla: 'configuraciones',
    registroId: null, accion: anterior ? 'rotar_codigo_acceso' : 'crear_codigo_acceso',
    descripcion: anterior
      ? `Cambió el código de acceso de ${rol} (el anterior terminaba en ${anterior.codigo.slice(-2)})`
      : `Generó el primer código de acceso de ${rol}`,
    ip,
  });

  res.json({
    ok: true,
    rol,
    activo: true,
    codigo: nuevo.codigo,
    enmascarado: enmascarar(nuevo.codigo),
    actualizadoEn: nuevo.actualizadoEn,
    mensaje: anterior
      ? `Código de ${rol} cambiado. El anterior ya no sirve para registrarse.`
      : `Código de ${rol} generado. Entrégaselo solo a quien vaya a entrar con ese rol.`,
  });
});

/**
 * GET /api/seguridad/consultas
 *
 * Cómo se está portando la base: cuántas consultas van, cuántas fallaron,
 * cuántas pasaron del umbral de lentitud y cuál fue la peor. Sirve para
 * responder "¿por qué va lento?" sin tener que abrir el registro de Vercel y
 * leerlo a mano.
 *
 * Los números son de ESTA instancia de la función y se pierden al enfriarse.
 * Lo que sí se conserva es el registro: cada consulta lenta y cada consulta
 * fallida quedan escritas ahí (config/database.js).
 */
const consultas = asyncHandler(async (req, res) => {
  res.json({ ok: true, consultas: estadisticasConsultas() });
});

module.exports = {
  roles,
  consultas,
  misPermisos,
  sesiones,
  cerrarSesionesDeUsuario,
  accesos,
  intentos,
  auditoria,
  verCodigoAcceso,
  rotarCodigoAcceso,
};
