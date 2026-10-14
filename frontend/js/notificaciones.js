/* ============================================================
   Avisos y recordatorios

   La misma página sirve a los tres roles: cada quien ve su propia
   bandeja, y quien tenga permiso para enviar ve además el botón
   de enviar y los recordatorios de toda la clínica.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const ICONO_TIPO = {
    cita_creada: 'icon-calendar',
    cita_confirmada: 'icon-check',
    cita_cancelada: 'icon-cross',
    cita_recordatorio: 'icon-clock',
    recordatorio_cita: 'icon-clock',
    recordatorio_vacuna: 'icon-syringe',
    vacuna_proxima: 'icon-syringe',
    consulta_registrada: 'icon-stetho',
    examen_listo: 'icon-micro',
    factura_emitida: 'icon-recibo',
    pago_registrado: 'icon-recibo',
    devolucion_registrada: 'icon-izquierda',
    stock_bajo: 'icon-caja',
  };

  const ETIQUETA_TIPO_RECORDATORIO = {
    cita: 'Cita',
    vacuna: 'Vacuna',
    control: 'Control',
    tratamiento: 'Tratamiento',
    otro: 'Otro',
  };

  let recordatoriosCargados = false;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(null, ['notificaciones.ver']);
    if (!usuario) return;

    H.prepararModal('modalEnviar');

    $('#pestanas').addEventListener('click', cambiarPestana);
    $('#filtroNoLeidas').addEventListener('change', cargarAvisos);
    $('#btnLeerTodas').addEventListener('click', leerTodas);
    $('#btnProcesar').addEventListener('click', procesarVencidos);
    $('#formEnviar').addEventListener('submit', enviarAviso);

    if (H.puede('notificaciones.enviar')) {
      $('#btnEnviar').hidden = false;
      $('#btnEnviar').addEventListener('click', () => H.abrirModal('modalEnviar'));
    }

    await cargarAvisos();
  });

  /* --------------------------------------------------------
     Bandeja
     -------------------------------------------------------- */

  async function cargarAvisos() {
    const caja = $('#listaAvisos');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/notificaciones', {
        soloNoLeidas: $('#filtroNoLeidas').checked ? 1 : undefined,
        limite: 100,
      });

      caja.innerHTML = datos.notificaciones.length
        ? `<div class="lista-avisos">${datos.notificaciones.map(tarjeta).join('')}</div>`
        : H.bloqueVacio('No tienes avisos por aquí.', 'icon-check');

      H.$$('[data-leida]', caja).forEach((btn) => {
        btn.addEventListener('click', () => marcarLeida(Number(btn.dataset.leida)));
      });
      H.$$('[data-borrar]', caja).forEach((btn) => {
        btn.addEventListener('click', () => borrar(Number(btn.dataset.borrar)));
      });
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function tarjeta(aviso) {
    const icono = ICONO_TIPO[aviso.tipo] || 'icon-panel';

    return `<article class="aviso-tarjeta ${aviso.leida ? '' : 'sin-leer'}">
      <svg class="icon"><use href="#${icono}"/></svg>
      <div class="aviso-cuerpo">
        <h4>${escapar(aviso.titulo)}</h4>
        ${aviso.mensaje ? `<p>${escapar(aviso.mensaje)}</p>` : ''}
        <span class="aviso-fecha">${escapar(H.fechaLarga(aviso.creado_en))} · ${escapar(H.hora12(aviso.creado_en))}</span>
      </div>
      <div class="aviso-acciones">
        ${aviso.enlace ? `<a class="btn btn-outline btn-sm" href="${H.ruta(aviso.enlace)}">Abrir</a>` : ''}
        ${aviso.leida ? '' : `<button type="button" class="btn btn-outline btn-sm" data-leida="${aviso.id}">Leído</button>`}
        <button type="button" class="btn btn-peligro btn-sm" data-borrar="${aviso.id}">Borrar</button>
      </div>
    </article>`;
  }

  async function marcarLeida(id) {
    try {
      await H.api.patch(`/notificaciones/${id}/leida`, {});
      await cargarAvisos();
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  async function leerTodas() {
    try {
      const datos = await H.api.post('/notificaciones/leer-todas', {});
      H.toast(datos.marcadas ? `${datos.marcadas} aviso(s) marcados como leídos.` : 'No había avisos sin leer.');
      await cargarAvisos();
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  async function borrar(id) {
    const ok = await H.confirmar('¿Borrar este aviso?');
    if (!ok) return;

    try {
      await H.api.del(`/notificaciones/${id}`);
      await cargarAvisos();
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  async function enviarAviso(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorEnviar');
    H.limpiarError(caja);

    const [clase, valor] = form.destino.value.split(':');

    const cuerpo = {
      titulo: form.titulo.value.trim(),
      mensaje: form.mensaje.value.trim() || null,
      tipo: 'aviso',
    };
    if (clase === 'rol') cuerpo.rol = valor;
    else cuerpo.usuarioId = Number(valor);

    if (!cuerpo.titulo) return H.mostrarError(caja, new Error('Escribe el título del aviso.'));

    await H.conBoton($('#btnGuardarEnvio'), 'Enviando…', async () => {
      try {
        const datos = await H.api.post('/notificaciones', cuerpo);
        H.toast(`Aviso enviado a ${datos.destinatarios} persona(s).`);
        H.cerrarModal('modalEnviar');
        form.reset();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Recordatorios
     -------------------------------------------------------- */

  async function cargarRecordatorios() {
    const caja = $('#listaRecordatorios');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/notificaciones/recordatorios', { limite: 100 });

      caja.innerHTML = datos.recordatorios.length
        ? `<div class="tabla-envoltura">
            <table class="tabla">
              <thead><tr><th>Cuándo</th><th>Tipo</th><th>Para</th><th>Mensaje</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                ${datos.recordatorios.map((r) => `
                  <tr>
                    <td>${escapar(H.fechaLarga(r.programado_en))}
                      <br><span class="campo-ayuda">${escapar(H.hora12(r.programado_en))}</span></td>
                    <td><span class="chip">${escapar(ETIQUETA_TIPO_RECORDATORIO[r.tipo] || r.tipo)}</span></td>
                    <td>${escapar(r.usuario_nombre)}
                      ${r.mascota_nombre ? `<br><span class="campo-ayuda">${escapar(r.mascota_nombre)}</span>` : ''}</td>
                    <td>${escapar(r.mensaje || '—')}</td>
                    <td><span class="insignia insignia-${claseEstado(r.estado)}">${escapar(r.estado)}</span></td>
                    <td class="acciones">
                      ${r.estado === 'pendiente' && H.puede('recordatorios.gestionar')
                        ? `<button type="button" class="btn btn-peligro btn-sm" data-cancelar="${r.id}">Cancelar</button>`
                        : ''}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        : H.bloqueVacio('No hay recordatorios programados.', 'icon-clock');

      H.$$('[data-cancelar]', caja).forEach((btn) => {
        btn.addEventListener('click', () => cancelarRecordatorio(Number(btn.dataset.cancelar)));
      });
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function claseEstado(estado) {
    if (estado === 'enviado') return 'atendida';
    if (estado === 'pendiente') return 'pendiente';
    if (estado === 'fallido') return 'no_asistio';
    return 'cancelada';
  }

  async function cancelarRecordatorio(id) {
    const ok = await H.confirmar('¿Cancelar este recordatorio?\n\nNo se enviará el aviso programado.');
    if (!ok) return;

    try {
      await H.api.del(`/notificaciones/recordatorios/${id}`);
      H.toast('Recordatorio cancelado.');
      await cargarRecordatorios();
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  /** Entrega ya los recordatorios cuya hora pasó, sin esperar al panel. */
  async function procesarVencidos() {
    try {
      const datos = await H.api.post('/notificaciones/recordatorios/procesar', {});
      H.toast(datos.entregados
        ? `${datos.entregados} recordatorio(s) entregados.`
        : 'No había recordatorios vencidos.');
      await Promise.all([cargarRecordatorios(), cargarAvisos()]);
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }

  function cambiarPestana(evento) {
    const boton = evento.target.closest('[data-pestana]');
    if (!boton) return;

    H.$$('#pestanas button').forEach((b) => b.classList.toggle('activa', b === boton));
    $('#panelAvisos').hidden = boton.dataset.pestana !== 'avisos';
    $('#panelRecordatorios').hidden = boton.dataset.pestana !== 'recordatorios';

    if (boton.dataset.pestana === 'recordatorios' && !recordatoriosCargados) {
      recordatoriosCargados = true;
      cargarRecordatorios();
    }
  }
})();
