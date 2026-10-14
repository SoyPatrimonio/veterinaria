/* ============================================================
   Facturas del cliente — solo consulta
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  let facturas = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente'], ['facturas.ver_propias', 'facturas.ver_todas']);
    if (!usuario) return;

    H.prepararModal('modalFactura');
    $('#filtroEstado').addEventListener('change', recargar);

    await recargar();
  });

  async function recargar() {
    $('#listaFacturas').innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/facturas', { estado: $('#filtroEstado').value || undefined });
      facturas = datos.facturas;
    } catch (error) {
      $('#listaFacturas').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    pintarResumen();
    $('#listaFacturas').innerHTML = H.tablaFacturas(facturas);

    H.$$('[data-factura]').forEach((btn) => {
      btn.addEventListener('click', () => verFactura(Number(btn.dataset.factura)));
    });
  }

  function pintarResumen() {
    // El resumen se calcula sobre lo que hay en pantalla: el cliente tiene
    // pocas facturas y así no hace falta una petición más.
    const vivas = facturas.filter((f) => f.estado !== 'anulada');
    const saldo = vivas.reduce((suma, f) => suma + Number(f.saldo || 0), 0);
    const pagado = vivas.reduce((suma, f) => suma + Number(f.pagado || 0), 0);
    const pendientes = vivas.filter((f) => Number(f.saldo) > 0).length;

    $('#resumenCartera').innerHTML = `<div class="rejilla-metricas">
      <article class="metrica ${saldo > 0 ? 'acento' : ''}">
        <span class="metrica-icono"><svg class="icon"><use href="#icon-recibo"/></svg></span>
        <div><strong>${escapar(H.moneda(saldo))}</strong><span>Saldo pendiente</span></div>
      </article>
      <article class="metrica">
        <span class="metrica-icono"><svg class="icon"><use href="#icon-check"/></svg></span>
        <div><strong>${escapar(H.moneda(pagado))}</strong><span>Pagado en total</span></div>
      </article>
      <article class="metrica">
        <span class="metrica-icono"><svg class="icon"><use href="#icon-carpeta"/></svg></span>
        <div><strong>${escapar(pendientes)}</strong><span>Facturas por pagar</span></div>
      </article>
    </div>`;
  }

  async function verFactura(id) {
    $('#detalleFactura').innerHTML = H.cargando();
    H.abrirModal('modalFactura');

    try {
      const datos = await H.api.get(`/facturas/${id}`);
      $('#detalleFactura').innerHTML = H.detalleFactura(datos.factura, datos);
    } catch (error) {
      $('#detalleFactura').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }
})();
