'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const comunidadModel = require('../models/comunidad.model');
const mascotaModel = require('../models/mascota.model');
const avisos = require('../services/notificaciones.service');
const almacenamiento = require('../services/storage.service');
const moderacion = require('../utils/moderacion');

/**
 * Comunidad: identidad digital, mascotas perdidas y adopciones.
 *
 * Este módulo tiene rutas públicas de verdad (el QR de la placa, el listado de
 * adopciones, el formulario de avistamiento). Todo lo público devuelve solo lo
 * que alguien autorizó a publicar; el resto exige sesión.
 */

async function mascotaPropia(req, mascotaId) {
  const mascota = await mascotaModel.buscarPorId(mascotaId);
  if (!mascota) throw ApiError.noEncontrado('Esa mascota no existe.');

  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';
  const esDueno = req.usuario.cliente_id && mascota.cliente_id === req.usuario.cliente_id;

  if (!esClinica && !esDueno) throw ApiError.prohibido('Esa mascota no es tuya.');
  return mascota;
}

/* ------------------------------------------------------------------
   Identidad digital
   ------------------------------------------------------------------ */

/** GET /api/comunidad/identidad/:id — la del dueño, con su configuración. */
const identidad = asyncHandler(async (req, res) => {
  const mascota = await mascotaPropia(req, req.params.id);
  const ficha = await comunidadModel.asegurarIdentidad(mascota.id);

  res.json({ ok: true, identidad: ficha, mascota: { id: mascota.id, nombre: mascota.nombre } });
});

/** PUT /api/comunidad/identidad/:id */
const configurarIdentidad = asyncHandler(async (req, res) => {
  const mascota = await mascotaPropia(req, req.params.id);
  await comunidadModel.asegurarIdentidad(mascota.id);
  await comunidadModel.configurarIdentidad(mascota.id, req.body);

  res.json({ ok: true, identidad: await comunidadModel.identidadDe(mascota.id) });
});

/** POST /api/comunidad/identidad/:id/token — revocar el QR anterior. */
const regenerarToken = asyncHandler(async (req, res) => {
  const mascota = await mascotaPropia(req, req.params.id);
  await comunidadModel.asegurarIdentidad(mascota.id);
  await comunidadModel.regenerarToken(mascota.id);

  res.json({
    ok: true,
    identidad: await comunidadModel.identidadDe(mascota.id),
    mensaje: 'El código anterior dejó de funcionar. Imprime la placa nueva.',
  });
});

/** GET /api/comunidad/qr/:token — PÚBLICO. Lo que ve quien escanea la placa. */
const perfilPublico = asyncHandler(async (req, res) => {
  const perfil = await comunidadModel.perfilPublico(req.params.token);
  if (!perfil) throw ApiError.noEncontrado('Ese código no corresponde a ninguna mascota.');

  res.json({ ok: true, perfil });
});

/* ------------------------------------------------------------------
   Mascotas perdidas
   ------------------------------------------------------------------ */

/** GET /api/comunidad/perdidas — PÚBLICO. */
const listarPerdidas = asyncHandler(async (req, res) => {
  res.json({ ok: true, reportes: await comunidadModel.listarPerdidas(req.consulta || {}) });
});

/** GET /api/comunidad/perdidas/:id — PÚBLICO. */
const detallePerdida = asyncHandler(async (req, res) => {
  const reporte = await comunidadModel.perdidaPorId(req.params.id);
  if (!reporte || !reporte.publicado) throw ApiError.noEncontrado('Ese reporte no existe.');

  res.json({ ok: true, reporte });
});

/** POST /api/comunidad/perdidas */
const reportarPerdida = asyncHandler(async (req, res) => {
  const mascota = await mascotaPropia(req, req.body.mascotaId);

  const id = await comunidadModel.reportarPerdida(
    { ...req.body, clienteId: mascota.cliente_id },
    req.usuario.id
  );

  // La clínica es la primera que puede reconocerla si aparece en consulta.
  await avisos.avisar({
    rol: 'veterinario',
    tipo: 'mascota_perdida',
    titulo: `${mascota.nombre} está perdida`,
    mensaje: `${req.body.ultimaDireccion || 'Sin última ubicación'} — ${req.body.telefonoContacto}`,
    enlace: 'admin/comunidad.html',
  });

  res.status(201).json({ ok: true, reporte: await comunidadModel.perdidaPorId(id) });
});

/** PATCH /api/comunidad/perdidas/:id */
const actualizarPerdida = asyncHandler(async (req, res) => {
  const reporte = await comunidadModel.perdidaPorId(req.params.id);
  if (!reporte) throw ApiError.noEncontrado('Ese reporte no existe.');

  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';
  if (!esClinica && reporte.cliente_id !== req.usuario.cliente_id) {
    throw ApiError.prohibido('Ese reporte no es tuyo.');
  }

  await comunidadModel.actualizarPerdida(reporte.id, req.body);
  res.json({ ok: true, reporte: await comunidadModel.perdidaPorId(reporte.id) });
});

/** GET /api/comunidad/perdidas/:id/avistamientos */
const avistamientos = asyncHandler(async (req, res) => {
  const reporte = await comunidadModel.perdidaPorId(req.params.id);
  if (!reporte) throw ApiError.noEncontrado('Ese reporte no existe.');

  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';
  if (!esClinica && reporte.cliente_id !== req.usuario.cliente_id) {
    throw ApiError.prohibido('Ese reporte no es tuyo.');
  }

  res.json({ ok: true, avistamientos: await comunidadModel.avistamientosDe(reporte.id) });
});

/**
 * POST /api/comunidad/perdidas/:id/avistamientos — PÚBLICO.
 *
 * Quien ve a la mascota en la calle no tiene cuenta ni la va a crear. Se acepta
 * sin sesión y el aviso llega de inmediato al dueño.
 */
const crearAvistamiento = asyncHandler(async (req, res) => {
  const reporte = await comunidadModel.perdidaPorId(req.params.id);
  if (!reporte || !reporte.publicado) throw ApiError.noEncontrado('Ese reporte no existe.');
  if (reporte.estado !== 'perdida') {
    throw ApiError.conflicto('Esa mascota ya apareció. ¡Gracias de todos modos!');
  }

  await comunidadModel.crearAvistamiento(reporte.id, req.body, req.ip);

  const usuarioCliente = await avisos.usuarioDelCliente(reporte.cliente_id);
  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'avistamiento',
    titulo: `Posible avistamiento de ${reporte.mascota}`,
    // No hay página propia para el reporte de mascotas perdidas del lado del
    // cliente: la dirección y el contacto ya van en el mensaje, así que no se
    // manda un enlace que terminaría en un 404.
    mensaje: `${req.body.direccion || 'Sin dirección'} · Contacto: ${req.body.telefono}`,
  });

  res.status(201).json({ ok: true, mensaje: 'Gracias. Avisamos a la familia ahora mismo.' });
});

/** PATCH /api/comunidad/avistamientos/:id */
const estadoAvistamiento = asyncHandler(async (req, res) => {
  const cambiado = await comunidadModel.cambiarEstadoAvistamiento(req.params.id, req.body.estado);
  if (!cambiado) throw ApiError.noEncontrado('Ese avistamiento no existe.');

  res.json({ ok: true, mensaje: 'Avistamiento actualizado.' });
});

/* ------------------------------------------------------------------
   Adopciones
   ------------------------------------------------------------------ */

/** GET /api/comunidad/adopciones — PÚBLICO. */
const listarAdopciones = asyncHandler(async (req, res) => {
  res.json({ ok: true, publicaciones: await comunidadModel.listarAdopciones(req.consulta || {}) });
});

/** GET /api/comunidad/adopciones/:id — PÚBLICO. */
const detalleAdopcion = asyncHandler(async (req, res) => {
  const publicacion = await comunidadModel.adopcionPorId(req.params.id);
  if (!publicacion) throw ApiError.noEncontrado('Esa publicación no existe.');

  // Las solicitudes solo las ve la clínica: son datos personales de terceros.
  const esClinica = req.usuario && ['admin', 'veterinario'].includes(req.usuario.rol);
  const solicitudes = esClinica ? await comunidadModel.solicitudesDe(publicacion.id) : undefined;

  res.json({ ok: true, publicacion, solicitudes });
});

/** POST /api/comunidad/adopciones */
const crearPublicacion = asyncHandler(async (req, res) => {
  const id = await comunidadModel.crearPublicacion(req.body);
  res.status(201).json({ ok: true, publicacion: await comunidadModel.adopcionPorId(id) });
});

/** PUT /api/comunidad/adopciones/:id */
const actualizarPublicacion = asyncHandler(async (req, res) => {
  const publicacion = await comunidadModel.adopcionPorId(req.params.id);
  if (!publicacion) throw ApiError.noEncontrado('Esa publicación no existe.');

  await comunidadModel.actualizarPublicacion(publicacion.id, req.body);
  res.json({ ok: true, publicacion: await comunidadModel.adopcionPorId(publicacion.id) });
});

/**
 * POST /api/comunidad/adopciones/:id/foto
 *
 * La foto es un archivo, no una dirección: se sube al bucket y en la base
 * queda su URL. Antes se escribía a mano la URL de una imagen alojada en
 * cualquier sitio, y esa foto desaparecía el día que el otro servidor la
 * quitaba o cambiaba de nombre.
 */
const subirFotoAdopcion = asyncHandler(async (req, res) => {
  const publicacion = await comunidadModel.adopcionPorId(req.params.id);
  if (!publicacion) throw ApiError.noEncontrado('Esa publicación no existe.');
  if (!req.file) throw ApiError.badRequest('No se recibió ninguna imagen.');

  const url = await almacenamiento.guardarFoto(req.file, 'adopciones');
  await comunidadModel.actualizarFotoAdopcion(publicacion.id, url);

  // La anterior se borra después de guardar la nueva: si el borrado falla, la
  // publicación ya tiene su foto al día y solo queda un archivo suelto, así
  // que no se hace fallar la petición. Se registra porque, si el borrado
  // dejara de funcionar, el único síntoma sería el bucket creciendo solo.
  try {
    await almacenamiento.borrarFoto(publicacion.foto);
  } catch (error) {
    console.warn(
      `[comunidad] quedó sin borrar la foto anterior de la publicación ${publicacion.id}: ${error.message}`
    );
  }

  res.json({ ok: true, foto: url });
});

/** DELETE /api/comunidad/adopciones/:id/foto — deja la publicación sin foto. */
const quitarFotoAdopcion = asyncHandler(async (req, res) => {
  const publicacion = await comunidadModel.adopcionPorId(req.params.id);
  if (!publicacion) throw ApiError.noEncontrado('Esa publicación no existe.');

  // Primero la base y después el archivo, por lo mismo que al subir: si el
  // bucket falla, la publicación ya quedó sin foto y no se ve una imagen rota.
  await comunidadModel.actualizarFotoAdopcion(publicacion.id, null);

  try {
    await almacenamiento.borrarFoto(publicacion.foto);
  } catch (error) {
    console.warn(
      `[comunidad] quedó sin borrar la foto de la publicación ${publicacion.id}: ${error.message}`
    );
  }

  res.json({ ok: true, mensaje: 'Foto quitada.' });
});

/** POST /api/comunidad/adopciones/:id/solicitudes — PÚBLICO. */
const solicitarAdopcion = asyncHandler(async (req, res) => {
  const publicacion = await comunidadModel.adopcionPorId(req.params.id);
  if (!publicacion) throw ApiError.noEncontrado('Esa publicación no existe.');
  if (publicacion.estado !== 'disponible') {
    throw ApiError.conflicto('Esta mascota ya está reservada o adoptada.');
  }

  // Una familia, una solicitud por mascota. Mandar el formulario tres veces
  // (porque la página tardó, porque se dudó) no mejora las opciones de nadie y
  // sí ensucia la bandeja de quien evalúa.
  const abierta = await comunidadModel.solicitudAbiertaDe(publicacion.id, {
    usuarioId: req.usuario?.id ?? null,
    email: req.body.email,
  });
  if (abierta) {
    throw ApiError.conflicto('Ya tienes una solicitud en curso para esta mascota. Te contactamos por esa misma.');
  }

  await comunidadModel.crearSolicitud(publicacion.id, req.body, req.usuario?.id ?? null);

  await avisos.avisar({
    rol: 'admin',
    tipo: 'solicitud_adopcion',
    titulo: `Nueva solicitud para adoptar a ${publicacion.nombre}`,
    mensaje: `${req.body.nombre} · ${req.body.telefono}`,
    enlace: 'admin/comunidad.html',
  });

  res.status(201).json({
    ok: true,
    mensaje: 'Recibimos tu solicitud. Te contactamos para la entrevista.',
  });
});

/**
 * GET /api/comunidad/mis-solicitudes — el seguimiento de quien pidió adoptar.
 *
 * Sin esto la solicitud es un buzón sin respuesta: la familia manda el
 * formulario y no vuelve a saber en qué va hasta que alguien la llama.
 */
const misSolicitudes = asyncHandler(async (req, res) => {
  res.json({ ok: true, solicitudes: await comunidadModel.solicitudesDeUsuario(req.usuario.id) });
});

/** GET /api/comunidad/solicitudes/:id */
const detalleSolicitud = asyncHandler(async (req, res) => {
  const solicitud = await comunidadModel.solicitudPorId(req.params.id);
  if (!solicitud) throw ApiError.noEncontrado('Esa solicitud no existe.');

  const [entrevistas, contrato, seguimientos] = await Promise.all([
    comunidadModel.entrevistasDe(solicitud.id),
    comunidadModel.contratoDe(solicitud.id),
    comunidadModel.seguimientosDe(solicitud.id),
  ]);

  res.json({ ok: true, solicitud, entrevistas, contrato, seguimientos });
});

/** PATCH /api/comunidad/solicitudes/:id */
const evaluarSolicitud = asyncHandler(async (req, res) => {
  const solicitud = await comunidadModel.solicitudPorId(req.params.id);
  if (!solicitud) throw ApiError.noEncontrado('Esa solicitud no existe.');

  const evaluada = await comunidadModel.evaluarSolicitud(solicitud.id, req.body, req.usuario.id);
  if (evaluada === null) throw ApiError.conflicto('No se pudo actualizar la solicitud.');

  // Al completar la adopción se programa el primer seguimiento: la adopción no
  // termina cuando se entrega el animal.
  if (req.body.estado === 'completada') {
    await comunidadModel.crearSeguimiento(solicitud.id, {
      fechaProgramada: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      medio: 'llamada',
      notas: 'Primer seguimiento al mes de la entrega.',
    });
  }

  res.json({ ok: true, solicitud: await comunidadModel.solicitudPorId(solicitud.id) });
});

/** POST /api/comunidad/solicitudes/:id/entrevistas */
const crearEntrevista = asyncHandler(async (req, res) => {
  const solicitud = await comunidadModel.solicitudPorId(req.params.id);
  if (!solicitud) throw ApiError.noEncontrado('Esa solicitud no existe.');

  await comunidadModel.crearEntrevista(solicitud.id, req.body, req.usuario.id);
  res.status(201).json({ ok: true, entrevistas: await comunidadModel.entrevistasDe(solicitud.id) });
});

/** POST /api/comunidad/solicitudes/:id/seguimientos */
const crearSeguimiento = asyncHandler(async (req, res) => {
  const solicitud = await comunidadModel.solicitudPorId(req.params.id);
  if (!solicitud) throw ApiError.noEncontrado('Esa solicitud no existe.');

  await comunidadModel.crearSeguimiento(solicitud.id, req.body);
  res.status(201).json({ ok: true, seguimientos: await comunidadModel.seguimientosDe(solicitud.id) });
});

/** PATCH /api/comunidad/seguimientos/:id */
const registrarSeguimiento = asyncHandler(async (req, res) => {
  const registrado = await comunidadModel.registrarSeguimiento(req.params.id, req.body, req.usuario.id);
  if (!registrado) throw ApiError.conflicto('Ese seguimiento ya estaba cerrado.');

  res.json({ ok: true, mensaje: 'Seguimiento registrado.' });
});

/** GET /api/comunidad/seguimientos/pendientes */
const seguimientosPendientes = asyncHandler(async (req, res) => {
  res.json({ ok: true, seguimientos: await comunidadModel.seguimientosVencidos() });
});

/* ------------------------------------------------------------------
   Testimonios
   ------------------------------------------------------------------ */

/** GET /api/comunidad/testimonios — PÚBLICO: los comentarios de la landing. */
const listarTestimonios = asyncHandler(async (req, res) => {
  res.json({ ok: true, testimonios: await comunidadModel.listarTestimonios(req.query.limite) });
});

/**
 * POST /api/comunidad/testimonios — PÚBLICO.
 *
 * El comentario se publica en el momento, sin que nadie lo apruebe antes. Por
 * eso el filtro de palabras se aplica aquí y no en el navegador: lo del
 * navegador se salta llamando a la ruta directamente, y esto es lo que queda
 * escrito en la página de la clínica.
 *
 * Se revisa también el nombre, que es la otra mitad de lo que se publica.
 */
const crearTestimonio = asyncHandler(async (req, res) => {
  if (!moderacion.esLimpio(`${req.body.nombre} ${req.body.mensaje}`)) {
    throw ApiError.badRequest(
      'En los comentarios de la página solo publicamos buenas palabras. ' +
      'Cuéntanos tu experiencia sin groserías y lo publicamos enseguida.'
    );
  }

  const testimonio = await comunidadModel.crearTestimonio(
    req.body,
    req.usuario ? req.usuario.id : null,
    req.ip
  );

  res.status(201).json({
    ok: true,
    testimonio,
    mensaje: '¡Gracias! Tu comentario ya está publicado.',
  });
});

module.exports = {
  identidad,
  configurarIdentidad,
  regenerarToken,
  perfilPublico,
  listarPerdidas,
  detallePerdida,
  reportarPerdida,
  actualizarPerdida,
  avistamientos,
  crearAvistamiento,
  estadoAvistamiento,
  listarAdopciones,
  detalleAdopcion,
  crearPublicacion,
  actualizarPublicacion,
  subirFotoAdopcion,
  quitarFotoAdopcion,
  solicitarAdopcion,
  misSolicitudes,
  detalleSolicitud,
  evaluarSolicitud,
  crearEntrevista,
  crearSeguimiento,
  registrarSeguimiento,
  seguimientosPendientes,
  listarTestimonios,
  crearTestimonio,
};
