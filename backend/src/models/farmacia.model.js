'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');
const { siguienteNumero } = require('../utils/consecutivos');

/**
 * Farmacia: recetas electrónicas y dispensación.
 *
 * Son dos cosas distintas a propósito. La receta es lo que firma el
 * veterinario y vale aunque el dueño compre el medicamento en otro sitio; la
 * dispensación es lo que sale del estante y descuenta inventario. Por eso una
 * receta puede quedar sin dispensar, o dispensarse a medias.
 */

/* ------------------------------------------------------------------
   Recetas
   ------------------------------------------------------------------ */

async function listar({ mascotaId, clienteId, estado, desde, hasta, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (mascotaId) { condiciones.push('r.mascota_id = ?'); params.push(mascotaId); }
  if (clienteId) { condiciones.push('r.cliente_id = ?'); params.push(clienteId); }
  if (estado) { condiciones.push('r.estado = ?'); params.push(estado); }
  if (desde) { condiciones.push('r.fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('r.fecha <= ?'); params.push(`${hasta} 23:59:59`); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT r.*, m.nombre AS mascota_nombre, uv.nombre AS veterinario_nombre,
            uc.nombre AS cliente_nombre,
            (SELECT COUNT(*) FROM receta_items ri WHERE ri.receta_id = r.id) AS items,
            (r.vigente_hasta IS NOT NULL AND r.vigente_hasta < CURRENT_DATE) AS caducada
       FROM recetas r
       JOIN mascotas m     ON m.id = r.mascota_id
       JOIN clientes cl    ON cl.id = r.cliente_id
       JOIN usuarios uc    ON uc.id = cl.usuario_id
       JOIN veterinarios v ON v.id = r.veterinario_id
       JOIN usuarios uv    ON uv.id = v.usuario_id
       ${where}
      ORDER BY r.fecha DESC
      LIMIT ${lim}`,
    params
  );
}

async function porId(id) {
  return consultarUna(
    `SELECT r.*, m.nombre AS mascota_nombre, m.cliente_id AS mascota_cliente_id,
            e.nombre AS especie, m.peso_kg,
            uv.nombre AS veterinario_nombre, v.licencia,
            uc.nombre AS cliente_nombre, uc.telefono AS cliente_telefono,
            sd.nombre AS sede_nombre,
            (r.vigente_hasta IS NOT NULL AND r.vigente_hasta < CURRENT_DATE) AS caducada
       FROM recetas r
       JOIN mascotas m     ON m.id = r.mascota_id
       JOIN especies e     ON e.id = m.especie_id
       JOIN clientes cl    ON cl.id = r.cliente_id
       JOIN usuarios uc    ON uc.id = cl.usuario_id
       JOIN veterinarios v ON v.id = r.veterinario_id
       JOIN usuarios uv    ON uv.id = v.usuario_id
       LEFT JOIN sedes sd  ON sd.id = r.sede_id
      WHERE r.id = ?`,
    [id]
  );
}

async function itemsDeReceta(recetaId) {
  return consultar(
    `SELECT ri.*, med.nombre AS medicamento, med.principio_activo, med.presentacion,
            med.concentracion, med.restringido, med.requiere_receta, med.producto_id
       FROM receta_items ri
       JOIN medicamentos med ON med.id = ri.medicamento_id
      WHERE ri.receta_id = ?
      ORDER BY ri.id`,
    [recetaId]
  );
}

async function crear(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const numero = await siguienteNumero(conexion, 'recetas');

    const [resultado] = await conexion.execute(
      `INSERT INTO recetas
         (numero, mascota_id, cliente_id, veterinario_id, consulta_id, tratamiento_id,
          sede_id, vigente_hasta, indicaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        numero,
        datos.mascotaId,
        datos.clienteId,
        datos.veterinarioId,
        datos.consultaId ?? null,
        datos.tratamientoId ?? null,
        datos.sedeId ?? null,
        datos.vigenteHasta ?? null,
        datos.indicaciones ?? null,
      ]
    );

    const recetaId = resultado.insertId;

    for (const item of datos.items) {
      await conexion.execute(
        `INSERT INTO receta_items
           (receta_id, medicamento_id, dosis, frecuencia, duracion, via, cantidad, indicaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recetaId,
          item.medicamentoId,
          item.dosis ?? null,
          item.frecuencia ?? null,
          item.duracion ?? null,
          item.via ?? null,
          item.cantidad,
          item.indicaciones ?? null,
        ]
      );
    }

    return recetaId;
  }, usuarioId);
}

async function anular(id, motivo) {
  const resultado = await ejecutar(
    `UPDATE recetas
        SET estado = 'anulada',
            indicaciones = COALESCE(indicaciones || E'\\n', '') || ?
      WHERE id = ? AND estado IN ('emitida','parcial')`,
    [`Anulada: ${motivo}`, id]
  );
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Interacciones medicamentosas
   ------------------------------------------------------------------ */

async function listarInteracciones() {
  return consultar(
    'SELECT * FROM interacciones_medicamentosas WHERE activo = 1 ORDER BY severidad DESC, principio_a'
  );
}

async function crearInteraccion(datos) {
  const resultado = await ejecutar(
    `INSERT INTO interacciones_medicamentosas
       (principio_a, principio_b, severidad, efecto, recomendacion, fuente)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [datos.principioA, datos.principioB, datos.severidad, datos.efecto, datos.recomendacion ?? null, datos.fuente ?? null]
  );
  return resultado.insertId;
}

/**
 * Busca interacciones entre una lista de medicamentos.
 *
 * Se cruza por principio activo, no por nombre comercial: dos marcas distintas
 * del mismo principio interaccionan igual, y buscar por nombre las dejaría
 * pasar. La comparación va en los dos sentidos porque el catálogo guarda cada
 * pareja una sola vez.
 */
async function interaccionesEntre(medicamentoIds) {
  if (!medicamentoIds || medicamentoIds.length < 2) return [];

  const marcas = medicamentoIds.map(() => '?').join(', ');

  return consultar(
    `WITH activos AS (
       SELECT DISTINCT id, COALESCE(principio_activo, nombre) AS principio, nombre
         FROM medicamentos
        WHERE id IN (${marcas})
     )
     SELECT i.*, a.nombre AS medicamento_a, b.nombre AS medicamento_b
       FROM interacciones_medicamentosas i
       JOIN activos a ON a.principio ILIKE i.principio_a OR a.principio ILIKE '%' || i.principio_a || '%'
       JOIN activos b ON (b.principio ILIKE i.principio_b OR b.principio ILIKE '%' || i.principio_b || '%')
                     AND b.id <> a.id
      WHERE i.activo = 1
      ORDER BY CASE i.severidad
                 WHEN 'contraindicada' THEN 1 WHEN 'grave' THEN 2
                 WHEN 'moderada' THEN 3 ELSE 4 END`,
    medicamentoIds
  );
}

/**
 * Alergias de la mascota que coincidan con lo que se le va a recetar. Es la
 * otra mitad del aviso: no basta con que dos fármacos no choquen entre sí si
 * uno de ellos es justo al que el paciente reaccionó.
 */
async function alergiasQueChocan(mascotaId, medicamentoIds) {
  if (!medicamentoIds || !medicamentoIds.length) return [];

  const marcas = medicamentoIds.map(() => '?').join(', ');

  return consultar(
    `SELECT al.nombre AS alergeno, ma.severidad, ma.reaccion, med.nombre AS medicamento
       FROM mascota_alergias ma
       JOIN alergias al ON al.id = ma.alergia_id
       JOIN medicamentos med ON med.id IN (${marcas})
      WHERE ma.mascota_id = ?
        AND al.tipo = 'medicamento'
        AND (med.nombre ILIKE '%' || al.nombre || '%'
          OR COALESCE(med.principio_activo, '') ILIKE '%' || al.nombre || '%')`,
    [...medicamentoIds, mascotaId]
  );
}

/* ------------------------------------------------------------------
   Dispensación
   ------------------------------------------------------------------ */

async function listarDispensaciones({ desde, hasta, clienteId, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (desde) { condiciones.push('d.fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('d.fecha <= ?'); params.push(`${hasta} 23:59:59`); }
  if (clienteId) { condiciones.push('d.cliente_id = ?'); params.push(clienteId); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT d.*, r.numero AS receta_numero, m.nombre AS mascota_nombre,
            uc.nombre AS cliente_nombre, ue.nombre AS entregado_por_nombre,
            (SELECT COUNT(*) FROM dispensacion_items di WHERE di.dispensacion_id = d.id) AS items
       FROM dispensaciones d
       LEFT JOIN recetas r   ON r.id = d.receta_id
       LEFT JOIN mascotas m  ON m.id = d.mascota_id
       LEFT JOIN clientes cl ON cl.id = d.cliente_id
       LEFT JOIN usuarios uc ON uc.id = cl.usuario_id
       LEFT JOIN usuarios ue ON ue.id = d.entregado_por
       ${where}
      ORDER BY d.fecha DESC
      LIMIT ${lim}`,
    params
  );
}

async function dispensacionPorId(id) {
  const dispensacion = await consultarUna(
    `SELECT d.*, r.numero AS receta_numero, m.nombre AS mascota_nombre, uc.nombre AS cliente_nombre
       FROM dispensaciones d
       LEFT JOIN recetas r   ON r.id = d.receta_id
       LEFT JOIN mascotas m  ON m.id = d.mascota_id
       LEFT JOIN clientes cl ON cl.id = d.cliente_id
       LEFT JOIN usuarios uc ON uc.id = cl.usuario_id
      WHERE d.id = ?`,
    [id]
  );
  if (!dispensacion) return null;

  dispensacion.items = await consultar(
    `SELECT di.*, p.nombre AS producto, p.unidad, l.codigo AS lote, l.fecha_vencimiento
       FROM dispensacion_items di
       JOIN productos p ON p.id = di.producto_id
       LEFT JOIN lotes l ON l.id = di.lote_id
      WHERE di.dispensacion_id = ?`,
    [id]
  );

  return dispensacion;
}

/**
 * Entrega de medicamentos.
 *
 * Todo va en una transacción: el movimiento de inventario, el avance de la
 * receta y el registro de la entrega. Si algo falla no puede quedar el stock
 * descontado sin la entrega anotada, ni al revés.
 */
async function dispensar(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `INSERT INTO dispensaciones
         (receta_id, cliente_id, mascota_id, factura_id, sede_id, entregado_por,
          recibe, documento_recibe, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        datos.recetaId ?? null,
        datos.clienteId ?? null,
        datos.mascotaId ?? null,
        datos.facturaId ?? null,
        datos.sedeId ?? null,
        usuarioId ?? null,
        datos.recibe ?? null,
        datos.documentoRecibe ?? null,
        datos.observaciones ?? null,
      ]
    );

    const dispensacionId = resultado.insertId;

    for (const item of datos.items) {
      // Se bloquea el producto antes de comprobar existencias: sin esto dos
      // entregas simultáneas podrían ver el mismo stock y dejarlo en negativo.
      const producto = await conexion.consultarUna(
        'SELECT id, nombre, cantidad, precio_venta FROM productos WHERE id = ? FOR UPDATE',
        [item.productoId]
      );
      if (!producto) throw new Error(`El producto ${item.productoId} no existe.`);

      const cantidad = Math.ceil(Number(item.cantidad));
      if (producto.cantidad < cantidad) {
        throw new Error(
          `No hay existencias suficientes de "${producto.nombre}": quedan ${producto.cantidad} y se piden ${cantidad}.`
        );
      }

      await conexion.execute(
        `INSERT INTO dispensacion_items
           (dispensacion_id, receta_item_id, producto_id, lote_id, cantidad, precio_unit)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          dispensacionId,
          item.recetaItemId ?? null,
          item.productoId,
          item.loteId ?? null,
          item.cantidad,
          item.precioUnit || producto.precio_venta,
        ]
      );

      await conexion.execute(
        `INSERT INTO movimientos_inventario
           (producto_id, ubicacion_id, lote_id, usuario_id, tipo, cantidad, motivo, referencia)
         VALUES (?, ?, ?, ?, 'salida', ?, 'Dispensación de farmacia', ?)`,
        [
          item.productoId,
          datos.ubicacionId ?? null,
          item.loteId ?? null,
          usuarioId ?? null,
          cantidad,
          `DISP-${dispensacionId}`,
        ]
      );

      // Avanzar el renglón de la receta es lo que dispara el recálculo de su
      // estado (emitida → parcial → dispensada).
      if (item.recetaItemId) {
        await conexion.execute(
          `UPDATE receta_items
              SET dispensado = LEAST(dispensado + ?, cantidad)
            WHERE id = ?`,
          [item.cantidad, item.recetaItemId]
        );
      }
    }

    return dispensacionId;
  }, usuarioId);
}

/**
 * Devolución. Solo el reingreso devuelve el producto al estante; lo que va a
 * destrucción o cuarentena sale del stock y no vuelve.
 */
async function devolver(datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `INSERT INTO devoluciones_medicamentos
         (dispensacion_id, producto_id, lote_id, cliente_id, recibido_por, cantidad, motivo, destino)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        datos.dispensacionId ?? null,
        datos.productoId,
        datos.loteId ?? null,
        datos.clienteId ?? null,
        usuarioId ?? null,
        datos.cantidad,
        datos.motivo,
        datos.destino,
      ]
    );

    if (datos.destino === 'reingreso') {
      await conexion.execute(
        `INSERT INTO movimientos_inventario
           (producto_id, ubicacion_id, lote_id, usuario_id, tipo, cantidad, motivo, referencia)
         VALUES (?, ?, ?, ?, 'entrada', ?, ?, ?)`,
        [
          datos.productoId,
          datos.ubicacionId ?? null,
          datos.loteId ?? null,
          usuarioId ?? null,
          Math.floor(Number(datos.cantidad)),
          `Devolución: ${datos.motivo}`,
          `DEVMED-${resultado.insertId}`,
        ]
      );
    }

    return resultado.insertId;
  }, usuarioId);
}

async function listarDevoluciones({ limite = 50 } = {}) {
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);
  return consultar(
    `SELECT dm.*, p.nombre AS producto, l.codigo AS lote, uc.nombre AS cliente_nombre,
            u.nombre AS recibido_por_nombre
       FROM devoluciones_medicamentos dm
       JOIN productos p ON p.id = dm.producto_id
       LEFT JOIN lotes l ON l.id = dm.lote_id
       LEFT JOIN clientes cl ON cl.id = dm.cliente_id
       LEFT JOIN usuarios uc ON uc.id = cl.usuario_id
       LEFT JOIN usuarios u  ON u.id = dm.recibido_por
      ORDER BY dm.fecha DESC
      LIMIT ${lim}`
  );
}

/* ------------------------------------------------------------------
   Inventario de farmacia
   ------------------------------------------------------------------ */

/**
 * Existencias de farmacia: los productos de categoría medicamento o vacuna y
 * los que estén enlazados a un medicamento del catálogo clínico. Se consulta
 * aparte de v_stock_productos porque aquí interesan el principio activo y la
 * marca de control especial, que la vista general no trae.
 */
async function inventarioFarmacia({ soloCriticos = false } = {}) {
  const filtro = soloCriticos
    ? "AND (p.cantidad <= p.stock_minimo OR lv.proximo <= CURRENT_DATE + INTERVAL '90 days')"
    : '';

  return consultar(
    `SELECT p.id, p.nombre, p.sku, p.cantidad, p.stock_minimo, p.precio_venta, p.unidad,
            cp.nombre AS categoria,
            (p.cantidad <= p.stock_minimo) AS stock_bajo,
            lv.proximo AS proximo_vencimiento,
            med.id AS medicamento_id, med.principio_activo,
            med.restringido, med.requiere_receta
       FROM productos p
       JOIN categorias_productos cp ON cp.id = p.categoria_id
       LEFT JOIN medicamentos med ON med.producto_id = p.id
       LEFT JOIN LATERAL (
         SELECT MIN(l.fecha_vencimiento) AS proximo
           FROM lotes l
          WHERE l.producto_id = p.id AND l.fecha_vencimiento >= CURRENT_DATE
       ) lv ON TRUE
      WHERE p.activo = 1
        AND (cp.tipo IN ('medicamento','vacuna') OR med.id IS NOT NULL)
        ${filtro}
      ORDER BY (p.cantidad <= p.stock_minimo) DESC, lv.proximo NULLS LAST, p.nombre`
  );
}

/** Lo que ha tomado una mascota a lo largo del tiempo. */
async function historialPorMascota(mascotaId) {
  return consultar(
    `SELECT r.id AS receta_id, r.numero, r.fecha, r.estado,
            med.nombre AS medicamento, med.principio_activo,
            ri.dosis, ri.frecuencia, ri.duracion, ri.via, ri.cantidad, ri.dispensado,
            uv.nombre AS veterinario_nombre
       FROM recetas r
       JOIN receta_items ri  ON ri.receta_id = r.id
       JOIN medicamentos med ON med.id = ri.medicamento_id
       JOIN veterinarios v   ON v.id = r.veterinario_id
       JOIN usuarios uv      ON uv.id = v.usuario_id
      WHERE r.mascota_id = ? AND r.estado <> 'anulada'
      ORDER BY r.fecha DESC, ri.id`,
    [mascotaId]
  );
}

/** Libro de medicamentos de control especial. */
async function movimientosRestringidos({ desde, hasta, limite = 200 } = {}) {
  const condiciones = ['med.restringido = 1'];
  const params = [];

  if (desde) { condiciones.push('d.fecha >= ?'); params.push(`${desde} 00:00:00`); }
  if (hasta) { condiciones.push('d.fecha <= ?'); params.push(`${hasta} 23:59:59`); }

  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 200, 1), 500);

  return consultar(
    `SELECT d.id AS dispensacion_id, d.fecha, d.recibe, d.documento_recibe,
            r.numero AS receta_numero, med.nombre AS medicamento, med.principio_activo,
            di.cantidad, l.codigo AS lote, m.nombre AS mascota_nombre,
            uc.nombre AS cliente_nombre, ue.nombre AS entregado_por_nombre
       FROM dispensacion_items di
       JOIN dispensaciones d ON d.id = di.dispensacion_id
       JOIN productos p      ON p.id = di.producto_id
       JOIN medicamentos med ON med.producto_id = p.id
       LEFT JOIN recetas r   ON r.id = d.receta_id
       LEFT JOIN lotes l     ON l.id = di.lote_id
       LEFT JOIN mascotas m  ON m.id = d.mascota_id
       LEFT JOIN clientes cl ON cl.id = d.cliente_id
       LEFT JOIN usuarios uc ON uc.id = cl.usuario_id
       LEFT JOIN usuarios ue ON ue.id = d.entregado_por
      WHERE ${condiciones.join(' AND ')}
      ORDER BY d.fecha DESC
      LIMIT ${lim}`,
    params
  );
}

module.exports = {
  listar,
  porId,
  itemsDeReceta,
  crear,
  anular,
  listarInteracciones,
  crearInteraccion,
  interaccionesEntre,
  alergiasQueChocan,
  listarDispensaciones,
  dispensacionPorId,
  dispensar,
  devolver,
  listarDevoluciones,
  inventarioFarmacia,
  historialPorMascota,
  movimientosRestringidos,
};
