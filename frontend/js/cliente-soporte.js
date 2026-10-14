/* ============================================================
   Ayuda y PQRS del portal

   La ley colombiana da quince días hábiles para responder una PQRS;
   el servidor calcula el plazo al radicar y aquí se muestra, para
   que el cliente sepa cuándo esperar respuesta.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  const TIPOS = {
    peticion: 'Petición', queja: 'Queja', reclamo: 'Reclamo',
    sugerencia: 'Sugerencia', felicitacion: 'Felicitación', soporte: 'Soporte técnico',
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente'], ['tickets.crear']);
    if (!usuario) return;

    H.prepararModal('modal');
    $('#btnPrincipal').addEventListener('click', abrirFormulario);

    await recargar();
  });

  async function recargar() {
    $('#contenido').innerHTML = H.cargando();
    try {
      const datos = await H.api.get('/soporte/tickets', { limite: 50 });
      pintar(datos.tickets || []);
    } catch (error) {
      $('#contenido').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar(tickets) {
    if (!tickets.length) {
      $('#contenido').innerHTML = H.bloqueVacio(
        'No has radicado ningún caso. Si algo no salió como esperabas, cuéntanos.', 'icon-shield'
      );
      return;
    }

    $('#contenido').innerHTML = M.tabla(tickets, [
      { titulo: 'Caso', valor: (t) => `<strong>${escapar(t.numero)}</strong><br><span class="campo-ayuda">${escapar(TIPOS[t.tipo] || t.tipo)}</span>` },
      { titulo: 'Asunto', campo: 'asunto' },
      { titulo: 'Radicado', valor: (t) => M.cuando(t.creado_en) },
      { titulo: 'Respuesta antes de', valor: (t) => (t.vence_en ? M.cuando(t.vence_en) : '—') },
      { titulo: 'Estado', valor: (t) => M.estado(t.estado) },
      { titulo: '', valor: (t) => `<button type="button" class="btn btn-outline btn-sm" data-abrir="${t.id}">Ver</button>` },
    ], { vacio: '', icono: 'icon-shield' });

    H.$$('#contenido [data-abrir]').forEach((b) => {
      b.addEventListener('click', () => abrirCaso(Number(b.dataset.abrir)));
    });
  }

  async function abrirCaso(id) {
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
    // Las notas internas del equipo no se le muestran al cliente.
    const mensajes = (datos.mensajes || []).filter((m) => !m.interno);
    const cerrado = ['resuelto', 'cerrado'].includes(t.estado);

    $('#tituloModal').textContent = `${t.numero} — ${t.asunto}`;
    $('#subModal').innerHTML = `${escapar(TIPOS[t.tipo] || t.tipo)} · ${M.estado(t.estado)}`;

    $('#cuerpoModal').innerHTML = `
      <p>${escapar(t.descripcion)}</p>

      <h4 class="titulo-modulo" style="margin-top:18px">Respuestas</h4>
      ${mensajes.length
        ? `<div class="linea-tiempo">${mensajes.map((m) => `
            <article class="hito">
              <div class="hito-cabecera">
                <strong>${escapar(m.autor_nombre || 'Huellitas de Amor')}</strong>
                <span class="hito-fecha">${M.cuando(m.creado_en, true)}</span>
              </div>
              <div class="hito-cuerpo">${escapar(m.mensaje)}</div>
            </article>`).join('')}</div>`
        : H.bloqueVacio('Todavía no hemos respondido. Estamos en ello.', 'icon-clock')}

      ${cerrado
        ? `<h4 class="titulo-modulo" style="margin-top:20px">¿Cómo te atendimos?</h4>
           <form id="formCalificar">
             <label class="campo">
               <span>Calificación (1 a 5) *</span>
               <input type="number" name="calificacion" min="1" max="5" required>
             </label>
             <label class="campo"><span>Comentario</span><textarea name="comentario" maxlength="2000"></textarea></label>
             <div class="modal-acciones"><button type="submit" class="btn btn-primary">Enviar calificación</button></div>
           </form>`
        : `<h4 class="titulo-modulo" style="margin-top:20px">Añadir información</h4>
           <form id="formMensaje">
             <label class="campo"><textarea name="mensaje" required maxlength="8000" rows="3"></textarea></label>
             <div class="modal-acciones"><button type="submit" class="btn btn-primary">Enviar</button></div>
           </form>`}`;

    M.conectarFormulario({
      form: '#formMensaje', ruta: `/soporte/tickets/${id}/mensajes`, cajaError: '#errorModal',
      ok: 'Mensaje enviado.', alTerminar: () => abrirCaso(id),
    });

    M.conectarFormulario({
      form: '#formCalificar', ruta: `/soporte/tickets/${id}/calificacion`, cajaError: '#errorModal',
      ok: 'Gracias por calificarnos.',
      alTerminar: async () => { H.cerrarModal('modal'); await recargar(); },
    });
  }

  function abrirFormulario() {
    H.limpiarError($('#errorModal'));
    $('#tituloModal').textContent = 'Radicar un caso';
    $('#subModal').textContent = 'Te respondemos dentro de los quince días hábiles que da la ley.';

    $('#cuerpoModal').innerHTML = `
      <form id="formTicket">
        <label class="campo">
          <span>Tipo *</span>
          <select name="tipo" required>
            ${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}">${escapar(t)}</option>`).join('')}
          </select>
        </label>
        <label class="campo">
          <span>Asunto *</span>
          <input type="text" name="asunto" required maxlength="150" minlength="3">
        </label>
        <label class="campo">
          <span>Cuéntanos qué pasó *</span>
          <textarea name="descripcion" required maxlength="8000" minlength="10" rows="5"></textarea>
        </label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Radicar</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formTicket', ruta: '/soporte/tickets', cajaError: '#errorModal',
      ok: 'Caso radicado. Te llegará el número de radicado.',
      alTerminar: async () => { H.cerrarModal('modal'); await recargar(); },
    });

    H.abrirModal('modal');
  }
})();
