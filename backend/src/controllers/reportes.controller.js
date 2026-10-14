'use strict';

const asyncHandler = require('../utils/asyncHandler');
const reporteModel = require('../models/reporte.model');

// La ventana de fechas la resuelve utils/fechas: la usan también el tablero de
// personal y el de inteligencia de negocio, y las tres tienen que tratar igual
// un rango sin fechas o al revés.
const { resolverRango } = require('../utils/fechas');

/** GET /api/reportes — todos los indicadores de una ventana de fechas. */
const resumen = asyncHandler(async (req, res) => {
  const { agrupacion } = req.consulta || {};
  const rango = resolverRango(req.consulta);

  const [
    ingresos,
    serieIngresos,
    citas,
    serieCitas,
    servicios,
    veterinarios,
    productos,
    metodosPago,
    actividad,
    diagnosticos,
    inventario,
  ] = await Promise.all([
    reporteModel.ingresos(rango.desde, rango.hasta),
    reporteModel.serieIngresos(rango.desde, rango.hasta, agrupacion),
    reporteModel.citas(rango.desde, rango.hasta),
    reporteModel.serieCitas(rango.desde, rango.hasta, agrupacion),
    reporteModel.serviciosMasPedidos(rango.desde, rango.hasta),
    reporteModel.rendimientoVeterinarios(rango.desde, rango.hasta),
    reporteModel.productosMasVendidos(rango.desde, rango.hasta),
    reporteModel.metodosDePago(rango.desde, rango.hasta),
    reporteModel.actividadClinica(rango.desde, rango.hasta),
    reporteModel.diagnosticosFrecuentes(rango.desde, rango.hasta),
    reporteModel.inventario(),
  ]);

  res.json({
    ok: true,
    rango: { ...rango, agrupacion: agrupacion || 'dia' },
    ingresos,
    citas,
    actividad,
    inventario,
    series: { ingresos: serieIngresos, citas: serieCitas },
    rankings: { servicios, veterinarios, productos, diagnosticos },
    metodosPago,
  });
});

module.exports = { resumen, resolverRango };
