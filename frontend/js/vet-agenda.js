/* ============================================================
   Agenda del veterinario: vistas día / semana / mes,
   cambios de estado, bloqueos y horario de atención.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  let usuario = null;
  let vista = 'dia';
  let fecha = H.fechaHoyISO();
  let citas = [];
  let bloqueos = [];

  document.addEventListener('DOMContentLoaded', async () => {
    usuario = H.montarPanel(['veterinario']);
    if (!usuario) return;

    H.prepararModal('modalBloqueo');
    H.prepararModal('modalHorario');

    $('#inputFecha').value = fecha;
    $('#inputFecha').addEventListener('change', () => {
      fecha = $('#inputFecha').value || H.fechaHoyISO();
      recargar();
    });

    document.querySelectorAll('#selectorVista button').forEach((btn) => {
      btn.addEventListener('click', () => {
        vista = btn.dataset.vista;
        document.querySelectorAll('#selectorVista button').forEach((b) => b.classList.toggle('activo', b === btn));
        recargar();
      });
    });

    $('#btnAnterior').addEventListener('click', () => mover(-1));
    $('#btnSiguiente').addEventListener('click', () => mover(1));
    $('#btnHoy').addEventListener('click', () => {
      fecha = H.fechaHoyISO();
      $('#inputFecha').value = fecha;
      recargar();
    });
    $('#filtroEstado').addEventListener('change', pintar);

    $('#btnBloquear').addEventListener('click', () => {
      H.limpiarError($('#errorBloqueo'));
      $('#formBloqueo').fecha.value = fecha;
      H.abrirModal('modalBloqueo');
    });
    $('#formBloqueo').addEventListener('submit', guardarBloqueo);

    $('#btnHorario').addEventListener('click', abrirHorario);
    $('#btnAgregarFranja').addEventListener('click', () => agregarFranja());
    $('#btnGuardarHorario').addEventListener('click', guardarHorario);

    await recargar();
  });

  function mover(direccion) {
    const salto = vista === 'dia' ? 1 : vista === 'semana' ? 7 : 30;
    fecha = H.sumarDiasISO(fecha, salto * direccion);
    $('#inputFecha').value = fecha;
    recargar();
  }

  /** Rango [desde, hasta] que se pide a la API según la vista activa. */
  function rango() {
    if (vista === 'dia') return { desde: fecha, hasta: fecha };

    if (vista === 'semana') {
      const dia = new Date(`${fecha}T00:00:00`).getDay();
      const lunes = H.sumarDiasISO(fecha, dia === 0 ? -6 : 1 - dia);
      return { desde: lunes, hasta: H.sumarDiasISO(lunes, 6) };
    }

    const [anio, mes] = fecha.split('-').map(Number);
    const primero = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anio, mes, 0).getDate();
    return { desde: primero, hasta: `${anio}-${String(mes).padStart(2, '0')}-${ultimoDia}` };
  }

  async function recargar() {
    const { desde, hasta } = rango();
    $('#contenidoAgenda').innerHTML = H.cargando();

    try {
      const [datosCitas, datosBloqueos] = await Promise.all([
        H.api.get('/citas', { desde, hasta, limite: 300 }),
        H.api.get(`/veterinarios/${usuario.veterinarioId}/bloqueos`, { desde, hasta }),
      ]);
      citas = datosCitas.citas;
      bloqueos = datosBloqueos.bloqueos;
      pintar();
      pintarBloqueos();
    } catch (error) {
      $('#contenidoAgenda').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  /* --------------------------------------------------------
     Pintado
     -------------------------------------------------------- */

  function citasVisibles() {
    const estado = $('#filtroEstado').value;
    return estado ? citas.filter((c) => c.estado === estado) : citas;
  }

  function pintar() {
    const { desde, hasta } = rango();
    const lista = citasVisibles();

    $('#tituloRango').textContent = vista === 'dia'
      ? `${DIAS[new Date(`${fecha}T00:00:00`).getDay()]} ${H.fechaLarga(fecha)}`
      : `${H.fechaLarga(desde)} — ${H.fechaLarga(hasta)}`;

    $('#contadorCitas').textContent = `${lista.length} cita(s)`;

    if (vista === 'semana') return pintarSemana(desde, lista);
    return pintarLista(lista);
  }

  function acciones(cita) {
    const botones = [];
    if (cita.estado === 'pendiente') {
      botones.push(`<button type="button" class="btn btn-moss btn-sm" data-estado="confirmada" data-id="${cita.id}">Confirmar</button>`);
    }
    if (cita.estado === 'pendiente' || cita.estado === 'confirmada') {
      botones.push(`<button type="button" class="btn btn-outline btn-sm" data-estado="atendida" data-id="${cita.id}">Atendida</button>`);
      botones.push(`<button type="button" class="btn btn-peligro btn-sm" data-estado="cancelada" data-id="${cita.id}">Cancelar</button>`);
    }
    return botones.join('');
  }

  function pintarLista(lista) {
    const caja = $('#contenidoAgenda');

    if (!lista.length) {
      caja.innerHTML = H.bloqueVacio('No hay citas en este periodo.');
      return;
    }

    // Agrupadas por fecha para que la vista de mes siga siendo legible.
    const grupos = {};
    lista.forEach((c) => {
      const dia = String(c.inicio).slice(0, 10);
      (grupos[dia] = grupos[dia] || []).push(c);
    });

    caja.innerHTML = Object.keys(grupos).sort().map((dia) => `
      <h4 style="margin:18px 0 10px;font-family:var(--font-body);font-size:.86rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">
        ${escapar(DIAS[new Date(`${dia}T00:00:00`).getDay()])} ${escapar(H.fechaLarga(dia))}
      </h4>
      <div class="lista-citas">
        ${grupos[dia].map((c) => H.tarjetaCita(c, 'clinica', acciones(c))).join('')}
      </div>`).join('');

    conectarAcciones(caja);
  }

  function pintarSemana(lunes, lista) {
    const caja = $('#contenidoAgenda');
    const hoy = H.fechaHoyISO();

    const columnas = [];
    for (let i = 0; i < 7; i += 1) {
      const dia = H.sumarDiasISO(lunes, i);
      const delDia = lista.filter((c) => String(c.inicio).slice(0, 10) === dia);

      columnas.push(`
        <div class="dia-columna ${dia === hoy ? 'hoy' : ''}">
          <div class="dia-cabecera">
            <strong>${escapar(DIAS[new Date(`${dia}T00:00:00`).getDay()])}</strong>
            <small>${escapar(H.fechaLarga(dia))}</small>
          </div>
          ${delDia.length
            ? delDia.map((c) => `
                <div class="dia-cita estado-${escapar(c.estado)}">
                  <strong>${escapar(H.hora12(c.inicio))} · ${escapar(c.mascota_nombre)}</strong>
                  <span>${escapar(c.servicio_nombre)}</span>
                </div>`).join('')
            : '<p class="campo-ayuda">Sin citas</p>'}
        </div>`);
    }

    caja.innerHTML = `<div class="semana">${columnas.join('')}</div>`;
  }

  function conectarAcciones(caja) {
    caja.querySelectorAll('[data-estado]').forEach((btn) => {
      btn.addEventListener('click', () => cambiarEstado(Number(btn.dataset.id), btn.dataset.estado, btn));
    });
  }

  async function cambiarEstado(id, estado, boton) {
    if (estado === 'cancelada') {
      const cita = citas.find((c) => c.id === id);
      const ok = await H.confirmar(`¿Cancelar la cita de ${cita.mascota_nombre} (${H.hora12(cita.inicio)})?`);
      if (!ok) return;
    }

    await H.conBoton(boton, '…', async () => {
      try {
        await H.api.patch(`/citas/${id}/estado`, { estado });
        H.toast(`Cita marcada como ${H.ETIQUETA_ESTADO[estado].toLowerCase()}.`);
        await recargar();
      } catch (error) {
        H.toast(error.message, 'error');
      }
    });
  }

  /* --------------------------------------------------------
     Bloqueos
     -------------------------------------------------------- */

  function pintarBloqueos() {
    const caja = $('#listaBloqueos');

    if (!bloqueos.length) {
      caja.innerHTML = H.bloqueVacio('No tienes horarios bloqueados en este periodo.', 'icon-shield');
      return;
    }

    caja.innerHTML = `<div class="lista-citas">
      ${bloqueos.map((b) => `
        <article class="cita">
          <div class="cita-hora" style="background:rgba(183,121,31,.14);color:#B7791F">
            <strong>${escapar(H.hora12(b.inicio))}</strong>
            <small>${escapar(H.hora12(b.fin))}</small>
          </div>
          <div class="cita-info">
            <h4>${escapar(b.motivo || 'Horario bloqueado')}</h4>
            <p>${escapar(H.fechaLarga(b.inicio))}</p>
          </div>
          <div class="cita-lado">
            <button type="button" class="btn btn-peligro btn-sm" data-borrar="${b.id}">Quitar</button>
          </div>
        </article>`).join('')}
    </div>`;

    caja.querySelectorAll('[data-borrar]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await H.api.del(`/veterinarios/${usuario.veterinarioId}/bloqueos/${btn.dataset.borrar}`);
          H.toast('Bloqueo eliminado.');
          await recargar();
        } catch (error) {
          H.toast(error.message, 'error');
        }
      });
    });
  }

  async function guardarBloqueo(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorBloqueo');
    H.limpiarError(caja);

    const cuerpo = {
      fecha: form.fecha.value,
      horaInicio: form.horaInicio.value,
      horaFin: form.horaFin.value,
      motivo: form.motivo.value.trim() || null,
    };

    if (!cuerpo.fecha || !cuerpo.horaInicio || !cuerpo.horaFin) {
      return H.mostrarError(caja, new Error('Completa la fecha y las dos horas.'));
    }
    if (cuerpo.horaFin <= cuerpo.horaInicio) {
      return H.mostrarError(caja, new Error('La hora final debe ser posterior a la inicial.'));
    }

    await H.conBoton($('#btnGuardarBloqueo'), 'Guardando…', async () => {
      try {
        await H.api.post(`/veterinarios/${usuario.veterinarioId}/bloqueos`, cuerpo);
        H.cerrarModal('modalBloqueo');
        H.toast('Horario bloqueado.');
        form.reset();
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Horario de atención
     -------------------------------------------------------- */

  async function abrirHorario() {
    H.limpiarError($('#errorHorario'));
    $('#editorHorario').innerHTML = H.cargando();
    H.abrirModal('modalHorario');

    try {
      const datos = await H.api.get(`/veterinarios/${usuario.veterinarioId}/horarios`);
      $('#editorHorario').innerHTML = '';
      if (!datos.horarios.length) {
        agregarFranja();
      } else {
        datos.horarios.forEach((h) => agregarFranja({
          diaSemana: h.dia_semana,
          horaInicio: String(h.hora_inicio).slice(0, 5),
          horaFin: String(h.hora_fin).slice(0, 5),
        }));
      }
    } catch (error) {
      $('#editorHorario').innerHTML = '';
      H.mostrarError($('#errorHorario'), error);
    }
  }

  function agregarFranja(valores) {
    const v = valores || { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' };

    const fila = document.createElement('div');
    fila.className = 'horario-fila';
    fila.innerHTML = `
      <label class="campo" style="margin:0">
        <span>Día</span>
        <select class="franja-dia">
          ${DIAS.map((d, i) => `<option value="${i}" ${i === Number(v.diaSemana) ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </label>
      <label class="campo" style="margin:0">
        <span>Desde</span>
        <input type="time" class="franja-inicio" value="${escapar(v.horaInicio)}">
      </label>
      <label class="campo" style="margin:0">
        <span>Hasta</span>
        <input type="time" class="franja-fin" value="${escapar(v.horaFin)}">
      </label>
      <button type="button" class="btn btn-peligro btn-sm quitar-franja" aria-label="Quitar franja">
        <svg class="icon"><use href="#icon-basura"/></svg>
      </button>`;

    fila.querySelector('.quitar-franja').addEventListener('click', () => fila.remove());
    $('#editorHorario').appendChild(fila);
  }

  async function guardarHorario() {
    const caja = $('#errorHorario');
    H.limpiarError(caja);

    const horarios = Array.from(document.querySelectorAll('#editorHorario .horario-fila')).map((fila) => ({
      diaSemana: Number(fila.querySelector('.franja-dia').value),
      horaInicio: fila.querySelector('.franja-inicio').value,
      horaFin: fila.querySelector('.franja-fin').value,
    }));

    for (const h of horarios) {
      if (!h.horaInicio || !h.horaFin) {
        return H.mostrarError(caja, new Error('Completa las horas de todas las franjas.'));
      }
      if (h.horaFin <= h.horaInicio) {
        return H.mostrarError(caja, new Error(`En ${DIAS[h.diaSemana]} la hora final debe ser posterior a la inicial.`));
      }
    }

    await H.conBoton($('#btnGuardarHorario'), 'Guardando…', async () => {
      try {
        await H.api.put(`/veterinarios/${usuario.veterinarioId}/horarios`, { horarios });
        H.cerrarModal('modalHorario');
        H.toast('Horario actualizado.');
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }
})();
