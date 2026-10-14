/* ============================================================
   Farmacia — recetas, dispensación, interacciones y control especial

   La receta y la dispensación son dos cosas distintas: se puede
   recetar y que el dueño compre fuera, o entregar solo parte. Por
   eso el estado de la receta lo calcula la base a partir de lo que
   realmente se entregó, no un botón.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const SEVERIDAD_INTERACCION = {
    leve: 'Leve',
    moderada: 'Moderada',
    grave: 'Grave',
    contraindicada: 'Contraindicada',
  };

  let recetaAbierta = null;
  let productos = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin', 'veterinario'], ['farmacia.dispensar', 'recetas.ver_todas']);
    if (!usuario) return;

    H.prepararModal('modalDispensar');

    $('#pestanas').addEventListener('click', (e) => {
      const boton = e.target.closest('[data-pestana]');
      if (boton) mostrar(boton.dataset.pestana);
    });

    await mostrar('recetas');
  });

  async function mostrar(nombre) {
    H.$$('#pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.pestana === nombre));
    $('#contenido').innerHTML = H.cargando();

    const vistas = {
      recetas: vistaRecetas,
      dispensaciones: vistaDispensaciones,
      inventario: vistaInventario,
      interacciones: vistaInteracciones,
      restringidos: vistaRestringidos,
    };

    try {
      await (vistas[nombre] || vistaRecetas)();
    } catch (error) {
      $('#contenido').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  /* --------------------------------------------------------
     Recetas
     -------------------------------------------------------- */

  async function vistaRecetas() {
    const datos = await H.api.get('/farmacia/recetas', { limite: 100 });
    const recetas = datos.recetas || [];

    if (!recetas.length) {
      $('#contenido').innerHTML = H.bloqueVacio('No hay recetas emitidas.', 'icon-syringe');
      return;
    }

    $('#contenido').innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr><th>Receta</th><th>Paciente</th><th>Veterinario</th><th>Fecha</th><th>Vigencia</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          ${recetas.map((r) => {
            const vencida = r.vigente_hasta && r.vigente_hasta < H.fechaHoyISO();
            return `<tr>
              <td><strong>${escapar(r.numero)}</strong></td>
              <td>${escapar(r.mascota || '—')}</td>
              <td>${escapar(r.veterinario || '—')}</td>
              <td>${escapar(H.fechaLarga(r.fecha))}</td>
              <td class="${vencida ? 'texto-alerta' : ''}">
                ${r.vigente_hasta ? escapar(H.fechaLarga(r.vigente_hasta)) : 'sin límite'}
              </td>
              <td><span class="insignia insignia-${escapar(r.estado)}">${escapar(r.estado)}</span></td>
              <td class="acciones">
                ${['emitida', 'parcial'].includes(r.estado) && H.puede('farmacia.dispensar')
                  ? `<button type="button" class="btn btn-primary btn-sm" data-dispensar="${r.id}">Dispensar</button>`
                  : `<button type="button" class="btn btn-outline btn-sm" data-ver="${r.id}">Ver</button>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

    H.$$('#contenido [data-dispensar]').forEach((b) => {
      b.addEventListener('click', () => abrirDispensar(Number(b.dataset.dispensar)));
    });
    H.$$('#contenido [data-ver]').forEach((b) => {
      b.addEventListener('click', () => abrirDispensar(Number(b.dataset.ver), true));
    });
  }

  async function abrirDispensar(id, soloLectura = false) {
    H.limpiarError($('#errorDispensar'));
    $('#cuerpoDispensar').innerHTML = H.cargando();
    H.abrirModal('modalDispensar');

    try {
      recetaAbierta = await H.api.get(`/farmacia/recetas/${id}`);
      if (!productos.length) {
        const inventario = await H.api.get('/farmacia/inventario');
        productos = inventario.productos || [];
      }
    } catch (error) {
      $('#cuerpoDispensar').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    pintarDispensar(soloLectura);
  }

  function pintarDispensar(soloLectura) {
    const r = recetaAbierta.receta;
    const items = recetaAbierta.items || [];
    const avisos = recetaAbierta.avisos || {};

    $('#tituloDispensar').textContent = `${r.numero} — ${r.mascota || ''}`;
    $('#subDispensar').innerHTML =
      `${escapar(H.fechaLarga(r.fecha))} · ${escapar(r.veterinario || '')}` +
      ` · <span class="insignia insignia-${escapar(r.estado)}">${escapar(r.estado)}</span>` +
      (r.indicaciones ? `<br><span class="campo-ayuda">${escapar(r.indicaciones)}</span>` : '');

    // Los avisos van arriba del todo: si el paciente es alérgico a algo de
    // esta receta, hay que verlo ANTES de empezar a contar cajas.
    const alertas = [
      ...(avisos.alergias || []).map((a) => ({
        tono: 'critica',
        titulo: `Alergia registrada: ${a.alergeno}`,
        texto: `${a.severidad}${a.reaccion ? ` · ${a.reaccion}` : ''}`,
      })),
      ...(avisos.interacciones || []).map((i) => ({
        tono: i.severidad === 'contraindicada' ? 'critica' : 'alta',
        titulo: `Interacción ${i.severidad}: ${i.principio_a} + ${i.principio_b}`,
        texto: `${i.efecto}${i.recomendacion ? ` · ${i.recomendacion}` : ''}`,
      })),
    ];

    const bloqueAlertas = alertas.length
      ? alertas.map((a) => `
        <div class="alerta alerta-${a.tono}">
          <div class="alerta-cuerpo">
            <h4>${escapar(a.titulo)}</h4>
            <p>${escapar(a.texto)}</p>
          </div>
        </div>`).join('')
      : '';

    const filas = items.map((it, indice) => {
      const pendiente = Number(it.cantidad) - Number(it.dispensado);

      return `<tr>
        <td>
          <strong>${escapar(it.medicamento_nombre || it.medicamento || '—')}</strong>
          ${it.restringido ? ' <span class="chip chip-error">control especial</span>' : ''}
          <br><span class="campo-ayuda">
            ${escapar([it.dosis, it.frecuencia, it.duracion, it.via].filter(Boolean).join(' · '))}
          </span>
        </td>
        <td>${escapar(it.cantidad)}</td>
        <td>${escapar(it.dispensado)}</td>
        <td class="${pendiente > 0 ? 'texto-alerta' : ''}">${escapar(pendiente)}</td>
        ${soloLectura ? '' : `
          <td>
            <select data-producto="${indice}" data-receta-item="${it.id}">
              <option value="">No entregar</option>
              ${productos.map((p) => `
                <option value="${p.id}">${escapar(p.nombre)} (${escapar(p.cantidad)} disp.)</option>`).join('')}
            </select>
          </td>
          <td>
            <input type="number" data-cantidad="${indice}" min="0" max="${pendiente}"
                   step="0.01" value="${pendiente > 0 ? pendiente : 0}" style="width:80px">
          </td>`}
      </tr>`;
    }).join('');

    $('#cuerpoDispensar').innerHTML = `
      ${bloqueAlertas}

      <div class="tabla-envoltura"><table class="tabla">
        <thead>
          <tr>
            <th>Medicamento</th><th>Recetado</th><th>Entregado</th><th>Pendiente</th>
            ${soloLectura ? '' : '<th>Producto</th><th>Entregar</th>'}
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table></div>

      ${soloLectura ? '' : `
        <form id="formDispensar" style="margin-top:18px">
          <div class="campos-fila">
            <label class="campo">
              <span>Quién recibe *</span>
              <input type="text" name="recibe" required maxlength="120" placeholder="Nombre de quien retira">
            </label>
            <label class="campo">
              <span>Documento</span>
              <input type="text" name="documentoRecibe" maxlength="30">
            </label>
          </div>
          <label class="campo">
            <span>Observaciones</span>
            <input type="text" name="observaciones" maxlength="255">
          </label>
          <div class="modal-acciones">
            <button type="submit" class="btn btn-primary">Registrar entrega</button>
          </div>
          <p class="campo-ayuda">
            Lo entregado se descuenta del inventario en la misma transacción.
          </p>
        </form>`}`;

    const form = $('#formDispensar');
    if (form) form.addEventListener('submit', dispensar);
  }

  async function dispensar(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorDispensar');
    H.limpiarError(caja);

    const items = [];
    H.$$('#cuerpoDispensar [data-producto]').forEach((select) => {
      if (!select.value) return;

      const indice = select.dataset.producto;
      const input = $(`#cuerpoDispensar [data-cantidad="${indice}"]`);
      const cantidad = Number(input.value);
      if (!cantidad || cantidad <= 0) return;

      items.push({
        recetaItemId: Number(select.dataset.recetaItem),
        productoId: Number(select.value),
        cantidad,
      });
    });

    if (!items.length) {
      return H.mostrarError(caja, new Error('Marca al menos un producto y su cantidad.'));
    }

    const cuerpo = {
      recetaId: recetaAbierta.receta.id,
      clienteId: recetaAbierta.receta.cliente_id,
      mascotaId: recetaAbierta.receta.mascota_id,
      recibe: form.recibe.value.trim(),
      documentoRecibe: form.documentoRecibe.value.trim() || null,
      observaciones: form.observaciones.value.trim() || null,
      items,
    };

    const boton = form.querySelector('button[type="submit"]');
    await H.conBoton(boton, 'Registrando…', async () => {
      try {
        await H.api.post('/farmacia/dispensaciones', cuerpo);
        H.cerrarModal('modalDispensar');
        H.toast('Dispensación registrada y descontada del inventario.');
        await mostrar('recetas');
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Dispensaciones, inventario, interacciones, restringidos
     -------------------------------------------------------- */

  async function vistaDispensaciones() {
    const datos = await H.api.get('/farmacia/dispensaciones', { limite: 100 });
    const lista = datos.dispensaciones || [];

    if (!lista.length) {
      $('#contenido').innerHTML = H.bloqueVacio('No hay dispensaciones registradas.', 'icon-caja');
      return;
    }

    $('#contenido').innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead><tr><th>Fecha</th><th>Receta</th><th>Paciente</th><th>Recibió</th><th>Entregó</th><th>Estado</th></tr></thead>
        <tbody>
          ${lista.map((d) => `
            <tr>
              <td>${escapar(H.fechaLarga(d.fecha))} ${escapar(H.hora12(d.fecha))}</td>
              <td>${escapar(d.receta_numero || 'venta libre')}</td>
              <td>${escapar(d.mascota || '—')}</td>
              <td>${escapar(d.recibe || '—')}</td>
              <td>${escapar(d.entregado_por_nombre || '—')}</td>
              <td><span class="insignia insignia-${escapar(d.estado)}">${escapar(d.estado)}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  async function vistaInventario() {
    const datos = await H.api.get('/farmacia/inventario');
    productos = datos.productos || [];

    if (!productos.length) {
      $('#contenido').innerHTML = H.bloqueVacio('No hay medicamentos en el inventario.', 'icon-caja');
      return;
    }

    $('#contenido').innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead><tr><th>Producto</th><th>Existencias</th><th>Mínimo</th><th>Próximo vencimiento</th><th></th></tr></thead>
        <tbody>
          ${productos.map((p) => {
            const bajo = Number(p.cantidad) <= Number(p.stock_minimo);
            return `<tr>
              <td><strong>${escapar(p.nombre)}</strong>${p.sku ? `<br><span class="campo-ayuda">${escapar(p.sku)}</span>` : ''}</td>
              <td class="${bajo ? 'texto-alerta' : ''}">${escapar(p.cantidad)}</td>
              <td>${escapar(p.stock_minimo)}</td>
              <td>${p.proximo_vencimiento ? escapar(H.fechaLarga(p.proximo_vencimiento)) : '—'}</td>
              <td>${bajo ? '<span class="chip chip-error">en mínimos</span>' : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  async function vistaInteracciones() {
    const datos = await H.api.get('/farmacia/interacciones');
    const lista = datos.interacciones || [];

    const tabla = lista.length
      ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Principios activos</th><th>Severidad</th><th>Efecto</th><th>Recomendación</th></tr></thead>
          <tbody>${lista.map((i) => `
            <tr>
              <td><strong>${escapar(i.principio_a)}</strong> + <strong>${escapar(i.principio_b)}</strong></td>
              <td><span class="insignia insignia-${i.severidad === 'contraindicada' || i.severidad === 'grave' ? 'critica' : 'media'}">
                ${escapar(SEVERIDAD_INTERACCION[i.severidad] || i.severidad)}</span></td>
              <td>${escapar(i.efecto)}</td>
              <td class="campo-ayuda">${escapar(i.recomendacion || '—')}</td>
            </tr>`).join('')}</tbody>
        </table></div>`
      : H.bloqueVacio('El catálogo de interacciones está vacío.', 'icon-alerta');

    $('#contenido').innerHTML = `
      <p class="campo-ayuda" style="margin-bottom:14px">
        Este catálogo avisa, no decide. La última palabra sigue siendo del veterinario,
        que conoce el caso y sabe cosas que la tabla no.
      </p>
      ${tabla}
      ${H.puede('farmacia.gestionar') ? `
        <form id="formInteraccion" style="margin-top:18px">
          <div class="campos-fila">
            <label class="campo"><span>Principio A *</span><input type="text" name="principioA" required maxlength="120"></label>
            <label class="campo"><span>Principio B *</span><input type="text" name="principioB" required maxlength="120"></label>
          </div>
          <div class="campos-fila">
            <label class="campo">
              <span>Severidad</span>
              <select name="severidad">
                ${Object.entries(SEVERIDAD_INTERACCION).map(([v, t]) => `<option value="${v}">${escapar(t)}</option>`).join('')}
              </select>
            </label>
            <label class="campo"><span>Efecto *</span><input type="text" name="efecto" required maxlength="255"></label>
          </div>
          <label class="campo"><span>Recomendación</span><input type="text" name="recomendacion" maxlength="2000"></label>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Añadir interacción</button></div>
        </form>` : ''}`;

    const form = $('#formInteraccion');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const boton = form.querySelector('button[type="submit"]');

      await H.conBoton(boton, 'Guardando…', async () => {
        try {
          await H.api.post('/farmacia/interacciones', {
            principioA: form.principioA.value.trim(),
            principioB: form.principioB.value.trim(),
            severidad: form.severidad.value,
            efecto: form.efecto.value.trim(),
            recomendacion: form.recomendacion.value.trim() || null,
          });
          H.toast('Interacción añadida.');
          await mostrar('interacciones');
        } catch (error) {
          H.toast(error.message, 'error');
        }
      });
    });
  }

  async function vistaRestringidos() {
    const datos = await H.api.get('/farmacia/restringidos', { limite: 200 });
    const movimientos = datos.movimientos || [];

    $('#contenido').innerHTML = `
      <p class="campo-ayuda" style="margin-bottom:14px">
        Libro de medicamentos de control especial: cada salida queda con fecha,
        paciente, quién la entregó y quién la recibió.
      </p>
      ${movimientos.length
        ? `<div class="tabla-envoltura"><table class="tabla">
            <thead><tr><th>Fecha</th><th>Medicamento</th><th>Cantidad</th><th>Paciente</th><th>Receta</th><th>Entregó</th><th>Recibió</th></tr></thead>
            <tbody>${movimientos.map((m) => `
              <tr>
                <td>${escapar(H.fechaLarga(m.fecha))} ${escapar(H.hora12(m.fecha))}</td>
                <td>${escapar(m.producto || m.medicamento || '—')}</td>
                <td>${escapar(m.cantidad)}</td>
                <td>${escapar(m.mascota || '—')}</td>
                <td>${escapar(m.receta_numero || '—')}</td>
                <td>${escapar(m.entregado_por_nombre || '—')}</td>
                <td>${escapar(m.recibe || '—')}</td>
              </tr>`).join('')}</tbody>
          </table></div>`
        : H.bloqueVacio('No hay movimientos de medicamentos restringidos.', 'icon-shield')}`;
  }
})();
