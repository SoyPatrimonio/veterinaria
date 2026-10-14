/* ============================================================
   Piezas de facturación compartidas por el portal del cliente y
   el panel de administración.
   ============================================================ */

(function (global) {
  'use strict';

  const H = global.Huella;
  const { escapar } = H;

  const ETIQUETA_FACTURA = {
    pendiente: 'Pendiente',
    parcial: 'Abonada',
    pagada: 'Pagada',
    anulada: 'Anulada',
  };

  // Se reutilizan las insignias que ya existen para las citas: el verde de
  // "atendida" y el azul de "confirmada" significan lo mismo aquí (resuelto y
  // en curso), y así no hay dos paletas para lo mismo.
  const CLASE_FACTURA = {
    pendiente: 'insignia-pendiente',
    parcial: 'insignia-confirmada',
    pagada: 'insignia-atendida',
    anulada: 'insignia-cancelada',
  };

  const ETIQUETA_METODO = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    en_linea: 'Pago en línea',
  };

  function insigniaFactura(estado) {
    return `<span class="insignia ${CLASE_FACTURA[estado] || ''}">${escapar(ETIQUETA_FACTURA[estado] || estado)}</span>`;
  }

  function tablaFacturas(facturas, { conCliente = false } = {}) {
    if (!facturas.length) {
      return H.bloqueVacio('No hay facturas con ese criterio.', 'icon-recibo');
    }

    return `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr>
            <th>Número</th><th>Fecha</th>
            ${conCliente ? '<th>Cliente</th>' : '<th>Atención</th>'}
            <th>Total</th><th>Saldo</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${facturas.map((f) => `
            <tr>
              <td><strong>${escapar(f.numero)}</strong></td>
              <td>${escapar(H.fechaLarga(f.fecha))}</td>
              <td>
                ${conCliente ? escapar(f.cliente_nombre) : escapar(f.mascota_nombre || 'Atención en clínica')}
                ${conCliente && f.mascota_nombre ? `<br><span class="campo-ayuda">${escapar(f.mascota_nombre)}</span>` : ''}
              </td>
              <td>${escapar(H.moneda(f.total))}</td>
              <td>${Number(f.saldo) > 0 ? `<strong>${escapar(H.moneda(f.saldo))}</strong>` : '—'}</td>
              <td>${insigniaFactura(f.estado)}</td>
              <td class="acciones">
                <button type="button" class="btn btn-outline btn-sm" data-factura="${f.id}">Ver</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  /** Contenido del modal de una factura: líneas, pagos y devoluciones. */
  function detalleFactura(factura, { lineas, pagos, devoluciones }, acciones = '') {
    const pagosVivos = pagos.filter((p) => p.estado === 'registrado');

    return `
      <h3>Factura ${escapar(factura.numero)}</h3>
      <p class="modal-sub">
        ${escapar(H.fechaLarga(factura.fecha))} · ${escapar(factura.cliente_nombre)}
        ${factura.mascota_nombre ? ` · ${escapar(factura.mascota_nombre)}` : ''}
      </p>

      <div class="hito-pie" style="margin:0 0 16px">
        ${insigniaFactura(factura.estado)}
        ${factura.emitida_por ? `<span class="chip">Emitió ${escapar(factura.emitida_por)}</span>` : ''}
        ${factura.sede_nombre ? `<span class="chip">${escapar(factura.sede_nombre)}</span>` : ''}
      </div>

      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th>Concepto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead>
          <tbody>
            ${lineas.map((l) => `
              <tr>
                <td>
                  <strong>${escapar(l.descripcion)}</strong>
                  ${l.servicio || l.producto || l.examen
                    ? `<br><span class="campo-ayuda">${escapar(l.servicio || l.producto || l.examen)}</span>`
                    : ''}
                </td>
                <td>${escapar(Number(l.cantidad))}</td>
                <td>${escapar(H.moneda(l.precio_unit))}</td>
                <td>${escapar(H.moneda(l.total_linea))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="resumen-cita" style="margin-top:16px">
        <div><span>Subtotal</span><span>${escapar(H.moneda(factura.subtotal))}</span></div>
        ${Number(factura.descuento) > 0
          ? `<div><span>Descuento</span><span>− ${escapar(H.moneda(factura.descuento))}</span></div>` : ''}
        ${Number(factura.impuestos) > 0
          ? `<div><span>Impuestos</span><span>${escapar(H.moneda(factura.impuestos))}</span></div>` : ''}
        <div><span>Total</span><span>${escapar(H.moneda(factura.total))}</span></div>
        <div><span>Pagado</span><span>${escapar(H.moneda(factura.pagado))}</span></div>
        <div><span>Saldo</span><span>${escapar(H.moneda(factura.saldo))}</span></div>
      </div>

      ${factura.observaciones ? `<p class="campo-ayuda" style="margin-top:12px">${escapar(factura.observaciones)}</p>` : ''}

      <h4 style="font-family:var(--font-body);font-size:.9rem;margin:20px 0 10px">Pagos</h4>
      ${pagosVivos.length
        ? `<div class="lista-avisos">
            ${pagos.map((p) => `
              <div class="aviso-tarjeta" ${p.estado === 'anulado' ? 'style="opacity:.6"' : ''}>
                <svg class="icon"><use href="#icon-recibo"/></svg>
                <div class="aviso-cuerpo">
                  <h4>${escapar(H.moneda(p.valor))} · ${escapar(ETIQUETA_METODO[p.metodo] || p.metodo)}</h4>
                  <p>${escapar(p.referencia || 'Sin referencia')}${p.registrado_por ? ` · ${escapar(p.registrado_por)}` : ''}</p>
                  <span class="aviso-fecha">${escapar(H.fechaLarga(p.fecha))} ${escapar(H.hora12(p.fecha))}</span>
                </div>
                <div class="aviso-acciones">
                  ${p.estado === 'anulado'
                    ? '<span class="chip chip-error">Anulado</span>'
                    : `<span class="chip chip-exito">Registrado</span>
                       ${acciones.includes('pagos') ? `<button type="button" class="btn btn-peligro btn-sm" data-anular-pago="${p.id}">Anular</button>` : ''}`}
                </div>
              </div>`).join('')}
          </div>`
        : H.bloqueVacio('Todavía no se ha registrado ningún pago.', 'icon-recibo')}

      ${devoluciones.length ? `
        <h4 style="font-family:var(--font-body);font-size:.9rem;margin:20px 0 10px">Devoluciones</h4>
        <div class="lista-avisos">
          ${devoluciones.map((d) => `
            <div class="aviso-tarjeta">
              <svg class="icon"><use href="#icon-izquierda"/></svg>
              <div class="aviso-cuerpo">
                <h4>${escapar(d.numero)} · ${escapar(H.moneda(d.total))}</h4>
                <p>${escapar(d.motivo)}</p>
                <span class="aviso-fecha">${escapar(H.fechaLarga(d.fecha))}</span>
              </div>
            </div>`).join('')}
        </div>` : ''}`;
  }

  Object.assign(H, {
    ETIQUETA_FACTURA,
    ETIQUETA_METODO,
    insigniaFactura,
    tablaFacturas,
    detalleFactura,
  });
})(window);
