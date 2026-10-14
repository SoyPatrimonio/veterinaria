/* ============================================================
   Laboratorio — órdenes, muestras, resultados y validación

   La regla que manda esta pantalla: al propietario no se le avisa
   hasta que alguien VALIDA el resultado. Un valor mal digitado que
   llega al dueño por correo antes de que nadie lo mire es un
   problema difícil de recoger.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const ETIQUETA_MUESTRA = {
    pendiente: 'Pendiente de toma',
    tomada: 'Tomada',
    en_transito: 'En tránsito',
    recibida: 'Recibida',
    procesando: 'Procesando',
    rechazada: 'Rechazada',
  };

  let ordenes = [];
  let tiposExamen = [];
  let listaMascotas = [];
  let ordenAbierta = null;
  let examenAbierto = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['veterinario', 'admin'], ['laboratorio.ver']);
    if (!usuario) return;

    ['modalOrden', 'modalDetalle', 'modalResultados'].forEach(H.prepararModal);

    $('#btnNuevaOrden').addEventListener('click', abrirNuevaOrden);
    $('#formOrden').addEventListener('submit', crearOrden);
    ['#filtroEstado', '#filtroPrioridad'].forEach((s) => $(s).addEventListener('change', recargar));

    if (!H.puede('laboratorio.ordenar')) $('#btnNuevaOrden').hidden = true;

    await cargarCatalogos();
    await Promise.all([cargarBandeja(), recargar()]);
  });

  async function cargarCatalogos() {
    try {
      const [catalogos, mascotas] = await Promise.all([
        H.api.get('/historia/catalogos'),
        H.api.get('/mascotas', { limite: 200 }),
      ]);

      // Solo los de laboratorio: pedir una radiografía por aquí sería mandarla
      // al circuito de muestras, que no le aplica.
      tiposExamen = (catalogos.tiposExamen || []).filter((t) => t.categoria === 'laboratorio');
      listaMascotas = mascotas.mascotas || [];
    } catch (error) {
      H.toast(`No se pudieron cargar los catálogos: ${error.message}`, 'error');
    }
  }

  async function cargarBandeja() {
    try {
      const datos = await H.api.get('/laboratorio/bandeja');
      pintarBandeja(datos);
    } catch (error) {
      $('#bandeja').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintarBandeja(datos) {
    const grupos = [
      { titulo: 'Urgentes sin empezar', lista: datos.urgentes || [], tono: 'critica' },
      { titulo: 'En proceso', lista: datos.pendientes || [], tono: 'media' },
      { titulo: 'Pedidos hace más de 5 días sin resultado', lista: datos.sinResultado || [], tono: 'alta' },
    ];

    const conContenido = grupos.filter((g) => g.lista.length);

    if (!conContenido.length) {
      $('#bandeja').innerHTML = H.bloqueVacio('El laboratorio está al día.', 'icon-check');
      return;
    }

    $('#bandeja').innerHTML = conContenido.map((g) => `
      <div class="alerta alerta-${g.tono}">
        <div class="alerta-cuerpo">
          <h4>${escapar(g.titulo)} (${g.lista.length})</h4>
          <p>${escapar(g.lista.map((o) => `${o.numero} · ${o.mascota || o.mascota_nombre || ''}`).slice(0, 6).join('  |  '))}</p>
        </div>
      </div>`).join('');
  }

  async function recargar() {
    $('#listaOrdenes').innerHTML = H.cargando();
    try {
      const datos = await H.api.get('/laboratorio/ordenes', {
        estado: $('#filtroEstado').value || undefined,
        prioridad: $('#filtroPrioridad').value || undefined,
      });
      ordenes = datos.ordenes || [];
      pintar();
    } catch (error) {
      $('#listaOrdenes').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar() {
    if (!ordenes.length) {
      $('#listaOrdenes').innerHTML = H.bloqueVacio('No hay órdenes con esos filtros.', 'icon-micro');
      return;
    }

    $('#listaOrdenes').innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr><th>Orden</th><th>Paciente</th><th>Solicitó</th><th>Fecha</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          ${ordenes.map((o) => `
            <tr>
              <td>
                <strong>${escapar(o.numero)}</strong>
                ${o.prioridad === 'urgente' ? ' <span class="chip chip-error">urgente</span>' : ''}
                ${o.ayuno ? ' <span class="chip chip-aviso">ayuno</span>' : ''}
              </td>
              <td>${escapar(o.mascota || '—')}</td>
              <td>${escapar(o.veterinario || '—')}</td>
              <td>${escapar(H.fechaLarga(o.fecha))}</td>
              <td><span class="insignia insignia-${escapar(o.estado)}">${escapar(o.estado.replace('_', ' '))}</span></td>
              <td class="acciones">
                <button type="button" class="btn btn-outline btn-sm" data-orden="${o.id}">Abrir</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    $('#listaOrdenes').querySelectorAll('[data-orden]').forEach((b) => {
      b.addEventListener('click', () => abrirOrden(Number(b.dataset.orden)));
    });
  }

  /* --------------------------------------------------------
     Nueva orden
     -------------------------------------------------------- */

  function abrirNuevaOrden() {
    const form = $('#formOrden');
    H.limpiarError($('#errorOrden'));
    form.reset();

    form.mascotaId.innerHTML = '<option value="">Selecciona el paciente</option>' + listaMascotas
      .map((m) => `<option value="${m.id}">${escapar(m.nombre)} — ${escapar(m.cliente_nombre || '')}</option>`)
      .join('');

    $('#listaTipos').innerHTML = tiposExamen.map((t) => `
      <label class="campo-check" style="margin:0">
        <input type="checkbox" value="${t.id}"> ${escapar(t.nombre)}
        <small class="campo-ayuda">${escapar(H.moneda(t.precio))}</small>
      </label>`).join('');

    H.abrirModal('modalOrden');
  }

  async function crearOrden(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorOrden');
    H.limpiarError(caja);

    const tipos = Array.from($('#listaTipos').querySelectorAll('input:checked')).map((i) => Number(i.value));

    if (!form.mascotaId.value) return H.mostrarError(caja, new Error('Selecciona el paciente.'));
    if (!tipos.length) return H.mostrarError(caja, new Error('Marca al menos un examen.'));

    const cuerpo = {
      mascotaId: Number(form.mascotaId.value),
      prioridad: form.prioridad.value,
      ayuno: form.ayuno.checked,
      indicaciones: form.indicaciones.value.trim() || null,
      tipos,
    };

    await H.conBoton($('#btnGuardarOrden'), 'Creando…', async () => {
      try {
        await H.api.post('/laboratorio/ordenes', cuerpo);
        H.cerrarModal('modalOrden');
        H.toast('Orden creada.');
        await Promise.all([cargarBandeja(), recargar()]);
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Detalle de la orden
     -------------------------------------------------------- */

  async function abrirOrden(id) {
    H.limpiarError($('#errorDetalle'));
    $('#cuerpoDetalle').innerHTML = H.cargando();
    H.abrirModal('modalDetalle');

    try {
      ordenAbierta = await H.api.get(`/laboratorio/ordenes/${id}`);
    } catch (error) {
      $('#cuerpoDetalle').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    pintarDetalle();
  }

  function pintarDetalle() {
    const o = ordenAbierta.orden;
    const items = ordenAbierta.items || [];
    const muestras = ordenAbierta.muestras || [];

    $('#tituloDetalle').textContent = `${o.numero} — ${o.mascota || ''}`;
    $('#subDetalle').innerHTML =
      `${escapar(H.fechaLarga(o.fecha))} · ${escapar(o.veterinario || '')}` +
      `${o.prioridad === 'urgente' ? ' · <span class="chip chip-error">urgente</span>' : ''}` +
      `${o.ayuno ? ' · <span class="chip chip-aviso">requiere ayuno</span>' : ''}` +
      `${o.indicaciones ? `<br><span class="campo-ayuda">${escapar(o.indicaciones)}</span>` : ''}`;

    const tablaItems = items.length
      ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Examen</th><th>Estado</th><th></th></tr></thead>
          <tbody>${items.map((it) => `
            <tr>
              <td>${escapar(it.tipo_nombre || it.nombre || '—')}</td>
              <td><span class="insignia insignia-${escapar(it.examen_estado || 'solicitado')}">
                ${escapar((it.examen_estado || 'solicitado').replace('_', ' '))}</span></td>
              <td class="acciones">
                ${it.examen_id
                  ? `<button type="button" class="btn btn-primary btn-sm" data-resultados="${it.examen_id}">Resultados</button>`
                  : '<span class="campo-ayuda">sin examen</span>'}
              </td>
            </tr>`).join('')}</tbody>
        </table></div>`
      : H.bloqueVacio('Esta orden no tiene exámenes.', 'icon-micro');

    const tablaMuestras = muestras.length
      ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Código</th><th>Tipo</th><th>Estado</th><th>Tomada</th><th></th></tr></thead>
          <tbody>${muestras.map((m) => `
            <tr>
              <td><strong>${escapar(m.codigo)}</strong></td>
              <td>${escapar(m.tipo)}</td>
              <td><span class="insignia insignia-${escapar(m.estado)}">${escapar(ETIQUETA_MUESTRA[m.estado] || m.estado)}</span></td>
              <td>${m.tomada_en ? escapar(H.hora12(m.tomada_en)) : '—'}</td>
              <td class="acciones">
                ${['pendiente', 'tomada', 'en_transito'].includes(m.estado)
                  ? `<button type="button" class="btn btn-outline btn-sm" data-muestra="${m.id}" data-estado="recibida">Recibir</button>
                     <button type="button" class="btn btn-peligro btn-sm" data-rechazar="${m.id}">Rechazar</button>`
                  : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table></div>`
      : H.bloqueVacio('Todavía no se ha tomado ninguna muestra.', 'icon-micro');

    $('#cuerpoDetalle').innerHTML = `
      <h4 class="titulo-modulo">Exámenes pedidos</h4>
      ${tablaItems}

      <h4 class="titulo-modulo" style="margin-top:24px">Muestras</h4>
      ${tablaMuestras}

      ${H.puede('laboratorio.procesar') ? `
        <form id="formMuestra" style="margin-top:16px">
          <div class="campos-fila">
            <label class="campo">
              <span>Tipo de muestra *</span>
              <select name="tipo" required>
                <option value="sangre">Sangre</option>
                <option value="orina">Orina</option>
                <option value="heces">Heces</option>
                <option value="tejido">Tejido</option>
                <option value="hisopado">Hisopado</option>
                <option value="liquido">Líquido</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label class="campo">
              <span>Observaciones</span>
              <input type="text" name="observaciones" maxlength="255" placeholder="Volumen, condiciones de la toma…">
            </label>
          </div>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar toma de muestra</button></div>
        </form>` : ''}`;

    conectarDetalle();
  }

  function conectarDetalle() {
    const form = $('#formMuestra');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        H.limpiarError($('#errorDetalle'));

        const boton = form.querySelector('button[type="submit"]');
        await H.conBoton(boton, 'Registrando…', async () => {
          try {
            await H.api.post(`/laboratorio/ordenes/${ordenAbierta.orden.id}/muestras`, {
              tipo: form.tipo.value,
              observaciones: form.observaciones.value.trim() || null,
            });
            H.toast('Muestra registrada.');
            ordenAbierta = await H.api.get(`/laboratorio/ordenes/${ordenAbierta.orden.id}`);
            pintarDetalle();
            await recargar();
          } catch (error) {
            H.mostrarError($('#errorDetalle'), error);
          }
        });
      });
    }

    H.$$('#cuerpoDetalle [data-muestra]').forEach((b) => {
      b.addEventListener('click', () => cambiarMuestra(Number(b.dataset.muestra), { estado: b.dataset.estado }));
    });

    H.$$('#cuerpoDetalle [data-rechazar]').forEach((b) => {
      b.addEventListener('click', async () => {
        // Rechazar sin motivo deja al veterinario sin saber si hay que repetir
        // la toma o esperar; la base lo exige y aquí se pregunta antes.
        const motivo = await H.pedirTexto({
          titulo: 'Rechazar muestra',
          detalle: 'Ej.: hemólisis, volumen insuficiente, muestra mal rotulada…',
          etiqueta: 'Motivo del rechazo',
          boton: 'Rechazar muestra',
        });
        if (!motivo) return;

        cambiarMuestra(Number(b.dataset.rechazar), {
          estado: 'rechazada',
          motivoRechazo: motivo,
        });
      });
    });

    H.$$('#cuerpoDetalle [data-resultados]').forEach((b) => {
      b.addEventListener('click', () => abrirResultados(Number(b.dataset.resultados)));
    });
  }

  async function cambiarMuestra(id, cuerpo) {
    try {
      await H.api.patch(`/laboratorio/muestras/${id}`, cuerpo);
      H.toast('Muestra actualizada.');
      ordenAbierta = await H.api.get(`/laboratorio/ordenes/${ordenAbierta.orden.id}`);
      pintarDetalle();
    } catch (error) {
      H.mostrarError($('#errorDetalle'), error);
    }
  }

  /* --------------------------------------------------------
     Resultados y validación
     -------------------------------------------------------- */

  async function abrirResultados(examenId) {
    H.limpiarError($('#errorResultados'));
    $('#cuerpoResultados').innerHTML = H.cargando();
    H.abrirModal('modalResultados');

    try {
      examenAbierto = await H.api.get(`/laboratorio/examenes/${examenId}`);
    } catch (error) {
      $('#cuerpoResultados').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    pintarResultados();
  }

  function pintarResultados() {
    const ex = examenAbierto.examen;
    const guardados = examenAbierto.resultados || [];
    const plantilla = examenAbierto.plantilla || [];

    $('#tituloResultados').textContent = `${ex.tipo_nombre || ex.descripcion || 'Examen'} — ${ex.mascota_nombre || ''}`;
    $('#subResultados').innerHTML =
      `Solicitado el ${escapar(H.fechaLarga(ex.fecha_solicitud))}` +
      ` · <span class="insignia insignia-${escapar(ex.estado)}">${escapar(ex.estado)}</span>` +
      (ex.validado_por_nombre
        ? ` · validado por ${escapar(ex.validado_por_nombre)} el ${escapar(H.fechaLarga(ex.validado_en))}`
        : '');

    // Se parte de la plantilla de parámetros del tipo de examen y se rellena
    // con lo que ya hubiera cargado. Así el rango de referencia sale solo.
    const filas = plantilla.length
      ? plantilla.map((p) => {
        const previo = guardados.find((g) => g.parametro_id === p.id) || {};
        return { ...p, valor: previo.valor ?? '', notas: previo.notas ?? '' };
      })
      : guardados.map((g) => ({
        id: g.parametro_id, nombre: g.parametro, unidad: g.unidad,
        referencia: g.referencia, valor: g.valor ?? '', notas: g.notas ?? '',
      }));

    if (!filas.length) {
      $('#cuerpoResultados').innerHTML = H.bloqueVacio(
        'Este tipo de examen no tiene parámetros definidos todavía.', 'icon-micro'
      );
      return;
    }

    const puedeEditar = H.puede('laboratorio.procesar') && ex.estado !== 'anulado';
    const puedeValidar = H.puede('laboratorio.validar') && ['listo', 'en_proceso'].includes(ex.estado);

    $('#cuerpoResultados').innerHTML = `
      <form id="formResultados">
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Parámetro</th><th>Valor</th><th>Unidad</th><th>Referencia</th><th>Nota</th></tr></thead>
          <tbody>
            ${filas.map((f) => `
              <tr>
                <td><strong>${escapar(f.nombre)}</strong></td>
                <td><input type="text" data-parametro="${f.id ?? ''}" data-nombre="${escapar(f.nombre)}"
                           value="${escapar(f.valor)}" maxlength="80" ${puedeEditar ? '' : 'disabled'}
                           style="width:110px"></td>
                <td>${escapar(f.unidad || '—')}</td>
                <td class="campo-ayuda">${escapar(f.referencia || f.rango_texto || '—')}</td>
                <td><input type="text" data-nota="${f.id ?? ''}" value="${escapar(f.notas)}"
                           maxlength="255" ${puedeEditar ? '' : 'disabled'}></td>
              </tr>`).join('')}
          </tbody>
        </table></div>

        <label class="campo" style="margin-top:16px">
          <span>Conclusión</span>
          <textarea name="conclusion" maxlength="4000" ${puedeEditar ? '' : 'disabled'}
                    placeholder="Interpretación del conjunto de valores.">${escapar(ex.conclusion || '')}</textarea>
        </label>

        <div class="modal-acciones">
          ${puedeEditar ? '<button type="submit" class="btn btn-outline">Guardar resultados</button>' : ''}
          ${puedeValidar ? '<button type="button" class="btn btn-primary" id="btnValidar">Validar y avisar</button>' : ''}
        </div>

        ${puedeValidar ? `<p class="campo-ayuda">
          Al validar se avisa al propietario. Antes de eso el resultado no sale de la clínica.
        </p>` : ''}
      </form>`;

    const form = $('#formResultados');
    form.addEventListener('submit', guardarResultados);

    const botonValidar = $('#btnValidar');
    if (botonValidar) botonValidar.addEventListener('click', validar);
  }

  function recogerResultados() {
    return H.$$('#cuerpoResultados input[data-parametro]').map((input) => {
      const id = input.dataset.parametro;
      const nota = $(`#cuerpoResultados input[data-nota="${id}"]`);

      return {
        parametroId: id ? Number(id) : null,
        parametro: input.dataset.nombre,
        valor: input.value.trim() || null,
        notas: nota && nota.value.trim() ? nota.value.trim() : null,
      };
    }).filter((r) => r.valor !== null);
  }

  async function guardarResultados(e) {
    e.preventDefault();
    H.limpiarError($('#errorResultados'));

    const resultados = recogerResultados();
    if (!resultados.length) {
      return H.mostrarError($('#errorResultados'), new Error('Escribe al menos un valor.'));
    }

    const boton = e.target.querySelector('button[type="submit"]');
    await H.conBoton(boton, 'Guardando…', async () => {
      try {
        await H.api.put(`/laboratorio/examenes/${examenAbierto.examen.id}/resultados`, {
          resultados,
          conclusion: e.target.conclusion.value.trim() || null,
        });
        H.toast('Resultados guardados.');
        examenAbierto = await H.api.get(`/laboratorio/examenes/${examenAbierto.examen.id}`);
        pintarResultados();
      } catch (error) {
        H.mostrarError($('#errorResultados'), error);
      }
    });
  }

  async function validar() {
    const ok = await H.confirmar(
      '¿Validar este resultado?\n\nSe le avisará al propietario de que ya está disponible.'
    );
    if (!ok) return;

    await H.conBoton($('#btnValidar'), 'Validando…', async () => {
      try {
        await H.api.post(`/laboratorio/examenes/${examenAbierto.examen.id}/validar`, {});
        H.toast('Resultado validado. Se avisó al propietario.');
        examenAbierto = await H.api.get(`/laboratorio/examenes/${examenAbierto.examen.id}`);
        pintarResultados();
        await Promise.all([cargarBandeja(), recargar()]);
      } catch (error) {
        H.mostrarError($('#errorResultados'), error);
      }
    });
  }
})();
