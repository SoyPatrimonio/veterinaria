/* ============================================================
   Historia clínica vista por el dueño

   Solo lectura: aquí se consulta lo que la clínica escribió. El
   dibujo lo comparte con el panel del veterinario (historia-ui.js).
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  let mascotas = [];
  let historia = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente'], ['historia.ver_propia', 'historia.ver_todas']);
    if (!usuario) return;

    H.prepararModal('modalDetalle');
    $('#pestanas').addEventListener('click', cambiarPestana);
    $('#selectorMascota').addEventListener('change', () => cargar(Number($('#selectorMascota').value)));

    try {
      const datos = await H.api.get('/mascotas');
      mascotas = datos.mascotas;
    } catch (error) {
      $('#fichaResumen').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    if (!mascotas.length) {
      $('#fichaResumen').innerHTML = H.bloqueVacio(
        'Todavía no tienes mascotas registradas. Regístralas para ver su historia clínica.', 'icon-paw'
      );
      return;
    }

    $('#selectorMascota').innerHTML = mascotas
      .map((m) => `<option value="${m.id}">${escapar(m.nombre)}</option>`).join('');

    // La mascota puede venir indicada desde el resumen o desde "mis mascotas".
    const pedida = Number(new URLSearchParams(location.search).get('mascota'));
    const inicial = mascotas.some((m) => m.id === pedida) ? pedida : mascotas[0].id;
    $('#selectorMascota').value = String(inicial);

    await cargar(inicial);
  });

  async function cargar(mascotaId) {
    $('#listaConsultas').innerHTML = H.cargando();

    try {
      historia = await H.api.get(`/historia/mascota/${mascotaId}`);
    } catch (error) {
      $('#fichaResumen').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      $('#listaConsultas').innerHTML = '';
      return;
    }

    pintarFicha();

    $('#listaConsultas').innerHTML = H.lineaTiempoConsultas(historia.consultas);
    $('#listaVacunas').innerHTML = H.tablaVacunas(historia.vacunas);
    $('#listaExamenes').innerHTML = H.listaExamenes(historia.examenes);
    $('#listaAntecedentes').innerHTML = H.antecedentes({
      alergias: historia.alergias,
      condiciones: historia.condiciones,
    });
    $('#curvaPeso').innerHTML = H.curvaPeso(historia.peso);

    H.$$('[data-ver]').forEach((btn) => {
      btn.addEventListener('click', () => verConsulta(Number(btn.dataset.ver)));
    });
  }

  function pintarFicha() {
    const m = historia.mascota;
    const ultima = historia.consultas[0];

    // El refuerzo más urgente, que es el dato que le sirve al dueño para
    // decidir si tiene que pedir cita.
    const refuerzos = historia.vacunas
      .filter((v) => v.proxima_fecha)
      .sort((a, b) => String(a.proxima_fecha).localeCompare(String(b.proxima_fecha)));
    const proximo = refuerzos[0];

    $('#fichaResumen').innerHTML = `
      <div class="rejilla-metricas">
        ${metrica('icon-stetho', historia.consultas.length, 'Consultas')}
        ${metrica('icon-syringe', historia.vacunas.length, 'Vacunas')}
        ${metrica('icon-calendar', ultima ? H.fechaLarga(ultima.fecha) : '—', 'Última consulta')}
        ${metrica('icon-grafica', m.peso_kg ? `${m.peso_kg} kg` : '—', 'Peso actual')}
      </div>
      ${proximo ? avisoRefuerzo(proximo) : ''}`;
  }

  function metrica(icono, valor, texto, clase = '') {
    return `<article class="metrica ${clase}">
      <span class="metrica-icono"><svg class="icon"><use href="#${icono}"/></svg></span>
      <div><strong>${escapar(valor)}</strong><span>${escapar(texto)}</span></div>
    </article>`;
  }

  function avisoRefuerzo(vacuna) {
    const dias = Number(vacuna.dias_para_refuerzo);
    if (Number.isNaN(dias) || dias > 30) return '';

    const vencida = dias < 0;
    return `<div class="aviso-linea ${vencida ? 'aviso-vencida' : 'aviso-proxima'}" style="margin-top:16px">
      <svg class="icon"><use href="#icon-syringe"/></svg>
      ${vencida
        ? `El refuerzo de ${escapar(vacuna.vacuna)} está vencido desde el ${escapar(H.fechaLarga(vacuna.proxima_fecha))}.`
        : `El refuerzo de ${escapar(vacuna.vacuna)} toca el ${escapar(H.fechaLarga(vacuna.proxima_fecha))}.`}
      <a class="link-btn" href="agendar.html">Agendar cita</a>
    </div>`;
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
})();
