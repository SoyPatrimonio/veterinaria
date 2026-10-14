/* ============================================================
   Videoconsulta — portal del cliente

   Antes de conectarse hay que aceptar el consentimiento de atención
   remota y pagar. No es burocracia: la atención a distancia tiene
   límites y el dueño tiene que saber cuáles antes de empezar.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  const CONSENTIMIENTO = [
    'Autorizo la atención veterinaria remota (telemedicina) para mi mascota.',
    'Entiendo que una videoconsulta NO reemplaza el examen físico: el veterinario',
    'puede indicarme que acuda presencialmente si lo considera necesario, y que',
    'no es posible auscultar, palpar ni tomar muestras a distancia.',
    'Entiendo que en una urgencia debo acudir de inmediato a la clínica.',
    'Autorizo que lo conversado y las imágenes que envíe queden registrados en la',
    'historia clínica de mi mascota.',
  ].join(' ');

  // Devuelve el conmutador de pestañas; aquí no hace falta guardarlo porque
  // cada acción recarga su propia sesión.


  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente'], ['telemedicina.ver_propias']);
    if (!usuario) return;

    H.prepararModal('modal');

    M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'proximas',
      vistas: {
        proximas: () => cargar(['programada', 'en_curso']),
        anteriores: () => cargar(['finalizada', 'cancelada']),
      },
    });
  });

  async function cargar(estados) {
    const listas = await Promise.all(estados.map((e) => H.api.get('/telemedicina', { estado: e })));
    const sesiones = listas.flatMap((l) => l.sesiones || []);

    if (!sesiones.length) {
      $('#contenido').innerHTML = H.bloqueVacio(
        'No tienes videoconsultas. Agenda una cita marcando la modalidad virtual.', 'icon-stetho'
      );
      return;
    }

    $('#contenido').innerHTML = sesiones.map((s) => `
      <article class="cita">
        <div class="cita-hora">
          <strong>${escapar(H.hora12(s.creado_en))}</strong>
          <small>${escapar(H.fechaLarga(s.creado_en))}</small>
        </div>
        <div class="cita-info">
          <h4>${escapar(s.mascota_nombre || '')} · ${escapar(s.veterinario_nombre || '')}</h4>
          <p>${escapar(s.motivo || 'Consulta remota')}</p>
          <p class="campo-ayuda">
            ${s.firma_id ? '<span class="chip chip-exito">consentimiento firmado</span>' : '<span class="chip chip-aviso">falta consentimiento</span>'}
            ${s.pagada ? '<span class="chip chip-exito">pagada</span>' : '<span class="chip chip-aviso">sin pagar</span>'}
          </p>
        </div>
        <div class="cita-lado">
          ${H.modulo.estado(s.estado)}
          <button type="button" class="btn btn-primary btn-sm" data-abrir="${s.id}">Abrir</button>
        </div>
      </article>`).join('');

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
    const usuario = H.sesion.usuario() || {};

    $('#tituloModal').textContent = `Videoconsulta de ${s.mascota_nombre || ''}`;
    $('#subModal').innerHTML = `${M.estado(s.estado)} · ${escapar(s.veterinario_nombre || '')}`;

    $('#cuerpoModal').innerHTML = `
      ${!s.firma_id ? `
        <h4 class="titulo-modulo">Consentimiento de atención remota</h4>
        <p class="campo-ayuda" style="margin-bottom:12px">${escapar(CONSENTIMIENTO)}</p>
        <form id="formConsentimiento">
          <input type="hidden" name="documentoTexto" value="${escapar(CONSENTIMIENTO)}">
          <div class="campos-fila">
            <label class="campo">
              <span>Tu nombre completo *</span>
              <input type="text" name="firmanteNombre" required maxlength="120" value="${escapar(usuario.nombre || '')}">
            </label>
            <label class="campo"><span>Documento</span><input type="text" name="firmanteDocumento" maxlength="30"></label>
          </div>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Acepto</button></div>
        </form>
        <hr style="margin:20px 0;border:0;border-top:1px solid var(--border)">` : ''}

      ${s.firma_id && !s.pagada ? `
        <div class="alerta alerta-alta">
          <div class="alerta-cuerpo">
            <h4>Falta el pago</h4>
            <p>La sala se abre una vez registrado el pago de la consulta.</p>
          </div>
        </div>
        <div class="modal-acciones" style="justify-content:flex-start">
          <button type="button" class="btn btn-primary" id="btnPagar">Pagar en línea</button>
        </div>` : ''}

      ${s.firma_id && s.pagada ? `
        <div class="mensaje-ok">
          Todo listo. Código de sala: <strong>${escapar(s.codigo_sala)}</strong>
          ${s.enlace ? `<br><a href="${escapar(s.enlace)}" target="_blank" rel="noopener">Entrar a la videollamada</a>` : ''}
        </div>` : ''}

      <h4 class="titulo-modulo" style="margin-top:18px">Chat con el veterinario</h4>
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

      <form id="formMensaje" style="margin-top:12px">
        <label class="campo"><input type="text" name="texto" maxlength="4000" placeholder="Escribe un mensaje…"></label>
        <label class="campo"><span>Adjuntar foto o vídeo (URL)</span><input type="url" name="archivo" maxlength="255"></label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Enviar</button></div>
      </form>

      ${s.resumen ? `
        <h4 class="titulo-modulo" style="margin-top:20px">Resumen de la consulta</h4>
        <p>${escapar(s.resumen)}</p>` : ''}`;

    M.conectarFormulario({
      form: '#formConsentimiento', ruta: `/telemedicina/${id}/consentimiento`, cajaError: '#errorModal',
      ok: 'Consentimiento registrado.', alTerminar: () => abrirSesion(id),
    });

    M.conectarFormulario({
      form: '#formMensaje', ruta: `/telemedicina/${id}/mensajes`, cajaError: '#errorModal',
      ok: 'Mensaje enviado.', alTerminar: () => abrirSesion(id),
    });

    const btnPagar = $('#btnPagar');
    if (btnPagar) {
      btnPagar.addEventListener('click', async () => {
        // Deshabilitado mientras corre: sin esto, un doble clic (normal en
        // redes lentas, sin ningún indicio de que ya se está procesando)
        // podía mandar dos veces la misma transacción de pago.
        await H.conBoton(btnPagar, 'Procesando…', async () => {
          try {
            const metodos = await H.api.get('/integraciones/pagos/metodos');
            const disponibles = metodos.metodos || [];

            if (!disponibles.length) {
              return H.toast('El pago en línea todavía no está habilitado. Llámanos y lo coordinamos.', 'error');
            }

            const r = await H.api.post('/integraciones/pagos', {
              pasarelaId: disponibles[0].id,
              sesionTeleId: id,
            });
            H.toast(r.mensaje || 'Transacción iniciada.');
          } catch (error) {
            H.toast(error.message, 'error');
          }
        });
      });
    }
  }
})();
