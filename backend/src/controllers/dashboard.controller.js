'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const citaModel = require('../models/cita.model');
const mascotaModel = require('../models/mascota.model');
const facturaModel = require('../models/factura.model');
const notificacionModel = require('../models/notificacion.model');
const historiaModel = require('../models/historia.model');
const inventarioModel = require('../models/inventario.model');
const avisos = require('../services/notificaciones.service');
const { aFechaISO } = require('../utils/fechas');
const { consultar, consultarUna } = require('../config/database');

/** La fecha de hoy en el formato que esperan los filtros de citaModel. */
const hoyISO = () => aFechaISO(new Date());

/**
 * GET /api/dashboard
 * Devuelve el resumen que corresponde al rol de la sesión, para no obligar al
 * frontend a encadenar cinco peticiones al abrir cada panel.
 */
const resumen = asyncHandler(async (req, res) => {
  if (req.usuario.rol === 'cliente') return res.json({ ok: true, ...(await dashboardCliente(req)) });
  if (req.usuario.rol === 'veterinario') return res.json({ ok: true, ...(await dashboardVeterinario(req)) });
  return res.json({ ok: true, ...(await dashboardAdmin(req)) });
});

async function dashboardCliente(req) {
  const clienteId = req.usuario.cliente_id;
  if (!clienteId) throw ApiError.badRequest('Tu cuenta no tiene ficha de cliente.');

  const [mascotas, contadores, proximas, facturas, noLeidas] = await Promise.all([
    mascotaModel.listarPorCliente(clienteId),
    citaModel.resumenCliente(clienteId),
    citaModel.listar({ clienteId, desde: hoyISO(), limite: 5 }),
    facturaModel.pendientesDeCliente(clienteId),
    notificacionModel.contarNoLeidas(req.usuario.id),
  ]);

  // Vacunas que vencen en los próximos 30 días o que ya están vencidas.
  const alertasVacunas = await consultar(
    `SELECT mv.id, mv.proxima_fecha, v.nombre AS vacuna, m.id AS mascota_id, m.nombre AS mascota,
            (mv.proxima_fecha - CURRENT_DATE) AS dias
       FROM aplicaciones_vacunas mv
       JOIN vacunas v  ON v.id = mv.vacuna_id
       JOIN mascotas m ON m.id = mv.mascota_id
      WHERE m.cliente_id = ?
        AND mv.proxima_fecha IS NOT NULL
        AND mv.proxima_fecha <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY mv.proxima_fecha`,
    [clienteId]
  );

  const porCobrar = facturas.reduce((suma, f) => suma + Number(f.saldo || 0), 0);

  return {
    rol: 'cliente',
    mascotas,
    resumen: {
      mascotas: mascotas.length,
      pendientes: Number(contadores?.pendientes || 0),
      confirmadas: Number(contadores?.confirmadas || 0),
      atendidas: Number(contadores?.atendidas || 0),
      proximas: Number(contadores?.proximas || 0),
      facturasPendientes: facturas.length,
      porCobrar,
      avisos: noLeidas,
    },
    proximasCitas: proximas.filter((c) => c.estado === 'pendiente' || c.estado === 'confirmada'),
    alertasVacunas,
    facturasPendientes: facturas,
  };
}

/**
 * Contadores de los módulos nuevos que alimentan las insignias del menú.
 *
 * Van en una sola consulta y no en seis: el menú los pide en cada pantalla que
 * se abre, y seis idas a la base por cada carga de página se notan.
 *
 * Se calculan aparte del resto porque los comparten el panel del veterinario y
 * el de administración, que ven las mismas urgencias y los mismos internados.
 */
async function contadoresClinicos() {
  const fila = await consultarUna(
    `SELECT
       (SELECT COUNT(*) FROM ingresos_urgencias
         WHERE estado <> 'cerrado')                                   AS urgencias,
       (SELECT COUNT(*) FROM ingresos_urgencias
         WHERE estado = 'en_espera')                                  AS urgencias_espera,
       (SELECT COUNT(*) FROM hospitalizaciones
         WHERE estado = 'activa')                                     AS hospitalizados,
       (SELECT COUNT(*) FROM v_hospitalizados
         WHERE medicacion_vencida > 0)                                AS controles_vencidos,
       (SELECT COUNT(*) FROM examenes
         WHERE estado IN ('solicitado','en_proceso','listo'))         AS examenes_pendientes,
       (SELECT COUNT(*) FROM alertas_criticas
         WHERE estado IN ('abierta','vista'))                         AS alertas,
       (SELECT COUNT(*) FROM alertas_criticas
         WHERE estado IN ('abierta','vista') AND severidad = 'critica') AS alertas_criticas`
  );

  return {
    urgencias: Number(fila?.urgencias || 0),
    urgenciasEspera: Number(fila?.urgencias_espera || 0),
    hospitalizados: Number(fila?.hospitalizados || 0),
    controlesVencidos: Number(fila?.controles_vencidos || 0),
    examenesPendientes: Number(fila?.examenes_pendientes || 0),
    alertas: Number(fila?.alertas || 0),
    alertasCriticas: Number(fila?.alertas_criticas || 0),
  };
}

async function dashboardVeterinario(req) {
  const veterinarioId = req.usuario.veterinario_id;
  if (!veterinarioId) throw ApiError.badRequest('Tu cuenta no está vinculada a un perfil de veterinario.');

  const [contadores, citasHoy, proximas, ultimasConsultas, refuerzos, noLeidas] = await Promise.all([
    citaModel.resumenVeterinario(veterinarioId),
    citaModel.listar({ veterinarioId, desde: hoyISO(), hasta: hoyISO(), limite: 50 }),
    citaModel.listar({ veterinarioId, desde: hoyISO(), limite: 10 }),
    historiaModel.listarConsultas({ veterinarioId, limite: 5 }),
    historiaModel.refuerzosProximos(15),
    notificacionModel.contarNoLeidas(req.usuario.id),
  ]);

  return {
    rol: 'veterinario',
    resumen: {
      hoy: Number(contadores?.hoy || 0),
      proximas: Number(contadores?.proximas || 0),
      porConfirmar: Number(contadores?.por_confirmar || 0),
      pacientes: Number(contadores?.pacientes || 0),
      consultas: ultimasConsultas.length,
      refuerzos: refuerzos.length,
      avisos: noLeidas,
      ...(await contadoresClinicos()),
    },
    citasHoy,
    proximasCitas: proximas.filter((c) => c.estado === 'pendiente' || c.estado === 'confirmada'),
    ultimasConsultas,
    refuerzos,
  };
}

/** Contadores que solo salen en el menú de administración. */
async function contadoresAdmin() {
  const fila = await consultarUna(
    `SELECT
       (SELECT COUNT(*) FROM pedidos
         WHERE estado IN ('pendiente','confirmado','preparando','enviado'))  AS pedidos_abiertos,
       (SELECT COUNT(*) FROM tickets
         WHERE estado NOT IN ('resuelto','cerrado'))                         AS pqrs_abiertas,
       (SELECT COUNT(*) FROM tickets
         WHERE estado NOT IN ('resuelto','cerrado')
           AND vence_en IS NOT NULL AND vence_en < LOCALTIMESTAMP)           AS pqrs_vencidas,
       (SELECT COUNT(*) FROM equipos_medicos
         WHERE activo = 1 AND estado <> 'dado_baja'
           AND (proximo_mantenimiento <= CURRENT_DATE
                OR (requiere_calibracion = 1 AND proxima_calibracion <= CURRENT_DATE))) AS equipos_pendientes`
  );

  return {
    pedidosAbiertos: Number(fila?.pedidos_abiertos || 0),
    pqrsAbiertas: Number(fila?.pqrs_abiertas || 0),
    pqrsVencidas: Number(fila?.pqrs_vencidas || 0),
    equiposPendientes: Number(fila?.equipos_pendientes || 0),
  };
}

async function dashboardAdmin(req) {
  // El panel de la clínica es lo primero que alguien abre cada mañana, así que
  // es el sitio natural para entregar los recordatorios que ya vencieron: no
  // hay proceso en segundo plano que pueda hacerlo por su cuenta.
  await avisos.procesarPendientes();

  const [contadores, citasHoy, ultimosClientes, serviciosTop] = await Promise.all([
    citaModel.resumenClinica(),
    citaModel.listar({ desde: hoyISO(), hasta: hoyISO(), limite: 100 }),
    consultar(
      `SELECT u.id, u.nombre, u.email, u.creado_en
         FROM usuarios u JOIN roles r ON r.id = u.rol_id
        WHERE r.nombre = 'cliente'
        ORDER BY u.creado_en DESC LIMIT 5`
    ),
    consultar(
      `SELECT s.nombre, COUNT(c.id) AS total
         FROM servicios s
         LEFT JOIN citas c ON c.servicio_id = s.id AND c.estado <> 'cancelada'
        GROUP BY s.id, s.nombre
        ORDER BY total DESC
        LIMIT 5`
    ),
  ]);

  const [alertasStock, cartera, alertasInventario, refuerzos, noLeidas] = await Promise.all([
    consultarUna('SELECT COUNT(*) AS total FROM productos WHERE activo = 1 AND cantidad <= stock_minimo'),
    facturaModel.resumen(),
    inventarioModel.alertas(30),
    historiaModel.refuerzosProximos(15),
    notificacionModel.contarNoLeidas(req.usuario.id),
  ]);

  return {
    rol: 'admin',
    resumen: {
      citasHoy: Number(contadores?.citas_hoy || 0),
      citasPendientes: Number(contadores?.citas_pendientes || 0),
      clientes: Number(contadores?.clientes || 0),
      mascotas: Number(contadores?.mascotas || 0),
      veterinarios: Number(contadores?.veterinarios || 0),
      servicios: Number(contadores?.servicios || 0),
      stockBajo: Number(alertasStock?.total || 0),
      productos: Number(alertasInventario.contadores?.productos || 0),
      facturasPendientes: Number(cartera?.pendientes || 0) + Number(cartera?.parciales || 0),
      porCobrar: Number(cartera?.por_cobrar || 0),
      cobradoMes: Number(cartera?.cobrado_mes || 0),
      refuerzos: refuerzos.length,
      avisos: noLeidas,
      ...(await contadoresClinicos()),
      ...(await contadoresAdmin()),
    },
    citasHoy,
    ultimosClientes,
    serviciosTop,
    cartera,
    alertasInventario: {
      stockBajo: alertasInventario.stockBajo.slice(0, 5),
      porVencer: alertasInventario.porVencer.slice(0, 5),
    },
    refuerzos: refuerzos.slice(0, 5),
  };
}

module.exports = { resumen };
