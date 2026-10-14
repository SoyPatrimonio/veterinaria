/* ============================================================
   Agendamiento por pasos:
   mascota → servicio → veterinario → fecha y hora → confirmar
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const PASOS = ['Mascota', 'Servicio', 'Veterinario', 'Fecha y hora', 'Confirmar'];

  const estado = {
    paso: 1,
    mascota: null,
    servicio: null,
    veterinario: null,
    fecha: null,
    hora: null,
    slots: [],
  };

  let mascotas = [];
  let servicios = [];
  let veterinarios = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente']);
    if (!usuario) return;

    $('#btnAtras').addEventListener('click', atras);
    $('#btnSiguiente').addEventListener('click', siguiente);
    $('#inputFecha').addEventListener('change', cargarHorarios);

    const hoy = H.fechaHoyISO();
    $('#inputFecha').min = hoy;
    $('#inputFecha').max = H.sumarDiasISO(hoy, 60);

    await cargarMascotas();
    await cargarServicios();

    // Si se llega desde la ficha de una mascota, ya viene elegida.
    const preseleccion = Number(new URLSearchParams(location.search).get('mascota'));
    if (preseleccion) {
      const encontrada = mascotas.find((m) => m.id === preseleccion);
      if (encontrada) {
        estado.mascota = encontrada;
        estado.paso = 2;
      }
    }

    render();
  });

  /* --------------------------------------------------------
     Carga de datos
     -------------------------------------------------------- */

  async function cargarMascotas() {
    try {
      const datos = await H.api.get('/mascotas');
      mascotas = datos.mascotas;
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  async function cargarServicios() {
    try {
      const datos = await H.api.get('/servicios');
      servicios = datos.servicios;
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  async function cargarVeterinarios() {
    const caja = $('#opcionesVeterinario');
    caja.innerHTML = H.cargando();
    try {
      const datos = await H.api.get(`/servicios/${estado.servicio.id}/veterinarios`);
      veterinarios = datos.veterinarios;
    } catch (error) {
      veterinarios = [];
      H.toast(error.message, 'error');
    }
    pintarVeterinarios();
  }

  async function cargarHorarios() {
    estado.fecha = $('#inputFecha').value || null;
    estado.hora = null;

    const caja = $('#horariosDisponibles');
    if (!estado.fecha) {
      caja.innerHTML = '';
      return;
    }

    caja.innerHTML = H.cargando('Buscando horarios libres…');

    try {
      const datos = await H.api.get('/citas/disponibilidad', {
        veterinarioId: estado.veterinario.id,
        servicioId: estado.servicio.id,
        fecha: estado.fecha,
      });

      estado.slots = datos.slots || [];

      if (!estado.slots.length) {
        caja.innerHTML = H.bloqueVacio(datos.mensaje || 'No quedan horarios libres ese día.', 'icon-clock');
        return;
      }

      caja.innerHTML = `
        <p class="campo-ayuda" style="margin-bottom:10px">
          ${estado.slots.length} horario(s) disponible(s) el ${escapar(H.diaSemanaDe(estado.fecha))} ${escapar(H.fechaLarga(estado.fecha))}.
          Cada cita dura ${escapar(estado.servicio.duracion_min)} minutos.
        </p>
        <div class="horarios">
          ${estado.slots.map((s) => `<button type="button" class="horario" data-hora="${escapar(s.hora)}">${escapar(H.hora12(s.hora))}</button>`).join('')}
        </div>`;

      caja.querySelectorAll('.horario').forEach((btn) => {
        btn.addEventListener('click', () => {
          estado.hora = btn.dataset.hora;
          caja.querySelectorAll('.horario').forEach((b) => b.classList.toggle('elegido', b === btn));
          H.limpiarError($('#errorAgenda'));
        });
      });
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  /* --------------------------------------------------------
     Pintado de cada paso
     -------------------------------------------------------- */

  function render() {
    // Barra de progreso
    $('#pasos').innerHTML = PASOS.map((texto, i) => {
      const numero = i + 1;
      const clase = numero === estado.paso ? 'activo' : numero < estado.paso ? 'listo' : '';
      return `<span class="paso-chip ${clase}"><b>${numero < estado.paso ? '✓' : numero}</b>${escapar(texto)}</span>`;
    }).join('');

    // Panel visible
    document.querySelectorAll('.panel-pestana').forEach((p) => {
      p.hidden = Number(p.dataset.paso) !== estado.paso;
    });

    if (estado.paso === 1) pintarMascotas();
    if (estado.paso === 2) pintarServicios();
    if (estado.paso === 3) cargarVeterinarios();
    if (estado.paso === 5) pintarResumen();

    $('#btnAtras').style.visibility = estado.paso === 1 ? 'hidden' : 'visible';
    $('#btnSiguiente').textContent = estado.paso === 5 ? 'Confirmar cita' : 'Continuar';
  }

  function pintarMascotas() {
    const caja = $('#opcionesMascota');

    if (!mascotas.length) {
      caja.innerHTML = `${H.bloqueVacio('Necesitas registrar una mascota antes de agendar.', 'icon-paw')}
        <a class="btn btn-primary" href="${H.ruta('cliente/mascotas.html')}">Registrar mascota</a>`;
      return;
    }

    caja.innerHTML = `<div class="opciones">
      ${mascotas.map((m) => `
        <button type="button" class="opcion ${estado.mascota?.id === m.id ? 'elegida' : ''}" data-id="${m.id}">
          <h4>${escapar(m.nombre)}</h4>
          <p>${escapar(m.especie)}${m.raza ? ` · ${escapar(m.raza)}` : ''}</p>
          <div class="opcion-pie"><span>${escapar(H.edadLegible(m.edad_meses))}</span></div>
        </button>`).join('')}
    </div>`;

    conectarOpciones(caja, (id) => {
      estado.mascota = mascotas.find((m) => m.id === id);
    });
  }

  function pintarServicios() {
    const caja = $('#opcionesServicio');

    caja.innerHTML = `<div class="opciones">
      ${servicios.map((s) => `
        <button type="button" class="opcion ${estado.servicio?.id === s.id ? 'elegida' : ''}" data-id="${s.id}">
          <h4>${escapar(s.nombre)}</h4>
          <p>${escapar((s.descripcion || '').slice(0, 110))}</p>
          <div class="opcion-pie">
            <span>${escapar(s.duracion_min)} min</span>
            <span>${escapar(Number(s.precio) > 0 ? H.moneda(s.precio) : 'Sin costo')}</span>
          </div>
        </button>`).join('')}
    </div>`;

    conectarOpciones(caja, (id) => {
      const nuevo = servicios.find((s) => s.id === id);
      // Cambiar de servicio invalida el veterinario y el horario elegidos.
      if (estado.servicio && estado.servicio.id !== id) {
        estado.veterinario = null;
        estado.hora = null;
      }
      estado.servicio = nuevo;
    });
  }

  function pintarVeterinarios() {
    const caja = $('#opcionesVeterinario');

    if (!veterinarios.length) {
      caja.innerHTML = H.bloqueVacio('No hay veterinarios disponibles para este servicio.', 'icon-user');
      return;
    }

    caja.innerHTML = `<div class="opciones">
      ${veterinarios.map((v) => `
        <button type="button" class="opcion ${estado.veterinario?.id === v.id ? 'elegida' : ''}" data-id="${v.id}">
          <h4>${escapar(v.nombre)}</h4>
          <p>${escapar(H.ETIQUETA_ESPECIALIDAD[v.especialidad] || v.especialidad)}</p>
          ${v.descripcion ? `<div class="opcion-pie"><span>${escapar(v.descripcion.slice(0, 70))}</span></div>` : ''}
        </button>`).join('')}
    </div>`;

    conectarOpciones(caja, (id) => {
      if (estado.veterinario && estado.veterinario.id !== id) estado.hora = null;
      estado.veterinario = veterinarios.find((v) => v.id === id);
    });
  }

  function conectarOpciones(caja, alElegir) {
    caja.querySelectorAll('.opcion').forEach((btn) => {
      btn.addEventListener('click', () => {
        alElegir(Number(btn.dataset.id));
        caja.querySelectorAll('.opcion').forEach((b) => b.classList.toggle('elegida', b === btn));
        H.limpiarError($('#errorAgenda'));
      });
    });
  }

  function pintarResumen() {
    const filas = [
      ['Mascota', estado.mascota.nombre],
      ['Servicio', estado.servicio.nombre],
      ['Veterinario', estado.veterinario.nombre],
      ['Fecha', `${H.diaSemanaDe(estado.fecha)} ${H.fechaLarga(estado.fecha)}`],
      ['Hora', H.hora12(estado.hora)],
      ['Duración', `${estado.servicio.duracion_min} minutos`],
      ['Valor', Number(estado.servicio.precio) > 0 ? H.moneda(estado.servicio.precio) : 'Sin costo'],
    ];

    $('#resumenCita').innerHTML = filas
      .map(([etiqueta, valor]) => `<div><span>${escapar(etiqueta)}</span><span>${escapar(valor)}</span></div>`)
      .join('');
  }

  /* --------------------------------------------------------
     Navegación
     -------------------------------------------------------- */

  function atras() {
    H.limpiarError($('#errorAgenda'));
    if (estado.paso > 1) {
      estado.paso -= 1;
      render();
    }
  }

  async function siguiente() {
    const caja = $('#errorAgenda');
    H.limpiarError(caja);

    if (estado.paso === 1 && !estado.mascota) {
      return H.mostrarError(caja, new Error('Elige la mascota que va a la cita.'));
    }
    if (estado.paso === 2 && !estado.servicio) {
      return H.mostrarError(caja, new Error('Elige el servicio.'));
    }
    if (estado.paso === 3 && !estado.veterinario) {
      return H.mostrarError(caja, new Error('Elige el veterinario que la atenderá.'));
    }
    if (estado.paso === 4) {
      if (!estado.fecha) return H.mostrarError(caja, new Error('Elige la fecha.'));
      if (!estado.hora) return H.mostrarError(caja, new Error('Elige uno de los horarios disponibles.'));
    }

    if (estado.paso === 5) return confirmar();

    estado.paso += 1;
    render();
  }

  async function confirmar() {
    const caja = $('#errorAgenda');

    await H.conBoton($('#btnSiguiente'), 'Agendando…', async () => {
      try {
        const datos = await H.api.post('/citas', {
          mascotaId: estado.mascota.id,
          servicioId: estado.servicio.id,
          veterinarioId: estado.veterinario.id,
          fecha: estado.fecha,
          hora: estado.hora,
          motivo: $('#inputMotivo').value.trim() || null,
        });

        H.toast('Cita agendada. Te confirmaremos por teléfono.');
        location.href = `${H.ruta('cliente/citas.html')}?nueva=${datos.cita.id}`;
      } catch (error) {
        H.mostrarError(caja, error);

        // Si el horario se ocupó mientras decidías, se vuelve al paso de la hora.
        if (error.status === 409) {
          estado.hora = null;
          estado.paso = 4;
          render();
          cargarHorarios();
        }
      }
    });
  }
})();
