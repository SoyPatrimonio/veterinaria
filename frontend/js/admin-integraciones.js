/* ============================================================
   Integraciones — DIAN, pasarelas de pago y mensajería

   Esta pantalla dice la verdad sobre qué está conectado. Un canal
   "activo" sin credencial cargada se muestra como NO disponible:
   lo contrario es descubrir que llevas un mes sin transmitir
   facturas. Aquí no se escriben secretos, solo el nombre de la
   variable de entorno donde viven.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  let mostrar = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin'], ['integraciones.ver', 'integraciones.gestionar']);
    if (!usuario) return;

    H.prepararModal('modal');

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'estado',
      vistas: {
        estado: vistaEstado,
        dian: vistaDian,
        pagos: vistaPagos,
        mensajes: vistaMensajes,
        automatizacion: vistaAutomatizacion,
      },
    });
  });

  const gestiona = () => H.puede('integraciones.gestionar');

  function tarjeta(titulo, listo, detalle) {
    return `<div class="alerta alerta-${listo ? 'baja' : 'alta'}">
      <div class="alerta-cuerpo">
        <h4>${escapar(titulo)} ${listo ? '<span class="chip chip-exito">conectado</span>' : '<span class="chip chip-aviso">sin conectar</span>'}</h4>
        <p>${escapar(detalle)}</p>
      </div>
    </div>`;
  }

  async function vistaEstado() {
    const datos = await H.api.get('/integraciones/estado');
    const canales = datos.canales || {};

    $('#contenido').innerHTML = `
      <p class="campo-ayuda" style="margin-bottom:16px">
        Lo que aparece como "sin conectar" no se transmite. La credencial vive en una
        variable de entorno, no en la base: rotarla no obliga a tocar nada de aquí.
      </p>

      ${tarjeta('Facturación electrónica DIAN', datos.dian?.listo,
        datos.dian?.listo
          ? `Proveedor: ${datos.dian.proveedor?.nombre || '—'} (${datos.dian.proveedor?.ambiente || '—'})`
          : datos.dian?.motivo || 'Sin proveedor configurado.')}

      ${tarjeta('Pasarelas de pago', Number(datos.pagos?.listas) > 0,
        `${datos.pagos?.listas || 0} de ${datos.pagos?.configuradas || 0} listas.` +
        ((datos.pagos?.pendientes || []).length
          ? ` Falta la credencial de: ${datos.pagos.pendientes.map((p) => `${p.nombre} (${p.falta})`).join(', ')}`
          : ''))}

      ${tarjeta('WhatsApp', canales.whatsapp, canales.whatsapp
        ? 'Configurado con WHATSAPP_TOKEN y WHATSAPP_PHONE_ID.'
        : 'Faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en el entorno.')}

      ${tarjeta('Correo electrónico', canales.email, canales.email
        ? 'Configurado.'
        : 'Falta SMTP_URL o RESEND_API_KEY en el entorno.')}

      ${tarjeta('SMS', canales.sms, canales.sms ? 'Configurado.' : 'Falta SMS_API_KEY en el entorno.')}`;
  }

  async function vistaDian() {
    const [config, facturas] = await Promise.all([
      H.api.get('/integraciones/dian'),
      H.api.get('/integraciones/dian/facturas', { limite: 50 }),
    ]);

    const p = (config.proveedores || [])[0] || {};

    $('#contenido').innerHTML = `
      ${gestiona() ? `
        <h4 class="titulo-modulo">Proveedor tecnológico</h4>
        <form id="formDian">
          <div class="campos-fila-3">
            <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="120" value="${escapar(p.nombre || '')}"></label>
            <label class="campo"><span>NIT</span><input type="text" name="nit" maxlength="30" value="${escapar(p.nit || '')}"></label>
            <label class="campo">
              <span>Ambiente</span>
              <select name="ambiente">
                <option value="pruebas" ${p.ambiente === 'pruebas' ? 'selected' : ''}>Pruebas</option>
                <option value="produccion" ${p.ambiente === 'produccion' ? 'selected' : ''}>Producción</option>
              </select>
            </label>
          </div>
          <div class="campos-fila-3">
            <label class="campo"><span>Prefijo</span><input type="text" name="prefijo" maxlength="10" value="${escapar(p.prefijo || '')}"></label>
            <label class="campo"><span>Resolución</span><input type="text" name="resolucion" maxlength="40" value="${escapar(p.resolucion || '')}"></label>
            <label class="campo"><span>Vigencia hasta</span><input type="date" name="vigenciaHasta" value="${escapar(p.vigencia_hasta || '')}"></label>
          </div>
          <div class="campos-fila-3">
            <label class="campo"><span>Rango desde</span><input type="number" name="rangoDesde" min="1" value="${escapar(p.rango_desde || '')}"></label>
            <label class="campo"><span>Rango hasta</span><input type="number" name="rangoHasta" min="1" value="${escapar(p.rango_hasta || '')}"></label>
            <label class="campo">
              <span>Variable del secreto</span>
              <input type="text" name="secretoEnv" maxlength="60" value="${escapar(p.secreto_env || '')}" placeholder="DIAN_API_TOKEN">
              <small class="campo-ayuda">Solo el nombre. El valor va en el entorno.</small>
            </label>
          </div>
          <label class="campo-check"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> Activo</label>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Guardar configuración</button></div>
        </form>` : ''}

      <h4 class="titulo-modulo" style="margin-top:22px">Cola de transmisión</h4>
      ${M.tabla(facturas.facturas || [], [
        { titulo: 'Factura', campo: 'numero' },
        { titulo: 'Cliente', campo: 'cliente' },
        { titulo: 'Total', valor: (f) => escapar(H.moneda(f.total)) },
        { titulo: 'CUFE', valor: (f) => escapar(f.cufe ? `${String(f.cufe).slice(0, 16)}…` : '—') },
        { titulo: 'Estado', valor: (f) => M.estado(f.estado) },
        { titulo: 'Enviada', valor: (f) => M.cuando(f.enviado_en, true) },
      ], { vacio: 'No hay facturas encoladas.', icono: 'icon-recibo' })}`;

    M.conectarFormulario({
      form: '#formDian', ruta: '/integraciones/dian', metodo: 'put', cajaError: '#error',
      ok: 'Configuración guardada.', alTerminar: () => mostrar('dian'),
    });
  }

  async function vistaPagos() {
    const [config, transacciones] = await Promise.all([
      H.api.get('/integraciones/pasarelas'),
      H.api.get('/integraciones/pagos', { limite: 50 }),
    ]);

    $('#contenido').innerHTML = `
      ${M.tabla(config.pasarelas || [], [
        { titulo: 'Pasarela', valor: (p) => `<strong>${escapar(p.nombre)}</strong><br><span class="campo-ayuda">${escapar(p.proveedor || '')}</span>` },
        { titulo: 'Método', campo: 'metodo' },
        { titulo: 'Ambiente', campo: 'ambiente' },
        { titulo: 'Comisión', valor: (p) => `${escapar(p.comision_pct)} %` },
        {
          titulo: 'Credencial',
          valor: (p) => (p.secreto_env
            ? `<span class="campo-ayuda">${escapar(p.secreto_env)}</span>`
            : '<span class="chip chip-error">sin definir</span>'),
        },
        { titulo: 'Estado', valor: (p) => M.estado(p.activo ? 'activo' : 'inactivo') },
      ], { vacio: 'No hay pasarelas configuradas.', icono: 'icon-recibo' })}

      ${gestiona() ? `
        <h4 class="titulo-modulo" style="margin-top:22px">Configurar pasarela</h4>
        <form id="formPasarela">
          <div class="campos-fila-3">
            <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="60" placeholder="Wompi PSE"></label>
            <label class="campo">
              <span>Método *</span>
              <select name="metodo" required>
                ${['pse', 'nequi', 'daviplata', 'tarjeta', 'transferencia', 'efecty', 'otro']
                  .map((m) => `<option value="${m}">${escapar(m.toUpperCase())}</option>`).join('')}
              </select>
            </label>
            <label class="campo"><span>Proveedor</span><input type="text" name="proveedor" maxlength="60" placeholder="Wompi, PayU…"></label>
          </div>
          <div class="campos-fila-3">
            <label class="campo">
              <span>Ambiente</span>
              <select name="ambiente"><option value="pruebas">Pruebas</option><option value="produccion">Producción</option></select>
            </label>
            <label class="campo"><span>Clave pública</span><input type="text" name="clavePublica" maxlength="160"></label>
            <label class="campo"><span>Variable del secreto</span><input type="text" name="secretoEnv" maxlength="60" placeholder="WOMPI_SECRET"></label>
          </div>
          <label class="campo-check"><input type="checkbox" name="activo"> Activa</label>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Guardar pasarela</button></div>
        </form>` : ''}

      <h4 class="titulo-modulo" style="margin-top:22px">Transacciones</h4>
      ${M.tabla(transacciones.transacciones || [], [
        { titulo: 'Referencia', valor: (t) => `<strong>${escapar(t.referencia)}</strong>` },
        { titulo: 'Concepto', valor: (t) => escapar(t.factura_numero || t.pedido_numero || '—') },
        { titulo: 'Cliente', valor: (t) => escapar(t.cliente || '—') },
        { titulo: 'Valor', valor: (t) => escapar(H.moneda(t.valor)) },
        { titulo: 'Pasarela', valor: (t) => escapar(t.pasarela || '—') },
        { titulo: 'Estado', valor: (t) => M.estado(t.estado) },
      ], { vacio: 'No hay transacciones.', icono: 'icon-recibo' })}`;

    M.conectarFormulario({
      form: '#formPasarela', ruta: '/integraciones/pasarelas', metodo: 'put', cajaError: '#error',
      ok: 'Pasarela guardada.', alTerminar: () => mostrar('pagos'),
    });
  }

  async function vistaMensajes() {
    const datos = await H.api.get('/integraciones/mensajes', { limite: 80 });
    const canales = datos.canales || {};

    $('#contenido').innerHTML = `
      <div class="opciones" style="margin-bottom:18px">
        ${Object.entries(canales).map(([canal, listo]) => `
          <article class="opcion">
            <strong>${escapar(canal)}</strong>
            ${listo ? '<span class="chip chip-exito">conectado</span>' : '<span class="chip chip-aviso">sin conectar</span>'}
          </article>`).join('')}
      </div>

      ${M.tabla(datos.mensajes || [], [
        { titulo: 'Fecha', valor: (m) => M.cuando(m.creado_en, true) },
        { titulo: 'Canal', campo: 'canal' },
        { titulo: 'Destino', campo: 'destino' },
        { titulo: 'Asunto', valor: (m) => escapar(m.asunto || '—') },
        { titulo: 'Estado', valor: (m) => M.estado(m.estado) },
        { titulo: 'Error', valor: (m) => (m.error ? `<span class="texto-alerta">${escapar(m.error)}</span>` : '—') },
      ], { vacio: 'No se ha enviado ningún mensaje externo.', icono: 'icon-phone' })}`;
  }

  async function vistaAutomatizacion() {
    const datos = await H.api.get('/integraciones/automatizacion');

    $('#contenido').innerHTML = `
      <p class="campo-ayuda" style="margin-bottom:14px">
        Qué suceso dispara qué aviso y con cuánta antelación. Un desfase negativo
        es antes del suceso; positivo, después.
      </p>
      ${M.tabla(datos.reglas || [], [
        { titulo: 'Regla', valor: (r) => `<strong>${escapar(r.nombre)}</strong><br><span class="campo-ayuda">${escapar(r.codigo)}</span>` },
        { titulo: 'Evento', valor: (r) => escapar(String(r.evento).replace(/_/g, ' ')) },
        { titulo: 'Canal', campo: 'canal' },
        { titulo: 'Desfase', valor: (r) => `${escapar(r.desfase_horas)} h` },
        { titulo: 'Destinatario', campo: 'destinatario' },
        { titulo: 'Estado', valor: (r) => M.estado(r.activo ? 'activo' : 'inactivo') },
      ], { vacio: 'No hay reglas de automatización.', icono: 'icon-ajustes' })}`;
  }
})();
