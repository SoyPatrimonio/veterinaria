'use strict';

const crypto = require('crypto');
const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

/**
 * Integraciones para Colombia: facturación electrónica DIAN, pasarelas de pago
 * (PSE, Nequi, Daviplata) y mensajería (WhatsApp, correo, SMS).
 *
 * Este módulo guarda la CONFIGURACIÓN y el RASTRO, no las credenciales: de cada
 * secreto se almacena el nombre de la variable de entorno donde vive. Así rotar
 * una clave no obliga a tocar la base, y un volcado de la base no entrega los
 * accesos a la DIAN ni a la pasarela.
 *
 * El envío real lo hace el proveedor que se contrate. Mientras no haya
 * credenciales configuradas, todo queda registrado en estado 'pendiente' y el
 * panel lo muestra como "sin proveedor conectado" en vez de fingir que se envió.
 */

/* ------------------------------------------------------------------
   Facturación electrónica
   ------------------------------------------------------------------ */

async function proveedoresFacturacion() {
  return consultar('SELECT * FROM proveedores_facturacion ORDER BY activo DESC, nombre');
}

async function proveedorActivo() {
  return consultarUna('SELECT * FROM proveedores_facturacion WHERE activo = 1 LIMIT 1');
}

async function guardarProveedorFacturacion(datos) {
  const resultado = await ejecutar(
    `INSERT INTO proveedores_facturacion
       (nombre, nit, ambiente, url_base, usuario, secreto_env, prefijo, resolucion,
        rango_desde, rango_hasta, vigencia_hasta, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (nombre) DO UPDATE
       SET nit = EXCLUDED.nit, ambiente = EXCLUDED.ambiente, url_base = EXCLUDED.url_base,
           usuario = EXCLUDED.usuario, secreto_env = EXCLUDED.secreto_env,
           prefijo = EXCLUDED.prefijo, resolucion = EXCLUDED.resolucion,
           rango_desde = EXCLUDED.rango_desde, rango_hasta = EXCLUDED.rango_hasta,
           vigencia_hasta = EXCLUDED.vigencia_hasta, activo = EXCLUDED.activo
     RETURNING id`,
    [
      datos.nombre, datos.nit ?? null, datos.ambiente, datos.urlBase ?? null,
      datos.usuario ?? null, datos.secretoEnv ?? null, datos.prefijo ?? null,
      datos.resolucion ?? null, datos.rangoDesde ?? null, datos.rangoHasta ?? null,
      datos.vigenciaHasta ?? null, datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

/**
 * ¿Está la facturación electrónica lista para usarse?
 *
 * Se comprueba también que el secreto exista de verdad en el entorno: tener el
 * proveedor "activo" en la base pero sin la clave cargada es la forma silenciosa
 * de que todas las facturas se queden sin transmitir.
 */
async function estadoFacturacionElectronica() {
  const proveedor = await proveedorActivo();

  if (!proveedor) {
    return { listo: false, motivo: 'No hay proveedor tecnológico configurado.' };
  }
  if (!proveedor.secreto_env || !process.env[proveedor.secreto_env]) {
    return {
      listo: false,
      proveedor,
      motivo: `Falta la variable de entorno ${proveedor.secreto_env || '(sin definir)'} con la credencial.`,
    };
  }
  if (proveedor.vigencia_hasta && proveedor.vigencia_hasta < new Date().toISOString().slice(0, 10)) {
    return { listo: false, proveedor, motivo: 'La resolución de numeración está vencida.' };
  }

  return { listo: true, proveedor };
}

async function facturasElectronicas({ estado = null, limite = 100 } = {}) {
  const where = estado ? 'WHERE fe.estado = ?' : '';
  const params = estado ? [estado] : [];
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT fe.*, f.numero, f.total, f.fecha, u.nombre AS cliente, p.nombre AS proveedor
       FROM facturas_electronicas fe
       JOIN facturas f  ON f.id = fe.factura_id
       JOIN clientes cl ON cl.id = f.cliente_id
       JOIN usuarios u  ON u.id = cl.usuario_id
       LEFT JOIN proveedores_facturacion p ON p.id = fe.proveedor_id
       ${where}
      ORDER BY fe.creado_en DESC
      LIMIT ${lim}`,
    params
  );
}

/**
 * Deja la factura encolada para la DIAN.
 *
 * No transmite: crea el registro en 'pendiente'. Quien transmite es el
 * proveedor tecnológico contratado, y ese paso se conecta aquí cuando existan
 * las credenciales. Registrar la intención igualmente es lo que permite saber
 * qué falta por enviar el día que se conecte.
 */
async function encolarFacturaElectronica(facturaId, proveedorId) {
  const resultado = await ejecutar(
    `INSERT INTO facturas_electronicas (factura_id, proveedor_id, estado)
     VALUES (?, ?, 'pendiente')
     ON CONFLICT (factura_id) DO UPDATE
       SET proveedor_id = EXCLUDED.proveedor_id,
           estado = CASE WHEN facturas_electronicas.estado = 'aceptada'
                         THEN facturas_electronicas.estado ELSE 'pendiente' END,
           intentos = facturas_electronicas.intentos + 1
     RETURNING id`,
    [facturaId, proveedorId ?? null]
  );
  return resultado.insertId;
}

async function actualizarFacturaElectronica(facturaId, datos) {
  const resultado = await ejecutar(
    `UPDATE facturas_electronicas
        SET estado = ?, cufe = COALESCE(?, cufe), numero_dian = COALESCE(?, numero_dian),
            xml_url = COALESCE(?, xml_url), pdf_url = COALESCE(?, pdf_url),
            qr_texto = COALESCE(?, qr_texto), respuesta = COALESCE(?::jsonb, respuesta),
            error = ?,
            enviado_en = COALESCE(enviado_en, LOCALTIMESTAMP),
            aceptado_en = CASE WHEN ? = 'aceptada' THEN LOCALTIMESTAMP ELSE aceptado_en END
      WHERE factura_id = ?`,
    [
      datos.estado, datos.cufe ?? null, datos.numeroDian ?? null,
      datos.xmlUrl ?? null, datos.pdfUrl ?? null, datos.qrTexto ?? null,
      datos.respuesta ? JSON.stringify(datos.respuesta) : null,
      datos.error ?? null, datos.estado, facturaId,
    ]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Pasarelas de pago
   ------------------------------------------------------------------ */

async function pasarelas({ soloActivas = false } = {}) {
  return consultar(
    `SELECT id, nombre, metodo, proveedor, ambiente, clave_publica, secreto_env,
            comision_pct, orden, activo
       FROM pasarelas_pago
      ${soloActivas ? 'WHERE activo = 1' : ''}
      ORDER BY orden, nombre`
  );
}

/** Métodos que el cliente puede usar de verdad: activos y con credencial. */
async function pasarelasDisponibles() {
  const lista = await pasarelas({ soloActivas: true });
  return lista
    .filter((p) => p.secreto_env && process.env[p.secreto_env])
    .map(({ secreto_env: _secreto, ...publica }) => publica);
}

async function guardarPasarela(datos) {
  const resultado = await ejecutar(
    `INSERT INTO pasarelas_pago
       (nombre, metodo, proveedor, ambiente, clave_publica, secreto_env, comision_pct, orden, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (nombre) DO UPDATE
       SET metodo = EXCLUDED.metodo, proveedor = EXCLUDED.proveedor,
           ambiente = EXCLUDED.ambiente, clave_publica = EXCLUDED.clave_publica,
           secreto_env = EXCLUDED.secreto_env, comision_pct = EXCLUDED.comision_pct,
           orden = EXCLUDED.orden, activo = EXCLUDED.activo
     RETURNING id`,
    [
      datos.nombre, datos.metodo, datos.proveedor ?? null, datos.ambiente,
      datos.clavePublica ?? null, datos.secretoEnv ?? null, datos.comisionPct,
      datos.orden, datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

/** Referencia de pago: única, aleatoria y no adivinable. */
function nuevaReferencia() {
  return `HLT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function iniciarTransaccion(datos) {
  const resultado = await ejecutar(
    `INSERT INTO transacciones_pago
       (pasarela_id, factura_id, pedido_id, sesion_tele_id, suscripcion_id, cliente_id,
        referencia, valor, metodo, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'iniciada')
     RETURNING id, referencia`,
    [
      datos.pasarelaId, datos.facturaId ?? null, datos.pedidoId ?? null,
      datos.sesionTeleId ?? null, datos.suscripcionId ?? null, datos.clienteId ?? null,
      nuevaReferencia(), datos.valor, datos.metodo ?? null,
    ]
  );
  return { id: resultado.insertId, referencia: resultado.rows[0].referencia };
}

async function transaccionPorReferencia(referencia) {
  return consultarUna(
    `SELECT t.*, p.nombre AS pasarela, p.metodo AS pasarela_metodo
       FROM transacciones_pago t
       LEFT JOIN pasarelas_pago p ON p.id = t.pasarela_id
      WHERE t.referencia = ?`,
    [referencia]
  );
}

async function transacciones({ estado = null, limite = 100 } = {}) {
  const where = estado ? 'WHERE t.estado = ?' : '';
  const params = estado ? [estado] : [];
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT t.*, p.nombre AS pasarela, f.numero AS factura_numero, pe.numero AS pedido_numero,
            u.nombre AS cliente
       FROM transacciones_pago t
       LEFT JOIN pasarelas_pago p ON p.id = t.pasarela_id
       LEFT JOIN facturas f  ON f.id = t.factura_id
       LEFT JOIN pedidos pe  ON pe.id = t.pedido_id
       LEFT JOIN clientes cl ON cl.id = t.cliente_id
       LEFT JOIN usuarios u  ON u.id = cl.usuario_id
       ${where}
      ORDER BY t.creado_en DESC
      LIMIT ${lim}`,
    params
  );
}

/**
 * Confirma el resultado del pago.
 *
 * Una transacción aprobada crea el pago de la factura (y el disparador de
 * facturación recalcula el saldo), marca el pedido como pagado o habilita la
 * videoconsulta, según lo que se estuviera pagando. Todo en la misma
 * transacción: que la pasarela diga "aprobado" y la factura siga en pendiente
 * es exactamente el descuadre que hay que evitar.
 */
async function confirmarTransaccion(transaccion, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    let pagoId = null;

    if (datos.estado === 'aprobada') {
      if (transaccion.factura_id) {
        const [pago] = await conexion.execute(
          `INSERT INTO pagos (factura_id, usuario_id, metodo, valor, referencia)
           VALUES (?, ?, 'en_linea', ?, ?)
           RETURNING id`,
          [transaccion.factura_id, usuarioId ?? null, transaccion.valor, transaccion.referencia]
        );
        pagoId = pago.insertId;
      }

      if (transaccion.pedido_id) {
        await conexion.execute(
          `UPDATE pedidos SET estado_pago = 'pagado' WHERE id = ?`,
          [transaccion.pedido_id]
        );
      }

      if (transaccion.sesion_tele_id) {
        await conexion.execute(
          'UPDATE sesiones_telemedicina SET pagada = 1 WHERE id = ?',
          [transaccion.sesion_tele_id]
        );
      }
    } else if (transaccion.pedido_id) {
      await conexion.execute(
        `UPDATE pedidos SET estado_pago = 'fallido' WHERE id = ?`,
        [transaccion.pedido_id]
      );
    }

    await conexion.execute(
      `UPDATE transacciones_pago
          SET estado = ?, referencia_externa = COALESCE(?, referencia_externa),
              respuesta = COALESCE(?::jsonb, respuesta), pago_id = COALESCE(?, pago_id),
              confirmado_en = LOCALTIMESTAMP
        WHERE id = ?`,
      [
        datos.estado, datos.referenciaExterna ?? null,
        datos.respuesta ? JSON.stringify(datos.respuesta) : null,
        pagoId, transaccion.id,
      ]
    );

    return pagoId;
  }, usuarioId);
}

/* ------------------------------------------------------------------
   Mensajería (WhatsApp, correo, SMS)
   ------------------------------------------------------------------ */

/** Canales con proveedor configurado; el resto se muestra como no disponible. */
function canalesDisponibles() {
  return {
    email: Boolean(process.env.SMTP_URL || process.env.RESEND_API_KEY),
    whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
    sms: Boolean(process.env.SMS_API_KEY),
    push: false,
  };
}

async function encolarMensaje(datos) {
  const resultado = await ejecutar(
    `INSERT INTO mensajes_enviados
       (canal, destino, usuario_id, plantilla_id, notificacion_id, recordatorio_id,
        asunto, cuerpo, proveedor, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
     RETURNING id`,
    [
      datos.canal, datos.destino, datos.usuarioId ?? null, datos.plantillaId ?? null,
      datos.notificacionId ?? null, datos.recordatorioId ?? null,
      datos.asunto ?? null, datos.cuerpo ?? null, datos.proveedor ?? null,
    ]
  );
  return resultado.insertId;
}

async function marcarMensaje(id, estado, { idExterno = null, error = null } = {}) {
  await ejecutar(
    `UPDATE mensajes_enviados
        SET estado = ?, id_externo = COALESCE(?, id_externo), error = ?,
            intentos = intentos + 1,
            enviado_en   = CASE WHEN ? IN ('enviado','entregado','leido') THEN COALESCE(enviado_en, LOCALTIMESTAMP) ELSE enviado_en END,
            entregado_en = CASE WHEN ? IN ('entregado','leido') THEN COALESCE(entregado_en, LOCALTIMESTAMP) ELSE entregado_en END
      WHERE id = ?`,
    [estado, idExterno, error, estado, estado, id]
  );
}

async function mensajes({ canal = null, estado = null, limite = 100 } = {}) {
  const condiciones = [];
  const params = [];

  if (canal) { condiciones.push('m.canal = ?'); params.push(canal); }
  if (estado) { condiciones.push('m.estado = ?'); params.push(estado); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT m.*, u.nombre AS usuario_nombre
       FROM mensajes_enviados m
       LEFT JOIN usuarios u ON u.id = m.usuario_id
       ${where}
      ORDER BY m.creado_en DESC
      LIMIT ${lim}`,
    params
  );
}

/* ------------------------------------------------------------------
   Reglas de automatización
   ------------------------------------------------------------------ */

async function reglasAutomaticas({ soloActivas = false } = {}) {
  return consultar(
    `SELECT r.*, p.codigo AS plantilla_codigo, p.asunto AS plantilla_asunto
       FROM reglas_automaticas r
       LEFT JOIN plantillas_notificaciones p ON p.id = r.plantilla_id
      ${soloActivas ? 'WHERE r.activo = 1' : ''}
      ORDER BY r.evento, r.codigo`
  );
}

async function guardarReglaAutomatica(datos) {
  const resultado = await ejecutar(
    `INSERT INTO reglas_automaticas
       (codigo, nombre, evento, plantilla_id, canal, desfase_horas, destinatario, condiciones, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
     ON CONFLICT (codigo) DO UPDATE
       SET nombre = EXCLUDED.nombre, evento = EXCLUDED.evento,
           plantilla_id = EXCLUDED.plantilla_id, canal = EXCLUDED.canal,
           desfase_horas = EXCLUDED.desfase_horas, destinatario = EXCLUDED.destinatario,
           condiciones = EXCLUDED.condiciones, activo = EXCLUDED.activo
     RETURNING id`,
    [
      datos.codigo, datos.nombre, datos.evento, datos.plantillaId ?? null,
      datos.canal, datos.desfaseHoras, datos.destinatario,
      datos.condiciones ? JSON.stringify(datos.condiciones) : null,
      datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

module.exports = {
  proveedoresFacturacion,
  proveedorActivo,
  guardarProveedorFacturacion,
  estadoFacturacionElectronica,
  facturasElectronicas,
  encolarFacturaElectronica,
  actualizarFacturaElectronica,
  pasarelas,
  pasarelasDisponibles,
  guardarPasarela,
  iniciarTransaccion,
  transaccionPorReferencia,
  transacciones,
  confirmarTransaccion,
  canalesDisponibles,
  encolarMensaje,
  marcarMensaje,
  mensajes,
  reglasAutomaticas,
  guardarReglaAutomatica,
};
