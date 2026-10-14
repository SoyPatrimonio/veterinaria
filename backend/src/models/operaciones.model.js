'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

/**
 * Operación de la clínica: equipos médicos, bioseguridad y caja.
 *
 * Van juntos porque son las tres cosas que hay que poder demostrarle a quien
 * venga a inspeccionar: que el equipo está calibrado, que los residuos se
 * entregaron a un gestor y que la caja cuadra.
 */

/* ==================================================================
   EQUIPOS MEDICOS
   ================================================================== */

async function equipos({ sedeId = null, estado = null, mantenimientoVencido = false } = {}) {
  const condiciones = ['e.activo = 1'];
  const params = [];

  if (sedeId) { condiciones.push('e.sede_id = ?'); params.push(sedeId); }
  if (estado) { condiciones.push('e.estado = ?'); params.push(estado); }
  if (mantenimientoVencido) {
    condiciones.push(`(e.proximo_mantenimiento <= CURRENT_DATE OR e.proxima_calibracion <= CURRENT_DATE)`);
  }

  return consultar(
    `SELECT e.*, s.nombre AS sede_nombre, u.nombre AS responsable_nombre,
            p.nombre AS proveedor_nombre,
            (e.proximo_mantenimiento - CURRENT_DATE) AS dias_mantenimiento,
            (e.proxima_calibracion   - CURRENT_DATE) AS dias_calibracion,
            (SELECT MAX(m.fecha) FROM mantenimientos_equipo m WHERE m.equipo_id = e.id) AS ultimo_mantenimiento
       FROM equipos_medicos e
       LEFT JOIN sedes s      ON s.id = e.sede_id
       LEFT JOIN usuarios u   ON u.id = e.responsable_id
       LEFT JOIN proveedores p ON p.id = e.proveedor_id
      WHERE ${condiciones.join(' AND ')}
      ORDER BY e.proximo_mantenimiento NULLS LAST, e.nombre`,
    params
  );
}

async function equipoPorId(id) {
  return consultarUna(
    `SELECT e.*, s.nombre AS sede_nombre, u.nombre AS responsable_nombre
       FROM equipos_medicos e
       LEFT JOIN sedes s    ON s.id = e.sede_id
       LEFT JOIN usuarios u ON u.id = e.responsable_id
      WHERE e.id = ?`,
    [id]
  );
}

async function crearEquipo(datos) {
  const resultado = await ejecutar(
    `INSERT INTO equipos_medicos
       (codigo, nombre, marca, modelo, numero_serie, categoria, sede_id, ubicacion,
        responsable_id, proveedor_id, fecha_compra, valor_compra, garantia_hasta, estado,
        requiere_calibracion, frecuencia_meses, proximo_mantenimiento, proxima_calibracion, notas, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.codigo, datos.nombre, datos.marca ?? null, datos.modelo ?? null,
      datos.numeroSerie ?? null, datos.categoria ?? null, datos.sedeId ?? null,
      datos.ubicacion ?? null, datos.responsableId ?? null, datos.proveedorId ?? null,
      datos.fechaCompra ?? null, datos.valorCompra ?? null, datos.garantiaHasta ?? null,
      datos.estado, datos.requiereCalibracion ? 1 : 0, datos.frecuenciaMeses ?? null,
      datos.proximoMantenimiento ?? null, datos.proximaCalibracion ?? null,
      datos.notas ?? null, datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

async function actualizarEquipo(id, datos) {
  const resultado = await ejecutar(
    `UPDATE equipos_medicos
        SET nombre = ?, marca = ?, modelo = ?, numero_serie = ?, categoria = ?, sede_id = ?,
            ubicacion = ?, responsable_id = ?, proveedor_id = ?, fecha_compra = ?,
            valor_compra = ?, garantia_hasta = ?, estado = ?, requiere_calibracion = ?,
            frecuencia_meses = ?, proximo_mantenimiento = ?, proxima_calibracion = ?,
            notas = ?, activo = ?
      WHERE id = ?`,
    [
      datos.nombre, datos.marca ?? null, datos.modelo ?? null, datos.numeroSerie ?? null,
      datos.categoria ?? null, datos.sedeId ?? null, datos.ubicacion ?? null,
      datos.responsableId ?? null, datos.proveedorId ?? null, datos.fechaCompra ?? null,
      datos.valorCompra ?? null, datos.garantiaHasta ?? null, datos.estado,
      datos.requiereCalibracion ? 1 : 0, datos.frecuenciaMeses ?? null,
      datos.proximoMantenimiento ?? null, datos.proximaCalibracion ?? null,
      datos.notas ?? null, datos.activo ? 1 : 0, id,
    ]
  );
  return resultado.affectedRows > 0;
}

async function mantenimientosDe(equipoId) {
  return consultar(
    `SELECT m.*, u.nombre AS realizado_por_nombre
       FROM mantenimientos_equipo m
       LEFT JOIN usuarios u ON u.id = m.realizado_por
      WHERE m.equipo_id = ?
      ORDER BY m.fecha DESC`,
    [equipoId]
  );
}

/**
 * Registra un mantenimiento y adelanta la fecha del siguiente.
 *
 * Si no se indicó la próxima fecha se calcula con la frecuencia del equipo: el
 * sentido de tener frecuencia_meses es no tener que acordarse cada vez.
 */
async function registrarMantenimiento(equipo, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [mantenimiento] = await conexion.execute(
      `INSERT INTO mantenimientos_equipo
         (equipo_id, tipo, fecha, realizado_por, proveedor, descripcion, repuestos, costo,
          resultado, proximo, certificado, fuera_servicio_dias)
       VALUES (?, ?, COALESCE(?::date, CURRENT_DATE), ?, ?, ?, ?, ?, ?,
               COALESCE(?::date,
                        CASE WHEN ?::smallint IS NOT NULL
                             THEN CURRENT_DATE + (?::smallint * INTERVAL '1 month')
                             ELSE NULL END),
               ?, ?)
       RETURNING id, proximo`,
      [
        equipo.id, datos.tipo, datos.fecha ?? null, usuarioId ?? null, datos.proveedor ?? null,
        datos.descripcion, datos.repuestos ?? null, datos.costo, datos.resultado,
        datos.proximo ?? null, equipo.frecuencia_meses, equipo.frecuencia_meses,
        datos.certificado ?? null, datos.fueraServicioDias ?? null,
      ]
    );

    const proximo = mantenimiento.rows[0].proximo;
    const esCalibracion = datos.tipo === 'calibracion';

    await conexion.execute(
      `UPDATE equipos_medicos
          SET proximo_mantenimiento = CASE WHEN ? THEN proximo_mantenimiento ELSE COALESCE(?::date, proximo_mantenimiento) END,
              proxima_calibracion   = CASE WHEN ? THEN COALESCE(?::date, proxima_calibracion) ELSE proxima_calibracion END,
              -- Un mantenimiento fallido deja el equipo fuera de servicio: no
              -- se puede seguir usando un ecógrafo que no pasó la revisión.
              estado = CASE WHEN ? = 'fallido' THEN 'fuera_servicio'
                            WHEN estado IN ('mantenimiento','reparacion') THEN 'operativo'
                            ELSE estado END
        WHERE id = ?`,
      [esCalibracion, proximo, esCalibracion, proximo, datos.resultado, equipo.id]
    );

    return mantenimiento.insertId;
  }, usuarioId);
}

/* ==================================================================
   BIOSEGURIDAD
   ================================================================== */

async function protocolos({ categoria = null, soloActivos = true } = {}) {
  const condiciones = [];
  const params = [];

  if (categoria) { condiciones.push('categoria = ?'); params.push(categoria); }
  if (soloActivos) condiciones.push('activo = 1');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return consultar(
    `SELECT p.*,
            (SELECT MAX(r.fecha) FROM registros_bioseguridad r WHERE r.protocolo_id = p.id) AS ultimo_registro
       FROM protocolos_bioseguridad p ${where}
      ORDER BY p.categoria, p.nombre`,
    params
  );
}

async function crearProtocolo(datos) {
  const resultado = await ejecutar(
    `INSERT INTO protocolos_bioseguridad
       (codigo, nombre, categoria, descripcion, pasos, frecuencia, responsable_cargo, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.codigo, datos.nombre, datos.categoria, datos.descripcion ?? null,
      datos.pasos ?? null, datos.frecuencia, datos.responsableCargo ?? null, datos.activo ? 1 : 0,
    ]
  );
  return resultado.insertId;
}

async function registrosBioseguridad({ protocoloId = null, desde = null, hasta = null, limite = 100 } = {}) {
  const condiciones = [];
  const params = [];

  if (protocoloId) { condiciones.push('r.protocolo_id = ?'); params.push(protocoloId); }
  if (desde) { condiciones.push('r.fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('r.fecha <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT r.*, p.nombre AS protocolo, p.categoria, s.nombre AS sede_nombre,
            u.nombre AS realizado_por_nombre, uv.nombre AS verificado_por_nombre
       FROM registros_bioseguridad r
       JOIN protocolos_bioseguridad p ON p.id = r.protocolo_id
       LEFT JOIN sedes s     ON s.id = r.sede_id
       LEFT JOIN usuarios u  ON u.id = r.realizado_por
       LEFT JOIN usuarios uv ON uv.id = r.verificado_por
       ${where}
      ORDER BY r.fecha DESC
      LIMIT ${lim}`,
    params
  );
}

async function registrarProtocolo(datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO registros_bioseguridad
       (protocolo_id, sede_id, area, realizado_por, cumplido, producto_usado, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.protocoloId, datos.sedeId ?? null, datos.area ?? null, usuarioId ?? null,
      datos.cumplido ? 1 : 0, datos.productoUsado ?? null, datos.observaciones ?? null,
    ]
  );
  return resultado.insertId;
}

async function residuos({ desde = null, hasta = null, tipo = null } = {}) {
  const condiciones = [];
  const params = [];

  if (desde) { condiciones.push('r.fecha >= ?'); params.push(desde); }
  if (hasta) { condiciones.push('r.fecha <= ?'); params.push(hasta); }
  if (tipo) { condiciones.push('r.tipo = ?'); params.push(tipo); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return consultar(
    `SELECT r.*, s.nombre AS sede_nombre, u.nombre AS entregado_por_nombre
       FROM residuos r
       LEFT JOIN sedes s    ON s.id = r.sede_id
       LEFT JOIN usuarios u ON u.id = r.entregado_por
       ${where}
      ORDER BY r.fecha DESC`,
    params
  );
}

async function registrarResiduos(datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO residuos (sede_id, tipo, peso_kg, fecha, gestor, numero_acta, entregado_por, observaciones)
     VALUES (?, ?, ?, COALESCE(?::date, CURRENT_DATE), ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.sedeId ?? null, datos.tipo, datos.pesoKg, datos.fecha ?? null,
      datos.gestor ?? null, datos.numeroActa ?? null, usuarioId ?? null, datos.observaciones ?? null,
    ]
  );
  return resultado.insertId;
}

/** Kilos por tipo en un rango: es el cuadro que pide el plan de residuos. */
async function resumenResiduos({ desde, hasta } = {}) {
  return consultar(
    `SELECT tipo, COUNT(*) AS entregas, SUM(peso_kg) AS kilos
       FROM residuos
      WHERE fecha BETWEEN ? AND ?
      GROUP BY tipo
      ORDER BY kilos DESC`,
    [desde, hasta]
  );
}

async function incidentes({ estado = null, gravedad = null, limite = 100 } = {}) {
  const condiciones = [];
  const params = [];

  if (estado) { condiciones.push('i.estado = ?'); params.push(estado); }
  if (gravedad) { condiciones.push('i.gravedad = ?'); params.push(gravedad); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT i.*, s.nombre AS sede_nombre, u.nombre AS reportado_por_nombre
       FROM incidentes_bioseguridad i
       LEFT JOIN sedes s    ON s.id = i.sede_id
       LEFT JOIN usuarios u ON u.id = i.reportado_por
       ${where}
      ORDER BY
        CASE i.gravedad WHEN 'grave' THEN 1 WHEN 'moderada' THEN 2 ELSE 3 END,
        i.fecha DESC
      LIMIT ${lim}`,
    params
  );
}

async function registrarIncidente(datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO incidentes_bioseguridad
       (sede_id, tipo, fecha, lugar, descripcion, involucrados, gravedad, acciones, reportado_por)
     VALUES (?, ?, COALESCE(?::timestamp, LOCALTIMESTAMP), ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.sedeId ?? null, datos.tipo, datos.fecha ?? null, datos.lugar ?? null,
      datos.descripcion, datos.involucrados ?? null, datos.gravedad,
      datos.acciones ?? null, usuarioId ?? null,
    ]
  );
  return resultado.insertId;
}

async function cerrarIncidente(id, datos) {
  const resultado = await ejecutar(
    `UPDATE incidentes_bioseguridad
        SET estado = ?, acciones = COALESCE(?, acciones),
            cerrado_en = CASE WHEN ? = 'cerrado' THEN COALESCE(cerrado_en, LOCALTIMESTAMP) ELSE cerrado_en END
      WHERE id = ?`,
    [datos.estado, datos.acciones ?? null, datos.estado, id]
  );
  return resultado.affectedRows > 0;
}

async function elementosProteccion() {
  return consultar(
    `SELECT e.*, p.nombre AS producto_nombre, p.cantidad AS existencias
       FROM elementos_proteccion e
       LEFT JOIN productos p ON p.id = e.producto_id
      ORDER BY e.tipo, e.nombre`
  );
}

async function crearElementoProteccion(datos) {
  const resultado = await ejecutar(
    `INSERT INTO elementos_proteccion (nombre, tipo, producto_id, vida_util_dias, activo)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [datos.nombre, datos.tipo, datos.productoId ?? null, datos.vidaUtilDias ?? null, datos.activo ? 1 : 0]
  );
  return resultado.insertId;
}

async function entregasEpp({ usuarioId = null, limite = 100 } = {}) {
  const where = usuarioId ? 'WHERE e.usuario_id = ?' : '';
  const params = usuarioId ? [usuarioId] : [];
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 300);

  return consultar(
    `SELECT e.*, el.nombre AS elemento, el.tipo, u.nombre AS usuario_nombre,
            ent.nombre AS entregado_por_nombre,
            (e.proxima_entrega - CURRENT_DATE) AS dias_restantes
       FROM entregas_epp e
       JOIN elementos_proteccion el ON el.id = e.elemento_id
       JOIN usuarios u   ON u.id = e.usuario_id
       LEFT JOIN usuarios ent ON ent.id = e.entregado_por
       ${where}
      ORDER BY e.fecha DESC
      LIMIT ${lim}`,
    params
  );
}

/**
 * Entrega EPP y, si el elemento está ligado a un producto del inventario, lo
 * descuenta: un tapabocas entregado es un tapabocas que salió de la bodega.
 */
async function entregarEpp(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const elemento = await conexion.consultarUna(
      'SELECT * FROM elementos_proteccion WHERE id = ? AND activo = 1',
      [datos.elementoId]
    );
    if (!elemento) throw new Error('Ese elemento de protección no existe o está inactivo.');

    const [entrega] = await conexion.execute(
      `INSERT INTO entregas_epp (elemento_id, usuario_id, cantidad, entregado_por, observaciones, proxima_entrega)
       VALUES (?, ?, ?, ?, ?,
               CASE WHEN ?::smallint IS NOT NULL
                    THEN CURRENT_DATE + (?::smallint * INTERVAL '1 day')
                    ELSE NULL END)
       RETURNING id`,
      [
        datos.elementoId, datos.usuarioId, datos.cantidad, usuarioId ?? null,
        datos.observaciones ?? null, elemento.vida_util_dias, elemento.vida_util_dias,
      ]
    );

    if (elemento.producto_id) {
      const producto = await conexion.consultarUna(
        'SELECT id, nombre, cantidad FROM productos WHERE id = ? FOR UPDATE',
        [elemento.producto_id]
      );
      if (producto && producto.cantidad >= datos.cantidad) {
        await conexion.execute(
          `INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo, cantidad, motivo)
           VALUES (?, ?, 'salida', ?, 'Entrega de elemento de protección')`,
          [elemento.producto_id, usuarioId ?? null, datos.cantidad]
        );
      }
    }

    return entrega.insertId;
  }, usuarioId);
}

/* ==================================================================
   CAJA
   ================================================================== */

async function cajas({ sedeId = null } = {}) {
  const where = sedeId ? 'WHERE c.sede_id = ?' : '';
  const params = sedeId ? [sedeId] : [];

  return consultar(
    `SELECT c.*, s.nombre AS sede_nombre,
            a.id AS apertura_id, a.apertura, a.base_inicial, u.nombre AS abierta_por_nombre
       FROM cajas c
       JOIN sedes s ON s.id = c.sede_id
       LEFT JOIN aperturas_caja a ON a.caja_id = c.id AND a.estado = 'abierta'
       LEFT JOIN usuarios u ON u.id = a.abierta_por
       ${where}
      ORDER BY s.nombre, c.nombre`,
    params
  );
}

async function crearCaja(datos) {
  const resultado = await ejecutar(
    'INSERT INTO cajas (sede_id, nombre, activo) VALUES (?, ?, ?) RETURNING id',
    [datos.sedeId, datos.nombre, datos.activo ? 1 : 0]
  );
  return resultado.insertId;
}

async function aperturaAbierta(cajaId) {
  return consultarUna(
    `SELECT a.*, c.nombre AS caja, c.sede_id
       FROM aperturas_caja a
       JOIN cajas c ON c.id = a.caja_id
      WHERE a.caja_id = ? AND a.estado = 'abierta'`,
    [cajaId]
  );
}

async function aperturaPorId(id) {
  return consultarUna(
    `SELECT a.*, c.nombre AS caja, c.sede_id, u.nombre AS abierta_por_nombre
       FROM aperturas_caja a
       JOIN cajas c ON c.id = a.caja_id
       JOIN usuarios u ON u.id = a.abierta_por
      WHERE a.id = ?`,
    [id]
  );
}

async function abrirCaja(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [apertura] = await conexion.execute(
      `INSERT INTO aperturas_caja (caja_id, abierta_por, base_inicial, observaciones)
       VALUES (?, ?, ?, ?)
       RETURNING id`,
      [datos.cajaId, usuarioId, datos.baseInicial, datos.observaciones ?? null]
    );

    if (Number(datos.baseInicial) > 0) {
      await conexion.execute(
        `INSERT INTO movimientos_caja (apertura_id, tipo, concepto, valor, metodo, usuario_id)
         VALUES (?, 'base', 'Base inicial del turno', ?, 'efectivo', ?)`,
        [apertura.insertId, datos.baseInicial, usuarioId]
      );
    }

    return apertura.insertId;
  }, usuarioId);
}

async function movimientosCaja(aperturaId) {
  return consultar(
    `SELECT m.*, u.nombre AS usuario_nombre, f.numero AS factura_numero
       FROM movimientos_caja m
       LEFT JOIN usuarios u ON u.id = m.usuario_id
       LEFT JOIN pagos p    ON p.id = m.pago_id
       LEFT JOIN facturas f ON f.id = p.factura_id
      WHERE m.apertura_id = ?
      ORDER BY m.fecha`,
    [aperturaId]
  );
}

async function registrarMovimiento(aperturaId, datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO movimientos_caja (apertura_id, tipo, concepto, valor, metodo, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [aperturaId, datos.tipo, datos.concepto, datos.valor, datos.metodo, usuarioId ?? null]
  );
  return resultado.insertId;
}

/**
 * Total que debería haber en la caja según lo registrado.
 *
 * Solo cuenta el efectivo: lo que entró por tarjeta o transferencia no está en
 * el cajón, así que exigir que cuadre con el conteo físico no tendría sentido.
 */
async function totalEsperado(aperturaId) {
  const fila = await consultarUna(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo IN ('ingreso','venta','base') THEN valor ELSE -valor END), 0) AS efectivo
     FROM movimientos_caja
     WHERE apertura_id = ? AND metodo = 'efectivo'`,
    [aperturaId]
  );
  return Number(fila?.efectivo || 0);
}

async function cerrarCaja(aperturaId, datos, usuarioId) {
  const esperado = await totalEsperado(aperturaId);
  const diferencia = Number(datos.totalContado) - esperado;

  const resultado = await ejecutar(
    `UPDATE aperturas_caja
        SET estado = 'cerrada', cierre = LOCALTIMESTAMP, cerrada_por = ?,
            total_esperado = ?, total_contado = ?, diferencia = ?,
            observaciones = COALESCE(?, observaciones)
      WHERE id = ? AND estado = 'abierta'`,
    [usuarioId, esperado, datos.totalContado, diferencia, datos.observaciones ?? null, aperturaId]
  );

  return resultado.affectedRows > 0 ? { esperado, contado: Number(datos.totalContado), diferencia } : null;
}

async function historialCajas({ sedeId = null, desde = null, hasta = null, limite = 60 } = {}) {
  const condiciones = [];
  const params = [];

  if (sedeId) { condiciones.push('c.sede_id = ?'); params.push(sedeId); }
  if (desde) { condiciones.push('a.apertura >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('a.apertura <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 60, 1), 200);

  return consultar(
    `SELECT a.*, c.nombre AS caja, s.nombre AS sede_nombre,
            ua.nombre AS abierta_por_nombre, uc.nombre AS cerrada_por_nombre
       FROM aperturas_caja a
       JOIN cajas c ON c.id = a.caja_id
       JOIN sedes s ON s.id = c.sede_id
       JOIN usuarios ua ON ua.id = a.abierta_por
       LEFT JOIN usuarios uc ON uc.id = a.cerrada_por
       ${where}
      ORDER BY a.apertura DESC
      LIMIT ${lim}`,
    params
  );
}

module.exports = {
  equipos,
  equipoPorId,
  crearEquipo,
  actualizarEquipo,
  mantenimientosDe,
  registrarMantenimiento,
  protocolos,
  crearProtocolo,
  registrosBioseguridad,
  registrarProtocolo,
  residuos,
  registrarResiduos,
  resumenResiduos,
  incidentes,
  registrarIncidente,
  cerrarIncidente,
  elementosProteccion,
  crearElementoProteccion,
  entregasEpp,
  entregarEpp,
  cajas,
  crearCaja,
  aperturaAbierta,
  aperturaPorId,
  abrirCaja,
  movimientosCaja,
  registrarMovimiento,
  totalEsperado,
  cerrarCaja,
  historialCajas,
};
