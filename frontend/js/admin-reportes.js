/* ============================================================
   Administración — reportes de la clínica
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  // Esta pantalla no carga factura-ui.js —no pinta facturas—, así que trae su
  // propia traducción de los métodos de pago.
  const ETIQUETA_METODO = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    en_linea: 'Pago en línea',
  };

  let datos = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin'], ['reportes.ver']);
    if (!usuario) return;

    $('#filtroDesde').addEventListener('change', cargar);
    $('#filtroHasta').addEventListener('change', cargar);
    $('#filtroAgrupacion').addEventListener('change', cargar);
    $('#btnDescargar').addEventListener('click', descargarCSV);

    $('#atajos').addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-dias]');
      if (!boton) return;

      H.$$('#atajos button').forEach((b) => b.classList.toggle('activo', b === boton));
      aplicarAtajo(Number(boton.dataset.dias));
    });

    aplicarAtajo(30);
  });

  /** Rellena las fechas con los últimos N días y recarga. */
  function aplicarAtajo(dias) {
    const hasta = H.fechaHoyISO();
    $('#filtroHasta').value = hasta;
    $('#filtroDesde').value = H.sumarDiasISO(hasta, -dias);
    // Con un año por días saldrían 365 puntos ilegibles: se agrupa por mes.
    $('#filtroAgrupacion').value = dias > 120 ? 'mes' : 'dia';
    cargar();
  }

  async function cargar() {
    $('#metricas').innerHTML = H.cargando();

    try {
      datos = await H.api.get('/reportes', {
        desde: $('#filtroDesde').value || undefined,
        hasta: $('#filtroHasta').value || undefined,
        agrupacion: $('#filtroAgrupacion').value,
      });
    } catch (error) {
      $('#metricas').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    pintarMetricas();
    pintarGraficas();
    pintarRankings();
  }

  function pintarMetricas() {
    const { ingresos, citas, inventario } = datos;

    $('#metricas').innerHTML = `<div class="rejilla-metricas">
      ${metrica('icon-grafica', H.moneda(ingresos.facturado), 'Facturado')}
      ${metrica('icon-recibo', H.moneda(ingresos.cobrado), 'Cobrado')}
      ${metrica('icon-alerta', H.moneda(ingresos.por_cobrar), 'Por cobrar',
        Number(ingresos.por_cobrar) > 0 ? 'acento' : '')}
      ${metrica('icon-calendar', citas.atendidas, 'Citas atendidas')}
      ${metrica('icon-users', citas.clientes, 'Clientes atendidos')}
      ${metrica('icon-caja', H.moneda(inventario.valor_costo), 'Inventario al costo')}
    </div>`;
  }

  function metrica(icono, valor, texto, clase = '') {
    return `<article class="metrica ${clase}">
      <span class="metrica-icono"><svg class="icon"><use href="#${icono}"/></svg></span>
      <div><strong>${escapar(valor)}</strong><span>${escapar(texto)}</span></div>
    </article>`;
  }

  function pintarGraficas() {
    const ingresos = datos.series.ingresos.map((f) => ({
      etiqueta: etiquetaPeriodo(f.periodo),
      valores: [Number(f.facturado), Number(f.cobrado)],
    }));

    $('#graficaIngresos').innerHTML = H.graficaLineas(
      ingresos,
      [{ nombre: 'Facturado' }, { nombre: 'Cobrado' }],
      { titulo: 'Facturación del periodo', vacio: 'No se emitieron facturas en este periodo.' }
    );

    const citas = datos.series.citas.map((c) => ({
      etiqueta: etiquetaPeriodo(c.periodo),
      valores: [Number(c.total), Number(c.atendidas)],
    }));

    $('#graficaCitas').innerHTML = H.graficaLineas(
      citas,
      [{ nombre: 'Agendadas' }, { nombre: 'Atendidas' }],
      { titulo: 'Citas del periodo', vacio: 'No hubo citas en este periodo.' }
    );

    // El desglose por método de pago dice de dónde entra la plata, que es lo
    // que decide si hace falta datáfono o no.
    const total = datos.metodosPago.reduce((suma, m) => suma + Number(m.total), 0);
    $('#metodosPago').innerHTML = datos.metodosPago.length
      ? H.ranking(datos.metodosPago.map((m) => ({
        nombre: ETIQUETA_METODO[m.metodo] || m.metodo,
        valor: Number(m.total),
        texto: `${H.moneda(m.total)} · ${total ? Math.round((m.total / total) * 100) : 0}%`,
      })))
      : H.bloqueVacio('No se registraron pagos en este periodo.', 'icon-recibo');

    const a = datos.actividad;
    $('#actividad').innerHTML = `<div class="constantes">
      <div class="constante"><span>Consultas</span><strong>${escapar(a.consultas)}</strong></div>
      <div class="constante"><span>Vacunas</span><strong>${escapar(a.vacunas)}</strong></div>
      <div class="constante"><span>Exámenes</span><strong>${escapar(a.examenes)}</strong></div>
      <div class="constante"><span>Cirugías</span><strong>${escapar(a.cirugias)}</strong></div>
      <div class="constante"><span>Pacientes nuevos</span><strong>${escapar(a.pacientes_nuevos)}</strong></div>
      <div class="constante"><span>Clientes nuevos</span><strong>${escapar(a.clientes_nuevos)}</strong></div>
    </div>
    <div class="constantes" style="margin-top:14px">
      <div class="constante"><span>Canceladas</span><strong>${escapar(datos.citas.canceladas)}</strong></div>
      <div class="constante"><span>No asistió</span><strong>${escapar(datos.citas.no_asistio)}</strong></div>
      <div class="constante"><span>Ticket promedio</span><strong>${escapar(H.moneda(datos.ingresos.ticket_promedio))}</strong></div>
    </div>`;
  }

  function pintarRankings() {
    $('#rankingServicios').innerHTML = H.ranking(
      datos.rankings.servicios.map((s) => ({
        nombre: s.nombre,
        valor: Number(s.citas),
        texto: `${s.citas} citas · ${H.moneda(s.ingreso_estimado)}`,
      })),
      { vacio: 'No hubo citas de ningún servicio.' }
    );

    $('#rankingProductos').innerHTML = H.ranking(
      datos.rankings.productos.map((p) => ({
        nombre: p.nombre,
        valor: Number(p.ingresos),
        texto: `${Number(p.unidades)} ${p.unidad}(s) · ${H.moneda(p.ingresos)}`,
      })),
      { vacio: 'No se vendieron productos en este periodo.' }
    );

    $('#rankingDiagnosticos').innerHTML = H.ranking(
      datos.rankings.diagnosticos.map((d) => ({
        nombre: d.diagnostico,
        valor: Number(d.veces),
        texto: `${d.veces} ${Number(d.veces) === 1 ? 'vez' : 'veces'}`,
      })),
      { vacio: 'No se registraron diagnósticos en este periodo.' }
    );

    $('#tablaVeterinarios').innerHTML = datos.rankings.veterinarios.length
      ? `<div class="tabla-envoltura">
          <table class="tabla">
            <thead><tr><th>Veterinario</th><th>Citas</th><th>Atendidas</th><th>Consultas</th><th>No asistió</th></tr></thead>
            <tbody>
              ${datos.rankings.veterinarios.map((v) => `
                <tr>
                  <td>
                    <strong>${escapar(v.nombre)}</strong>
                    <br><span class="campo-ayuda">${escapar(H.ETIQUETA_ESPECIALIDAD[v.especialidad] || v.especialidad)}</span>
                  </td>
                  <td>${escapar(v.citas)}</td>
                  <td><strong>${escapar(v.atendidas)}</strong></td>
                  <td>${escapar(v.consultas)}</td>
                  <td>${escapar(v.no_asistio)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`
      : H.bloqueVacio('Sin actividad del equipo en este periodo.', 'icon-stetho');
  }

  /** '2026-08-11' -> '11/08'; '2026-08' -> '08/2026'. */
  function etiquetaPeriodo(periodo) {
    const partes = String(periodo).split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}` : `${partes[1]}/${partes[0]}`;
  }

  /**
   * Descarga la serie del periodo como CSV.
   *
   * Se arma en el navegador con lo que ya está en pantalla: pedirle al
   * servidor un formato más sería una ruta nueva para los mismos datos. El
   * separador es el punto y coma porque es lo que espera Excel en español.
   */
  function descargarCSV() {
    if (!datos) return;

    const filas = [
      ['Periodo', 'Facturas', 'Facturado', 'Cobrado', 'Citas', 'Atendidas'],
      ...datos.series.ingresos.map((f) => {
        const citas = datos.series.citas.find((c) => c.periodo === f.periodo);
        return [f.periodo, f.facturas, f.facturado, f.cobrado, citas?.total ?? 0, citas?.atendidas ?? 0];
      }),
    ];

    // El BOM hace que Excel abra el archivo como UTF-8 y no parta las tildes.
    const contenido = `﻿${filas.map((fila) => fila.join(';')).join('\n')}`;
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }));
    enlace.download = `huellitas-reporte-${datos.rango.desde}-a-${datos.rango.hasta}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);

    H.toast('Reporte descargado.');
  }
})();
