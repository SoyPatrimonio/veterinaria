/* ============================================================
   Mis pedidos — estado y seguimiento del domicilio
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  const PASOS = ['pendiente', 'confirmado', 'preparando', 'enviado', 'entregado'];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente'], ['pedidos.ver_propios']);
    if (!usuario) return;

    H.prepararModal('modal');
    await recargar();
  });

  async function recargar() {
    $('#contenido').innerHTML = H.cargando();
    try {
      const datos = await H.api.get('/tienda/pedidos', { limite: 50 });
      pintar(datos.pedidos || []);
    } catch (error) {
      $('#contenido').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar(pedidos) {
    if (!pedidos.length) {
      $('#contenido').innerHTML = H.bloqueVacio('Todavía no has hecho ningún pedido.', 'icon-caja');
      return;
    }

    $('#contenido').innerHTML = pedidos.map((p) => {
      const indice = PASOS.indexOf(p.estado);
      const cancelado = p.estado === 'cancelado';

      // Barra de pasos: se ve de un vistazo dónde va el pedido sin leer nada.
      const pasos = cancelado
        ? '<span class="chip chip-error">cancelado</span>'
        : PASOS.map((paso, i) => `
            <span class="paso-chip ${i <= indice ? 'activo' : ''}">${escapar(paso)}</span>`).join('');

      return `<article class="cita" data-id="${p.id}">
        <div class="cita-hora">
          <strong>${escapar(p.numero)}</strong>
          <small>${escapar(H.fechaLarga(p.creado_en))}</small>
        </div>
        <div class="cita-info">
          <h4>${escapar(H.moneda(p.total))} · ${escapar(p.entrega === 'domicilio' ? 'a domicilio' : 'recoges en sede')}</h4>
          <div class="pasos">${pasos}</div>
          <p class="campo-ayuda">
            Pago: ${escapar(p.estado_pago)}
            ${p.hora_estimada ? ` · llega hacia las ${escapar(H.hora12(p.hora_estimada))}` : ''}
          </p>
        </div>
        <div class="cita-lado">
          <button type="button" class="btn btn-outline btn-sm" data-abrir="${p.id}">Ver detalle</button>
        </div>
      </article>`;
    }).join('');

    H.$$('#contenido [data-abrir]').forEach((b) => {
      b.addEventListener('click', () => abrirDetalle(Number(b.dataset.abrir)));
    });
  }

  async function abrirDetalle(id) {
    H.limpiarError($('#errorModal'));
    $('#cuerpoModal').innerHTML = H.cargando();
    H.abrirModal('modal');

    let datos;
    try {
      datos = await H.api.get(`/tienda/pedidos/${id}`);
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    const p = datos.pedido;
    $('#tituloModal').textContent = p.numero;
    $('#subModal').innerHTML = `${M.estado(p.estado)} · pago ${M.estado(p.estado_pago)}`;

    $('#cuerpoModal').innerHTML = `
      ${M.tabla(datos.items || [], [
        { titulo: 'Artículo', campo: 'descripcion' },
        { titulo: 'Cantidad', campo: 'cantidad' },
        { titulo: 'Total', valor: (i) => escapar(H.moneda(i.total_linea)) },
      ], { vacio: 'Sin artículos.', icono: 'icon-caja' })}

      <dl class="constantes" style="margin-top:14px">
        <div class="constante"><dt>Subtotal</dt><dd>${escapar(H.moneda(p.subtotal))}</dd></div>
        ${Number(p.descuento) ? `<div class="constante"><dt>Descuento</dt><dd>-${escapar(H.moneda(p.descuento))}</dd></div>` : ''}
        ${Number(p.envio) ? `<div class="constante"><dt>Envío</dt><dd>${escapar(H.moneda(p.envio))}</dd></div>` : ''}
        <div class="constante"><dt>Total</dt><dd><strong>${escapar(H.moneda(p.total))}</strong></dd></div>
      </dl>

      <h4 class="titulo-modulo" style="margin-top:20px">Seguimiento</h4>
      ${(datos.seguimiento || []).length
        ? `<div class="linea-tiempo">${datos.seguimiento.map((s) => `
            <article class="hito">
              <div class="hito-cabecera">
                <strong>${escapar(String(s.estado).replace('_', ' '))}</strong>
                <span class="hito-fecha">${M.cuando(s.fecha, true)}</span>
              </div>
              ${s.nota ? `<div class="hito-cuerpo">${escapar(s.nota)}</div>` : ''}
            </article>`).join('')}</div>`
        : `<div class="linea-tiempo">${(datos.historial || []).map((h) => `
            <article class="hito">
              <div class="hito-cabecera">
                <strong>${escapar(String(h.estado).replace('_', ' '))}</strong>
                <span class="hito-fecha">${M.cuando(h.creado_en, true)}</span>
              </div>
              ${h.nota ? `<div class="hito-cuerpo">${escapar(h.nota)}</div>` : ''}
            </article>`).join('')}</div>`}

      ${p.estado_pago === 'pendiente' && H.puede('pagos.en_linea')
        ? `<div class="modal-acciones">
            <button type="button" class="btn btn-primary" id="btnPagar">Pagar en línea</button>
          </div>` : ''}`;

    const btnPagar = $('#btnPagar');
    if (btnPagar) btnPagar.addEventListener('click', () => iniciarPago(p.id));
  }

  async function iniciarPago(pedidoId) {
    try {
      const metodos = await H.api.get('/integraciones/pagos/metodos');
      const disponibles = metodos.metodos || [];

      if (!disponibles.length) {
        // Se dice claro en vez de abrir una pasarela que no va a responder.
        return H.toast('El pago en línea todavía no está habilitado. Escríbenos y coordinamos.', 'error');
      }

      const datos = await H.api.post('/integraciones/pagos', {
        pasarelaId: disponibles[0].id,
        pedidoId,
      });

      H.toast(datos.mensaje || 'Transacción iniciada.');
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }
})();
