'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const integracionModel = require('../models/integracion.model');
const { consultarUna } = require('../config/database');

/**
 * Integraciones: DIAN, pasarelas de pago y mensajería.
 *
 * El panel dice siempre la verdad sobre qué está conectado y qué no. Un canal
 * "activo" sin credencial en el entorno se reporta como no disponible, porque
 * lo contrario es descubrir que llevas un mes sin transmitir facturas.
 */

/** GET /api/integraciones/estado — resumen de qué está conectado. */
const estado = asyncHandler(async (req, res) => {
  const [dian, pasarelas] = await Promise.all([
    integracionModel.estadoFacturacionElectronica(),
    integracionModel.pasarelas({ soloActivas: true }),
  ]);

  const canales = integracionModel.canalesDisponibles();
  const pasarelasListas = pasarelas.filter((p) => p.secreto_env && process.env[p.secreto_env]);

  res.json({
    ok: true,
    dian,
    pagos: {
      configuradas: pasarelas.length,
      listas: pasarelasListas.length,
      // El nombre de la variable sí se muestra; su valor nunca.
      pendientes: pasarelas
        .filter((p) => !p.secreto_env || !process.env[p.secreto_env])
        .map((p) => ({ nombre: p.nombre, falta: p.secreto_env || 'variable de entorno sin definir' })),
    },
    canales,
  });
});

/* ---- Facturación electrónica --------------------------------------- */

/** GET /api/integraciones/dian */
const proveedoresDian = asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    proveedores: await integracionModel.proveedoresFacturacion(),
    estado: await integracionModel.estadoFacturacionElectronica(),
  });
});

/** PUT /api/integraciones/dian */
const guardarProveedorDian = asyncHandler(async (req, res) => {
  await integracionModel.guardarProveedorFacturacion(req.body);

  res.json({
    ok: true,
    proveedores: await integracionModel.proveedoresFacturacion(),
    estado: await integracionModel.estadoFacturacionElectronica(),
  });
});

/** GET /api/integraciones/dian/facturas */
const facturasElectronicas = asyncHandler(async (req, res) => {
  res.json({ ok: true, facturas: await integracionModel.facturasElectronicas(req.consulta || {}) });
});

/** POST /api/integraciones/dian/facturas/:id — encola una factura. */
const enviarFacturaElectronica = asyncHandler(async (req, res) => {
  const factura = await consultarUna('SELECT id, numero, estado FROM facturas WHERE id = ?', [req.params.id]);
  if (!factura) throw ApiError.noEncontrado('Esa factura no existe.');
  if (factura.estado === 'anulada') throw ApiError.conflicto('Una factura anulada no se transmite.');

  const disponible = await integracionModel.estadoFacturacionElectronica();
  await integracionModel.encolarFacturaElectronica(factura.id, disponible.proveedor?.id ?? null);

  // Se responde 202 y no 201: queda encolada, no transmitida. Decir "enviada"
  // cuando solo se guardó la intención es lo que hace que nadie revise la cola.
  res.status(202).json({
    ok: true,
    encolada: true,
    transmitida: false,
    mensaje: disponible.listo
      ? `La factura ${factura.numero} quedó en cola para transmitirse a la DIAN.`
      : `La factura ${factura.numero} quedó en cola, pero todavía no se puede transmitir: ${disponible.motivo}`,
  });
});

/* ---- Pasarelas de pago ---------------------------------------------- */

/** GET /api/integraciones/pasarelas */
const pasarelas = asyncHandler(async (req, res) => {
  res.json({ ok: true, pasarelas: await integracionModel.pasarelas() });
});

/** GET /api/integraciones/pagos/metodos — lo que el cliente puede usar hoy. */
const metodosDisponibles = asyncHandler(async (req, res) => {
  res.json({ ok: true, metodos: await integracionModel.pasarelasDisponibles() });
});

/** PUT /api/integraciones/pasarelas */
const guardarPasarela = asyncHandler(async (req, res) => {
  await integracionModel.guardarPasarela(req.body);
  res.json({ ok: true, pasarelas: await integracionModel.pasarelas() });
});

/**
 * POST /api/integraciones/pagos — inicia una transacción.
 *
 * Devuelve la referencia con la que la pasarela reportará el resultado. El
 * valor lo pone el servidor a partir de lo que se está pagando, nunca el
 * cliente: si viniera del navegador, cualquiera pagaría mil pesos por una
 * cirugía.
 */
const iniciarPago = asyncHandler(async (req, res) => {
  const { facturaId, pedidoId, sesionTeleId, suscripcionId } = req.body;
  let valor = null;

  /**
   * Un cliente solo puede abrir el pago de lo suyo.
   *
   * Sin esto, cambiar el id en la petición no llegaba a pagar la cuenta de
   * otro, pero sí devolvía su saldo: bastaba con recorrer los identificadores
   * para saber cuánto debe cada cliente de la clínica. El personal sí puede
   * iniciar el cobro de cualquiera, que es lo que hace en el mostrador.
   */
  function exigirPropio(duenoId, queEs) {
    if (req.usuario.rol !== 'cliente') return;
    if (!req.usuario.cliente_id || duenoId !== req.usuario.cliente_id) {
      throw ApiError.prohibido(`${queEs} no es tuya.`);
    }
  }

  if (facturaId) {
    const factura = await consultarUna(
      `SELECT cliente_id, total - pagado AS saldo, estado FROM facturas WHERE id = ?`,
      [facturaId]
    );
    if (!factura) throw ApiError.noEncontrado('Esa factura no existe.');
    exigirPropio(factura.cliente_id, 'Esa factura');
    if (factura.estado === 'anulada') throw ApiError.conflicto('Esa factura está anulada.');
    if (Number(factura.saldo) <= 0) throw ApiError.conflicto('Esa factura ya está pagada.');
    valor = Number(factura.saldo);
  } else if (pedidoId) {
    const pedido = await consultarUna('SELECT cliente_id, total, estado_pago FROM pedidos WHERE id = ?', [pedidoId]);
    if (!pedido) throw ApiError.noEncontrado('Ese pedido no existe.');
    exigirPropio(pedido.cliente_id, 'Ese pedido');
    if (pedido.estado_pago === 'pagado') throw ApiError.conflicto('Ese pedido ya está pagado.');
    valor = Number(pedido.total);
  } else if (sesionTeleId) {
    const sesion = await consultarUna(
      `SELECT s.cliente_id, s.pagada, COALESCE(sv.precio, 0) AS precio
         FROM sesiones_telemedicina s
         LEFT JOIN citas c     ON c.id = s.cita_id
         LEFT JOIN servicios sv ON sv.id = c.servicio_id
        WHERE s.id = ?`,
      [sesionTeleId]
    );
    if (!sesion) throw ApiError.noEncontrado('Esa videoconsulta no existe.');
    exigirPropio(sesion.cliente_id, 'Esa videoconsulta');
    if (sesion.pagada === 1) throw ApiError.conflicto('Esa videoconsulta ya está pagada.');
    valor = Number(sesion.precio);
  } else if (suscripcionId) {
    const suscripcion = await consultarUna(
      'SELECT cliente_id, precio FROM suscripciones_plan WHERE id = ?',
      [suscripcionId]
    );
    if (!suscripcion) throw ApiError.noEncontrado('Esa suscripción no existe.');
    exigirPropio(suscripcion.cliente_id, 'Esa suscripción');
    valor = Number(suscripcion.precio);
  }

  if (!valor || valor <= 0) throw ApiError.badRequest('No hay un valor a cobrar.');

  const transaccion = await integracionModel.iniciarTransaccion({
    ...req.body,
    clienteId: req.usuario.cliente_id ?? null,
    valor,
  });

  const disponibles = await integracionModel.pasarelasDisponibles();
  const pasarela = disponibles.find((p) => p.id === req.body.pasarelaId);

  res.status(201).json({
    ok: true,
    referencia: transaccion.referencia,
    valor,
    listo: Boolean(pasarela),
    mensaje: pasarela
      ? 'Transacción iniciada. Continúa el pago en la pasarela.'
      : 'La transacción quedó registrada, pero esa pasarela todavía no tiene credenciales configuradas.',
  });
});

/**
 * POST /api/integraciones/pagos/:referencia/confirmar
 *
 * Lo llama la pasarela (o la administración a mano). Aprobar crea el pago de la
 * factura y deja que el disparador recalcule el saldo, todo en una transacción.
 */
const confirmarPago = asyncHandler(async (req, res) => {
  const transaccion = await integracionModel.transaccionPorReferencia(req.params.referencia);
  if (!transaccion) throw ApiError.noEncontrado('Esa referencia no existe.');
  if (transaccion.confirmado_en) throw ApiError.conflicto('Esa transacción ya fue confirmada.');

  const pagoId = await integracionModel.confirmarTransaccion(transaccion, req.body, req.usuario?.id ?? null);

  res.json({
    ok: true,
    estado: req.body.estado,
    pagoId,
    mensaje: req.body.estado === 'aprobada' ? 'Pago confirmado y aplicado.' : 'Transacción cerrada.',
  });
});

/** GET /api/integraciones/pagos */
const transacciones = asyncHandler(async (req, res) => {
  res.json({ ok: true, transacciones: await integracionModel.transacciones(req.consulta || {}) });
});

/* ---- Mensajería y automatización ------------------------------------ */

/** GET /api/integraciones/mensajes */
const mensajes = asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    canales: integracionModel.canalesDisponibles(),
    mensajes: await integracionModel.mensajes(req.consulta || {}),
  });
});

/** GET /api/integraciones/automatizacion */
const reglasAutomaticas = asyncHandler(async (req, res) => {
  res.json({ ok: true, reglas: await integracionModel.reglasAutomaticas() });
});

/** PUT /api/integraciones/automatizacion */
const guardarReglaAutomatica = asyncHandler(async (req, res) => {
  await integracionModel.guardarReglaAutomatica(req.body);
  res.json({ ok: true, reglas: await integracionModel.reglasAutomaticas() });
});

module.exports = {
  estado,
  proveedoresDian,
  guardarProveedorDian,
  facturasElectronicas,
  enviarFacturaElectronica,
  pasarelas,
  metodosDisponibles,
  guardarPasarela,
  iniciarPago,
  confirmarPago,
  transacciones,
  mensajes,
  reglasAutomaticas,
  guardarReglaAutomatica,
};
