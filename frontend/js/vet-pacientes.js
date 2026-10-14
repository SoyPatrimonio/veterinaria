/* ============================================================
   Listado de pacientes para el personal de la clínica
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  let pacientes = [];
  let temporizador = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['veterinario', 'admin']);
    if (!usuario) return;

    H.prepararModal('modalPaciente');

    // Se espera a que el usuario deje de escribir antes de consultar.
    $('#inputBusqueda').addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => buscar($('#inputBusqueda').value.trim()), 300);
    });

    await buscar('');
  });

  async function buscar(texto) {
    $('#listaPacientes').innerHTML = H.cargando();
    try {
      const datos = await H.api.get('/mascotas', { busqueda: texto || undefined, limite: 100 });
      pacientes = datos.mascotas;
      pintar();
    } catch (error) {
      $('#listaPacientes').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar() {
    $('#contador').textContent = `${pacientes.length} paciente(s)`;
    const caja = $('#listaPacientes');

    if (!pacientes.length) {
      caja.innerHTML = H.bloqueVacio('No se encontraron pacientes con ese criterio.', 'icon-paw');
      return;
    }

    caja.innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr>
            <th>Paciente</th><th>Especie / raza</th><th>Edad</th>
            <th>Dueño</th><th>Teléfono</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${pacientes.map((m) => `
            <tr>
              <td><strong>${escapar(m.nombre)}</strong></td>
              <td>${escapar(m.especie)}${m.raza ? ` · ${escapar(m.raza)}` : ''}</td>
              <td>${escapar(H.edadLegible(m.edad_meses))}</td>
              <td>${escapar(m.cliente_nombre)}</td>
              <td>${escapar(m.cliente_telefono || '—')}</td>
              <td class="acciones">
                <button type="button" class="btn btn-outline btn-sm" data-ficha="${m.id}">Ver ficha</button>
                <a class="btn btn-moss btn-sm" href="historia.html?mascota=${m.id}">Historia</a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    caja.querySelectorAll('[data-ficha]').forEach((btn) => {
      btn.addEventListener('click', () => abrirFicha(Number(btn.dataset.ficha)));
    });
  }

  async function abrirFicha(id) {
    const mascota = pacientes.find((m) => m.id === id);
    $('#fichaPaciente').innerHTML = H.cargando();
    H.abrirModal('modalPaciente');

    // La ficha se abre igual sin el historial: los datos de la mascota ya
    // están cargados y son lo principal. Pero el fallo se registra, porque un
    // historial vacío por avería se ve idéntico a uno vacío de verdad.
    let citas = [];
    try {
      const datos = await H.api.get('/citas', { mascotaId: id, limite: 20 });
      citas = datos.citas;
    } catch (error) {
      console.error('[pacientes] no se pudo cargar el historial de citas:', error);
      H.toast('No se pudo cargar el historial de citas.', 'error');
    }

    const sexo = { macho: 'Macho', hembra: 'Hembra', desconocido: 'Sin registrar' }[mascota.sexo];

    const datosFicha = [
      ['Especie', mascota.especie],
      ['Raza', mascota.raza || 'Sin registrar'],
      ['Sexo', sexo],
      ['Edad', H.edadLegible(mascota.edad_meses)],
      ['Peso', mascota.peso_kg ? `${mascota.peso_kg} kg` : 'Sin registrar'],
      ['Color', mascota.color || 'Sin registrar'],
      ['Microchip', mascota.microchip || 'Sin microchip'],
      ['Esterilizado', mascota.esterilizado ? 'Sí' : 'No'],
      ['Dueño', mascota.cliente_nombre],
      ['Teléfono', mascota.cliente_telefono || 'Sin registrar'],
    ];

    $('#fichaPaciente').innerHTML = `
      <h3>${escapar(mascota.nombre)}</h3>
      <p class="modal-sub">Ficha del paciente e historial de citas.</p>

      <a class="btn btn-primary" href="historia.html?mascota=${mascota.id}" style="margin-bottom:16px">
        <svg class="icon"><use href="#icon-stetho"/></svg> Abrir historia clínica
      </a>

      <div class="resumen-cita">
        ${datosFicha.map(([k, v]) => `<div><span>${escapar(k)}</span><span>${escapar(v)}</span></div>`).join('')}
      </div>

      ${mascota.informacion
        ? `<p class="campo-ayuda" style="margin-bottom:16px"><strong>Notas del dueño:</strong> ${escapar(mascota.informacion)}</p>`
        : ''}

      <h4 style="font-family:var(--font-body);font-size:.9rem;margin-bottom:10px">Historial de citas</h4>
      ${citas.length
        ? `<div class="lista-citas">${citas.map((c) => H.tarjetaCita(c, 'clinica')).join('')}</div>`
        : H.bloqueVacio('Este paciente todavía no tiene citas registradas.')}`;
  }
})();
