'use strict';

const { consultar, consultarUna } = require('../config/database');

/**
 * Indicadores de la clínica.
 *
 * Todas las consultas reciben la misma ventana de fechas y devuelven cifras
 * ya agregadas: el panel de reportes no debería traerse miles de filas para
 * sumarlas en el navegador.
 *
 * Las facturas anuladas quedan fuera de todo lo que sea dinero. Siguen en la
 * base porque hay que poder auditarlas, pero contarlas como ingreso haría que
 * los reportes no cuadraran con la caja.
 */

/** Dinero facturado y cobrado en la ventana. */
async function ingresos(desde, hasta) {
  return consultarUna(
    `SELECT
        COUNT(*)                                   AS facturas,
        COALESCE(SUM(total), 0)                    AS facturado,
        COALESCE(SUM(pagado), 0)                   AS cobrado,
        COALESCE(SUM(total - pagado), 0)           AS por_cobrar,
        COALESCE(SUM(descuento), 0)                AS descuentos,
        COALESCE(SUM(impuestos), 0)                AS impuestos,
        COALESCE(AVG(total), 0)                    AS ticket_promedio
       FROM facturas
      WHERE estado <> 'anulada' AND fecha BETWEEN ?::date AND ?::date`,
    [desde, hasta]
  );
}

/**
 * Serie temporal de la facturación. La agrupación llega validada como 'dia' o
 * 'mes' desde el esquema; se interpola porque date_trunc no admite parámetro
 * en esa posición.
 */
async function serieIngresos(desde, hasta, agrupacion = 'dia') {
  const unidad = agrupacion === 'mes' ? 'month' : 'day';
  const formato = agrupacion === 'mes' ? 'YYYY-MM' : 'YYYY-MM-DD';

  return consultar(
    `SELECT to_char(date_trunc('${unidad}', fecha), '${formato}') AS periodo,
            COUNT(*)                AS facturas,
            COALESCE(SUM(total), 0) AS facturado,
            COALESCE(SUM(pagado), 0) AS cobrado
       FROM facturas
      WHERE estado <> 'anulada' AND fecha BETWEEN ?::date AND ?::date
      GROUP BY 1
      ORDER BY 1`,
    [desde, hasta]
  );
}

async function citas(desde, hasta) {
  return consultarUna(
    `SELECT
        COUNT(*)                                        AS total,
        COUNT(*) FILTER (WHERE estado = 'atendida')     AS atendidas,
        COUNT(*) FILTER (WHERE estado = 'cancelada')    AS canceladas,
        COUNT(*) FILTER (WHERE estado = 'no_asistio')   AS no_asistio,
        COUNT(*) FILTER (WHERE estado IN ('pendiente','confirmada')) AS abiertas,
        COUNT(DISTINCT mascota_id)                      AS pacientes,
        COUNT(DISTINCT cliente_id)                      AS clientes
       FROM citas
      WHERE inicio::date BETWEEN ?::date AND ?::date`,
    [desde, hasta]
  );
}

async function serieCitas(desde, hasta, agrupacion = 'dia') {
  const unidad = agrupacion === 'mes' ? 'month' : 'day';
  const formato = agrupacion === 'mes' ? 'YYYY-MM' : 'YYYY-MM-DD';

  return consultar(
    `SELECT to_char(date_trunc('${unidad}', inicio), '${formato}') AS periodo,
            COUNT(*)                                    AS total,
            COUNT(*) FILTER (WHERE estado = 'atendida') AS atendidas
       FROM citas
      WHERE inicio::date BETWEEN ?::date AND ?::date
      GROUP BY 1
      ORDER BY 1`,
    [desde, hasta]
  );
}

async function serviciosMasPedidos(desde, hasta, limite = 8) {
  return consultar(
    `SELECT s.id, s.nombre, s.precio,
            COUNT(c.id)                                     AS citas,
            COUNT(c.id) FILTER (WHERE c.estado = 'atendida') AS atendidas,
            COALESCE(SUM(s.precio) FILTER (WHERE c.estado = 'atendida'), 0) AS ingreso_estimado
       FROM servicios s
       JOIN citas c ON c.servicio_id = s.id
        AND c.inicio::date BETWEEN ?::date AND ?::date
        AND c.estado <> 'cancelada'
      GROUP BY s.id, s.nombre, s.precio
      ORDER BY citas DESC, s.nombre
      LIMIT ${Number.parseInt(limite, 10) || 8}`,
    [desde, hasta]
  );
}

async function rendimientoVeterinarios(desde, hasta) {
  return consultar(
    `SELECT v.id, u.nombre, v.especialidad,
            COUNT(c.id)                                      AS citas,
            COUNT(c.id) FILTER (WHERE c.estado = 'atendida')  AS atendidas,
            COUNT(c.id) FILTER (WHERE c.estado = 'no_asistio') AS no_asistio,
            (SELECT COUNT(*) FROM consultas co
              WHERE co.veterinario_id = v.id
                AND co.fecha::date BETWEEN ?::date AND ?::date) AS consultas
       FROM veterinarios v
       JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN citas c ON c.veterinario_id = v.id
        AND c.inicio::date BETWEEN ?::date AND ?::date
      WHERE v.activo = 1
      GROUP BY v.id, u.nombre, v.especialidad
      ORDER BY atendidas DESC, u.nombre`,
    [desde, hasta, desde, hasta]
  );
}

async function productosMasVendidos(desde, hasta, limite = 8) {
  return consultar(
    `SELECT p.id, p.nombre, p.unidad,
            SUM(df.cantidad)    AS unidades,
            SUM(df.total_linea) AS ingresos
       FROM detalle_facturas df
       JOIN productos p ON p.id = df.producto_id
       JOIN facturas f  ON f.id = df.factura_id
      WHERE f.estado <> 'anulada' AND f.fecha BETWEEN ?::date AND ?::date
      GROUP BY p.id, p.nombre, p.unidad
      ORDER BY ingresos DESC
      LIMIT ${Number.parseInt(limite, 10) || 8}`,
    [desde, hasta]
  );
}

async function metodosDePago(desde, hasta) {
  return consultar(
    `SELECT pg.metodo, COUNT(*) AS pagos, COALESCE(SUM(pg.valor), 0) AS total
       FROM pagos pg
       JOIN facturas f ON f.id = pg.factura_id
      WHERE pg.estado = 'registrado' AND pg.fecha::date BETWEEN ?::date AND ?::date
      GROUP BY pg.metodo
      ORDER BY total DESC`,
    [desde, hasta]
  );
}

async function actividadClinica(desde, hasta) {
  return consultarUna(
    `SELECT
        (SELECT COUNT(*) FROM consultas WHERE fecha::date BETWEEN ?::date AND ?::date)                 AS consultas,
        (SELECT COUNT(*) FROM aplicaciones_vacunas WHERE fecha_aplicacion BETWEEN ?::date AND ?::date) AS vacunas,
        (SELECT COUNT(*) FROM examenes WHERE fecha_solicitud BETWEEN ?::date AND ?::date)              AS examenes,
        (SELECT COUNT(*) FROM cirugias WHERE fecha BETWEEN ?::date AND ?::date)                        AS cirugias,
        (SELECT COUNT(*) FROM mascotas WHERE creado_en::date BETWEEN ?::date AND ?::date)              AS pacientes_nuevos,
        (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id = u.rol_id
          WHERE r.nombre = 'cliente' AND u.creado_en::date BETWEEN ?::date AND ?::date)                AS clientes_nuevos`,
    [desde, hasta, desde, hasta, desde, hasta, desde, hasta, desde, hasta, desde, hasta]
  );
}

async function diagnosticosFrecuentes(desde, hasta, limite = 8) {
  return consultar(
    `SELECT COALESCE(cat.nombre, cd.descripcion) AS diagnostico,
            cat.categoria,
            COUNT(*) AS veces
       FROM consulta_diagnosticos cd
       JOIN consultas c ON c.id = cd.consulta_id
       LEFT JOIN catalogo_diagnosticos cat ON cat.id = cd.diagnostico_id
      WHERE c.fecha::date BETWEEN ?::date AND ?::date
      GROUP BY 1, 2
      ORDER BY veces DESC
      LIMIT ${Number.parseInt(limite, 10) || 8}`,
    [desde, hasta]
  );
}

/** Estado actual del inventario: no depende de la ventana de fechas. */
async function inventario() {
  return consultarUna(
    `SELECT
        COUNT(*) FILTER (WHERE activo = 1)                                  AS productos,
        COUNT(*) FILTER (WHERE activo = 1 AND cantidad <= stock_minimo)      AS stock_bajo,
        COUNT(*) FILTER (WHERE activo = 1 AND cantidad = 0)                  AS agotados,
        COALESCE(SUM(cantidad * precio_compra) FILTER (WHERE activo = 1), 0) AS valor_costo,
        COALESCE(SUM(cantidad * precio_venta)  FILTER (WHERE activo = 1), 0) AS valor_venta
       FROM productos`
  );
}

module.exports = {
  ingresos,
  serieIngresos,
  citas,
  serieCitas,
  serviciosMasPedidos,
  rendimientoVeterinarios,
  productosMasVendidos,
  metodosDePago,
  actividadClinica,
  diagnosticosFrecuentes,
  inventario,
};
