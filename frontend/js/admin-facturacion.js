/* ============================================================
   Administración — facturación, pagos y devoluciones
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  let facturas = [];
  let clientes = [];
  let servicios = [];
  let productos = [];
  let citasDelCliente = [];
  let facturaAbierta = null;
  let temporizador = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin'], ['facturas.ver_todas']);
    if (!usuario) return;

    ['modalFactura', 'modalDetalle', 'modalPago', 'modalDevolucion'].forEach(H.prepararModal);

    $('#btnNuevaFactura').addEventListener('click', abrirFormularioFactura);
    $('#formFactura').addEventListener('submit', guardarFactura);
    $('#formPago').addEventListener('submit', guardarPago);
    $('#formDevolucion').addEventListener('submit', guardarDevolucion);
    $('#selectCliente').addEventListener('change', cargarCitasDelCliente);
    $('#filtroEstado').addEventListener('change', recargar);
    $('#filtroDesde').addEventListener('change', recargar);
    $('#filtroHasta').addEventListener('change', recargar);

    $('#inputBusqueda').addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(recargar, 300);
    });

    H.$$('[data-agregar]').forEach((btn) => {
      btn.addEventListener('click', () => agregarLinea(btn.dataset.agregar));
    });

    // Los catálogos se piden una vez: se usan al armar cada factura y no
    // cambian mientras la pantalla está abierta.
    try {
      const [datosClientes, datosServicios, datosProductos] = await Promise.all([
        H.api.get('/clientes'),
        H.api.get('/servicios'),
        H.api.get('/inventario/productos', { limite: 200 }),
      ]);
      clientes = datosClientes.clientes;
      servicios = datosServicios.servicios;
      productos = datosProductos.productos;
    } catch (error) {
      console.error('[facturacion] no se pudieron cargar los catálogos:', error);
      H.toast('No se pudieron cargar clientes, servicios o productos.', 'error');
    }

    await Promise.all([recargar(), cargarResumen()]);
  });

  /* --------------------------------------------------------
     Listado
     -------------------------------------------------------- */

  async function recargar() {
    $('#listaFacturas').innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/facturas', {
        estado: $('#filtroEstado').value || undefined,
        busqueda: $('#inputBusqueda').value.trim() || undefined,
        desde: $('#filtroDesde').value || undefined,
        hasta: $('#filtroHasta').value || undefined,
        limite: 200,
      });
      facturas = datos.facturas;
    } catch (error) {
      $('#listaFacturas').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    $('#listaFacturas').innerHTML = H.tablaFacturas(facturas, { conCliente: true });
    H.$$('[data-factura]').forEach((btn) => {
      btn.addEventListener('click', () => verFactura(Number(btn.dataset.factura)));
    });
  }

  async function cargarResumen() {
    try {
      const { resumen } = await H.api.get('/facturas/resumen');

      $('#metricas').innerHTML = `<div class="rejilla-metricas">
        <article class="metrica ${Number(resumen.por_cobrar) > 0 ? 'acento' : ''}">
          <span class="metrica-icono"><svg class="icon"><use href="#icon-recibo"/></svg></span>
          <div><strong>${escapar(H.moneda(resumen.por_cobrar))}</strong><span>Por cobrar</span></div>
        </article>
        <article class="metrica">
          <span class="metrica-icono"><svg class="icon"><use href="#icon-grafica"/></svg></span>
          <div><strong>${escapar(H.moneda(resumen.cobrado_mes))}</strong><span>Cobrado este mes</span></div>
        </article>
        <article class="metrica">
          <span class="metrica-icono"><svg class="icon"><use href="#icon-carpeta"/></svg></span>
          <div><strong>${escapar(Number(resumen.pendientes) + Number(resumen.parciales))}</strong><span>Facturas abiertas</span></div>
        </article>
        <article class="metrica">
          <span class="metrica-icono"><svg class="icon"><use href="#icon-calendar"/></svg></span>
          <div><strong>${escapar(resumen.hoy)}</strong><span>Emitidas hoy</span></div>
        </article>
      </div>`;
    } catch (error) {
      console.warn('[facturacion] no se pudo cargar el resumen de cartera:', error);
    }
  }

  /* --------------------------------------------------------
     Detalle y acciones
     -------------------------------------------------------- */

  async function verFactura(id) {
    $('#detalleFactura').innerHTML = H.cargando();
    $('#accionesFactura').innerHTML = '';
    H.abrirModal('modalDetalle');

    try {
      const datos = await H.api.get(`/facturas/${id}`);
      facturaAbierta = datos;

      $('#detalleFactura').innerHTML = H.detalleFactura(datos.factura, datos, 'pagos');
      $('#accionesFactura').innerHTML = botonesDe(datos.factura);

      H.$$('[data-anular-pago]').forEach((btn) => {
        btn.addEventListener('click', () => anularPago(Number(btn.dataset.anularPago)));
      });
      const pagar = $('#btnAbrirPago');
      if (pagar) pagar.addEventListener('click', abrirFormularioPago);
      const anular = $('#btnAnularFactura');
      if (anular) anular.addEventListener('click', anularFactura);
      const devolver = $('#btnAbrirDevolucion');
      if (devolver) devolver.addEventListener('click', abrirFormularioDevolucion);
    } catch (error) {
      $('#detalleFactura').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  /**
   * Qué se puede hacer con la factura según su estado. Anular solo tiene
   * sentido antes del primer pago; después, lo que corresponde es una
   * devolución, y el servidor rechaza lo contrario.
   */
  function botonesDe(factura) {
    if (factura.estado === 'anulada') return '';

    const botones = [];
    if (Number(factura.saldo) > 0) {
      botones.push('<button type="button" class="btn btn-primary" id="btnAbrirPago">Registrar pago</button>');
    }
    if (Number(factura.pagado) > 0) {
      botones.push('<button type="button" class="btn btn-outline" id="btnAbrirDevolucion">Devolución</button>');
    } else {
      botones.push('<button type="button" class="btn btn-peligro" id="btnAnularFactura">Anular</button>');
    }
    return botones.join('');
  }

  function abrirFormularioPago() {
    const form = $('#formPago');
    H.limpiarError($('#errorPago'));
    form.reset();

    const factura = facturaAbierta.factura;
    $('#subtituloPago').textContent =
      `Factura ${factura.numero} · saldo pendiente ${H.moneda(factura.saldo)}`;
    form.valor.value = factura.saldo;
    form.valor.max = factura.saldo;

    H.abrirModal('modalPago');
  }

  async function guardarPago(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorPago');
    H.limpiarError(caja);

    const cuerpo = {
      metodo: form.metodo.value,
      valor: Number(form.valor.value),
      referencia: form.referencia.value.trim() || null,
    };

    await H.conBoton($('#btnGuardarPago'), 'Registrando…', async () => {
      try {
        await H.api.post(`/facturas/${facturaAbierta.factura.id}/pagos`, cuerpo);
        H.toast('Pago registrado.');
        H.cerrarModal('modalPago');
        await Promise.all([verFactura(facturaAbierta.factura.id), recargar(), cargarResumen()]);
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  async function anularPago(pagoId) {
    const ok = await H.confirmar('¿Anular este pago?\n\nLa factura volverá a quedar con saldo pendiente.');
    if (!ok) return;

    try {
      await H.api.del(`/facturas/${facturaAbierta.factura.id}/pagos/${pagoId}`);
      H.toast('Pago anulado.');
      await Promise.all([verFactura(facturaAbierta.factura.id), recargar(), cargarResumen()]);
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  async function anularFactura() {
    const motivo = await H.pedirTexto({
      titulo: 'Anular factura',
      detalle: 'Explica por qué se anula. Queda registrado junto con la factura.',
      etiqueta: 'Motivo de la anulación',
      boton: 'Anular factura',
    });
    if (!motivo) return;

    try {
      await H.api.post(`/facturas/${facturaAbierta.factura.id}/anular`, { motivo });
      H.toast('Factura anulada. Los productos volvieron al inventario.');
      H.cerrarModal('modalDetalle');
      await Promise.all([recargar(), cargarResumen()]);
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  function abrirFormularioDevolucion() {
    const form = $('#formDevolucion');
    H.limpiarError($('#errorDevolucion'));
    form.reset();

    $('#lineasDevolucion').innerHTML = facturaAbierta.lineas.map((l) => `
      <div class="fila-editable" data-linea="${l.id}">
        <div>
          <label class="campo-check" style="margin-bottom:9px">
            <input type="checkbox" data-campo="devolver"> ${escapar(l.descripcion)}
          </label>
          <div class="campos-fila">
            <label class="campo">
              <span>Cantidad</span>
              <input type="number" data-campo="cantidad" min="0.01" step="1" value="${escapar(Number(l.cantidad))}">
            </label>
            <label class="campo">
              <span>Valor a devolver</span>
              <input type="number" data-campo="valor" min="0" step="100" value="${escapar(Number(l.total_linea))}">
            </label>
          </div>
          ${l.producto_id
            ? '<label class="campo-check"><input type="checkbox" data-campo="reingresa" checked> Vuelve al inventario</label>'
            : ''}
        </div>
      </div>`).join('');

    H.abrirModal('modalDevolucion');
  }

  async function guardarDevolucion(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorDevolucion');
    H.limpiarError(caja);

    const lineas = H.$$('[data-linea]', $('#lineasDevolucion'))
      .filter((fila) => fila.querySelector('[data-campo="devolver"]').checked)
      .map((fila) => {
        const detalleId = Number(fila.dataset.linea);
        const original = facturaAbierta.lineas.find((l) => l.id === detalleId);
        const reingresa = fila.querySelector('[data-campo="reingresa"]');

        return {
          detalleId,
          descripcion: original.descripcion,
          cantidad: Number(fila.querySelector('[data-campo="cantidad"]').value || 1),
          valor: Number(fila.querySelector('[data-campo="valor"]').value || 0),
          reingresaStock: Boolean(reingresa && reingresa.checked),
        };
      });

    if (!lineas.length) return H.mostrarError(caja, new Error('Marca al menos un concepto para devolver.'));

    await H.conBoton($('#btnGuardarDevolucion'), 'Registrando…', async () => {
      try {
        await H.api.post(`/facturas/${facturaAbierta.factura.id}/devoluciones`, {
          motivo: form.motivo.value.trim(),
          lineas,
        });
        H.toast('Devolución registrada.');
        H.cerrarModal('modalDevolucion');
        await Promise.all([verFactura(facturaAbierta.factura.id), recargar(), cargarResumen()]);
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Nueva factura
     -------------------------------------------------------- */

  function abrirFormularioFactura() {
    const form = $('#formFactura');
    H.limpiarError($('#errorFactura'));
    form.reset();

    // El listado de clientes devuelve cliente_id: es el que espera la factura,
    // no el id de la cuenta de usuario.
    $('#selectCliente').innerHTML = clientes
      .map((c) => `<option value="${c.cliente_id}">${escapar(c.nombre)}${c.documento ? ` — ${escapar(c.documento)}` : ''}</option>`)
      .join('');

    $('#filasFactura').innerHTML = '';
    agregarLinea('servicio');
    recalcular();
    cargarCitasDelCliente();

    H.abrirModal('modalFactura');
  }

  /**
   * Citas atendidas del cliente que todavía no se han facturado. Elegir una
   * precarga su servicio como primera línea, que es el caso más común.
   */
  async function cargarCitasDelCliente() {
    const clienteId = Number($('#selectCliente').value);
    const selector = $('#selectCitaFactura');
    selector.innerHTML = '<option value="">Sin cita asociada</option>';
    if (!clienteId) return;

    try {
      const facturadas = new Set(facturas.map((f) => f.cita_id).filter(Boolean));
      const datos = await H.api.get('/citas', { limite: 200 });

      citasDelCliente = datos.citas.filter(
        (c) => c.cliente_id === clienteId && !facturadas.has(c.id) && c.estado === 'atendida'
      );

      selector.innerHTML += citasDelCliente.map((c) => `
        <option value="${c.id}">
          ${escapar(H.fechaLarga(c.inicio))} — ${escapar(c.servicio_nombre)} (${escapar(c.mascota_nombre)})
        </option>`).join('');
    } catch (error) {
      console.warn('[facturacion] no se pudieron cargar las citas del cliente:', error);
    }

    selector.onchange = () => {
      const cita = citasDelCliente.find((c) => c.id === Number(selector.value));
      if (!cita) return;

      $('#filasFactura').innerHTML = '';
      agregarLinea('servicio', {
        servicioId: cita.servicio_id,
        descripcion: cita.servicio_nombre,
        precioUnit: cita.precio,
      });
      recalcular();
    };
  }

  function agregarLinea(tipo, valores = {}) {
    const fila = document.createElement('div');
    fila.className = 'fila-editable';
    fila.dataset.linea = tipo;

    const opciones = tipo === 'servicio'
      ? servicios.map((s) => `<option value="${s.id}" data-precio="${s.precio}">${escapar(s.nombre)}</option>`).join('')
      : tipo === 'producto'
        ? productos.map((p) => `<option value="${p.id}" data-precio="${p.precio_venta}">
              ${escapar(p.nombre)} (${escapar(p.cantidad)} disponibles)</option>`).join('')
        : '';

    fila.innerHTML = `
      <div>
        ${tipo !== 'libre' ? `
          <label class="campo">
            <span>${tipo === 'servicio' ? 'Servicio' : 'Producto'} *</span>
            <select data-campo="referencia"><option value="">Elige uno</option>${opciones}</select>
          </label>` : ''}
        <label class="campo">
          <span>Descripción *</span>
          <input type="text" data-campo="descripcion" maxlength="180" value="${escapar(valores.descripcion || '')}">
        </label>
        <div class="campos-fila-3">
          <label class="campo">
            <span>Cantidad</span>
            <input type="number" data-campo="cantidad" min="0.01" step="1" value="1">
          </label>
          <label class="campo">
            <span>Precio</span>
            <input type="number" data-campo="precioUnit" min="0" step="100" value="${escapar(valores.precioUnit || 0)}">
          </label>
          <label class="campo">
            <span>Impuesto</span>
            <input type="number" data-campo="impuesto" min="0" step="100" value="0">
          </label>
        </div>
      </div>
      <button type="button" class="btn btn-peligro btn-sm" data-quitar>Quitar</button>`;

    const select = fila.querySelector('[data-campo="referencia"]');
    if (select) {
      if (valores.servicioId) select.value = String(valores.servicioId);

      select.addEventListener('change', () => {
        const opcion = select.options[select.selectedIndex];
        fila.querySelector('[data-campo="precioUnit"]').value = opcion.dataset.precio || 0;
        const descripcion = fila.querySelector('[data-campo="descripcion"]');
        if (!descripcion.value.trim()) descripcion.value = opcion.textContent.trim().replace(/\s*\(.*\)$/, '');
        recalcular();
      });
    }

    fila.querySelectorAll('input').forEach((campo) => campo.addEventListener('input', recalcular));
    fila.querySelector('[data-quitar]').addEventListener('click', () => {
      fila.remove();
      recalcular();
    });

    $('#filasFactura').appendChild(fila);
  }

  function leerLineas() {
    return H.$$('[data-linea]', $('#filasFactura')).map((fila) => {
      const tipo = fila.dataset.linea;
      const valor = (campo) => {
        const elemento = fila.querySelector(`[data-campo="${campo}"]`);
        return elemento ? elemento.value.trim() : '';
      };

      const referencia = valor('referencia') ? Number(valor('referencia')) : null;

      return {
        servicioId: tipo === 'servicio' ? referencia : null,
        productoId: tipo === 'producto' ? referencia : null,
        descripcion: valor('descripcion'),
        cantidad: Number(valor('cantidad') || 1),
        precioUnit: Number(valor('precioUnit') || 0),
        impuesto: Number(valor('impuesto') || 0),
        descuento: 0,
      };
    }).filter((l) => l.descripcion);
  }

  /**
   * Los mismos totales que calcula el servidor. Se repiten aquí para que el
   * cajero vea el importe antes de emitir; el que vale es el del backend.
   */
  function recalcular() {
    const lineas = leerLineas();
    const subtotal = lineas.reduce((suma, l) => suma + l.cantidad * l.precioUnit, 0);
    const impuestos = lineas.reduce((suma, l) => suma + l.impuesto, 0);
    const descuento = Number($('#formFactura').descuento.value || 0);

    $('#totalesFactura').innerHTML = `
      <div><span>Subtotal</span><span>${escapar(H.moneda(subtotal))}</span></div>
      <div><span>Descuento</span><span>− ${escapar(H.moneda(descuento))}</span></div>
      <div><span>Impuestos</span><span>${escapar(H.moneda(impuestos))}</span></div>
      <div><span>Total</span><span>${escapar(H.moneda(subtotal - descuento + impuestos))}</span></div>`;
  }

  async function guardarFactura(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorFactura');
    H.limpiarError(caja);

    const lineas = leerLineas();
    if (!lineas.length) return H.mostrarError(caja, new Error('Añade al menos un concepto a la factura.'));

    const cuerpo = {
      clienteId: Number(form.clienteId.value),
      citaId: form.citaId.value ? Number(form.citaId.value) : null,
      descuento: Number(form.descuento.value || 0),
      observaciones: form.observaciones.value.trim() || null,
      lineas,
    };

    await H.conBoton($('#btnGuardarFactura'), 'Emitiendo…', async () => {
      try {
        const datos = await H.api.post('/facturas', cuerpo);
        H.toast(`Factura ${datos.factura.numero} emitida.`);
        H.cerrarModal('modalFactura');
        await Promise.all([recargar(), cargarResumen()]);
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  // El descuento global también mueve los totales de la vista previa.
  document.addEventListener('input', (evento) => {
    if (evento.target.name === 'descuento') recalcular();
  });
})();
