/* ============================================================
   Hospitalización — tablero de internados

   Lo que hace útil esta pantalla no es la lista, es saber a quién
   le toca algo AHORA: la medicación vencida y el tiempo desde el
   último control salen antes que cualquier otro dato.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const MS_REFRESCO = 60000;

  // A partir de aquí un paciente lleva demasiado sin que nadie lo mire. Es el
  // mismo umbral por defecto que usa la alerta 'hospitalizado_sin_control'.
  const HORAS_SIN_CONTROL = 8;

  const ETIQUETA_CONSUMO = {
    total: 'Comió todo',
    parcial: 'Comió parte',
    nada: 'No comió',
    rechazo: 'Rechazó el alimento',
  };

  let pacientes = [];
  let habitaciones = [];
  let habitacionesLibres = [];
  let veterinarios = [];
  let listaMascotas = [];
  let abierto = null;
  let temporizador = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['veterinario', 'admin'], ['hospitalizacion.ver', 'hospitalizacion.gestionar']);
    if (!usuario) return;

    ['modalIngreso', 'modalPaciente'].forEach(H.prepararModal);

    $('#btnIngresar').addEventListener('click', abrirIngreso);
    $('#formIngreso').addEventListener('submit', ingresar);

    $('#pestanasPaciente').addEventListener('click', (e) => {
      const boton = e.target.closest('[data-pestana]');
      if (boton) mostrarPestana(boton.dataset.pestana);
    });

    await cargarCatalogos();
    await recargar();

    temporizador = setInterval(recargar, MS_REFRESCO);
    document.addEventListener('visibilitychange', () => {
      clearInterval(temporizador);
      if (!document.hidden) {
        recargar();
        temporizador = setInterval(recargar, MS_REFRESCO);
      }
    });
  });

  async function cargarCatalogos() {
    try {
      const [vets, mascotas] = await Promise.all([
        H.api.get('/veterinarios'),
        H.api.get('/mascotas', { limite: 200 }),
      ]);
      veterinarios = vets.veterinarios || [];
      listaMascotas = mascotas.mascotas || [];
    } catch (error) {
      H.toast(`No se pudieron cargar los catálogos: ${error.message}`, 'error');
    }
  }

  async function recargar() {
    try {
      const [tablero, todasHabitaciones] = await Promise.all([
        H.api.get('/hospitalizacion/tablero'),
        H.api.get('/hospitalizacion/habitaciones'),
      ]);

      pacientes = tablero.pacientes || [];
      habitacionesLibres = tablero.habitacionesLibres || [];
      habitaciones = todasHabitaciones.habitaciones || [];

      pintarMetricas();
      pintarPacientes();
      pintarHabitaciones();
      $('#ultimaActualizacion').textContent =
        `Actualizado a las ${H.hora12(new Date().toTimeString().slice(0, 5))}`;
    } catch (error) {
      $('#listaPacientes').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  /** Horas transcurridas desde una marca de tiempo de la base. */
  function horasDesde(valor) {
    if (!valor) return null;
    const fecha = new Date(String(valor).replace(' ', 'T'));
    return (Date.now() - fecha.getTime()) / 3600000;
  }

  function pintarMetricas() {
    const conMedicacion = pacientes.filter((p) => Number(p.medicacion_vencida) > 0).length;
    const sinControl = pacientes.filter((p) => {
      const horas = horasDesde(p.ultimo_control || p.fecha_ingreso);
      return horas !== null && horas > HORAS_SIN_CONTROL;
    }).length;

    const tarjetas = [
      { texto: 'Internados', valor: pacientes.length, icono: 'icon-house' },
      { texto: 'Medicación vencida', valor: conMedicacion, icono: 'icon-syringe' },
      { texto: 'Sin control reciente', valor: sinControl, icono: 'icon-clock' },
      { texto: 'Jaulas libres', valor: habitacionesLibres.length, icono: 'icon-check' },
    ];

    $('#metricas').innerHTML = tarjetas.map((t) => `
      <article class="metrica">
        <span class="metrica-icono"><svg class="icon"><use href="#${t.icono}"/></svg></span>
        <div class="contador-vivo">${escapar(t.valor)}<small>${escapar(t.texto)}</small></div>
      </article>`).join('');
  }

  function pintarPacientes() {
    const caja = $('#listaPacientes');

    if (!pacientes.length) {
      caja.innerHTML = H.bloqueVacio('No hay pacientes hospitalizados.', 'icon-house');
      return;
    }

    caja.innerHTML = pacientes.map((p) => {
      const horas = horasDesde(p.ultimo_control || p.fecha_ingreso);
      const sinControl = horas !== null && horas > HORAS_SIN_CONTROL;
      const medicacionVencida = Number(p.medicacion_vencida) > 0;

      // La franja lateral usa la escala del triage para que la lectura rápida
      // sea la misma que en urgencias: rojo es lo que hay que mirar ya.
      const franja = medicacionVencida ? 'rojo' : sinControl ? 'naranja' : 'verde';

      return `<article class="cita fila-triage fila-triage-${franja}" data-id="${p.id}">
        <div class="cita-hora">
          <strong>${escapar(p.habitacion || 'sin jaula')}</strong>
          <small>${escapar(H.fechaLarga(p.fecha_ingreso))}</small>
        </div>
        <div class="cita-info">
          <h4>${escapar(p.mascota)} <span class="campo-ayuda">· ${escapar(p.especie)}</span></h4>
          <p>${escapar(p.motivo)}</p>
          <p class="campo-ayuda">
            ${escapar(p.veterinario || 'sin veterinario')}
            · ${escapar(p.cliente)} (${escapar(p.cliente_telefono || 'sin teléfono')})
            ${p.pronostico ? ` · pronóstico ${escapar(p.pronostico)}` : ''}
          </p>
          <p class="campo-ayuda">
            Último control:
            <span class="${sinControl ? 'texto-alerta' : ''}">
              ${p.ultimo_control ? `${escapar(H.hora12(p.ultimo_control))} (hace ${Math.floor(horas)} h)` : 'ninguno todavía'}
            </span>
            ${medicacionVencida
              ? ` · <span class="texto-alerta">${escapar(p.medicacion_vencida)} dosis vencida(s)</span>`
              : p.proxima_medicacion ? ` · próxima dosis ${escapar(H.hora12(p.proxima_medicacion))}` : ''}
          </p>
        </div>
        <div class="cita-lado">
          <button type="button" class="btn btn-primary btn-sm" data-abrir="${p.id}">Seguimiento</button>
        </div>
      </article>`;
    }).join('');

    caja.querySelectorAll('[data-abrir]').forEach((b) => {
      b.addEventListener('click', () => abrirPaciente(Number(b.dataset.abrir)));
    });
  }

  function pintarHabitaciones() {
    const caja = $('#listaHabitaciones');

    if (!habitaciones.length) {
      caja.innerHTML = H.bloqueVacio('No hay jaulas registradas.', 'icon-house');
      return;
    }

    caja.innerHTML = `<div class="opciones">
      ${habitaciones.map((h) => `
        <article class="opcion">
          <strong>${escapar(h.codigo)}</strong>
          <span class="insignia insignia-${escapar(h.estado)}">${escapar(h.estado)}</span>
          <small class="campo-ayuda">
            ${escapar(h.tipo)} · ${escapar(h.tamano)}
            ${h.aislamiento ? ' · aislamiento' : ''}
            ${h.sede_nombre ? ` · ${escapar(h.sede_nombre)}` : ''}
          </small>
          ${h.estado === 'limpieza' && H.puede('habitaciones.gestionar')
            ? `<button type="button" class="btn btn-outline btn-sm" data-liberar="${h.id}">Marcar disponible</button>`
            : ''}
        </article>`).join('')}
    </div>`;

    caja.querySelectorAll('[data-liberar]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await H.api.patch(`/hospitalizacion/habitaciones/${b.dataset.liberar}`, { estado: 'disponible' });
          H.toast('Jaula disponible.');
          await recargar();
        } catch (error) {
          H.toast(error.message, 'error');
        }
      });
    });
  }

  /* --------------------------------------------------------
     Ingreso
     -------------------------------------------------------- */

  function abrirIngreso() {
    const form = $('#formIngreso');
    H.limpiarError($('#errorIngreso'));
    form.reset();

    form.mascotaId.innerHTML = '<option value="">Selecciona el paciente</option>' + listaMascotas
      .map((m) => `<option value="${m.id}">${escapar(m.nombre)} — ${escapar(m.cliente_nombre || '')}</option>`)
      .join('');

    form.veterinarioId.innerHTML = '<option value="">Selecciona</option>' + veterinarios
      .map((v) => `<option value="${v.id}">${escapar(v.nombre)}</option>`).join('');

    // Solo las libres: ofrecer una jaula ocupada es prometer algo que el
    // servidor va a rechazar igual.
    form.habitacionId.innerHTML = '<option value="">Sin asignar</option>' + habitacionesLibres
      .map((h) => `<option value="${h.id}">${escapar(h.codigo)} — ${escapar(h.tipo)} ${escapar(h.tamano)}</option>`)
      .join('');

    H.abrirModal('modalIngreso');
  }

  async function ingresar(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorIngreso');
    H.limpiarError(caja);

    const cuerpo = {
      mascotaId: Number(form.mascotaId.value),
      veterinarioId: Number(form.veterinarioId.value),
      habitacionId: form.habitacionId.value ? Number(form.habitacionId.value) : null,
      motivo: form.motivo.value.trim(),
      dieta: form.dieta.value.trim() || null,
      pronostico: form.pronostico.value || null,
      indicaciones: form.indicaciones.value.trim() || null,
    };

    if (!cuerpo.mascotaId) return H.mostrarError(caja, new Error('Selecciona el paciente.'));
    if (!cuerpo.veterinarioId) return H.mostrarError(caja, new Error('Selecciona el veterinario responsable.'));
    if (cuerpo.motivo.length < 3) return H.mostrarError(caja, new Error('Escribe el motivo del ingreso.'));

    await H.conBoton($('#btnGuardarIngreso'), 'Ingresando…', async () => {
      try {
        await H.api.post('/hospitalizacion', cuerpo);
        H.cerrarModal('modalIngreso');
        H.toast('Paciente ingresado.');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Seguimiento
     -------------------------------------------------------- */

  async function abrirPaciente(id) {
    H.limpiarError($('#errorPaciente'));
    $('#cuerpoPaciente').innerHTML = H.cargando();
    H.abrirModal('modalPaciente');

    try {
      abierto = await H.api.get(`/hospitalizacion/${id}`);
    } catch (error) {
      $('#cuerpoPaciente').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    // El detalle nombra los campos distinto que el tablero: viene de la tabla
    // con alias (mascota_nombre) y no de la vista (mascota).
    const h = abierto.hospitalizacion;
    $('#tituloPaciente').textContent = `${h.mascota_nombre} — ${h.motivo}`;
    $('#subPaciente').textContent =
      `Ingresó el ${H.fechaLarga(h.fecha_ingreso)} a las ${H.hora12(h.fecha_ingreso)}` +
      `${h.habitacion_codigo ? ` · jaula ${h.habitacion_codigo}` : ''}` +
      `${h.dieta ? ` · dieta: ${h.dieta}` : ''}`;

    mostrarPestana('controles');
  }

  function mostrarPestana(nombre) {
    H.$$('#pestanasPaciente button').forEach((b) => {
      b.classList.toggle('activa', b.dataset.pestana === nombre);
    });

    const vistas = {
      controles: vistaControles,
      medicacion: vistaMedicacion,
      alimentacion: vistaAlimentacion,
      visitas: vistaVisitas,
      egreso: vistaEgreso,
    };

    $('#cuerpoPaciente').innerHTML = (vistas[nombre] || vistaControles)();
    conectarPestana(nombre);
  }

  function siNo(valor) {
    if (valor === null || valor === undefined) return '—';
    return Number(valor) ? 'Sí' : 'No';
  }

  function vistaControles() {
    const controles = abierto.controles || [];

    const tabla = controles.length
      ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Hora</th><th>Temp.</th><th>FC</th><th>FR</th><th>Come</th><th>Orina</th><th>Defeca</th><th>Registró</th></tr></thead>
          <tbody>${controles.map((c) => `
            <tr>
              <td>${escapar(H.fechaLarga(c.fecha))} ${escapar(H.hora12(c.fecha))}</td>
              <td>${c.temperatura_c ? `${escapar(c.temperatura_c)} °C` : '—'}</td>
              <td>${escapar(c.frec_cardiaca ?? '—')}</td>
              <td>${escapar(c.frec_respiratoria ?? '—')}</td>
              <td>${escapar(siNo(c.come))}</td>
              <td>${escapar(siNo(c.orina))}</td>
              <td>${escapar(siNo(c.defeca))}</td>
              <td>${escapar(c.registrado_por_nombre || '—')}</td>
            </tr>`).join('')}</tbody>
        </table></div>`
      : H.bloqueVacio('Todavía no hay controles registrados.', 'icon-clock');

    return `
      <form id="formControl">
        <div class="campos-fila-3">
          <label class="campo"><span>Temperatura (°C)</span><input type="number" name="temperaturaC" step="0.1" min="20" max="45"></label>
          <label class="campo"><span>Frec. cardiaca</span><input type="number" name="frecCardiaca" min="0" max="400"></label>
          <label class="campo"><span>Frec. respiratoria</span><input type="number" name="frecRespiratoria" min="0" max="200"></label>
        </div>
        <div class="campos-fila-3">
          <label class="campo-check"><input type="checkbox" name="come"> Comió</label>
          <label class="campo-check"><input type="checkbox" name="orina"> Orinó</label>
          <label class="campo-check"><input type="checkbox" name="defeca"> Defecó</label>
        </div>
        <label class="campo">
          <span>Observaciones</span>
          <textarea name="observaciones" maxlength="2000" placeholder="Estado general, actitud, novedades…"></textarea>
        </label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar control</button></div>
      </form>
      ${tabla}`;
  }

  function vistaMedicacion() {
    const medicacion = abierto.medicacion || [];

    const tabla = medicacion.length
      ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Medicamento</th><th>Dosis</th><th>Vía</th><th>Cada</th><th>Próxima</th><th>Estado</th><th></th></tr></thead>
          <tbody>${medicacion.map((m) => {
            const vencida = m.proxima_toma && new Date(String(m.proxima_toma).replace(' ', 'T')) < new Date();
            return `<tr>
              <td>${escapar(m.descripcion)}</td>
              <td>${escapar(m.dosis || '—')}</td>
              <td>${escapar(m.via || '—')}</td>
              <td>${m.cada_horas ? `${escapar(m.cada_horas)} h` : '—'}</td>
              <td class="${vencida ? 'texto-alerta' : ''}">
                ${m.proxima_toma ? escapar(H.hora12(m.proxima_toma)) : '—'}
              </td>
              <td><span class="insignia insignia-${escapar(m.estado)}">${escapar(m.estado)}</span></td>
              <td class="acciones">
                ${m.estado === 'activo' ? `
                  <button type="button" class="btn btn-primary btn-sm" data-toma="${m.id}">Aplicar dosis</button>
                  <button type="button" class="btn btn-peligro btn-sm" data-suspender="${m.id}">Suspender</button>` : ''}
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`
      : H.bloqueVacio('No hay pauta de medicación.', 'icon-syringe');

    return `
      <form id="formMedicacion">
        <div class="campos-fila">
          <label class="campo">
            <span>Medicamento *</span>
            <input type="text" name="descripcion" required maxlength="180" placeholder="Enrofloxacina 5%">
          </label>
          <label class="campo"><span>Dosis</span><input type="text" name="dosis" maxlength="80" placeholder="5 mg/kg"></label>
        </div>
        <div class="campos-fila">
          <label class="campo"><span>Vía</span><input type="text" name="via" maxlength="20" placeholder="IV, IM, SC, oral"></label>
          <label class="campo"><span>Cada cuántas horas</span><input type="number" name="cadaHoras" min="1" max="168" placeholder="12"></label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Añadir a la pauta</button></div>
      </form>
      ${tabla}`;
  }

  function vistaAlimentacion() {
    const registros = abierto.alimentacion || [];

    const tabla = registros.length
      ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Hora</th><th>Alimento</th><th>Cantidad</th><th>Consumo</th><th>Agua</th></tr></thead>
          <tbody>${registros.map((a) => `
            <tr>
              <td>${escapar(H.fechaLarga(a.fecha))} ${escapar(H.hora12(a.fecha))}</td>
              <td>${escapar(a.alimento || '—')}</td>
              <td>${a.cantidad_g ? `${escapar(a.cantidad_g)} g` : '—'}</td>
              <td>${escapar(ETIQUETA_CONSUMO[a.consumido] || a.consumido)}</td>
              <td>${a.agua_ml ? `${escapar(a.agua_ml)} ml` : '—'}</td>
            </tr>`).join('')}</tbody>
        </table></div>`
      : H.bloqueVacio('No hay registros de alimentación.', 'icon-bone');

    return `
      <form id="formAlimentacion">
        <div class="campos-fila">
          <label class="campo"><span>Alimento</span><input type="text" name="alimento" maxlength="140" placeholder="Gastrointestinal húmedo"></label>
          <label class="campo"><span>Cantidad (g)</span><input type="number" name="cantidadG" step="1" min="0"></label>
        </div>
        <div class="campos-fila">
          <label class="campo">
            <span>Consumo</span>
            <select name="consumido">
              ${Object.entries(ETIQUETA_CONSUMO).map(([v, t]) => `<option value="${v}">${escapar(t)}</option>`).join('')}
            </select>
          </label>
          <label class="campo"><span>Agua (ml)</span><input type="number" name="aguaMl" step="1" min="0"></label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar</button></div>
      </form>
      ${tabla}`;
  }

  function vistaVisitas() {
    const visitas = abierto.visitas || [];

    const tabla = visitas.length
      ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Visitante</th><th>Parentesco</th><th>Entrada</th><th>Salida</th><th></th></tr></thead>
          <tbody>${visitas.map((v) => `
            <tr>
              <td>${escapar(v.visitante)}</td>
              <td>${escapar(v.parentesco || '—')}</td>
              <td>${escapar(H.hora12(v.entrada))}</td>
              <td>${v.salida ? escapar(H.hora12(v.salida)) : '<span class="chip chip-info">dentro</span>'}</td>
              <td class="acciones">
                ${v.salida ? '' : `<button type="button" class="btn btn-outline btn-sm" data-salida="${v.id}">Registrar salida</button>`}
              </td>
            </tr>`).join('')}</tbody>
        </table></div>`
      : H.bloqueVacio('No ha venido nadie a visitarlo todavía.', 'icon-users');

    return `
      <form id="formVisita">
        <div class="campos-fila">
          <label class="campo">
            <span>Visitante *</span>
            <input type="text" name="visitante" required maxlength="120" placeholder="Nombre de quien visita">
          </label>
          <label class="campo"><span>Parentesco</span><input type="text" name="parentesco" maxlength="60" placeholder="Propietaria, hijo…"></label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar entrada</button></div>
      </form>
      ${tabla}`;
  }

  function vistaEgreso() {
    const h = abierto.hospitalizacion;

    if (h.estado !== 'activa') {
      return `<div class="mensaje-ok">
        Este paciente egresó como <strong>${escapar(h.estado)}</strong>
        el ${escapar(H.fechaLarga(h.fecha_egreso))} a las ${escapar(H.hora12(h.fecha_egreso))}.
        ${h.epicrisis ? `<p style="margin-top:10px">${escapar(h.epicrisis)}</p>` : ''}
      </div>`;
    }

    return `
      <form id="formEgreso">
        <label class="campo">
          <span>Tipo de egreso *</span>
          <select name="estado" required>
            <option value="">Selecciona</option>
            <option value="alta">Alta</option>
            <option value="remitida">Remitida a otro centro</option>
            <option value="fallecido">Fallecido</option>
          </select>
        </label>
        <label class="campo">
          <span>Epicrisis *</span>
          <textarea name="epicrisis" required maxlength="8000" rows="6"
                    placeholder="Resumen del internamiento: evolución, tratamiento recibido, estado al egreso e indicaciones para la casa."></textarea>
          <small class="campo-ayuda">
            Es lo que queda en la historia clínica y lo que lee el próximo
            veterinario que atienda a este paciente.
          </small>
        </label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Dar egreso</button></div>
      </form>`;
  }

  /** Recoge un formulario respetando checkbox y number. */
  function leerFormulario(form) {
    const cuerpo = {};

    Array.from(form.elements).forEach((campo) => {
      if (!campo.name) return;

      if (campo.type === 'checkbox') {
        cuerpo[campo.name] = campo.checked;
        return;
      }

      const texto = String(campo.value).trim();
      if (texto === '') return;
      cuerpo[campo.name] = campo.type === 'number' ? Number(texto) : texto;
    });

    return cuerpo;
  }

  function conectarPestana(nombre) {
    const id = abierto.hospitalizacion.id;

    const envios = {
      controles: { form: '#formControl', ruta: `/hospitalizacion/${id}/controles`, ok: 'Control registrado.' },
      medicacion: { form: '#formMedicacion', ruta: `/hospitalizacion/${id}/medicacion`, ok: 'Pauta añadida.' },
      alimentacion: { form: '#formAlimentacion', ruta: `/hospitalizacion/${id}/alimentacion`, ok: 'Registrado.' },
      visitas: { form: '#formVisita', ruta: `/hospitalizacion/${id}/visitas`, ok: 'Visita registrada.' },
      egreso: { form: '#formEgreso', ruta: `/hospitalizacion/${id}/egreso`, ok: 'Egreso registrado.' },
    };

    const config = envios[nombre];
    const form = config && $(config.form);

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        H.limpiarError($('#errorPaciente'));

        const boton = form.querySelector('button[type="submit"]');
        await H.conBoton(boton, 'Guardando…', async () => {
          try {
            await H.api.post(config.ruta, leerFormulario(form));
            H.toast(config.ok);

            if (nombre === 'egreso') {
              H.cerrarModal('modalPaciente');
            } else {
              abierto = await H.api.get(`/hospitalizacion/${id}`);
              mostrarPestana(nombre);
            }
            await recargar();
          } catch (error) {
            H.mostrarError($('#errorPaciente'), error);
          }
        });
      });
    }

    // Acciones sueltas de las tablas
    H.$$('#cuerpoPaciente [data-toma]').forEach((b) => {
      b.addEventListener('click', () => accionMedicacion(`/hospitalizacion/medicacion/${b.dataset.toma}/toma`, 'post', 'Dosis aplicada.', nombre, id));
    });
    H.$$('#cuerpoPaciente [data-suspender]').forEach((b) => {
      b.addEventListener('click', async () => {
        const ok = await H.confirmar('¿Suspender esta pauta? Dejará de generar dosis pendientes.');
        if (ok) accionMedicacion(`/hospitalizacion/medicacion/${b.dataset.suspender}`, 'del', 'Pauta suspendida.', nombre, id);
      });
    });
    H.$$('#cuerpoPaciente [data-salida]').forEach((b) => {
      b.addEventListener('click', () => accionMedicacion(`/hospitalizacion/visitas/${b.dataset.salida}/salida`, 'patch', 'Salida registrada.', nombre, id));
    });
  }

  async function accionMedicacion(ruta, metodo, mensaje, pestana, id) {
    try {
      await H.api[metodo](ruta, metodo === 'del' ? undefined : {});
      H.toast(mensaje);
      abierto = await H.api.get(`/hospitalizacion/${id}`);
      mostrarPestana(pestana);
      await recargar();
    } catch (error) {
      H.mostrarError($('#errorPaciente'), error);
    }
  }
})();
