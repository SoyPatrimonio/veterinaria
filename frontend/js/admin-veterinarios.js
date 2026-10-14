/* ============================================================
   Administración — alta y edición de veterinarios
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  let veterinarios = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin']);
    if (!usuario) return;

    H.prepararModal('modalNuevo');
    H.prepararModal('modalEditar');

    $('#btnNuevo').addEventListener('click', () => {
      H.limpiarError($('#errorNuevo'));
      $('#formNuevo').reset();
      H.abrirModal('modalNuevo');
    });

    $('#formNuevo').addEventListener('submit', crear);
    $('#formEditar').addEventListener('submit', actualizar);

    await recargar();
  });

  async function recargar() {
    $('#listaVeterinarios').innerHTML = H.cargando();
    try {
      // ?todos=1 incluye también los inactivos (solo lo permite el admin).
      const datos = await H.api.get('/veterinarios', { todos: 1 });
      veterinarios = datos.veterinarios;
      pintar();
    } catch (error) {
      $('#listaVeterinarios').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar() {
    const caja = $('#listaVeterinarios');

    if (!veterinarios.length) {
      caja.innerHTML = H.bloqueVacio('Todavía no hay veterinarios registrados.', 'icon-stetho');
      return;
    }

    caja.innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr><th>Nombre</th><th>Especialidad</th><th>Licencia</th><th>Contacto</th><th>Turno</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          ${veterinarios.map((v) => `
            <tr>
              <td><strong>${escapar(v.nombre)}</strong></td>
              <td>${escapar(H.ETIQUETA_ESPECIALIDAD[v.especialidad] || v.especialidad)}</td>
              <td>${escapar(v.licencia)}</td>
              <td>${escapar(v.email)}<br><span class="campo-ayuda">${escapar(v.telefono || '—')}</span></td>
              <td>${escapar(v.duracion_slot_min)} min</td>
              <td><span class="insignia insignia-${v.activo ? 'activo' : 'inactivo'}">${v.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td class="acciones">
                <button type="button" class="btn btn-outline btn-sm" data-editar="${v.id}">Editar</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    caja.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => abrirEdicion(Number(btn.dataset.editar)));
    });
  }

  async function crear(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorNuevo');
    H.limpiarError(caja);

    const cuerpo = {
      nombre: form.nombre.value.trim(),
      email: form.email.value.trim(),
      telefono: form.telefono.value.trim() || null,
      password: form.password.value,
      licencia: form.licencia.value.trim(),
      especialidad: form.especialidad.value,
      duracionSlotMin: Number(form.duracionSlotMin.value),
      descripcion: form.descripcion.value.trim() || null,
      // Horario base de lunes a viernes; el propio veterinario lo ajusta
      // después desde su panel.
      horarios: [1, 2, 3, 4, 5].map((dia) => ({ diaSemana: dia, horaInicio: '08:00', horaFin: '12:00' }))
        .concat([1, 2, 3, 4, 5].map((dia) => ({ diaSemana: dia, horaInicio: '14:00', horaFin: '18:00' }))),
    };

    if (cuerpo.password.length < 8 || !/[A-Za-z]/.test(cuerpo.password) || !/\d/.test(cuerpo.password)) {
      return H.mostrarError(caja, new Error('La contraseña debe tener al menos 8 caracteres, con una letra y un número.'));
    }

    await H.conBoton($('#btnGuardarNuevo'), 'Registrando…', async () => {
      try {
        await H.api.post('/veterinarios', cuerpo);
        H.cerrarModal('modalNuevo');
        H.toast('Veterinario registrado con horario de lunes a viernes.');
        form.reset();
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  function abrirEdicion(id) {
    const v = veterinarios.find((x) => x.id === id);
    if (!v) return;

    H.limpiarError($('#errorEditar'));
    const form = $('#formEditar');
    form.id.value = v.id;
    form.nombre.value = v.nombre;
    form.telefono.value = v.telefono || '';
    form.especialidad.value = v.especialidad;
    form.duracionSlotMin.value = String(v.duracion_slot_min);
    form.activo.value = v.activo ? '1' : '0';
    form.descripcion.value = v.descripcion || '';

    $('#tituloEditar').textContent = `Editar a ${v.nombre}`;
    H.abrirModal('modalEditar');
  }

  async function actualizar(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorEditar');
    H.limpiarError(caja);

    const cuerpo = {
      nombre: form.nombre.value.trim(),
      telefono: form.telefono.value.trim() || null,
      especialidad: form.especialidad.value,
      duracionSlotMin: Number(form.duracionSlotMin.value),
      activo: form.activo.value === '1',
      descripcion: form.descripcion.value.trim() || null,
    };

    await H.conBoton($('#btnGuardarEditar'), 'Guardando…', async () => {
      try {
        await H.api.put(`/veterinarios/${form.id.value}`, cuerpo);
        H.cerrarModal('modalEditar');
        H.toast('Veterinario actualizado.');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }
})();
