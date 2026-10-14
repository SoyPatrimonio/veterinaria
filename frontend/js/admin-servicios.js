/* ============================================================
   Administración — catálogo de servicios
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  let servicios = [];
  let veterinarios = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin']);
    if (!usuario) return;

    H.prepararModal('modalServicio');

    $('#btnNuevo').addEventListener('click', () => abrirFormulario(null));
    $('#formServicio').addEventListener('submit', guardar);

    try {
      const datos = await H.api.get('/veterinarios');
      veterinarios = datos.veterinarios;
    } catch (error) {
      H.toast(error.message, 'error');
    }

    await recargar();
  });

  async function recargar() {
    $('#listaServicios').innerHTML = H.cargando();
    try {
      const datos = await H.api.get('/servicios', { todos: 1 });
      servicios = datos.servicios;
      pintar();
    } catch (error) {
      $('#listaServicios').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar() {
    const caja = $('#listaServicios');

    if (!servicios.length) {
      caja.innerHTML = H.bloqueVacio('No hay servicios registrados.', 'icon-shield');
      return;
    }

    caja.innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr><th>Servicio</th><th>Precio</th><th>Duración</th><th>Especialistas</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          ${servicios.map((s) => `
            <tr>
              <td>
                <strong>${escapar(s.nombre)}</strong>
                ${s.descripcion ? `<br><span class="campo-ayuda">${escapar(s.descripcion.slice(0, 80))}…</span>` : ''}
              </td>
              <td>${escapar(Number(s.precio) > 0 ? H.moneda(s.precio) : 'Sin costo')}</td>
              <td>${escapar(s.duracion_min)} min</td>
              <td>${Number(s.veterinarios_disponibles) > 0 ? escapar(s.veterinarios_disponibles) : 'Todo el equipo'}</td>
              <td><span class="insignia insignia-${s.activo ? 'activo' : 'inactivo'}">${s.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td class="acciones">
                <button type="button" class="btn btn-outline btn-sm" data-editar="${s.id}">Editar</button>
                ${s.activo ? `<button type="button" class="btn btn-peligro btn-sm" data-baja="${s.id}">Desactivar</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    caja.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => abrirFormulario(Number(btn.dataset.editar)));
    });
    caja.querySelectorAll('[data-baja]').forEach((btn) => {
      btn.addEventListener('click', () => desactivar(Number(btn.dataset.baja)));
    });
  }

  async function abrirFormulario(id) {
    const form = $('#formServicio');
    H.limpiarError($('#errorServicio'));
    form.reset();

    let asignados = [];

    if (id) {
      const servicio = servicios.find((s) => s.id === id);
      $('#tituloServicio').textContent = `Editar ${servicio.nombre}`;
      form.id.value = servicio.id;
      form.nombre.value = servicio.nombre;
      form.precio.value = servicio.precio;
      form.duracionMin.value = servicio.duracion_min;
      form.activo.value = servicio.activo ? '1' : '0';
      form.descripcion.value = servicio.descripcion || '';
      form.requisitos.value = servicio.requisitos || '';

      // Si el detalle no carga NO se puede abrir el formulario: los veterinarios
      // asignados se pintan desde `asignados`, y con la lista vacía saldrían
      // todos sin marcar. Guardar desde ahí mandaría `veterinarios: []` y
      // borraría las asignaciones reales sin que nadie lo hubiera pedido.
      try {
        const datos = await H.api.get(`/servicios/${id}`);
        asignados = datos.veterinarios.map((v) => v.id);
        form.descripcion.value = datos.servicio.descripcion || '';
        form.requisitos.value = datos.servicio.requisitos || '';
      } catch (error) {
        console.error('[servicios] no se pudo cargar el detalle del servicio:', error);
        H.toast('No se pudieron cargar los datos del servicio. Inténtalo de nuevo.', 'error');
        return;
      }
    } else {
      $('#tituloServicio').textContent = 'Nuevo servicio';
      form.id.value = '';
    }

    $('#listaCheckVets').innerHTML = veterinarios.map((v) => `
      <label class="campo-check" style="margin:0">
        <input type="checkbox" value="${v.id}" ${asignados.includes(v.id) ? 'checked' : ''}>
        ${escapar(v.nombre)} — ${escapar(H.ETIQUETA_ESPECIALIDAD[v.especialidad] || v.especialidad)}
      </label>`).join('');

    H.abrirModal('modalServicio');
  }

  async function guardar(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorServicio');
    H.limpiarError(caja);

    const seleccionados = Array.from($('#listaCheckVets').querySelectorAll('input:checked'))
      .map((input) => Number(input.value));

    const cuerpo = {
      nombre: form.nombre.value.trim(),
      precio: Number(form.precio.value),
      duracionMin: Number(form.duracionMin.value),
      activo: form.activo.value === '1',
      descripcion: form.descripcion.value.trim() || null,
      requisitos: form.requisitos.value.trim() || null,
      icono: null,
      veterinarios: seleccionados,
    };

    if (!cuerpo.nombre) return H.mostrarError(caja, new Error('Escribe el nombre del servicio.'));
    if (cuerpo.duracionMin < 5) return H.mostrarError(caja, new Error('La duración mínima es de 5 minutos.'));

    await H.conBoton($('#btnGuardarServicio'), 'Guardando…', async () => {
      try {
        if (form.id.value) {
          await H.api.put(`/servicios/${form.id.value}`, cuerpo);
          H.toast('Servicio actualizado.');
        } else {
          await H.api.post('/servicios', cuerpo);
          H.toast('Servicio creado.');
        }
        H.cerrarModal('modalServicio');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  async function desactivar(id) {
    const servicio = servicios.find((s) => s.id === id);
    const ok = await H.confirmar(
      `¿Desactivar "${servicio.nombre}"?\n\nDejará de aparecer al agendar, pero las citas ya registradas se conservan.`
    );
    if (!ok) return;

    try {
      await H.api.del(`/servicios/${id}`);
      H.toast('Servicio desactivado.');
      await recargar();
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }
})();
