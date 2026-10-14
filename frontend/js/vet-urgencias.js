/* ============================================================
   Urgencias — sala en vivo, triage y atención

   La lista se ordena por gravedad y no por hora de llegada: en
   urgencias eso no es una preferencia de interfaz, es el criterio
   clínico. El servidor ya devuelve `orden_prioridad`; aquí solo se
   respeta.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  // Cada cuánto se refresca la sala. Es un tablero que se mira de lejos
  // mientras se trabaja, así que tiene que moverse solo; 30 s es suficiente
  // para no golpear la API en cada respiración.
  const MS_REFRESCO = 30000;

  const PRIORIDADES = [
    { valor: 'rojo',     texto: 'Rojo',     detalle: 'Atención inmediata' },
    { valor: 'naranja',  texto: 'Naranja',  detalle: 'Muy urgente, 10 min' },
    { valor: 'amarillo', texto: 'Amarillo', detalle: 'Urgente, 30 min' },
    { valor: 'verde',    texto: 'Verde',    detalle: 'Poco urgente' },
    { valor: 'azul',     texto: 'Azul',     detalle: 'No urgente' },
  ];

  const ETIQUETA_ESTADO = {
    en_espera: 'En espera',
    en_triage: 'En triage',
    en_atencion: 'En atención',
    en_observacion: 'En observación',
    cerrado: 'Cerrado',
  };

  const ETIQUETA_DESENLACE = {
    alta: 'Alta',
    hospitalizacion: 'Hospitalización',
    remitido: 'Remitido',
    fallecido: 'Fallecido',
    retiro_voluntario: 'Retiro voluntario',
  };

  let ingresos = [];
  let salas = [];
  let veterinarios = [];
  let pacientes = [];
  let ingresoAbierto = null;
  let temporizador = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['veterinario', 'admin'], ['urgencias.ver', 'urgencias.gestionar']);
    if (!usuario) return;

    ['modalLlegada', 'modalTriage', 'modalDetalle'].forEach(H.prepararModal);

    $('#btnLlegada').addEventListener('click', abrirLlegada);
    $('#formLlegada').addEventListener('submit', registrarLlegada);
    $('#formTriage').addEventListener('submit', guardarTriage);

    $('#pestanasDetalle').addEventListener('click', (e) => {
      const boton = e.target.closest('[data-pestana]');
      if (boton) mostrarPestana(boton.dataset.pestana);
    });

    await cargarCatalogos();
    await recargar();

    temporizador = setInterval(recargar, MS_REFRESCO);
    // Si la pestaña se va a segundo plano no tiene sentido seguir pidiendo.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(temporizador);
      } else {
        recargar();
        temporizador = setInterval(recargar, MS_REFRESCO);
      }
    });
  });

  async function cargarCatalogos() {
    try {
      // Las salas llegan con el tablero; aquí solo hace falta lo que ese no trae.
      const [datosVets, datosPacientes] = await Promise.all([
        H.api.get('/veterinarios'),
        H.api.get('/mascotas', { limite: 200 }),
      ]);

      veterinarios = datosVets.veterinarios || [];
      pacientes = datosPacientes.mascotas || [];
    } catch (error) {
      H.toast(`No se pudieron cargar los catálogos: ${error.message}`, 'error');
    }
  }

  async function recargar() {
    try {
      const datos = await H.api.get('/urgencias/tablero');
      ingresos = datos.urgencias || [];
      // El tablero ya trae las salas, así que se aprovechan en vez de pedirlas
      // otra vez: son las mismas y cambian poquísimo.
      if (datos.salas) salas = datos.salas;
      pintarMetricas(datos.resumen || {});
      pintar();
      $('#ultimaActualizacion').textContent = `Actualizado a las ${H.hora12(new Date().toTimeString().slice(0, 5))}`;
    } catch (error) {
      $('#listaUrgencias').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintarMetricas(resumen) {
    const tarjetas = [
      { clave: 'activas', texto: 'En sala', icono: 'icon-house' },
      { clave: 'en_espera', texto: 'En espera', icono: 'icon-clock' },
      { clave: 'criticas', texto: 'Rojo o naranja', icono: 'icon-heart' },
      { clave: 'minutos_triage_promedio', texto: 'Triage promedio', icono: 'icon-alerta', sufijo: ' min' },
    ];

    $('#metricas').innerHTML = tarjetas.map((t) => `
      <article class="metrica">
        <span class="metrica-icono"><svg class="icon"><use href="#${t.icono}"/></svg></span>
        <div class="contador-vivo">
          ${escapar(Number(resumen[t.clave] || 0))}${escapar(t.sufijo || '')}
          <small>${escapar(t.texto)}</small>
        </div>
      </article>`).join('');
  }

  function pintar() {
    const caja = $('#listaUrgencias');

    if (!ingresos.length) {
      caja.innerHTML = H.bloqueVacio('No hay pacientes en la sala de urgencias.', 'icon-heart');
      return;
    }

    caja.innerHTML = ingresos.map((i) => {
      const prioridad = i.prioridad || 'sin';
      const espera = Number(i.minutos_espera || 0);

      // Un paciente sin triage lleva demasiado esperando: el triage es lo
      // primero que tiene que pasar, no puede quedarse en la cola.
      const alertaEspera = !i.prioridad && espera > 15;

      return `<article class="cita fila-triage fila-triage-${escapar(prioridad)}" data-id="${i.id}">
        <div class="cita-hora">
          <strong>${escapar(H.hora12(i.llegada))}</strong>
          <small class="${alertaEspera ? 'texto-alerta' : ''}">${escapar(espera)} min</small>
        </div>
        <div class="cita-info">
          <h4>${escapar(i.mascota)} <span class="campo-ayuda">· ${escapar(i.especie)}</span></h4>
          <p>${escapar(i.motivo)}</p>
          <p class="campo-ayuda">
            ${escapar(i.cliente)} · ${escapar(i.cliente_telefono || 'sin teléfono')}
            ${i.sala ? ` · Sala ${escapar(i.sala)}` : ''}
            ${i.veterinario ? ` · ${escapar(i.veterinario)}` : ' · <strong>sin veterinario</strong>'}
          </p>
        </div>
        <div class="cita-lado">
          <span class="triage triage-${escapar(prioridad)}">
            ${escapar(i.prioridad ? i.prioridad : 'sin triage')}
          </span>
          <span class="insignia insignia-${escapar(i.estado)}">${escapar(ETIQUETA_ESTADO[i.estado] || i.estado)}</span>
          <div class="mascota-acciones">
            <button type="button" class="btn btn-outline btn-sm" data-triage="${i.id}">
              ${i.prioridad ? 'Retriage' : 'Triage'}
            </button>
            <button type="button" class="btn btn-primary btn-sm" data-abrir="${i.id}">Atender</button>
          </div>
        </div>
      </article>`;
    }).join('');

    caja.querySelectorAll('[data-triage]').forEach((b) => {
      b.addEventListener('click', () => abrirTriage(Number(b.dataset.triage)));
    });
    caja.querySelectorAll('[data-abrir]').forEach((b) => {
      b.addEventListener('click', () => abrirDetalle(Number(b.dataset.abrir)));
    });
  }

  /* --------------------------------------------------------
     Registrar llegada
     -------------------------------------------------------- */

  function opcionesSelect(lista, valor, texto, vacio) {
    return `<option value="">${escapar(vacio)}</option>` + lista
      .map((x) => `<option value="${x[valor]}">${escapar(x[texto])}</option>`)
      .join('');
  }

  function abrirLlegada() {
    const form = $('#formLlegada');
    H.limpiarError($('#errorLlegada'));
    form.reset();

    form.mascotaId.innerHTML = `<option value="">Selecciona el paciente</option>` + pacientes
      .map((m) => `<option value="${m.id}">${escapar(m.nombre)} — ${escapar(m.cliente_nombre || '')}</option>`)
      .join('');
    form.salaId.innerHTML = opcionesSelect(salas, 'id', 'nombre', 'Sin asignar');
    form.veterinarioId.innerHTML = opcionesSelect(veterinarios, 'id', 'nombre', 'Sin asignar');

    H.abrirModal('modalLlegada');
  }

  async function registrarLlegada(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorLlegada');
    H.limpiarError(caja);

    const cuerpo = {
      mascotaId: Number(form.mascotaId.value),
      salaId: form.salaId.value ? Number(form.salaId.value) : null,
      veterinarioId: form.veterinarioId.value ? Number(form.veterinarioId.value) : null,
      motivo: form.motivo.value.trim(),
    };

    if (!cuerpo.mascotaId) return H.mostrarError(caja, new Error('Selecciona el paciente.'));
    if (!cuerpo.motivo) return H.mostrarError(caja, new Error('Escribe el motivo de consulta.'));

    await H.conBoton($('#btnGuardarLlegada'), 'Registrando…', async () => {
      try {
        await H.api.post('/urgencias', cuerpo);
        H.cerrarModal('modalLlegada');
        H.toast('Llegada registrada. Haz el triage cuanto antes.');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Triage
     -------------------------------------------------------- */

  function abrirTriage(id) {
    const ingreso = ingresos.find((i) => i.id === id);
    if (!ingreso) return;

    const form = $('#formTriage');
    H.limpiarError($('#errorTriage'));
    form.reset();
    form.id.value = ingreso.id;

    $('#tituloTriage').textContent = `Triage de ${ingreso.mascota}`;

    $('#opcionesPrioridad').innerHTML = PRIORIDADES.map((p) => `
      <label class="opcion">
        <input type="radio" name="prioridad" value="${p.valor}" ${ingreso.prioridad === p.valor ? 'checked' : ''}>
        <span class="triage triage-${p.valor}">${escapar(p.texto)}</span>
        <small class="campo-ayuda">${escapar(p.detalle)}</small>
      </label>`).join('');

    form.salaId.innerHTML = opcionesSelect(salas, 'id', 'nombre', 'Sin asignar');
    form.veterinarioId.innerHTML = opcionesSelect(veterinarios, 'id', 'nombre', 'Sin asignar');
    if (ingreso.sala_id) form.salaId.value = ingreso.sala_id;
    if (ingreso.veterinario_id) form.veterinarioId.value = ingreso.veterinario_id;

    H.abrirModal('modalTriage');
  }

  async function guardarTriage(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorTriage');
    H.limpiarError(caja);

    const marcada = form.querySelector('input[name="prioridad"]:checked');
    if (!marcada) return H.mostrarError(caja, new Error('Elige la prioridad del paciente.'));

    const cuerpo = {
      prioridad: marcada.value,
      salaId: form.salaId.value ? Number(form.salaId.value) : null,
      veterinarioId: form.veterinarioId.value ? Number(form.veterinarioId.value) : null,
      hallazgos: form.hallazgos.value.trim() || null,
    };

    await H.conBoton($('#btnGuardarTriage'), 'Guardando…', async () => {
      try {
        await H.api.patch(`/urgencias/${form.id.value}/triage`, cuerpo);
        H.cerrarModal('modalTriage');
        H.toast('Triage registrado.');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Atención: línea de tiempo, signos, medicación y cierre
     -------------------------------------------------------- */

  async function abrirDetalle(id) {
    H.limpiarError($('#errorDetalle'));
    $('#cuerpoDetalle').innerHTML = H.cargando();
    H.abrirModal('modalDetalle');

    try {
      ingresoAbierto = await H.api.get(`/urgencias/${id}`);
    } catch (error) {
      $('#cuerpoDetalle').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    const i = ingresoAbierto.ingreso;
    $('#tituloDetalle').textContent = `${i.mascota} — ${i.motivo}`;
    $('#subDetalle').innerHTML = `
      <span class="triage triage-${escapar(i.prioridad || 'sin')}">${escapar(i.prioridad || 'sin triage')}</span>
      · Llegó a las ${escapar(H.hora12(i.llegada))}
      · ${escapar(i.cliente)} (${escapar(i.cliente_telefono || 'sin teléfono')})`;

    mostrarPestana('tiempo');
  }

  function mostrarPestana(nombre) {
    H.$$('#pestanasDetalle button').forEach((b) => {
      b.classList.toggle('activa', b.dataset.pestana === nombre);
    });

    const vistas = { tiempo: vistaTiempo, signos: vistaSignos, medicacion: vistaMedicacion, cierre: vistaCierre };
    $('#cuerpoDetalle').innerHTML = (vistas[nombre] || vistaTiempo)();
    conectarPestana(nombre);
  }

  function vistaTiempo() {
    const eventos = ingresoAbierto.eventos || [];

    const lista = eventos.length
      ? `<div class="linea-tiempo">${eventos.map((ev) => `
          <article class="hito">
            <div class="hito-cabecera">
              <strong>${escapar(ev.tipo)}</strong>
              <span class="hito-fecha">${escapar(H.hora12(ev.fecha))}</span>
            </div>
            <div class="hito-cuerpo">${escapar(ev.descripcion)}</div>
            ${ev.usuario_nombre ? `<div class="hito-pie">${escapar(ev.usuario_nombre)}</div>` : ''}
          </article>`).join('')}</div>`
      : H.bloqueVacio('Todavía no hay eventos registrados.', 'icon-clock');

    return `
      <form id="formEvento" class="fila-editable">
        <label class="campo">
          <span>Anotar en la línea de tiempo</span>
          <input type="text" name="descripcion" maxlength="1000" required
                 placeholder="Se canaliza vía cefálica derecha, se inicia fluidoterapia…">
        </label>
        <button type="submit" class="btn btn-primary">Anotar</button>
      </form>
      ${lista}`;
  }

  function vistaSignos() {
    const signos = ingresoAbierto.signos || [];

    const tabla = signos.length
      ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Hora</th><th>Peso</th><th>Temp.</th><th>FC</th><th>FR</th><th>Mucosas</th></tr></thead>
          <tbody>${signos.map((s) => `
            <tr>
              <td>${escapar(H.hora12(s.fecha))}</td>
              <td>${s.peso_kg ? `${escapar(s.peso_kg)} kg` : '—'}</td>
              <td>${s.temperatura_c ? `${escapar(s.temperatura_c)} °C` : '—'}</td>
              <td>${escapar(s.frec_cardiaca ?? '—')}</td>
              <td>${escapar(s.frec_respiratoria ?? '—')}</td>
              <td>${escapar(s.mucosas || '—')}</td>
            </tr>`).join('')}</tbody>
        </table></div>`
      : H.bloqueVacio('Todavía no se han tomado signos vitales.', 'icon-heart');

    return `
      <form id="formSignos">
        <div class="campos-fila-3">
          <label class="campo"><span>Peso (kg)</span><input type="number" name="pesoKg" step="0.01" min="0"></label>
          <label class="campo"><span>Temperatura (°C)</span><input type="number" name="temperaturaC" step="0.1" min="20" max="45"></label>
          <label class="campo"><span>Frec. cardiaca</span><input type="number" name="frecCardiaca" min="0" max="400"></label>
        </div>
        <div class="campos-fila-3">
          <label class="campo"><span>Frec. respiratoria</span><input type="number" name="frecRespiratoria" min="0" max="200"></label>
          <label class="campo"><span>Mucosas</span><input type="text" name="mucosas" maxlength="30" placeholder="rosadas, pálidas…"></label>
          <label class="campo"><span>Hidratación</span><input type="text" name="hidratacion" maxlength="30" placeholder="normal, 5%…"></label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar toma</button></div>
      </form>
      ${tabla}`;
  }

  function vistaMedicacion() {
    const medicacion = ingresoAbierto.medicacion || [];

    const tabla = medicacion.length
      ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Hora</th><th>Medicamento</th><th>Dosis</th><th>Vía</th><th>Aplicó</th></tr></thead>
          <tbody>${medicacion.map((m) => `
            <tr>
              <td>${escapar(H.hora12(m.fecha))}</td>
              <td>${escapar(m.descripcion)}</td>
              <td>${escapar(m.dosis || '—')}</td>
              <td>${escapar(m.via || '—')}</td>
              <td>${escapar(m.administrado_por_nombre || '—')}</td>
            </tr>`).join('')}</tbody>
        </table></div>`
      : H.bloqueVacio('No se ha administrado medicación.', 'icon-syringe');

    return `
      <form id="formMedicacion">
        <div class="campos-fila">
          <label class="campo">
            <span>Medicamento *</span>
            <input type="text" name="descripcion" required maxlength="180" placeholder="Adrenalina 1:1000">
          </label>
          <label class="campo"><span>Dosis</span><input type="text" name="dosis" maxlength="80" placeholder="0.01 mg/kg"></label>
        </div>
        <div class="campos-fila">
          <label class="campo"><span>Vía</span><input type="text" name="via" maxlength="20" placeholder="IV, IM, SC"></label>
          <label class="campo"><span>Cantidad</span><input type="number" name="cantidad" step="0.01" min="0"></label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar administración</button></div>
      </form>
      ${tabla}`;
  }

  function vistaCierre() {
    const i = ingresoAbierto.ingreso;

    if (i.estado === 'cerrado') {
      return `<div class="mensaje-ok">
        Esta atención se cerró como <strong>${escapar(ETIQUETA_DESENLACE[i.desenlace] || i.desenlace)}</strong>
        el ${escapar(H.fechaLarga(i.cierre_en))} a las ${escapar(H.hora12(i.cierre_en))}.
      </div>`;
    }

    return `
      <form id="formCierre">
        <label class="campo">
          <span>Desenlace *</span>
          <select name="desenlace" required>
            <option value="">Selecciona cómo termina la atención</option>
            ${Object.entries(ETIQUETA_DESENLACE)
              .map(([v, t]) => `<option value="${v}">${escapar(t)}</option>`).join('')}
          </select>
          <small class="campo-ayuda">
            Cerrar exige decir cómo terminó: sin eso la estadística de urgencias
            queda con casos que desaparecen.
          </small>
        </label>
        <label class="campo">
          <span>Observaciones de cierre</span>
          <textarea name="observaciones" maxlength="4000"
                    placeholder="Evolución, indicaciones al propietario, motivo de la remisión…"></textarea>
        </label>
        <div class="modal-acciones">
          <button type="submit" class="btn btn-primary">Cerrar atención</button>
        </div>
      </form>`;
  }

  /** Conecta el formulario de la pestaña que se acaba de pintar. */
  function conectarPestana(nombre) {
    const id = ingresoAbierto.ingreso.id;

    const envios = {
      tiempo: { form: '#formEvento', ruta: `/urgencias/${id}/eventos`, extra: { tipo: 'nota' }, ok: 'Anotado.' },
      signos: { form: '#formSignos', ruta: `/urgencias/${id}/signos`, ok: 'Signos registrados.' },
      medicacion: { form: '#formMedicacion', ruta: `/urgencias/${id}/medicacion`, ok: 'Medicación registrada.' },
      cierre: { form: '#formCierre', ruta: `/urgencias/${id}`, metodo: 'patch', ok: 'Atención cerrada.' },
    };

    const config = envios[nombre];
    const form = config && $(config.form);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError($('#errorDetalle'));

      const cuerpo = { ...(config.extra || {}) };
      new FormData(form).forEach((valor, clave) => {
        const texto = String(valor).trim();
        if (texto === '') return;
        // Los number del formulario llegan como texto; el backend los valida
        // igual, pero mandarlos como número evita coerciones raras en zod.
        const campo = form.elements[clave];
        cuerpo[clave] = campo && campo.type === 'number' ? Number(texto) : texto;
      });

      if (nombre === 'cierre') cuerpo.estado = 'cerrado';

      const boton = form.querySelector('button[type="submit"]');
      await H.conBoton(boton, 'Guardando…', async () => {
        try {
          await H.api[config.metodo || 'post'](config.ruta, cuerpo);
          H.toast(config.ok);

          if (nombre === 'cierre') {
            H.cerrarModal('modalDetalle');
          } else {
            ingresoAbierto = await H.api.get(`/urgencias/${id}`);
            mostrarPestana(nombre);
          }
          await recargar();
        } catch (error) {
          H.mostrarError($('#errorDetalle'), error);
        }
      });
    });
  }
})();
