/* ============================================================
   Panel del veterinario — resumen del día
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['veterinario']);
    if (!usuario) return;

    $('#saludo').textContent = `Hola, ${usuario.nombre.split(' ')[0]}`;
    const hoy = H.fechaHoyISO();
    $('#fechaHoy').textContent = `Hoy es ${H.diaSemanaDe(hoy)} ${H.fechaLarga(hoy)}.`;

    $('#citasHoy').innerHTML = H.cargando();
    $('#proximas').innerHTML = H.cargando();

    try {
      const datos = await H.resumenPanel();
      pintarMetricas(datos.resumen);
      pintarLista('#citasHoy', datos.citasHoy || [], 'Hoy no tienes citas programadas.');
      pintarLista('#proximas', (datos.proximasCitas || []).slice(0, 6), 'No hay citas próximas.');
    } catch (error) {
      H.toast(error.message, 'error');
      $('#citasHoy').innerHTML = H.bloqueVacio('No se pudo cargar la agenda.', 'icon-alerta');
      $('#proximas').innerHTML = '';
    }
  });

  function pintarMetricas(resumen) {
    const bloque = (valor, texto, icono, clase = '') => `
      <article class="metrica ${clase}">
        <span class="metrica-icono"><svg class="icon"><use href="#${icono}"/></svg></span>
        <strong>${valor}</strong>
        <span>${escapar(texto)}</span>
      </article>`;

    $('#metricas').innerHTML = [
      bloque(resumen.hoy, 'Citas hoy', 'icon-clock', 'acento'),
      bloque(resumen.porConfirmar, 'Por confirmar', 'icon-alerta', resumen.porConfirmar > 0 ? 'aviso' : ''),
      bloque(resumen.proximas, 'Próximas citas', 'icon-calendar'),
      bloque(resumen.pacientes, 'Pacientes atendidos', 'icon-paw'),
    ].join('');
  }

  function pintarLista(selector, citas, mensajeVacio) {
    const caja = $(selector);
    if (!citas.length) {
      caja.innerHTML = H.bloqueVacio(mensajeVacio);
      return;
    }
    caja.innerHTML = `<div class="lista-citas">
      ${citas.map((c) => H.tarjetaCita(c, 'clinica')).join('')}
    </div>`;
  }
})();
