'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const historiaModel = require('../models/historia.model');
const mascotaModel = require('../models/mascota.model');
const avisos = require('../services/notificaciones.service');
const fechas = require('../utils/fechas');
const seguridad = require('../models/seguridad.model');
const { alcanceCliente } = require('../middleware/roles');
const { consultarUna } = require('../config/database');

/**
 * Historia clínica.
 *
 * La regla de acceso es la misma en todas las rutas y por eso vive en un solo
 * sitio: el dueño ve la historia de sus mascotas y el personal de la clínica
 * ve la de todas. Escribir en ella es siempre cosa del personal, y eso lo
 * filtran los permisos de la ruta.
 */
async function mascotaConAcceso(req, mascotaId) {
  const mascota = await mascotaModel.buscarPorId(mascotaId);
  if (!mascota) throw ApiError.noEncontrado('Esa mascota no existe.');

  const esClinica = req.usuario.rol === 'admin' || req.usuario.rol === 'veterinario';
  const esDueno = req.usuario.cliente_id && mascota.cliente_id === req.usuario.cliente_id;

  if (!esClinica && !esDueno) {
    throw ApiError.prohibido('No tienes acceso a la historia clínica de esta mascota.');
  }
  return mascota;
}

/**
 * Quién firma la consulta o la vacuna. Un veterinario firma con su propio
 * perfil; el administrador tiene que decir a nombre de quién lo registra,
 * porque la historia clínica siempre lleva firma de un profesional.
 */
async function veterinarioQueFirma(req, indicado) {
  if (req.usuario.rol === 'veterinario') {
    if (!req.usuario.veterinario_id) {
      throw ApiError.badRequest('Tu cuenta no está vinculada a un perfil de veterinario.');
    }
    return req.usuario.veterinario_id;
  }

  if (!indicado) {
    throw ApiError.badRequest('Indica el veterinario que atiende (veterinarioId).');
  }
  const existe = await consultarUna('SELECT id FROM veterinarios WHERE id = ? AND activo = 1', [indicado]);
  if (!existe) throw ApiError.badRequest('Ese veterinario no existe o está inactivo.');
  return indicado;
}

/* ------------------------------------------------------------------
   Lectura
   ------------------------------------------------------------------ */

/** GET /api/historia/catalogos — vacunas, diagnósticos, medicamentos, exámenes. */
const catalogos = asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await historiaModel.catalogos()) });
});

/**
 * Deja constancia de que alguien abrió una historia clínica.
 *
 * Modificarla ya dejaba rastro; leerla no, y en un registro médico saber quién
 * la consultó importa tanto como quién la cambió. No se espera el resultado:
 * la auditoría no debe hacer más lenta la pantalla, y auditar() se traga sus
 * propios fallos.
 *
 * No se registra la consulta del propio dueño: es su mascota, no aporta nada al
 * control y llenaría la tabla de ruido que tapa lo que sí importa mirar.
 */
function auditarLectura(req, mascota, detalle) {
  if (req.usuario.rol === 'cliente') return;

  const { ip } = seguridad.datosPeticion(req);
  seguridad.auditar({
    usuarioId: req.usuario.id,
    modulo: 'historia',
    tabla: 'historias_clinicas',
    registroId: mascota.id,
    accion: 'consultar',
    descripcion: `${detalle} de ${mascota.nombre} (cliente ${mascota.cliente_id})`,
    ip,
  });
}

/** GET /api/historia/mascota/:id — la historia completa de un paciente. */
const porMascota = asyncHandler(async (req, res) => {
  const mascota = await mascotaConAcceso(req, req.params.id);
  auditarLectura(req, mascota, 'Abrió la historia clínica');
  const historia = await historiaModel.asegurarHistoria(mascota.id);

  const [consultas, vacunas, examenes, peso, antecedentes] = await Promise.all([
    historiaModel.listarConsultas({ mascotaId: mascota.id, limite: 100 }),
    historiaModel.vacunasDeMascota(mascota.id),
    historiaModel.examenesDeMascota(mascota.id),
    historiaModel.historialPeso(mascota.id),
    historiaModel.alergiasYCondiciones(mascota.id),
  ]);

  res.json({
    ok: true,
    mascota,
    historia,
    consultas,
    vacunas,
    examenes,
    peso,
    ...antecedentes,
  });
});

/** GET /api/historia/consultas — listado para el personal de la clínica. */
const listarConsultas = asyncHandler(async (req, res) => {
  const filtros = { ...(req.consulta || {}) };

  // Sin este recorte, un cliente con historia.ver_propia —que es la que le da
  // acceso a la historia de sus mascotas— recibía aquí las consultas de TODA
  // la clínica: motivo, anamnesis, diagnósticos y el nombre del dueño de cada
  // paciente. El permiso dejaba pasar la ruta y nadie filtraba después.
  const clienteId = alcanceCliente(req, 'historia.ver_todas');
  if (clienteId) filtros.clienteId = clienteId;

  // El veterinario ve por defecto las suyas; el admin, las de toda la clínica.
  if (req.usuario.rol === 'veterinario' && !filtros.veterinarioId) {
    filtros.veterinarioId = req.usuario.veterinario_id;
  }
  if (filtros.mascotaId) await mascotaConAcceso(req, filtros.mascotaId);

  const consultas = await historiaModel.listarConsultas(filtros);
  res.json({ ok: true, consultas });
});

/** GET /api/historia/consultas/:id */
const detalleConsulta = asyncHandler(async (req, res) => {
  const consulta = await historiaModel.consultaPorId(req.params.id);
  if (!consulta) throw ApiError.noEncontrado('Esa consulta no existe.');
  const mascota = await mascotaConAcceso(req, consulta.mascota_id);
  auditarLectura(req, mascota, `Consultó la atención del ${String(consulta.fecha).slice(0, 10)}`);

  const detalle = await historiaModel.detalleConsulta(consulta.id);
  res.json({ ok: true, consulta, ...detalle });
});

/* ------------------------------------------------------------------
   Escritura
   ------------------------------------------------------------------ */

/** POST /api/historia/consultas */
const crearConsulta = asyncHandler(async (req, res) => {
  const mascota = await mascotaConAcceso(req, req.body.mascotaId);
  const veterinarioId = await veterinarioQueFirma(req, req.body.veterinarioId);

  // La cita tiene que ser de esta mascota: si no, la consulta quedaría colgada
  // de la visita de otro paciente y el historial de ambos saldría mal.
  if (req.body.citaId) {
    const cita = await consultarUna('SELECT id, mascota_id, sede_id FROM citas WHERE id = ?', [req.body.citaId]);
    if (!cita) throw ApiError.badRequest('Esa cita no existe.');
    if (cita.mascota_id !== mascota.id) {
      throw ApiError.badRequest('La cita seleccionada no es de esta mascota.');
    }
    const yaTiene = await consultarUna('SELECT id FROM consultas WHERE cita_id = ?', [req.body.citaId]);
    if (yaTiene) throw ApiError.conflicto('Esa cita ya tiene una consulta registrada.');
  }

  const id = await historiaModel.crearConsulta(
    { ...req.body, veterinarioId, sedeId: req.usuario.sede_id ?? null },
    req.usuario.id
  );

  const consulta = await historiaModel.consultaPorId(id);
  const detalle = await historiaModel.detalleConsulta(id);

  // El dueño se entera de que su mascota ya fue atendida y puede leer la
  // consulta desde su portal.
  const usuarioCliente = await avisos.usuarioDelCliente(mascota.cliente_id);
  await avisos.avisar({
    usuarioId: usuarioCliente,
    tipo: 'consulta_registrada',
    titulo: `Nueva consulta de ${mascota.nombre}`,
    mensaje: `${consulta.veterinario_nombre} registró la consulta del ${consulta.fecha.slice(0, 10)}: ${consulta.motivo}.`,
    enlace: 'cliente/historia.html',
  });

  res.status(201).json({ ok: true, consulta, ...detalle });
});

/** PUT /api/historia/consultas/:id — corrige los textos de una consulta. */
const editarConsulta = asyncHandler(async (req, res) => {
  const consulta = await historiaModel.consultaPorId(req.params.id);
  if (!consulta) throw ApiError.noEncontrado('Esa consulta no existe.');

  // Cada quien corrige lo suyo: un veterinario no reescribe la consulta de otro.
  if (req.usuario.rol === 'veterinario' && consulta.veterinario_id !== req.usuario.veterinario_id) {
    throw ApiError.prohibido('Solo el veterinario que la registró puede editar esta consulta.');
  }

  await historiaModel.editarConsulta(consulta.id, req.body);
  const actualizada = await historiaModel.consultaPorId(consulta.id);
  res.json({ ok: true, consulta: actualizada });
});

/** POST /api/historia/vacunas — registra una aplicación en el carné. */
const aplicarVacuna = asyncHandler(async (req, res) => {
  const mascota = await mascotaConAcceso(req, req.body.mascotaId);
  const veterinarioId = await veterinarioQueFirma(req, req.body.veterinarioId);

  const vacuna = await consultarUna('SELECT * FROM vacunas WHERE id = ?', [req.body.vacunaId]);
  if (!vacuna) throw ApiError.badRequest('Esa vacuna no está en el catálogo.');

  if (req.body.loteId) {
    const lote = await consultarUna(
      'SELECT id, vacuna_id, dosis_totales, dosis_usadas, fecha_vencimiento FROM lotes_vacunas WHERE id = ?',
      [req.body.loteId]
    );
    if (!lote) throw ApiError.badRequest('Ese lote no existe.');
    if (lote.vacuna_id !== vacuna.id) throw ApiError.badRequest('El lote no corresponde a la vacuna elegida.');
    if (lote.dosis_usadas >= lote.dosis_totales) {
      throw ApiError.conflicto('Ese lote ya no tiene dosis disponibles.');
    }
    if (lote.fecha_vencimiento && lote.fecha_vencimiento < req.body.fechaAplicacion) {
      throw ApiError.conflicto('Ese lote está vencido.');
    }
  }

  // Si no se indicó el refuerzo, sale del catálogo: es el dato que después
  // dispara el aviso al dueño, así que conviene que no dependa de que alguien
  // se acuerde de escribirlo.
  const proximaFecha = req.body.proximaFecha
    || (vacuna.refuerzo_meses ? fechas.sumarMeses(req.body.fechaAplicacion, vacuna.refuerzo_meses) : null);

  const id = await historiaModel.aplicarVacuna(
    { ...req.body, veterinarioId, proximaFecha },
    req.usuario.id
  );

  // El recordatorio se programa una semana antes del refuerzo, que es tiempo
  // suficiente para pedir la cita sin que se pase la fecha.
  const usuarioCliente = await avisos.usuarioDelCliente(mascota.cliente_id);
  if (proximaFecha && usuarioCliente) {
    await avisos.programar({
      usuarioId: usuarioCliente,
      mascotaId: mascota.id,
      aplicacionId: id,
      tipo: 'vacuna',
      programadoEn: `${fechas.aFechaISO(fechas.sumarDias(new Date(`${proximaFecha}T00:00:00`), -7))} 09:00:00`,
      mensaje: `${mascota.nombre} necesita el refuerzo de ${vacuna.nombre} el ${proximaFecha}.`,
    });
  }

  await avisos.avisarConPlantilla('vacuna_proxima', {
    usuarioId: usuarioCliente,
    variables: { mascota: mascota.nombre, vacuna: vacuna.nombre, fecha: proximaFecha || 'la fecha indicada' },
    enlace: 'cliente/historia.html',
    tituloRespaldo: 'Vacuna aplicada',
  });

  const aplicacion = await historiaModel.aplicacionPorId(id);
  res.status(201).json({ ok: true, aplicacion });
});

/** POST /api/historia/examenes — solicita un examen de laboratorio o imagen. */
const solicitarExamen = asyncHandler(async (req, res) => {
  await mascotaConAcceso(req, req.body.mascotaId);

  if (req.body.consultaId) {
    const consulta = await historiaModel.consultaPorId(req.body.consultaId);
    if (!consulta) throw ApiError.badRequest('Esa consulta no existe.');
    if (consulta.mascota_id !== req.body.mascotaId) {
      throw ApiError.badRequest('La consulta no es de esta mascota.');
    }
  }

  const id = await historiaModel.crearExamen({
    ...req.body,
    solicitadoPor: req.usuario.veterinario_id ?? null,
  });

  const examen = await historiaModel.examenPorId(id);
  res.status(201).json({ ok: true, examen });
});

/** PUT /api/historia/examenes/:id/resultados */
const guardarResultados = asyncHandler(async (req, res) => {
  const examen = await historiaModel.examenPorId(req.params.id);
  if (!examen) throw ApiError.noEncontrado('Ese examen no existe.');
  await mascotaConAcceso(req, examen.mascota_id);

  await historiaModel.guardarResultados(examen.id, req.body, req.usuario.id);

  if (req.body.estado === 'listo') {
    const usuarioCliente = await avisos.usuarioDelCliente(examen.cliente_id);
    await avisos.avisar({
      usuarioId: usuarioCliente,
      tipo: 'examen_listo',
      titulo: `Resultados listos de ${examen.mascota_nombre}`,
      mensaje: `Ya están los resultados de ${examen.tipo_nombre || examen.descripcion || 'el examen solicitado'}.`,
      enlace: 'cliente/historia.html',
    });
  }

  const actualizados = await historiaModel.examenesDeMascota(examen.mascota_id);
  res.json({ ok: true, examen: actualizados.find((e) => e.id === examen.id) });
});

/** GET /api/historia/refuerzos — vacunas por vencer, para la clínica. */
const refuerzos = asyncHandler(async (req, res) => {
  const dias = Math.min(Math.max(Number.parseInt(req.query.dias, 10) || 30, 1), 365);
  const lista = await historiaModel.refuerzosProximos(dias);
  res.json({ ok: true, dias, refuerzos: lista });
});

module.exports = {
  catalogos,
  porMascota,
  listarConsultas,
  detalleConsulta,
  crearConsulta,
  editarConsulta,
  aplicarVacuna,
  solicitarExamen,
  guardarResultados,
  refuerzos,
};
