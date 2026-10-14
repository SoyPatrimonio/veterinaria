'use strict';

const crypto = require('crypto');
const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

/**
 * Planes de salud y fidelización.
 *
 * Dos cosas distintas que comparten pantalla: el plan es un contrato con
 * beneficios contados (cuatro consultas al año, las vacunas incluidas), y los
 * puntos son un premio por gastar. El saldo de puntos y el nivel los mantiene
 * un disparador de la base a partir de los movimientos, para que no puedan
 * quedar descuadrados.
 */

/* ------------------------------------------------------------------
   Planes de salud
   ------------------------------------------------------------------ */

function slugificar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100);
}

async function planes({ soloActivos = true } = {}) {
  const lista = await consultar(
    `SELECT * FROM planes_salud ${soloActivos ? 'WHERE activo = 1' : ''} ORDER BY orden, precio_mensual`
  );

  if (!lista.length) return [];

  const beneficios = await consultar(
    `SELECT b.*, s.nombre AS servicio_nombre, v.nombre AS vacuna_nombre
       FROM plan_beneficios b
       LEFT JOIN servicios s ON s.id = b.servicio_id
       LEFT JOIN vacunas v   ON v.id = b.vacuna_id
      ORDER BY b.id`
  );

  return lista.map((plan) => ({
    ...plan,
    beneficios: beneficios.filter((b) => b.plan_id === plan.id),
  }));
}

async function planPorId(id) {
  const plan = await consultarUna('SELECT * FROM planes_salud WHERE id = ?', [id]);
  if (!plan) return null;

  plan.beneficios = await consultar('SELECT * FROM plan_beneficios WHERE plan_id = ? ORDER BY id', [id]);
  return plan;
}

async function crearPlan(datos) {
  return enTransaccion(async (conexion) => {
    const [plan] = await conexion.execute(
      `INSERT INTO planes_salud
         (nombre, slug, descripcion, precio_mensual, precio_anual, descuento_general_pct, color, orden, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        datos.nombre,
        slugificar(datos.nombre),
        datos.descripcion ?? null,
        datos.precioMensual,
        datos.precioAnual ?? null,
        datos.descuentoGeneralPct,
        datos.color ?? null,
        datos.orden,
        datos.activo ? 1 : 0,
      ]
    );

    for (const b of datos.beneficios) {
      await conexion.execute(
        `INSERT INTO plan_beneficios
           (plan_id, tipo, servicio_id, vacuna_id, descripcion, cantidad_incluida, descuento_pct, periodo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          plan.insertId,
          b.tipo,
          b.servicioId ?? null,
          b.vacunaId ?? null,
          b.descripcion,
          b.cantidadIncluida ?? null,
          b.descuentoPct ?? null,
          b.periodo,
        ]
      );
    }

    return plan.insertId;
  });
}

/**
 * Reemplaza el plan y sus beneficios.
 *
 * Los beneficios se borran y se vuelven a insertar, pero el consumo ya
 * registrado apunta al beneficio viejo con ON DELETE CASCADE… así que si se
 * borrara sin más, desaparecería el histórico de lo que la gente ya usó. Por
 * eso los beneficios que tienen consumo no se borran: se desactivan poniendo
 * la cantidad en cero.
 */
async function actualizarPlan(id, datos) {
  return enTransaccion(async (conexion) => {
    await conexion.execute(
      `UPDATE planes_salud
          SET nombre = ?, descripcion = ?, precio_mensual = ?, precio_anual = ?,
              descuento_general_pct = ?, color = ?, orden = ?, activo = ?
        WHERE id = ?`,
      [
        datos.nombre,
        datos.descripcion ?? null,
        datos.precioMensual,
        datos.precioAnual ?? null,
        datos.descuentoGeneralPct,
        datos.color ?? null,
        datos.orden,
        datos.activo ? 1 : 0,
        id,
      ]
    );

    await conexion.execute(
      `DELETE FROM plan_beneficios b
        WHERE b.plan_id = ?
          AND NOT EXISTS (SELECT 1 FROM consumo_beneficios c WHERE c.beneficio_id = b.id)`,
      [id]
    );

    for (const b of datos.beneficios) {
      await conexion.execute(
        `INSERT INTO plan_beneficios
           (plan_id, tipo, servicio_id, vacuna_id, descripcion, cantidad_incluida, descuento_pct, periodo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          b.tipo,
          b.servicioId ?? null,
          b.vacunaId ?? null,
          b.descripcion,
          b.cantidadIncluida ?? null,
          b.descuentoPct ?? null,
          b.periodo,
        ]
      );
    }

    return true;
  });
}

/* ------------------------------------------------------------------
   Suscripciones
   ------------------------------------------------------------------ */

async function suscripciones({ clienteId = null, estado = null, limite = 100 } = {}) {
  const condiciones = [];
  const params = [];

  if (clienteId) { condiciones.push('s.cliente_id = ?'); params.push(clienteId); }
  if (estado) { condiciones.push('s.estado = ?'); params.push(estado); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT s.*, p.nombre AS plan, p.color, u.nombre AS cliente, m.nombre AS mascota,
            (s.fin - CURRENT_DATE) AS dias_restantes
       FROM suscripciones_plan s
       JOIN planes_salud p ON p.id = s.plan_id
       JOIN clientes cl    ON cl.id = s.cliente_id
       JOIN usuarios u     ON u.id = cl.usuario_id
       LEFT JOIN mascotas m ON m.id = s.mascota_id
       ${where}
      ORDER BY s.fin DESC
      LIMIT ${lim}`,
    params
  );
}

async function suscripcionPorId(id) {
  return consultarUna(
    `SELECT s.*, p.nombre AS plan, u.nombre AS cliente
       FROM suscripciones_plan s
       JOIN planes_salud p ON p.id = s.plan_id
       JOIN clientes cl    ON cl.id = s.cliente_id
       JOIN usuarios u     ON u.id = cl.usuario_id
      WHERE s.id = ?`,
    [id]
  );
}

async function suscribir(datos) {
  const plan = await consultarUna('SELECT * FROM planes_salud WHERE id = ? AND activo = 1', [datos.planId]);
  if (!plan) return null;

  const anual = datos.periodicidad === 'anual';
  const precio = anual ? (plan.precio_anual ?? plan.precio_mensual * 12) : plan.precio_mensual;

  const resultado = await ejecutar(
    `INSERT INTO suscripciones_plan
       (cliente_id, plan_id, mascota_id, periodicidad, precio, inicio, fin, renovacion_automatica)
     VALUES (?, ?, ?, ?, ?, CURRENT_DATE, CURRENT_DATE + ?::interval, ?)
     RETURNING id`,
    [
      datos.clienteId,
      datos.planId,
      datos.mascotaId ?? null,
      datos.periodicidad,
      precio,
      anual ? '1 year' : '1 month',
      datos.renovacionAutomatica ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

async function cancelarSuscripcion(id) {
  const resultado = await ejecutar(
    `UPDATE suscripciones_plan SET estado = 'cancelada', renovacion_automatica = 0
      WHERE id = ? AND estado = 'activa'`,
    [id]
  );
  return resultado.affectedRows > 0;
}

/** Cuánto le queda al cliente de cada beneficio: sale de la vista de la base. */
async function beneficiosDisponibles(clienteId) {
  return consultar(
    'SELECT * FROM v_beneficios_disponibles WHERE cliente_id = ? ORDER BY plan, tipo',
    [clienteId]
  );
}

/**
 * Registra el uso de un beneficio.
 *
 * Se comprueba el cupo dentro de la transacción y con FOR UPDATE sobre la
 * suscripción: sin eso, dos consultas facturadas a la vez podrían gastar
 * la misma última consulta incluida.
 */
async function consumirBeneficio(suscripcionId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    await conexion.consultarUna('SELECT id FROM suscripciones_plan WHERE id = ? FOR UPDATE', [suscripcionId]);

    const cupo = await conexion.consultarUna(
      'SELECT * FROM v_beneficios_disponibles WHERE suscripcion_id = ? AND beneficio_id = ?',
      [suscripcionId, datos.beneficioId]
    );

    if (!cupo) throw new Error('Ese beneficio no pertenece al plan del cliente o la suscripción no está activa.');
    if (cupo.disponibles !== null && cupo.disponibles < datos.cantidad) {
      throw new Error(`Ya usó los ${cupo.cantidad_incluida} de "${cupo.descripcion}" que incluye el plan.`);
    }

    await conexion.execute(
      `INSERT INTO consumo_beneficios (suscripcion_id, beneficio_id, cita_id, factura_id, cantidad, valor_ahorrado)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        suscripcionId,
        datos.beneficioId,
        datos.citaId ?? null,
        datos.facturaId ?? null,
        datos.cantidad,
        datos.valorAhorrado,
      ]
    );

    return true;
  }, usuarioId);
}

/** Suscripciones que vencen dentro de N días y siguen activas. */
async function suscripcionesPorVencer(dias = 15) {
  return consultar(
    `SELECT s.*, p.nombre AS plan, u.id AS usuario_id, u.nombre AS cliente,
            (s.fin - CURRENT_DATE) AS dias_restantes
       FROM suscripciones_plan s
       JOIN planes_salud p ON p.id = s.plan_id
       JOIN clientes cl    ON cl.id = s.cliente_id
       JOIN usuarios u     ON u.id = cl.usuario_id
      WHERE s.estado = 'activa' AND s.fin BETWEEN CURRENT_DATE AND CURRENT_DATE + ?::integer
      ORDER BY s.fin`,
    [dias]
  );
}

/* ------------------------------------------------------------------
   Puntos y recompensas
   ------------------------------------------------------------------ */

async function cuentaDe(clienteId, { crear = true } = {}) {
  let cuenta = await consultarUna(
    `SELECT c.*, n.nombre AS nivel, n.descuento_pct, n.color, n.beneficios AS nivel_beneficios
       FROM cuentas_puntos c
       LEFT JOIN niveles_cliente n ON n.id = c.nivel_id
      WHERE c.cliente_id = ?`,
    [clienteId]
  );

  if (!cuenta && crear) {
    await ejecutar(
      `INSERT INTO cuentas_puntos (cliente_id, nivel_id)
       VALUES (?, (SELECT id FROM niveles_cliente ORDER BY puntos_minimos LIMIT 1))`,
      [clienteId]
    );
    cuenta = await cuentaDe(clienteId, { crear: false });
  }

  return cuenta;
}

async function movimientosPuntos(cuentaId, limite = 50) {
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);
  return consultar(
    `SELECT mp.*, f.numero AS factura_numero, pe.numero AS pedido_numero
       FROM movimientos_puntos mp
       LEFT JOIN facturas f ON f.id = mp.factura_id
       LEFT JOIN pedidos pe ON pe.id = mp.pedido_id
      WHERE mp.cuenta_id = ?
      ORDER BY mp.fecha DESC
      LIMIT ${lim}`,
    [cuentaId]
  );
}

async function moverPuntos(cuentaId, datos) {
  const resultado = await ejecutar(
    `INSERT INTO movimientos_puntos (cuenta_id, tipo, puntos, motivo, factura_id, pedido_id, usuario_id, vence_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      cuentaId,
      datos.tipo,
      datos.puntos,
      datos.motivo,
      datos.facturaId ?? null,
      datos.pedidoId ?? null,
      datos.usuarioId ?? null,
      datos.venceEn ?? null,
    ]
  );
  return resultado.insertId;
}

async function niveles() {
  return consultar('SELECT * FROM niveles_cliente ORDER BY puntos_minimos');
}

async function recompensas({ soloActivas = true } = {}) {
  return consultar(
    `SELECT r.*, s.nombre AS servicio_nombre, p.nombre AS producto_nombre
       FROM recompensas r
       LEFT JOIN servicios s ON s.id = r.servicio_id
       LEFT JOIN productos p ON p.id = r.producto_id
      ${soloActivas ? 'WHERE r.activo = 1' : ''}
      ORDER BY r.puntos`
  );
}

async function crearRecompensa(datos) {
  const resultado = await ejecutar(
    `INSERT INTO recompensas (nombre, descripcion, puntos, tipo, servicio_id, producto_id, valor, existencias, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.nombre,
      datos.descripcion ?? null,
      datos.puntos,
      datos.tipo,
      datos.servicioId ?? null,
      datos.productoId ?? null,
      datos.valor ?? null,
      datos.existencias ?? null,
      datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

/**
 * Canjea una recompensa.
 *
 * El saldo se bloquea con FOR UPDATE y el descuento entra como movimiento, no
 * como un UPDATE al saldo: así el canje queda en el extracto y el disparador
 * es el único que toca la cuenta.
 */
async function canjear(cuentaId, recompensaId, usuarioId) {
  return enTransaccion(async (conexion) => {
    const cuenta = await conexion.consultarUna(
      'SELECT * FROM cuentas_puntos WHERE id = ? FOR UPDATE',
      [cuentaId]
    );
    if (!cuenta) throw new Error('Esa cuenta de puntos no existe.');

    const recompensa = await conexion.consultarUna(
      'SELECT * FROM recompensas WHERE id = ? AND activo = 1 FOR UPDATE',
      [recompensaId]
    );
    if (!recompensa) throw new Error('Esa recompensa ya no está disponible.');
    if (recompensa.existencias !== null && recompensa.existencias <= 0) {
      throw new Error('Esa recompensa se agotó.');
    }
    if (cuenta.puntos < recompensa.puntos) {
      throw new Error(`Te faltan ${recompensa.puntos - cuenta.puntos} puntos para canjear esa recompensa.`);
    }

    const codigo = crypto.randomBytes(5).toString('hex').toUpperCase();

    const [canje] = await conexion.execute(
      `INSERT INTO canjes (cuenta_id, recompensa_id, puntos, codigo, vence_en)
       VALUES (?, ?, ?, ?, CURRENT_DATE + INTERVAL '90 days')
       RETURNING id`,
      [cuentaId, recompensaId, recompensa.puntos, codigo]
    );

    await conexion.execute(
      `INSERT INTO movimientos_puntos (cuenta_id, tipo, puntos, motivo, usuario_id)
       VALUES (?, 'canje', ?, ?, ?)`,
      [cuentaId, -recompensa.puntos, `Canje: ${recompensa.nombre}`, usuarioId ?? null]
    );

    if (recompensa.existencias !== null) {
      await conexion.execute('UPDATE recompensas SET existencias = existencias - 1 WHERE id = ?', [recompensaId]);
    }

    return { id: canje.insertId, codigo, recompensa: recompensa.nombre };
  }, usuarioId);
}

async function canjesDe(cuentaId) {
  return consultar(
    `SELECT c.*, r.nombre AS recompensa, r.tipo
       FROM canjes c
       JOIN recompensas r ON r.id = c.recompensa_id
      WHERE c.cuenta_id = ?
      ORDER BY c.fecha DESC`,
    [cuentaId]
  );
}

async function usarCanje(codigo) {
  const resultado = await ejecutar(
    `UPDATE canjes SET estado = 'usado', usado_en = LOCALTIMESTAMP
      WHERE codigo = ? AND estado = 'pendiente'
        AND (vence_en IS NULL OR vence_en >= CURRENT_DATE)`,
    [codigo]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Promociones
   ------------------------------------------------------------------ */

async function promociones() {
  return consultar(
    `SELECT p.*, c.codigo AS cupon_codigo
       FROM promociones p
       LEFT JOIN cupones c ON c.id = p.cupon_id
      ORDER BY p.activo DESC, p.desde DESC`
  );
}

async function crearPromocion(datos) {
  const resultado = await ejecutar(
    `INSERT INTO promociones (nombre, descripcion, segmento, cupon_id, plantilla_id, desde, hasta, activo)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_DATE), ?, ?)
     RETURNING id`,
    [
      datos.nombre,
      datos.descripcion ?? null,
      datos.segmento,
      datos.cuponId ?? null,
      datos.plantillaId ?? null,
      datos.desde ?? null,
      datos.hasta ?? null,
      datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

/**
 * Clientes de un segmento, para dirigir una promoción.
 *
 * 'inactivos' son los que llevan más de seis meses sin cita: es a quienes tiene
 * sentido reactivar. 'cumpleanos' mira el cumpleaños de la mascota, que es lo
 * que la clínica conoce.
 */
async function clientesDelSegmento(segmento) {
  const consultas = {
    todos: `SELECT cl.id AS cliente_id, u.id AS usuario_id, u.nombre, u.email
              FROM clientes cl JOIN usuarios u ON u.id = cl.usuario_id
             WHERE u.estado = 'activo'`,

    nuevos: `SELECT cl.id AS cliente_id, u.id AS usuario_id, u.nombre, u.email
               FROM clientes cl JOIN usuarios u ON u.id = cl.usuario_id
              WHERE u.estado = 'activo' AND u.creado_en >= LOCALTIMESTAMP - INTERVAL '30 days'`,

    inactivos: `SELECT cl.id AS cliente_id, u.id AS usuario_id, u.nombre, u.email
                  FROM clientes cl JOIN usuarios u ON u.id = cl.usuario_id
                 WHERE u.estado = 'activo'
                   AND NOT EXISTS (
                     SELECT 1 FROM citas c
                      WHERE c.cliente_id = cl.id
                        AND c.inicio >= LOCALTIMESTAMP - INTERVAL '6 months'
                        AND c.estado <> 'cancelada')`,

    recurrentes: `SELECT cl.id AS cliente_id, u.id AS usuario_id, u.nombre, u.email
                    FROM clientes cl JOIN usuarios u ON u.id = cl.usuario_id
                   WHERE u.estado = 'activo'
                     AND (SELECT COUNT(*) FROM citas c
                           WHERE c.cliente_id = cl.id AND c.estado = 'atendida') >= 3`,

    cumpleanos: `SELECT DISTINCT cl.id AS cliente_id, u.id AS usuario_id, u.nombre, u.email
                   FROM clientes cl
                   JOIN usuarios u  ON u.id = cl.usuario_id
                   JOIN mascotas m  ON m.cliente_id = cl.id
                  WHERE u.estado = 'activo' AND m.activo = 1 AND m.fallecido = 0
                    AND m.fecha_nacimiento IS NOT NULL
                    AND EXTRACT(MONTH FROM m.fecha_nacimiento) = EXTRACT(MONTH FROM CURRENT_DATE)
                    AND EXTRACT(DAY   FROM m.fecha_nacimiento) = EXTRACT(DAY   FROM CURRENT_DATE)`,

    nivel: `SELECT cl.id AS cliente_id, u.id AS usuario_id, u.nombre, u.email
              FROM cuentas_puntos cp
              JOIN clientes cl ON cl.id = cp.cliente_id
              JOIN usuarios u  ON u.id = cl.usuario_id
             WHERE u.estado = 'activo' AND cp.nivel_id IS NOT NULL
               AND cp.nivel_id = (SELECT MAX(id) FROM niveles_cliente)`,

    plan: `SELECT DISTINCT cl.id AS cliente_id, u.id AS usuario_id, u.nombre, u.email
             FROM suscripciones_plan s
             JOIN clientes cl ON cl.id = s.cliente_id
             JOIN usuarios u  ON u.id = cl.usuario_id
            WHERE u.estado = 'activo' AND s.estado = 'activa'`,
  };

  return consultar(consultas[segmento] || consultas.todos);
}

module.exports = {
  planes,
  planPorId,
  crearPlan,
  actualizarPlan,
  suscripciones,
  suscripcionPorId,
  suscribir,
  cancelarSuscripcion,
  beneficiosDisponibles,
  consumirBeneficio,
  suscripcionesPorVencer,
  cuentaDe,
  movimientosPuntos,
  moverPuntos,
  niveles,
  recompensas,
  crearRecompensa,
  canjear,
  canjesDe,
  usarCanje,
  promociones,
  crearPromocion,
  clientesDelSegmento,
};
