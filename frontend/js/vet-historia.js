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
  let usuarioId = null;     // separa los borradores si dos personas comparten equipo

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['veterinario', 'admin'], ['historia.ver_todas']);
    if (!usuario) return;
    usuarioId = usuario.id;

    if (!mascotaId) {
      $('#fichaResumen').innerHTML = H.bloqueVacio(
        'Abre la historia desde el listado de pacientes.', 'icon-paw'
      );
      return;
    }

    ['modalConsulta', 'modalVacuna', 'modalExamen', 'modalDetalle'].forEach(H.prepararModal);

    $('#pestanas').addEventListener('click', cambiarPestana);
    $('#btnNuevaConsulta').addEventListener('click', abrirFormularioConsulta);
    $('#btnCalculadora').addEventListener('click', () => H.calculadora.abrir({ peso: pesoActual }));
    $('#btnAplicarVacuna').addEventListener('click', abrirFormularioVacuna);
    $('#btnSolicitarExamen').addEventListener('click', () => abrirFormularioExamen(null));
    $('#btnAgregarDiagnostico').addEventListener('click', () => agregarDiagnostico());
    $('#btnAgregarTratamiento').addEventListener('click', () => agregarTratamiento());
    $('#btnAgregarResultado').addEventListener('click', () => agregarResultado());
    $('#btnDescartarBorrador').addEventListener('click', descartarBorrador);
    $('#formConsulta').addEventListener('submit', guardarConsulta);
    $('#formVacuna').addEventListener('submit', guardarVacuna);
    $('#formExamen').addEventListener('submit', guardarExamen);
    $('#selectVacuna').addEventListener('change', filtrarLotes);
    prepararAvisosSignos();
    $('#formConsulta').addEventListener('input', guardarBorrador);
    $('#formConsulta').addEventListener('change', guardarBorrador);

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

  // Lo usa la calculadora para no tener que volver a escribir el peso.
  let pesoActual = null;

  function pintarFicha() {
    const m = historia.mascota;

    document.title = `${m.nombre} — Historia clínica`;
    $('#tituloPaciente').textContent = `${m.nombre} · ${historia.historia?.numero || 'Historia clínica'}`;
    $('#subtituloPaciente').textContent =
      `${m.especie}${m.raza ? ` · ${m.raza}` : ''} · ${H.edadLegible(m.edad_meses)} · Dueño: ${m.cliente_nombre}`;

    const ultimoPeso = historia.peso.length ? historia.peso[historia.peso.length - 1].peso_kg : m.peso_kg;
    pesoActual = ultimoPeso || null;
    const proxima = historia.vacunas.find((v) => v.proxima_fecha);

    $('#fichaResumen').innerHTML = `${bandaAlergias()}<div class="rejilla-metricas">
      ${metrica('icon-stetho', historia.consultas.length, 'Consultas')}
      ${metrica('icon-syringe', historia.vacunas.length, 'Vacunas aplicadas')}
      ${metrica('icon-micro', historia.examenes.length, 'Exámenes')}
      ${metrica('icon-grafica', ultimoPeso ? `${ultimoPeso} kg` : '—', 'Último peso')}
      ${proxima ? metricaRefuerzo(proxima) : ''}
    </div>
    ${H.botonesDocumentos(m)}`;
  }

  /**
   * Alergias y reacciones a la vista, arriba de todo. En la pestaña de
   * antecedentes se ven completas, pero quien abre una historia para recetar
   * no tiene por qué pasar por ahí.
   */
  function bandaAlergias() {
    const alergias = historia.alergias || [];
    const reacciones = historia.reacciones || [];
    if (!alergias.length && !reacciones.length) return '';

    const items = [
      ...alergias.map((a) => `<li><strong>${escapar(a.nombre)}</strong>${a.severidad ? ` · ${escapar(a.severidad)}` : ''}${a.reaccion ? ` — ${escapar(a.reaccion)}` : ''}</li>`),
      ...reacciones.map((r) => `<li><strong>Reacción a ${escapar(r.medicamento || 'un medicamento')}</strong> · ${escapar(r.severidad)} — ${escapar(r.descripcion)}</li>`),
    ];
    return `<div class="banda-alergias" role="note">
      <svg class="icon"><use href="#icon-alerta"/></svg>
      <div><h4>Alergias y reacciones</h4><ul>${items.join('')}</ul></div>
    </div>`;
  }

  /** Lo que el módulo de seguridad clínica necesita saber del paciente. */
  function contextoClinico() {
    const m = historia.mascota;
    return {
      especie: m.especie,
      raza: m.raza,
      edadMeses: m.edad_meses,
      alergias: historia.alergias || [],
      reacciones: historia.reacciones || [],
    };
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
      reacciones: historia.reacciones,
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

    const borrador = leerBorrador();
    if (borrador) restaurarBorrador(borrador);
    else agregarDiagnostico();
    avisoBorrador(Boolean(borrador));

    pintarAvisosSignos();
    pintarInteracciones();
    H.abrirModal('modalConsulta');
  }

  /* --------------------------------------------------------
     Avisos clínicos dentro del formulario
     -------------------------------------------------------- */

  const CAMPOS_SIGNOS = ['pesoKg', 'temperaturaC', 'condicionCorporal', 'frecCardiaca', 'frecRespiratoria'];

  /** Pone debajo de cada signo vital un renglón para el aviso. Una vez. */
  function prepararAvisosSignos() {
    const form = $('#formConsulta');
    CAMPOS_SIGNOS.forEach((nombre) => {
      const nota = document.createElement('small');
      nota.className = 'nota-signo';
      nota.dataset.nota = nombre;
      nota.setAttribute('aria-live', 'polite');
      form[nombre].closest('.campo').appendChild(nota);
      form[nombre].addEventListener('input', pintarAvisosSignos);
    });
  }

  function pintarAvisosSignos() {
    const form = $('#formConsulta');
    if (!historia) return;
    const signos = Object.fromEntries(CAMPOS_SIGNOS.map((n) => [n, form[n].value]));
    const anterior = historia.peso.length ? historia.peso[historia.peso.length - 1] : null;
    const evaluacion = H.clinica.evaluarSignos(contextoClinico(), signos, anterior);

    CAMPOS_SIGNOS.forEach((nombre) => {
      const nota = form.querySelector(`[data-nota="${nombre}"]`);
      const r = evaluacion[nombre];
      nota.textContent = r ? r.texto : '';
      nota.className = `nota-signo${r ? ` nota-${r.nivel}` : ''}`;
      form[nombre].classList.toggle('campo-fuera-rango', Boolean(r && r.nivel !== 'ok'));
    });
  }

  function medicamentoPorId(id) {
    return (catalogos?.medicamentos || []).find((m) => m.id === Number(id)) || null;
  }

  function avisosHtml(avisos) {
    return avisos.map((a) => `<p class="aviso-clinico aviso-clinico-${a.nivel}">
      <svg class="icon"><use href="#icon-alerta"/></svg><span>${escapar(a.texto)}</span></p>`).join('');
  }

  /** Avisos de un renglón de receta: alergias, especie, raza. */
  function pintarAvisosReceta(receta) {
    const medicamento = medicamentoPorId(receta.querySelector('[data-campo="medicamentoId"]').value);
    receta.querySelector('[data-avisos]').innerHTML =
      avisosHtml(H.clinica.revisarMedicamento(medicamento, contextoClinico()));
    pintarInteracciones();
  }

  /** Interacciones entre todo lo recetado en la consulta. */
  function pintarInteracciones() {
    const recetados = H.$$('[data-receta] [data-campo="medicamentoId"]', $('#filasTratamientos'))
      .map((s) => medicamentoPorId(s.value))
      .filter(Boolean);
    $('#avisosInteracciones').innerHTML = avisosHtml(H.clinica.interacciones(recetados));
  }

  /** Los avisos graves de toda la receta, para pedir confirmación al guardar. */
  function peligrosDeLaReceta() {
    return H.$$('[data-receta] [data-campo="medicamentoId"]', $('#filasTratamientos'))
      .map((s) => medicamentoPorId(s.value))
      .filter(Boolean)
      .flatMap((m) => H.clinica.revisarMedicamento(m, contextoClinico()))
      .filter((a) => a.nivel === 'peligro')
      .map((a) => a.texto);
  }

  /* --------------------------------------------------------
     Borrador de la consulta

     Una consulta se escribe durante toda la atención, con interrupciones; un
     clic fuera del modal o una recarga no deberían costar lo escrito. Se
     guarda en sessionStorage —no en localStorage— porque es información
     clínica en un equipo compartido: muere con la pestaña y no queda en el
     disco para el siguiente que use el computador.
     -------------------------------------------------------- */

  const CAMPOS_BORRADOR = ['tipo', 'citaId', 'motivo', 'anamnesis', 'sintomas', 'examenFisico', 'planManejo', ...CAMPOS_SIGNOS, 'mucosas'];

  function claveBorrador() {
    return `huellitas:borrador-consulta:${usuarioId}:${mascotaId}`;
  }

  /** Valores [data-campo] de un renglón, sin los de los renglones anidados. */
  function valoresFila(fila, saltarAnidadas) {
    const datos = {};
    H.$$('[data-campo]', fila).forEach((c) => {
      if (saltarAnidadas && c.closest('[data-receta]')) return;
      datos[c.dataset.campo] = c.type === 'checkbox' ? c.checked : c.value;
    });
    return datos;
  }

  function ponerValores(fila, datos, saltarAnidadas) {
    H.$$('[data-campo]', fila).forEach((c) => {
      if (saltarAnidadas && c.closest('[data-receta]')) return;
      if (!(c.dataset.campo in datos)) return;
      if (c.type === 'checkbox') c.checked = Boolean(datos[c.dataset.campo]);
      else c.value = datos[c.dataset.campo];
    });
  }

  let temporizadorBorrador = null;
  function guardarBorrador() {
    clearTimeout(temporizadorBorrador);
    temporizadorBorrador = setTimeout(() => {
      const form = $('#formConsulta');
      const datos = {
        campos: Object.fromEntries(CAMPOS_BORRADOR.map((n) => [n, form[n].value])),
        diagnosticos: H.$$('[data-diagnostico]', $('#filasDiagnosticos')).map((f) => valoresFila(f)),
        tratamientos: H.$$('[data-tratamiento]', $('#filasTratamientos')).map((f) => ({
          campos: valoresFila(f, true),
          recetas: H.$$('[data-receta]', f).map((r) => valoresFila(r)),
        })),
      };
      const vacio = !Object.values(datos.campos).some((v) => v && v !== 'consulta') &&
        !datos.diagnosticos.some((d) => d.descripcion) && !datos.tratamientos.length;
      try {
        if (vacio) sessionStorage.removeItem(claveBorrador());
        else sessionStorage.setItem(claveBorrador(), JSON.stringify(datos));
      } catch { /* sin almacenamiento: se pierde el borrador, no la consulta */ }
    }, 400);
  }

  function leerBorrador() {
    try {
      return JSON.parse(sessionStorage.getItem(claveBorrador()) || 'null');
    } catch {
      return null;
    }
  }

  function borrarBorrador() {
    clearTimeout(temporizadorBorrador);
    try { sessionStorage.removeItem(claveBorrador()); } catch { /* nada que borrar */ }
  }

  function restaurarBorrador(datos) {
    const form = $('#formConsulta');
    Object.entries(datos.campos || {}).forEach(([n, v]) => {
      // La cita puede haberse atendido en otra pestaña: si ya no está en la
      // lista, el select se queda en "Sin cita" en vez de inventar una opción.
      if (form[n]) form[n].value = v;
    });
    (datos.diagnosticos || []).forEach((d) => ponerValores(agregarDiagnostico(), d));
    if (!(datos.diagnosticos || []).length) agregarDiagnostico();
    (datos.tratamientos || []).forEach((t) => {
      const fila = agregarTratamiento();
      ponerValores(fila, t.campos || {}, true);
      (t.recetas || []).forEach((r) => {
        const receta = agregarReceta(fila.querySelector('[data-recetas]'));
        ponerValores(receta, r);
        pintarAvisosReceta(receta);
      });
    });
  }

  function avisoBorrador(hay) {
    const caja = $('#avisoBorrador');
    caja.hidden = !hay;
  }

  function descartarBorrador() {
    borrarBorrador();
    abrirFormularioConsulta();
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

    fila.querySelector('[data-quitar]').addEventListener('click', () => { fila.remove(); guardarBorrador(); });

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
    return fila;
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

    fila.querySelector('[data-quitar]').addEventListener('click', () => {
      fila.remove();
      pintarInteracciones();
      guardarBorrador();
    });
    fila.querySelector('[data-agregar-receta]').addEventListener('click', () => {
      agregarReceta(fila.querySelector('[data-recetas]'));
    });

    $('#filasTratamientos').appendChild(fila);
    return fila;
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
        <div data-avisos></div>
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

    receta.querySelector('[data-quitar]').addEventListener('click', () => {
      receta.remove();
      pintarInteracciones();
      guardarBorrador();
    });
    receta.querySelector('[data-campo="medicamentoId"]').addEventListener('change', () => pintarAvisosReceta(receta));
    contenedor.appendChild(receta);
    return receta;
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

    // Los avisos graves no bloquean —el veterinario puede tener razones—, pero
    // guardar una receta así tiene que ser una decisión, no un descuido.
    const peligros = peligrosDeLaReceta();
    if (peligros.length) {
      const seguir = await H.confirmar(
        `Esta receta tiene avisos de seguridad:\n\n• ${peligros.join('\n• ')}\n\n¿Guardarla de todas formas?`
      );
      if (!seguir) return;
    }

    await H.conBoton($('#btnGuardarConsulta'), 'Guardando…', async () => {
      try {
        await H.api.post('/historia/consultas', cuerpo);
        borrarBorrador();
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
