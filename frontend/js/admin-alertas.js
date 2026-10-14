/* ============================================================
   Alertas críticas

   Una alerta no es un aviso: el aviso se lee y se descarta, la
   alerta se queda hasta que alguien la resuelve. Por eso esta
   pantalla no tiene "marcar todas como leídas".
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const ETIQUETA_CATEGORIA = {
    clinica: 'Clínica',
    inventario: 'Inventario',
    agenda: 'Agenda',
    facturacion: 'Facturación',
    equipos: 'Equipos',
    personal: 'Personal',
    seguridad: 'Seguridad',
  };

  const ETIQUETA_SEVERIDAD = {
    critica: 'Crítica',
    alta: 'Alta',
    media: 'Media',
    baja: 'Baja',
  };

  let alertas = [];
  let reglas = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin', 'veterinario'], ['alertas.ver', 'alertas.gestionar']);
    if (!usuario) return;

    H.prepararModal('modalResolver');

    $('#btnRecalcular').addEventListener('click', recalcular);
    $('#formResolver').addEventListener('submit', guardarResolucion);

    ['#filtroCategoria', '#filtroSeveridad', '#filtroEstado'].forEach((sel) => {
      $(sel).addEventListener('change', recargar);
    });

    // Al abrir se recalcula una vez: en Vercel no hay proceso en segundo plano,
    // así que abrir el tablero es lo que hace de reloj.
    await recalcular({ silencioso: true });

    if (H.puede('alertas.gestionar')) {
      $('#seccionReglas').hidden = false;
      await cargarReglas();
    }
  });

  function filtros() {
    return {
      categoria: $('#filtroCategoria').value || undefined,
      severidad: $('#filtroSeveridad').value || undefined,
      estado: $('#filtroEstado').value || undefined,
    };
  }

  async function recargar() {
    $('#listaAlertas').innerHTML = H.cargando();
    try {
      const datos = await H.api.get('/alertas', filtros());
      alertas = datos.alertas || [];
      pintarMetricas(datos.resumen || {});
      pintar();
    } catch (error) {
      $('#listaAlertas').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  async function recalcular(opciones = {}) {
    const boton = $('#btnRecalcular');
    await H.conBoton(boton, 'Recalculando…', async () => {
      try {
        const datos = await H.api.post('/alertas/recalcular', {});
        if (opciones.silencioso !== true) {
          H.toast(
            `${datos.abiertas} alerta(s) nueva(s) · ${datos.resueltas} cerrada(s) sola(s).`
          );
        }
      } catch (error) {
        // Que falle el recálculo no debe dejar la pantalla vacía: se sigue
        // mostrando lo que ya había registrado.
        console.warn('[alertas] no se pudo recalcular:', error.message);
        H.toast(`No se pudo recalcular: ${error.message}`, 'error');
      }
    });

    await recargar();
  }

  function pintarMetricas(resumen) {
    const porSeveridad = Object.fromEntries(
      (resumen.porSeveridad || []).map((s) => [s.severidad, s.total])
    );

    const tarjetas = [
      { texto: 'Abiertas', valor: resumen.abiertas || 0, icono: 'icon-alerta' },
      { texto: 'Sin ver', valor: resumen.sin_ver || 0, icono: 'icon-clock' },
      { texto: 'Críticas', valor: resumen.criticas || 0, icono: 'icon-heart' },
      { texto: 'Altas', valor: porSeveridad.alta || 0, icono: 'icon-shield' },
    ];

    $('#metricas').innerHTML = tarjetas.map((t) => `
      <article class="metrica">
        <span class="metrica-icono"><svg class="icon"><use href="#${t.icono}"/></svg></span>
        <div class="contador-vivo">
          ${escapar(t.valor)}
          <small>${escapar(t.texto)}</small>
        </div>
      </article>`).join('');
  }

  function pintar() {
    const caja = $('#listaAlertas');

    if (!alertas.length) {
      caja.innerHTML = H.bloqueVacio('No hay alertas con esos filtros. Buena señal.', 'icon-check');
      return;
    }

    caja.innerHTML = alertas.map((a) => {
      const cerrada = ['resuelta', 'descartada'].includes(a.estado);

      return `<article class="alerta alerta-${escapar(a.severidad)}">
        <div class="alerta-cuerpo">
          <h4>${escapar(a.titulo)}</h4>
          <p>${escapar(a.mensaje || '')}</p>
          <div class="alerta-meta">
            <span class="insignia insignia-${escapar(a.severidad)}">${escapar(ETIQUETA_SEVERIDAD[a.severidad] || a.severidad)}</span>
            ${escapar(ETIQUETA_CATEGORIA[a.categoria] || a.categoria)}
            · ${escapar(H.fechaLarga(a.creado_en))} ${escapar(H.hora12(a.creado_en))}
            ${a.mascota ? ` · ${escapar(a.mascota)}` : ''}
            ${a.sede_nombre ? ` · ${escapar(a.sede_nombre)}` : ''}
            ${cerrada && a.atendida_por_nombre ? ` · cerrada por ${escapar(a.atendida_por_nombre)}` : ''}
          </div>
          ${cerrada && a.nota_cierre ? `<div class="alerta-meta">${escapar(a.nota_cierre)}</div>` : ''}
        </div>
        <div class="alerta-acciones">
          ${a.enlace ? `<a class="btn btn-outline btn-sm" href="${H.ruta(a.enlace)}">Ir</a>` : ''}
          ${cerrada ? '' : `
            ${a.estado === 'abierta' ? `<button type="button" class="btn btn-outline btn-sm" data-vista="${a.id}">Visto</button>` : ''}
            <button type="button" class="btn btn-primary btn-sm" data-resolver="${a.id}">Resolver</button>
            <button type="button" class="btn btn-peligro btn-sm" data-descartar="${a.id}">Descartar</button>`}
        </div>
      </article>`;
    }).join('');

    caja.querySelectorAll('[data-vista]').forEach((b) => {
      b.addEventListener('click', () => marcarVista(Number(b.dataset.vista)));
    });
    caja.querySelectorAll('[data-resolver]').forEach((b) => {
      b.addEventListener('click', () => abrirResolver(Number(b.dataset.resolver), 'resuelta'));
    });
    caja.querySelectorAll('[data-descartar]').forEach((b) => {
      b.addEventListener('click', () => abrirResolver(Number(b.dataset.descartar), 'descartada'));
    });
  }

  /** "Visto" no pide nota: solo dice que alguien ya la miró. */
  async function marcarVista(id) {
    try {
      await H.api.patch(`/alertas/${id}`, { estado: 'vista' });
      await recargar();
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  function abrirResolver(id, estado) {
    const alerta = alertas.find((a) => a.id === id);
    if (!alerta) return;

    const form = $('#formResolver');
    H.limpiarError($('#errorResolver'));
    form.reset();
    form.id.value = id;
    form.estado.value = estado;

    const descarta = estado === 'descartada';
    $('#tituloResolver').textContent = descarta ? 'Descartar alerta' : 'Resolver alerta';
    $('#subResolver').textContent = alerta.titulo;

    // Descartar sí exige nota: es decir "esto no era un problema", y eso hay
    // que poder justificarlo después. Resolver puede ir sin nota.
    $('#etiquetaNota').textContent = descarta ? 'Por qué se descarta *' : 'Nota de cierre';
    form.notaCierre.required = descarta;

    H.abrirModal('modalResolver');
  }

  async function guardarResolucion(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorResolver');
    H.limpiarError(caja);

    const nota = form.notaCierre.value.trim();
    if (form.estado.value === 'descartada' && !nota) {
      return H.mostrarError(caja, new Error('Descartar una alerta exige decir por qué.'));
    }

    await H.conBoton($('#btnGuardarResolver'), 'Guardando…', async () => {
      try {
        await H.api.patch(`/alertas/${form.id.value}`, {
          estado: form.estado.value,
          notaCierre: nota || null,
        });
        H.cerrarModal('modalResolver');
        H.toast('Alerta cerrada.');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Reglas y umbrales
     -------------------------------------------------------- */

  async function cargarReglas() {
    try {
      const datos = await H.api.get('/alertas/reglas');
      reglas = datos.reglas || [];
      pintarReglas();
    } catch (error) {
      $('#listaReglas').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintarReglas() {
    $('#listaReglas').innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr><th>Regla</th><th>Categoría</th><th>Severidad</th><th>Umbrales</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          ${reglas.map((r) => `
            <tr>
              <td>
                <strong>${escapar(r.nombre)}</strong>
                <br><span class="campo-ayuda">${escapar(r.descripcion || '')}</span>
              </td>
              <td>${escapar(ETIQUETA_CATEGORIA[r.categoria] || r.categoria)}</td>
              <td>
                <select class="selector-severidad" data-regla="${r.id}">
                  ${Object.entries(ETIQUETA_SEVERIDAD).map(([v, t]) => `
                    <option value="${v}" ${r.severidad === v ? 'selected' : ''}>${escapar(t)}</option>`).join('')}
                </select>
              </td>
              <td>${pintarUmbrales(r)}</td>
              <td>
                <span class="insignia insignia-${r.activo ? 'activo' : 'inactivo'}">
                  ${r.activo ? 'Activa' : 'Inactiva'}
                </span>
              </td>
              <td class="acciones">
                <button type="button" class="btn btn-outline btn-sm" data-alternar="${r.id}">
                  ${r.activo ? 'Desactivar' : 'Activar'}
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    $('#listaReglas').querySelectorAll('.selector-severidad').forEach((sel) => {
      sel.addEventListener('change', () => guardarRegla(Number(sel.dataset.regla), { severidad: sel.value }));
    });
    $('#listaReglas').querySelectorAll('[data-alternar]').forEach((b) => {
      const regla = reglas.find((r) => r.id === Number(b.dataset.alternar));
      b.addEventListener('click', () => guardarRegla(regla.id, { activo: !regla.activo }));
    });
  }

  function pintarUmbrales(regla) {
    const parametros = regla.parametros || {};
    const claves = Object.keys(parametros);

    if (!claves.length) return '<span class="campo-ayuda">Sin umbral</span>';

    return claves.map((clave) => `
      <label class="campo-umbral">
        <span class="campo-ayuda">${escapar(clave.replace(/_/g, ' '))}</span>
        <input type="number" min="1" max="99999" value="${escapar(parametros[clave])}"
               data-regla="${regla.id}" data-clave="${escapar(clave)}" class="umbral">
      </label>`).join('');
  }

  // Se guarda al salir del campo, no en cada tecla: escribir "30" pasaría por
  // "3" y guardaría un umbral que nadie quiso.
  document.addEventListener('change', (e) => {
    const input = e.target.closest('.umbral');
    if (!input) return;

    const regla = reglas.find((r) => r.id === Number(input.dataset.regla));
    if (!regla) return;

    const valor = Number(input.value);
    if (!valor || valor < 1) {
      H.toast('El umbral tiene que ser mayor que cero.', 'error');
      input.value = regla.parametros[input.dataset.clave];
      return;
    }

    guardarRegla(regla.id, { parametros: { ...regla.parametros, [input.dataset.clave]: valor } });
  });

  async function guardarRegla(id, cambios) {
    try {
      await H.api.patch(`/alertas/reglas/${id}`, cambios);
      H.toast('Regla actualizada.');
      await cargarReglas();
    } catch (error) {
      H.toast(error.message, 'error');
      await cargarReglas();
    }
  }
})();
