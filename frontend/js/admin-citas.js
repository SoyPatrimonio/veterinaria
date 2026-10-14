/* ============================================================
   Administración — listado y gestión de todas las citas
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  let citas = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin']);
    if (!usuario) return;

    const hoy = H.fechaHoyISO();
    $('#inputDesde').value = hoy;
    $('#inputHasta').value = H.sumarDiasISO(hoy, 30);

    $('#btnFiltrar').addEventListener('click', recargar);

    try {
      const datos = await H.api.get('/veterinarios');
      $('#filtroVeterinario').innerHTML = '<option value="">Todos</option>' +
        datos.veterinarios.map((v) => `<option value="${v.id}">${escapar(v.nombre)}</option>`).join('');
    } catch (error) {
      H.toast(error.message, 'error');
    }

    await recargar();
  });

  async function recargar() {
    $('#listaCitas').innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/citas', {
        desde: $('#inputDesde').value || undefined,
        hasta: $('#inputHasta').value || undefined,
        veterinarioId: $('#filtroVeterinario').value || undefined,
        estado: $('#filtroEstado').value || undefined,
        limite: 300,
      });
      citas = datos.citas;
      pintar();
    } catch (error) {
      $('#listaCitas').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar() {
    $('#contador').textContent = `${citas.length} cita(s)`;
    const caja = $('#listaCitas');

    if (!citas.length) {
      caja.innerHTML = H.bloqueVacio('No hay citas con esos filtros.');
      return;
    }

    caja.innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr>
            <th>Fecha y hora</th><th>Mascota</th><th>Cliente</th>
            <th>Servicio</th><th>Veterinario</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${citas.map((c) => `
            <tr>
              <td>
                <strong>${escapar(H.hora12(c.inicio))}</strong><br>
                <span class="campo-ayuda">${escapar(H.fechaLarga(c.inicio))}</span>
              </td>
              <td>${escapar(c.mascota_nombre)}<br><span class="campo-ayuda">${escapar(c.especie)}</span></td>
              <td>${escapar(c.cliente_nombre)}<br><span class="campo-ayuda">${escapar(c.cliente_telefono || '—')}</span></td>
              <td>${escapar(c.servicio_nombre)}<br><span class="campo-ayuda">${escapar(H.moneda(c.precio))}</span></td>
              <td>${escapar(c.veterinario_nombre)}</td>
              <td>${H.insigniaEstado(c.estado)}</td>
              <td class="acciones">${acciones(c)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    caja.querySelectorAll('[data-estado]').forEach((btn) => {
      btn.addEventListener('click', () => cambiarEstado(Number(btn.dataset.id), btn.dataset.estado, btn));
    });
  }

  function acciones(cita) {
    const botones = [];
    if (cita.estado === 'pendiente') {
      botones.push(`<button type="button" class="btn btn-moss btn-sm" data-estado="confirmada" data-id="${cita.id}">Confirmar</button>`);
    }
    if (cita.estado === 'pendiente' || cita.estado === 'confirmada') {
      botones.push(`<button type="button" class="btn btn-outline btn-sm" data-estado="atendida" data-id="${cita.id}">Atendida</button>`);
      botones.push(`<button type="button" class="btn btn-outline btn-sm" data-estado="no_asistio" data-id="${cita.id}">No asistió</button>`);
      botones.push(`<button type="button" class="btn btn-peligro btn-sm" data-estado="cancelada" data-id="${cita.id}">Cancelar</button>`);
    }
    return botones.join('');
  }

  async function cambiarEstado(id, estado, boton) {
    if (estado === 'cancelada') {
      const cita = citas.find((c) => c.id === id);
      const ok = await H.confirmar(`¿Cancelar la cita de ${cita.mascota_nombre} del ${H.fechaLarga(cita.inicio)}?`);
      if (!ok) return;
    }

    await H.conBoton(boton, '…', async () => {
      try {
        await H.api.patch(`/citas/${id}/estado`, { estado });
        H.toast('Cita actualizada.');
        await recargar();
      } catch (error) {
        H.toast(error.message, 'error');
      }
    });
  }
})();
