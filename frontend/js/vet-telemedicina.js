/* ============================================================
   Videoconsultas — lado del veterinario

   El sistema no transporta vídeo: guarda la sala, el enlace del
   proveedor, el chat, el consentimiento y el pago, y deja la
   consulta escrita en la historia clínica. Sin consentimiento
   firmado y sin pago, la sala no se abre.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  let mostrar = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['veterinario', 'admin'], ['telemedicina.atender', 'telemedicina.gestionar']);
    if (!usuario) return;

    H.prepararModal('modal');

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'agenda',
      vistas: {
        agenda: () => cargar(['programada', 'en_curso']),
        historial: () => cargar(['finalizada', 'cancelada']),
      },
    });
  });

  async function cargar(estados) {
    const listas = await Promise.all(estados.map((e) => H.api.get('/telemedicina', { estado: e })));
    const sesiones = listas.flatMap((l) => l.sesiones || []);

    $('#contenido').innerHTML = M.tabla(sesiones, [
      { titulo: 'Paciente', valor: (s) => `<strong>${escapar(s.mascota_nombre || '—')}</strong><br><span class="campo-ayuda">${escapar(s.cliente_nombre || '')}</span>` },
      { titulo: 'Motivo', valor: (s) => escapar(s.motivo || '—') },
      { titulo: 'Programada', valor: (s) => M.cuando(s.creado_en, true) },
      {
        titulo: 'Requisitos',
        valor: (s) => [
          s.firma_id ? '<span class="chip chip-exito">consentimiento</span>' : '<span class="chip chip-aviso">sin consentimiento</span>',
          s.pagada ? '<span class="chip chip-exito">pagada</span>' : '<span class="chip chip-aviso">sin pagar</span>',
        ].join(' '),
      },
      { titulo: 'Estado', valor: (s) => M.estado(s.estado) },
      { titulo: '', valor: (s) => `<button type="button" class="btn btn-outline btn-sm" data-abrir="${s.id}">Abrir</button>` },
    ], { vacio: 'No hay videoconsultas.', icono: 'icon-stetho' });

    H.$$('#contenido [data-abrir]').forEach((b) => {
      b.addEventListener('click', () => abrirSesion(Number(b.dataset.abrir)));
    });
  }

  async function abrirSesion(id) {
    H.limpiarError($('#errorModal'));
    $('#cuerpoModal').innerHTML = H.cargando();
    H.abrirModal('modal');

    let datos;
    try {
      datos = await H.api.get(`/telemedicina/${id}`);
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    const s = datos.sesion;
    const mensajes = datos.mensajes || [];
    const lista = s.firma_id && s.pagada;

    $('#tituloModal').textContent = `${s.mascota_nombre || ''} — videoconsulta`;
    $('#subModal').innerHTML = `${M.estado(s.estado)} · ${escapar(s.cliente_nombre || '')}`;

    $('#cuerpoModal').innerHTML = `
      ${lista
        ? `<div class="mensaje-ok">
            Sala lista. Código: <strong>${escapar(s.codigo_sala)}</strong>
            ${s.enlace ? ` · <a href="${escapar(s.enlace)}" target="_blank" rel="noopener">Abrir videollamada</a>` : ''}
          </div>`
        : `<div class="alerta alerta-alta">
            <div class="alerta-cuerpo">
              <h4>La sala todavía no se puede abrir</h4>
              <p>
                ${!s.firma_id ? 'Falta el consentimiento de atención remota. ' : ''}
                ${!s.pagada ? 'Falta el pago de la consulta.' : ''}
              </p>
            </div>
          </div>`}

      <h4 class="titulo-modulo" style="margin-top:18px">Chat</h4>
      ${mensajes.length
        ? `<div class="linea-tiempo">${mensajes.map((m) => `
            <article class="hito">
              <div class="hito-cabecera">
                <strong>${escapar(m.autor_nombre || '—')}</strong>
                <span class="hito-fecha">${M.cuando(m.creado_en, true)}</span>
              </div>
              ${m.texto ? `<div class="hito-cuerpo">${escapar(m.texto)}</div>` : ''}
              ${m.archivo ? `<div class="hito-pie"><a href="${escapar(m.archivo)}" target="_blank" rel="noopener">Ver adjunto</a></div>` : ''}
            </article>`).join('')}</div>`
        : H.bloqueVacio('Sin mensajes todavía.', 'icon-phone')}

      <form id="formMensaje" class="fila-editable" style="margin-top:12px">
        <label class="campo"><input type="text" name="texto" maxlength="4000" placeholder="Escribe un mensaje…"></label>
        <button type="submit" class="btn btn-primary">Enviar</button>
      </form>

      ${s.estado !== 'finalizada' && s.estado !== 'cancelada' ? `
        <h4 class="titulo-modulo" style="margin-top:20px">Cerrar la consulta</h4>
        <form id="formCierre">
          <input type="hidden" name="estado" value="finalizada">
          <label class="campo">
            <span>Resumen clínico *</span>
            <textarea name="resumen" required maxlength="8000" rows="4"
                      placeholder="Motivo, hallazgos referidos, recomendaciones dadas."></textarea>
          </label>
          <label class="campo-check">
            <input type="checkbox" name="registrarEnHistoria" checked>
            Dejar la consulta escrita en la historia clínica
          </label>
          <p class="campo-ayuda">
            Si no queda escrita es como si no hubiera existido.
          </p>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Finalizar consulta</button></div>
        </form>` : ''}`;

    M.conectarFormulario({
      form: '#formMensaje', ruta: `/telemedicina/${id}/mensajes`, cajaError: '#errorModal',
      ok: 'Mensaje enviado.', alTerminar: () => abrirSesion(id),
    });

    M.conectarFormulario({
      form: '#formCierre', ruta: `/telemedicina/${id}`, metodo: 'patch', cajaError: '#errorModal',
      ok: 'Consulta finalizada.',
      alTerminar: async () => { H.cerrarModal('modal'); await mostrar('agenda'); },
    });
  }
})();
