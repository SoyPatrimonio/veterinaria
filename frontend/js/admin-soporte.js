/* ============================================================
   PQRS — peticiones, quejas, reclamos y sugerencias

   El plazo legal en Colombia es de quince días hábiles. El servidor
   calcula `vence_en` al radicar; aquí lo único que hace falta es
   que salte a la vista lo que se está pasando de fecha.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  const TIPOS = {
    peticion: 'Petición', queja: 'Queja', reclamo: 'Reclamo',
    sugerencia: 'Sugerencia', felicitacion: 'Felicitación', soporte: 'Soporte',
  };

  let mostrar = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin', 'veterinario'], ['tickets.ver_todos', 'tickets.gestionar']);
    if (!usuario) return;

    H.prepararModal('modal');

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'tickets',
      vistas: { tickets: vistaTickets, encuestas: vistaEncuestas },
    });
  });

  /** ¿Cuánto le queda de plazo? Es lo que decide el color de la fila. */
  function plazo(ticket) {
    if (!ticket.vence_en || ['resuelto', 'cerrado'].includes(ticket.estado)) return null;

    const dias = Math.floor(
      (new Date(String(ticket.vence_en).replace(' ', 'T')) - Date.now()) / 86400000
    );
    return dias;
  }

  async function vistaTickets() {
    const [datos, resumen] = await Promise.all([
      H.api.get('/soporte/tickets', { limite: 100 }),
      H.api.get('/soporte/resumen'),
    ]);

    const tickets = datos.tickets || [];
    const r = resumen.resumen || {};

    $('#metricas').innerHTML = M.metricas([
      { texto: 'Abiertos', valor: r.abiertos ?? 0, icono: 'icon-shield' },
      { texto: 'Fuera de plazo', valor: r.vencidos ?? 0, icono: 'icon-alerta' },
      { texto: 'Resueltos este mes', valor: r.resueltos_mes ?? 0, icono: 'icon-check' },
      { texto: 'Calificación media', valor: r.calificacion_promedio ?? '—', icono: 'icon-heart' },
    ]);

    $('#contenido').innerHTML = M.tabla(tickets, [
      { titulo: 'Caso', valor: (t) => `<strong>${escapar(t.numero)}</strong><br><span class="campo-ayuda">${escapar(TIPOS[t.tipo] || t.tipo)}</span>` },
      { titulo: 'Asunto', valor: (t) => `${escapar(t.asunto)}<br><span class="campo-ayuda">${escapar(t.cliente_nombre || t.nombre_contacto || '—')}</span>` },
      { titulo: 'Radicado', valor: (t) => M.cuando(t.creado_en) },
      {
        titulo: 'Plazo',
        valor: (t) => {
          const dias = plazo(t);
          if (dias === null) return '—';
          if (dias < 0) return `<span class="texto-alerta">vencido hace ${Math.abs(dias)} d</span>`;
          return `<span class="${dias <= 2 ? 'texto-alerta' : ''}">${dias} día(s)</span>`;
        },
      },
      { titulo: 'Prioridad', valor: (t) => M.estado(t.prioridad) },
      { titulo: 'Estado', valor: (t) => M.estado(t.estado) },
      { titulo: '', valor: (t) => `<button type="button" class="btn btn-outline btn-sm" data-abrir="${t.id}">Abrir</button>` },
    ], { vacio: 'No hay casos radicados.', icono: 'icon-shield' });

    H.$$('#contenido [data-abrir]').forEach((b) => {
      b.addEventListener('click', () => abrirTicket(Number(b.dataset.abrir)));
    });
  }

  async function abrirTicket(id) {
    H.limpiarError($('#errorModal'));
    $('#cuerpoModal').innerHTML = H.cargando();
    H.abrirModal('modal');

    let datos;
    try {
      datos = await H.api.get(`/soporte/tickets/${id}`);
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    const t = datos.ticket;
    const mensajes = datos.mensajes || [];

    $('#tituloModal').textContent = `${t.numero} — ${t.asunto}`;
    $('#subModal').innerHTML =
      `${escapar(TIPOS[t.tipo] || t.tipo)} · ${escapar(t.canal)} · ${M.cuando(t.creado_en, true)}
       · ${M.estado(t.estado)}
       ${t.vence_en ? ` · vence ${escapar(H.fechaLarga(t.vence_en))}` : ''}`;

    const cerrado = ['resuelto', 'cerrado'].includes(t.estado);

    $('#cuerpoModal').innerHTML = `
      <p>${escapar(t.descripcion)}</p>

      <h4 class="titulo-modulo" style="margin-top:18px">Conversación</h4>
      ${mensajes.length ? `<div class="linea-tiempo">${mensajes.map((m) => `
        <article class="hito">
          <div class="hito-cabecera">
            <strong>${escapar(m.autor_nombre || 'Cliente')}</strong>
            ${m.interno ? ' <span class="chip chip-aviso">nota interna</span>' : ''}
            <span class="hito-fecha">${M.cuando(m.creado_en, true)}</span>
          </div>
          <div class="hito-cuerpo">${escapar(m.mensaje)}</div>
        </article>`).join('')}</div>`
        : H.bloqueVacio('Sin respuestas todavía.', 'icon-phone')}

      ${H.puede('tickets.gestionar') ? `
        <h4 class="titulo-modulo" style="margin-top:20px">Responder</h4>
        <form id="formRespuesta">
          <label class="campo"><textarea name="mensaje" required maxlength="8000" rows="4"></textarea></label>
          <label class="campo-check">
            <input type="checkbox" name="interno"> Nota interna (no la ve el cliente)
          </label>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Enviar respuesta</button></div>
        </form>

        ${cerrado ? '' : `
          <h4 class="titulo-modulo" style="margin-top:20px">Cambiar estado</h4>
          <form id="formEstado">
            <div class="campos-fila">
              <label class="campo">
                <span>Estado</span>
                <select name="estado">
                  <option value="en_proceso">En proceso</option>
                  <option value="esperando">Esperando al cliente</option>
                  <option value="resuelto">Resuelto</option>
                  <option value="cerrado">Cerrado</option>
                </select>
              </label>
              <label class="campo">
                <span>Prioridad</span>
                <select name="prioridad">
                  <option value="baja">Baja</option><option value="normal" selected>Normal</option>
                  <option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
              </label>
            </div>
            <label class="campo">
              <span>Comentario de cierre</span>
              <textarea name="comentarioCierre" maxlength="4000"
                        placeholder="Obligatorio al marcar como resuelto o cerrado."></textarea>
            </label>
            <div class="modal-acciones"><button type="submit" class="btn btn-outline">Actualizar</button></div>
          </form>`}` : ''}`;

    M.conectarFormulario({
      form: '#formRespuesta', ruta: `/soporte/tickets/${t.id}/mensajes`, cajaError: '#errorModal',
      ok: 'Respuesta enviada.', alTerminar: () => abrirTicket(t.id),
    });

    M.conectarFormulario({
      form: '#formEstado', ruta: `/soporte/tickets/${t.id}`, metodo: 'patch', cajaError: '#errorModal',
      ok: 'Caso actualizado.',
      antesDeEnviar: (cuerpo) => {
        if (['resuelto', 'cerrado'].includes(cuerpo.estado) && !cuerpo.comentarioCierre) {
          H.mostrarError($('#errorModal'), new Error('Cerrar un caso exige escribir cómo se resolvió.'));
          return false;
        }
        return cuerpo;
      },
      alTerminar: async () => { await abrirTicket(t.id); await mostrar('tickets'); },
    });
  }

  /** Los resultados van por encuesta, así que primero hay que elegir cuál. */
  async function vistaEncuestas() {
    const datos = await H.api.get('/soporte/encuestas', { soloActivas: false });
    const encuestas = datos.encuestas || [];

    if (!encuestas.length) {
      $('#contenido').innerHTML = H.bloqueVacio('No hay encuestas definidas.', 'icon-grafica');
      return;
    }

    $('#contenido').innerHTML = `
      <label class="campo" style="max-width:360px">
        <span>Encuesta</span>
        <select id="selectorEncuesta">${M.opciones(encuestas)}</select>
      </label>
      <div id="resultadosEncuesta"></div>`;

    const selector = $('#selectorEncuesta');
    selector.addEventListener('change', () => cargarResultados(Number(selector.value)));
    await cargarResultados(Number(selector.value));
  }

  async function cargarResultados(encuestaId) {
    const caja = $('#resultadosEncuesta');
    caja.innerHTML = H.cargando();

    let datos;
    try {
      datos = await H.api.get(`/soporte/encuestas/${encuestaId}/resultados`);
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    caja.innerHTML = `
      <div class="rejilla-metricas" style="margin:18px 0">
        ${M.metricas([
          { texto: 'Respuestas', valor: datos.total ?? (datos.respuestas || []).length, icono: 'icon-grafica' },
          { texto: 'Calificación media', valor: datos.promedio ?? '—', icono: 'icon-heart' },
        ])}
      </div>
      ${M.tabla(datos.respuestas || [], [
        { titulo: 'Fecha', valor: (r) => M.cuando(r.fecha) },
        { titulo: 'Cliente', valor: (r) => escapar(r.cliente_nombre || 'anónimo') },
        { titulo: 'Veterinario', valor: (r) => escapar(r.veterinario_nombre || '—') },
        { titulo: 'Calificación', valor: (r) => (r.calificacion ? `${escapar(r.calificacion)} / 5` : '—') },
        { titulo: 'Comentario', valor: (r) => escapar(r.comentario || '—') },
      ], { vacio: 'Esta encuesta todavía no tiene respuestas.', icono: 'icon-grafica' })}`;
  }
})();
