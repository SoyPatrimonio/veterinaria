/* ============================================================
   Panel del cliente — listado de citas y cancelación
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $ } = H;

  let citas = [];
  let filtro = 'proximas';

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente']);
    if (!usuario) return;

    const nueva = new URLSearchParams(location.search).get('nueva');
    if (nueva) {
      $('#aviso').innerHTML = `<div class="mensaje-ok">
        Tu cita quedó registrada. La clínica la confirmará y te avisará por teléfono.
      </div>`;
    }

    document.querySelectorAll('#filtros button').forEach((btn) => {
      btn.addEventListener('click', () => {
        filtro = btn.dataset.filtro;
        document.querySelectorAll('#filtros button').forEach((b) => b.classList.toggle('activa', b === btn));
        pintar();
      });
    });

    await recargar();
  });

  async function recargar() {
    $('#listaCitas').innerHTML = H.cargando();
    try {
      const datos = await H.api.get('/citas', { limite: 200 });
      citas = datos.citas;
      pintar();
    } catch (error) {
      $('#listaCitas').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function filtrar() {
    const ahora = new Date();

    if (filtro === 'proximas') {
      return citas.filter((c) =>
        new Date(String(c.inicio).replace(' ', 'T')) >= ahora &&
        ['pendiente', 'confirmada'].includes(c.estado)
      );
    }
    if (filtro === 'historial') {
      return citas
        .filter((c) => new Date(String(c.inicio).replace(' ', 'T')) < ahora || ['atendida', 'cancelada', 'no_asistio'].includes(c.estado))
        .reverse();
    }
    return citas;
  }

  function pintar() {
    const caja = $('#listaCitas');
    const lista = filtrar();

    if (!lista.length) {
      const mensajes = {
        proximas: 'No tienes citas próximas. Agenda una cuando lo necesites.',
        historial: 'Todavía no hay citas en el historial.',
        todas: 'Aún no has agendado ninguna cita.',
      };
      caja.innerHTML = H.bloqueVacio(mensajes[filtro]);
      return;
    }

    caja.innerHTML = `<div class="lista-citas">
      ${lista.map((c) => {
        const cancelable = ['pendiente', 'confirmada'].includes(c.estado) &&
          new Date(String(c.inicio).replace(' ', 'T')) > new Date();

        const acciones = cancelable
          ? `<button type="button" class="btn btn-peligro btn-sm" data-cancelar="${c.id}">Cancelar</button>`
          : '';

        return H.tarjetaCita(c, 'cliente', acciones);
      }).join('')}
    </div>`;

    caja.querySelectorAll('[data-cancelar]').forEach((btn) => {
      btn.addEventListener('click', () => cancelar(Number(btn.dataset.cancelar)));
    });
  }

  async function cancelar(id) {
    const cita = citas.find((c) => c.id === id);
    const confirmado = await H.confirmar(
      `¿Cancelar la cita de ${cita.mascota_nombre} del ${H.fechaLarga(cita.inicio)} a las ${H.hora12(cita.inicio)}?`
    );
    if (!confirmado) return;

    try {
      await H.api.del(`/citas/${id}`);
      H.toast('Cita cancelada.');
      await recargar();
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }
})();
