/* ============================================================
   Panel de administración — resumen de la clínica
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin']);
    if (!usuario) return;

    const hoy = H.fechaHoyISO();
    $('#fechaHoy').textContent = `${H.diaSemanaDe(hoy)} ${H.fechaLarga(hoy)}`;
    $('#citasHoy').innerHTML = H.cargando();

    try {
      const datos = await H.resumenPanel();
      pintarMetricas(datos.resumen);
      pintarCitas(datos.citasHoy || []);
      pintarServicios(datos.serviciosTop || []);
      pintarClientes(datos.ultimosClientes || []);
    } catch (error) {
      H.toast(error.message, 'error');
      $('#citasHoy').innerHTML = H.bloqueVacio('No se pudo cargar el resumen.', 'icon-alerta');
    }
  });

  function pintarMetricas(r) {
    const bloque = (valor, texto, icono, clase = '') => `
      <article class="metrica ${clase}">
        <span class="metrica-icono"><svg class="icon"><use href="#${icono}"/></svg></span>
        <strong>${valor}</strong>
        <span>${escapar(texto)}</span>
      </article>`;

    $('#metricas').innerHTML = [
      bloque(r.citasHoy, 'Citas hoy', 'icon-calendar', 'acento'),
      bloque(r.citasPendientes, 'Por confirmar', 'icon-alerta', r.citasPendientes > 0 ? 'aviso' : ''),
      bloque(r.clientes, 'Clientes activos', 'icon-users'),
      bloque(r.mascotas, 'Mascotas registradas', 'icon-paw'),
      bloque(r.veterinarios, 'Veterinarios', 'icon-stetho'),
      bloque(r.stockBajo, 'Productos con stock bajo', 'icon-caja', r.stockBajo > 0 ? 'aviso' : ''),
    ].join('');
  }

  function pintarCitas(citas) {
    const caja = $('#citasHoy');
    if (!citas.length) {
      caja.innerHTML = H.bloqueVacio('Hoy no hay citas programadas.');
      return;
    }
    caja.innerHTML = `<div class="lista-citas">${citas.map((c) => H.tarjetaCita(c, 'clinica')).join('')}</div>`;
  }

  function pintarServicios(servicios) {
    const caja = $('#serviciosTop');
    const conCitas = servicios.filter((s) => Number(s.total) > 0);

    if (!conCitas.length) {
      caja.innerHTML = H.bloqueVacio('Todavía no hay citas suficientes para calcular esto.', 'icon-grafica');
      return;
    }

    const maximo = Math.max(...conCitas.map((s) => Number(s.total)));

    caja.innerHTML = conCitas.map((s) => {
      const porcentaje = Math.round((Number(s.total) / maximo) * 100);
      return `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:.86rem;margin-bottom:4px">
          <span>${escapar(s.nombre)}</span><strong>${escapar(s.total)}</strong>
        </div>
        <div style="height:7px;background:var(--surface-2);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${porcentaje}%;background:var(--moss);border-radius:99px"></div>
        </div>
      </div>`;
    }).join('');
  }

  function pintarClientes(clientes) {
    const caja = $('#ultimosClientes');
    if (!clientes.length) {
      caja.innerHTML = H.bloqueVacio('Aún no hay clientes registrados.', 'icon-users');
      return;
    }

    caja.innerHTML = clientes.map((c) => `
      <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--border)">
        <div>
          <strong style="font-size:.9rem">${escapar(c.nombre)}</strong>
          <p class="campo-ayuda" style="margin:0">${escapar(c.email)}</p>
        </div>
        <span class="campo-ayuda">${escapar(H.fechaLarga(c.creado_en))}</span>
      </div>`).join('');
  }
})();
