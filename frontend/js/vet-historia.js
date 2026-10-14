/* ============================================================
   Historia clínica de un paciente — panel de la clínica

   La página se abre con ?mascota=ID desde el listado de pacientes
   o desde la agenda del día.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const mascotaId = Number(new URLSearchParams(location.search).get('mascota'));

  let historia = null;      // respuesta completa de /historia/mascota/:id
  let catalogos = null;     // vacunas, diagnósticos, medicamentos, exámenes
  let citasSinConsulta = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['veterinario', 'admin'], ['historia.ver_todas']);
    if (!usuario) return;

    if (!mascotaId) {
      $('#fichaResumen').innerHTML = H.bloqueVacio(
        'Abre la historia desde el listado de pacientes.', 'icon-paw'
      );
      return;
    }

    ['modalConsulta', 'modalVacuna', 'modalExamen', 'modalDetalle'].forEach(H.prepararModal);

    $('#pestanas').addEventListener('click', cambiarPestana);
    $('#btnNuevaConsulta').addEventListener('click', abrirFormularioConsulta);
    $('#btnAplicarVacuna').addEventListener('click', abrirFormularioVacuna);
    $('#btnSolicitarExamen').addEventListener('click', () => abrirFormularioExamen(null));
    $('#btnAgregarDiagnostico').addEventListener('click', () => agregarDiagnostico());
    $('#btnAgregarTratamiento').addEventListener('click', () => agregarTratamiento());
    $('#btnAgregarResultado').addEventListener('click', () => agregarResultado());
    $('#formConsulta').addEventListener('submit', guardarConsulta);
    $('#formVacuna').addEventListener('submit', guardarVacuna);
    $('#formExamen').addEventListener('submit', guardarExamen);
    $('#selectVacuna').addEventListener('change', filtrarLotes);

    // Los catálogos no bloquean la historia: si fallan, lo que no se puede es
    // registrar nada nuevo, pero lo ya escrito tiene que poder leerse igual.
    try {
      catalogos = await H.api.get('/historia/catalogos');
    } catch (error) {
      console.warn('[historia] no se pudieron cargar los catálogos:', error);
      H.toast('No se pudieron cargar los catálogos clínicos.', 'error');
    }

    await recargar();
  });

  async function recargar() {
    $('#listaConsultas').innerHTML = H.cargando();

    try {
      historia = await H.api.get(`/historia/mascota/${mascotaId}`);
    } catch (error) {
      $('#fichaResumen').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      $('#listaConsultas').innerHTML = '';
      return;
    }

    pintarFicha();
    pintarTodo();
    await cargarCitasPendientes();
  }

  /* --------------------------------------------------------
     Pintado
     -------------------------------------------------------- */

  function pintarFicha() {
    const m = historia.mascota;

    document.title = `${m.nombre} — Historia clínica`;
    $('#tituloPaciente').textContent = `${m.nombre} · ${historia.historia?.numero || 'Historia clínica'}`;
    $('#subtituloPaciente').textContent =
      `${m.especie}${m.raza ? ` · ${m.raza}` : ''} · ${H.edadLegible(m.edad_meses)} · Dueño: ${m.cliente_nombre}`;

    const ultimoPeso = historia.peso.length ? historia.peso[historia.peso.length - 1].peso_kg : m.peso_kg;
    const proxima = historia.vacunas.find((v) => v.proxima_fecha);

    $('#fichaResumen').innerHTML = `<div class="rejilla-metricas">
      ${metrica('icon-stetho', historia.consultas.length, 'Consultas')}
      ${metrica('icon-syringe', historia.vacunas.length, 'Vacunas aplicadas')}
      ${metrica('icon-micro', historia.examenes.length, 'Exámenes')}
      ${metrica('icon-grafica', ultimoPeso ? `${ultimoPeso} kg` : '—', 'Último peso')}
      ${proxima ? metricaRefuerzo(proxima) : ''}
    </div>`;
  }

  function metrica(icono, valor, texto, clase = '') {
    return `<article class="metrica ${clase}">
      <span class="metrica-icono"><svg class="icon"><use href="#${icono}"/></svg></span>
      <div><strong>${escapar(valor)}</strong><span>${escapar(texto)}</span></div>
    </article>`;
  }

  function metricaRefuerzo(vacuna) {
    const estado = H.estadoRefuerzo(vacuna);
    const clase = estado.chip.includes('error') ? 'aviso' : estado.chip.includes('aviso') ? 'acento' : '';
    return metrica('icon-calendar', H.fechaLarga(vacuna.proxima_fecha), `Próximo refuerzo · ${vacuna.vacuna}`, clase);
  }

  function pintarTodo() {
    $('#listaConsultas').innerHTML = H.lineaTiempoConsultas(historia.consultas, { conAcciones: true });
    $('#listaVacunas').innerHTML = H.tablaVacunas(historia.vacunas);
    $('#listaExamenes').innerHTML = H.listaExamenes(historia.examenes, { conAcciones: true });
    $('#listaAntecedentes').innerHTML = H.antecedentes({
      alergias: historia.alergias,
      condiciones: historia.condiciones,
    });
    $('#curvaPeso').innerHTML = H.curvaPeso(historia.peso);

    H.$$('[data-ver]').forEach((btn) => {
      btn.addEventListener('click', () => verConsulta(Number(btn.dataset.ver)));
    });
    H.$$('[data-resultados]').forEach((btn) => {
      btn.addEventListener('click', () => abrirFormularioExamen(Number(btn.dataset.resultados)));
    });
  }

  function cambiarPestana(evento) {
    const boton = evento.target.closest('[data-pestana]');
    if (!boton) return;

    H.$$('#pestanas button').forEach((b) => b.classList.toggle('activa', b === boton));
    ['consultas', 'vacunas', 'examenes', 'antecedentes'].forEach((nombre) => {
      const seccion = document.getElementById(`panel${nombre[0].toUpperCase()}${nombre.slice(1)}`);
      seccion.hidden = nombre !== boton.dataset.pestana;
    });
  }

  async function verConsulta(id) {
    $('#detalleConsulta').innerHTML = H.cargando();
    H.abrirModal('modalDetalle');

    try {
      const datos = await H.api.get(`/historia/consultas/${id}`);
      $('#detalleConsulta').innerHTML = H.detalleConsulta(datos.consulta, datos);
    } catch (error) {
      $('#detalleConsulta').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  /* --------------------------------------------------------
     Nueva consulta
     -------------------------------------------------------- */

  /**
   * Citas del paciente que todavía no tienen consulta: son las que se pueden
   * cerrar registrando una. Las ya atendidas se dejan fuera para no ofrecer
   * algo que el servidor rechazaría.
   */
  async function cargarCitasPendientes() {
    try {
      const datos = await H.api.get('/citas', { mascotaId, limite: 30 });
      const conConsulta = new Set(historia.consultas.map((c) => c.cita_id).filter(Boolean));

      citasSinConsulta = datos.citas.filter(
        (c) => !conConsulta.has(c.id) && c.estado !== 'cancelada' && c.estado !== 'no_asistio'
      );
    } catch (error) {
      console.warn('[historia] no se pudieron cargar las citas del paciente:', error);
      citasSinConsulta = [];
    }
  }

  function abrirFormularioConsulta() {
    const form = $('#formConsulta');
    H.limpiarError($('#errorConsulta'));
    form.reset();

    $('#selectCita').innerHTML = `<option value="">Sin cita asociada</option>${
      citasSinConsulta.map((c) => `
        <option value="${c.id}">
          ${escapar(H.fechaLarga(c.inicio))} ${escapar(H.hora12(c.inicio))} — ${escapar(c.servicio_nombre)}
        </option>`).join('')}`;

    $('#filasDiagnosticos').innerHTML = '';
    $('#filasTratamientos').innerHTML = '';
    agregarDiagnostico();

    H.abrirModal('modalConsulta');
  }

  function agregarDiagnostico() {
    const opciones = (catalogos?.diagnosticos || [])
      .map((d) => `<option value="${d.id}">${escapar(d.nombre)}</option>`).join('');

    const fila = document.createElement('div');
    fila.className = 'fila-editable';
    fila.dataset.diagnostico = '1';
    fila.innerHTML = `
      <div>
        <label class="campo">
          <span>Del catálogo</span>
          <select data-campo="diagnosticoId">
            <option value="">Sin tipificar</option>
            ${opciones}
          </select>
        </label>
        <label class="campo">
          <span>Descripción *</span>
          <input type="text" data-campo="descripcion" maxlength="500" placeholder="Otitis externa en oído derecho">
        </label>
        <div class="campos-fila">
          <label class="campo">
            <span>Tipo</span>
            <select data-campo="tipo">
              <option value="presuntivo">Presuntivo</option>
              <option value="definitivo">Definitivo</option>
              <option value="descartado">Descartado</option>
            </select>
          </label>
          <label class="campo-check">
            <input type="checkbox" data-campo="principal"> Diagnóstico principal
          </label>
        </div>
      </div>
      <button type="button" class="btn btn-peligro btn-sm" data-quitar>Quitar</button>`;

    fila.querySelector('[data-quitar]').addEventListener('click', () => fila.remove());

    // Al elegir del catálogo se rellena la descripción, que es lo que se
    // guarda: así no queda vacía por escribir solo el código.
    const select = fila.querySelector('[data-campo="diagnosticoId"]');
    select.addEventListener('change', () => {
      const entrada = fila.querySelector('[data-campo="descripcion"]');
      if (select.value && !entrada.value.trim()) {
        entrada.value = select.options[select.selectedIndex].textContent.trim();
      }
    });

    $('#filasDiagnosticos').appendChild(fila);
  }

  function agregarTratamiento() {
    const fila = document.createElement('div');
    fila.className = 'fila-editable';
    fila.dataset.tratamiento = '1';
    fila.innerHTML = `
      <div>
        <label class="campo">
          <span>Tratamiento *</span>
          <input type="text" data-campo="descripcion" maxlength="2000" placeholder="Antibiótico por 7 días">
        </label>
        <label class="campo">
          <span>Indicaciones</span>
          <textarea data-campo="indicaciones" maxlength="2000"></textarea>
        </label>
        <div class="campos-fila">
          <label class="campo">
            <span>Inicio</span>
            <input type="date" data-campo="fechaInicio">
          </label>
          <label class="campo">
            <span>Fin</span>
            <input type="date" data-campo="fechaFin">
          </label>
        </div>
        <div data-recetas></div>
        <button type="button" class="btn btn-outline btn-sm" data-agregar-receta>
          <svg class="icon"><use href="#icon-mas"/></svg> Añadir medicamento
        </button>
      </div>
      <button type="button" class="btn btn-peligro btn-sm" data-quitar>Quitar</button>`;

    fila.querySelector('[data-quitar]').addEventListener('click', () => fila.remove());
    fila.querySelector('[data-agregar-receta]').addEventListener('click', () => {
      agregarReceta(fila.querySelector('[data-recetas]'));
    });

    $('#filasTratamientos').appendChild(fila);
  }

  function agregarReceta(contenedor) {
    const opciones = (catalogos?.medicamentos || [])
      .map((m) => `<option value="${m.id}">${escapar(m.nombre)}${m.concentracion ? ` ${escapar(m.concentracion)}` : ''}</option>`)
      .join('');

    const receta = document.createElement('div');
    receta.className = 'fila-editable';
    receta.dataset.receta = '1';
    receta.innerHTML = `
      <div>
        <label class="campo">
          <span>Medicamento *</span>
          <select data-campo="medicamentoId"><option value="">Elige uno</option>${opciones}</select>
        </label>
        <div class="campos-fila-3">
          <label class="campo">
            <span>Dosis</span>
            <input type="text" data-campo="dosis" maxlength="80" placeholder="1 tableta">
          </label>
          <label class="campo">
            <span>Frecuencia</span>
            <input type="text" data-campo="frecuencia" maxlength="80" placeholder="cada 12 h">
          </label>
          <label class="campo">
            <span>Duración</span>
            <input type="text" data-campo="duracion" maxlength="80" placeholder="7 días">
          </label>
        </div>
      </div>
      <button type="button" class="btn btn-peligro btn-sm" data-quitar>Quitar</button>`;

    receta.querySelector('[data-quitar]').addEventListener('click', () => receta.remove());
    contenedor.appendChild(receta);
  }

  /** Lee un grupo de filas del formulario como objetos. */
  function leerFilas(raiz, selector) {
    return H.$$(selector, raiz).map((fila) => {
      const datos = {};
      H.$$('[data-campo]', fila).forEach((campo) => {
        // Una fila de tratamiento contiene recetas, que también tienen
        // [data-campo]: se saltan para que no se mezclen los dos niveles.
        if (campo.closest('[data-receta]') && !fila.dataset.receta) return;
        datos[campo.dataset.campo] = campo.type === 'checkbox' ? campo.checked : campo.value.trim();
      });
      return datos;
    });
  }

  async function guardarConsulta(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorConsulta');
    H.limpiarError(caja);

    const numero = (valor) => (valor === '' || valor === null ? null : Number(valor));

    const diagnosticos = leerFilas($('#filasDiagnosticos'), '[data-diagnostico]')
      .filter((d) => d.descripcion)
      .map((d) => ({
        diagnosticoId: d.diagnosticoId ? Number(d.diagnosticoId) : null,
        descripcion: d.descripcion,
        tipo: d.tipo,
        principal: Boolean(d.principal),
      }));

    const tratamientos = H.$$('[data-tratamiento]', $('#filasTratamientos'))
      .map((fila) => {
        // Los campos del tratamiento y los de sus recetas comparten el
        // atributo [data-campo], así que aquí se leen solo los del primer
        // nivel y las recetas se recogen aparte.
        const datos = {};
        H.$$('[data-campo]', fila).forEach((campo) => {
          if (campo.closest('[data-receta]')) return;
          datos[campo.dataset.campo] = campo.value.trim();
        });

        return {
          descripcion: datos.descripcion,
          indicaciones: datos.indicaciones || null,
          fechaInicio: datos.fechaInicio || null,
          fechaFin: datos.fechaFin || null,
          prescripciones: leerFilas(fila, '[data-receta]')
            .filter((r) => r.medicamentoId)
            .map((r) => ({
              medicamentoId: Number(r.medicamentoId),
              dosis: r.dosis || null,
              frecuencia: r.frecuencia || null,
              duracion: r.duracion || null,
            })),
        };
      })
      .filter((t) => t.descripcion);

    const cuerpo = {
      mascotaId,
      citaId: form.citaId.value ? Number(form.citaId.value) : null,
      tipo: form.tipo.value,
      motivo: form.motivo.value.trim(),
      anamnesis: form.anamnesis.value.trim() || null,
      sintomas: form.sintomas.value.trim() || null,
      examenFisico: form.examenFisico.value.trim() || null,
      planManejo: form.planManejo.value.trim() || null,
      signos: {
        pesoKg: numero(form.pesoKg.value),
        temperaturaC: numero(form.temperaturaC.value),
        frecCardiaca: numero(form.frecCardiaca.value),
        frecRespiratoria: numero(form.frecRespiratoria.value),
        condicionCorporal: numero(form.condicionCorporal.value),
        mucosas: form.mucosas.value.trim() || null,
      },
      diagnosticos,
      tratamientos,
    };

    if (!cuerpo.motivo) return H.mostrarError(caja, new Error('Escribe el motivo de la consulta.'));

    await H.conBoton($('#btnGuardarConsulta'), 'Guardando…', async () => {
      try {
        await H.api.post('/historia/consultas', cuerpo);
        H.toast('Consulta registrada.');
        H.cerrarModal('modalConsulta');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Vacunas
     -------------------------------------------------------- */

  function abrirFormularioVacuna() {
    const form = $('#formVacuna');
    H.limpiarError($('#errorVacuna'));
    form.reset();

    const especieId = historia.mascota.especie_id;
    // Las vacunas sin especie sirven para cualquiera; las demás solo para la suya.
    const disponibles = (catalogos?.vacunas || [])
      .filter((v) => !v.especie_id || v.especie_id === especieId);

    $('#selectVacuna').innerHTML = disponibles
      .map((v) => `<option value="${v.id}">${escapar(v.nombre)}${v.obligatoria ? ' (obligatoria)' : ''}</option>`)
      .join('');

    form.fechaAplicacion.value = H.fechaHoyISO();
    filtrarLotes();
    H.abrirModal('modalVacuna');
  }

  function filtrarLotes() {
    const vacunaId = Number($('#selectVacuna').value);
    const lotes = (catalogos?.lotesVacunas || []).filter((l) => l.vacuna_id === vacunaId && l.dosis_disponibles > 0);

    $('#selectLote').innerHTML = `<option value="">Sin registrar</option>${
      lotes.map((l) => `
        <option value="${l.id}">
          ${escapar(l.lote)} — ${l.dosis_disponibles} dosis${l.fecha_vencimiento ? ` · vence ${escapar(H.fechaLarga(l.fecha_vencimiento))}` : ''}
        </option>`).join('')}`;

    const vacuna = (catalogos?.vacunas || []).find((v) => v.id === vacunaId);
    $('#ayudaRefuerzo').textContent = vacuna?.refuerzo_meses
      ? `Si lo dejas vacío se programa a los ${vacuna.refuerzo_meses} meses.`
      : 'Esta vacuna no tiene refuerzo definido en el catálogo.';
  }

  async function guardarVacuna(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorVacuna');
    H.limpiarError(caja);

    const cuerpo = {
      mascotaId,
      vacunaId: Number(form.vacunaId.value),
      loteId: form.loteId.value ? Number(form.loteId.value) : null,
      fechaAplicacion: form.fechaAplicacion.value,
      proximaFecha: form.proximaFecha.value || null,
      observaciones: form.observaciones.value.trim() || null,
    };

    if (!cuerpo.vacunaId) return H.mostrarError(caja, new Error('Elige la vacuna que se aplicó.'));

    await H.conBoton($('#btnGuardarVacuna'), 'Guardando…', async () => {
      try {
        await H.api.post('/historia/vacunas', cuerpo);
        H.toast('Vacuna registrada en el carné.');
        H.cerrarModal('modalVacuna');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Exámenes
     -------------------------------------------------------- */

  function abrirFormularioExamen(examenId) {
    const form = $('#formExamen');
    H.limpiarError($('#errorExamen'));
    form.reset();
    form.id.value = examenId || '';

    const cargandoResultados = Boolean(examenId);
    $('#camposSolicitud').hidden = cargandoResultados;
    $('#camposResultados').hidden = !cargandoResultados;
    $('#tituloExamen').textContent = cargandoResultados ? 'Resultados del examen' : 'Solicitar examen';
    $('#subtituloExamen').textContent = cargandoResultados
      ? 'Un renglón por parámetro medido, como llega del laboratorio.'
      : 'Queda como solicitado hasta que se carguen los resultados.';

    if (cargandoResultados) {
      const examen = historia.examenes.find((e) => e.id === examenId);
      $('#filasResultados').innerHTML = '';
      (examen?.resultados || []).forEach(agregarResultado);
      if (!examen?.resultados?.length) agregarResultado();
      form.conclusion.value = examen?.conclusion || '';
      form.estado.value = examen?.estado === 'solicitado' ? 'listo' : examen.estado;
    } else {
      $('#selectTipoExamen').innerHTML = `<option value="">Otro (lo describo abajo)</option>${
        (catalogos?.tiposExamen || []).map((t) => `
          <option value="${t.id}">${escapar(t.nombre)}${t.precio ? ` — ${escapar(H.moneda(t.precio))}` : ''}</option>`).join('')}`;
    }

    H.abrirModal('modalExamen');
  }

  function agregarResultado(valores = {}) {
    const fila = document.createElement('div');
    fila.className = 'fila-editable';
    fila.dataset.resultado = '1';
    fila.innerHTML = `
      <div>
        <div class="campos-fila">
          <label class="campo">
            <span>Parámetro *</span>
            <input type="text" data-campo="parametro" maxlength="120" value="${escapar(valores.parametro || '')}">
          </label>
          <label class="campo">
            <span>Valor</span>
            <input type="text" data-campo="valor" maxlength="80" value="${escapar(valores.valor || '')}">
          </label>
        </div>
        <div class="campos-fila-3">
          <label class="campo">
            <span>Unidad</span>
            <input type="text" data-campo="unidad" maxlength="30" value="${escapar(valores.unidad || '')}">
          </label>
          <label class="campo">
            <span>Referencia</span>
            <input type="text" data-campo="referencia" maxlength="60" value="${escapar(valores.referencia || '')}">
          </label>
          <label class="campo-check" style="margin-top:26px">
            <input type="checkbox" data-campo="fueraRango" ${valores.fuera_rango ? 'checked' : ''}> Fuera de rango
          </label>
        </div>
      </div>
      <button type="button" class="btn btn-peligro btn-sm" data-quitar>Quitar</button>`;

    fila.querySelector('[data-quitar]').addEventListener('click', () => fila.remove());
    $('#filasResultados').appendChild(fila);
  }

  async function guardarExamen(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorExamen');
    H.limpiarError(caja);

    await H.conBoton($('#btnGuardarExamen'), 'Guardando…', async () => {
      try {
        if (form.id.value) {
          const resultados = leerFilas($('#filasResultados'), '[data-resultado]')
            .filter((r) => r.parametro)
            .map((r) => ({
              parametro: r.parametro,
              valor: r.valor || null,
              unidad: r.unidad || null,
              referencia: r.referencia || null,
              fueraRango: Boolean(r.fueraRango),
            }));

          await H.api.put(`/historia/examenes/${form.id.value}/resultados`, {
            estado: form.estado.value,
            conclusion: form.conclusion.value.trim() || null,
            resultados,
          });
          H.toast('Resultados guardados.');
        } else {
          await H.api.post('/historia/examenes', {
            mascotaId,
            tipoExamenId: form.tipoExamenId.value ? Number(form.tipoExamenId.value) : null,
            descripcion: form.descripcion.value.trim() || null,
          });
          H.toast('Examen solicitado.');
        }

        H.cerrarModal('modalExamen');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }
})();
