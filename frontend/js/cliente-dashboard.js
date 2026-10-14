/* ============================================================
   Panel del cliente — resumen
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente']);
    if (!usuario) return;

    $('#saludo').textContent = `Hola, ${usuario.nombre.split(' ')[0]}`;
    $('#proximasCitas').innerHTML = H.cargando();
    $('#listaMascotas').innerHTML = H.cargando();

    try {
      const datos = await H.resumenPanel();
      pintarMetricas(datos.resumen);
      pintarAlertas(datos.alertasVacunas || []);
      pintarCitas(datos.proximasCitas || []);
      pintarMascotas(datos.mascotas || []);
    } catch (error) {
      H.toast(error.message, 'error');
      $('#proximasCitas').innerHTML = H.bloqueVacio('No se pudo cargar la información.', 'icon-alerta');
      $('#listaMascotas').innerHTML = '';
    }
  });

  function metrica(valor, texto, icono, clase = '') {
    return `<article class="metrica ${clase}">
      <span class="metrica-icono"><svg class="icon"><use href="#${icono}"/></svg></span>
      <strong>${valor}</strong>
      <span>${escapar(texto)}</span>
    </article>`;
  }

  function pintarMetricas(resumen) {
    $('#metricas').innerHTML = [
      metrica(resumen.proximas, 'Citas próximas', 'icon-calendar', 'acento'),
      metrica(resumen.mascotas, resumen.mascotas === 1 ? 'Mascota registrada' : 'Mascotas registradas', 'icon-paw'),
      metrica(resumen.pendientes, 'Por confirmar', 'icon-clock'),
      metrica(resumen.atendidas, 'Consultas atendidas', 'icon-check'),
    ].join('');
  }

  function pintarAlertas(alertas) {
    const caja = $('#alertas');
    if (!alertas.length) {
      caja.innerHTML = '';
      return;
    }

    const lineas = alertas.map((a) => {
      const dias = Number(a.dias);
      const vencida = dias < 0;
      const texto = vencida
        ? `La vacuna ${a.vacuna} de ${a.mascota} está vencida desde hace ${Math.abs(dias)} día(s).`
        : `${a.mascota} necesita el refuerzo de ${a.vacuna} en ${dias} día(s).`;

      return `<div class="aviso-linea ${vencida ? 'aviso-vencida' : 'aviso-proxima'}">
                <svg class="icon"><use href="#icon-syringe"/></svg>
                <span>${escapar(texto)}</span>
              </div>`;
    });

    caja.innerHTML = `<section class="tarjeta" style="margin-bottom:18px">
        <div class="tarjeta-cabecera"><h2><svg class="icon"><use href="#icon-alerta"/></svg> Alertas de vacunación</h2></div>
        ${lineas.join('')}
      </section>`;
  }

  function pintarCitas(citas) {
    const caja = $('#proximasCitas');
    if (!citas.length) {
      caja.innerHTML = H.bloqueVacio('No tienes citas programadas. Agenda una cuando lo necesites.');
      return;
    }
    caja.innerHTML = `<div class="lista-citas">
      ${citas.map((c) => H.tarjetaCita(c, 'cliente')).join('')}
    </div>`;
  }

  function pintarMascotas(mascotas) {
    const caja = $('#listaMascotas');
    if (!mascotas.length) {
      caja.innerHTML = `${H.bloqueVacio('Aún no has registrado ninguna mascota.', 'icon-paw')}
        <a href="${H.ruta('cliente/mascotas.html')}" class="btn btn-moss btn-bloque">Registrar mi primera mascota</a>`;
      return;
    }

    caja.innerHTML = `<div class="lista-citas">
      ${mascotas.map((m) => `
        <article class="cita">
          <div class="cita-hora cita-hora-mascota">
            <strong><svg class="icon"><use href="#icon-paw"/></svg></strong>
            <small>${escapar(m.especie)}</small>
          </div>
          <div class="cita-info">
            <h4>${escapar(m.nombre)}</h4>
            <p>${escapar(m.raza || 'Sin raza registrada')} · ${escapar(H.edadLegible(m.edad_meses))}</p>
          </div>
          <div class="cita-lado">
            <a class="btn btn-outline btn-sm" href="${H.ruta('cliente/mascotas.html')}">Ver ficha</a>
          </div>
        </article>`).join('')}
    </div>`;
  }
})();
