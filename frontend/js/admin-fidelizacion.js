/* ============================================================
   Planes de salud, puntos y recompensas

   El nivel del cliente se calcula con los puntos ACUMULADOS de por
   vida, no con el saldo: canjear un premio no debe hacerle perder
   la categoría que ya se ganó.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  let mostrar = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin'], ['planes.gestionar', 'puntos.gestionar']);
    if (!usuario) return;

    H.prepararModal('modal');

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'planes',
      vistas: {
        planes: vistaPlanes,
        suscripciones: vistaSuscripciones,
        recompensas: vistaRecompensas,
        promociones: vistaPromociones,
      },
    });
  });

  async function vistaPlanes() {
    const datos = await H.api.get('/fidelizacion/planes', { todos: 1 });

    $('#contenido').innerHTML = `
      ${M.tabla(datos.planes || [], [
        { titulo: 'Plan', valor: (p) => `<strong>${escapar(p.nombre)}</strong><br><span class="campo-ayuda">${escapar(p.descripcion || '')}</span>` },
        { titulo: 'Mensual', valor: (p) => escapar(H.moneda(p.precio_mensual)) },
        { titulo: 'Anual', valor: (p) => (p.precio_anual ? escapar(H.moneda(p.precio_anual)) : '—') },
        { titulo: 'Descuento', valor: (p) => `${escapar(p.descuento_general_pct)} %` },
        { titulo: 'Beneficios', valor: (p) => escapar(p.beneficios_count ?? (p.beneficios || []).length ?? '—') },
        { titulo: 'Estado', valor: (p) => M.estado(p.activo ? 'activo' : 'inactivo') },
      ], { vacio: 'No hay planes de salud.', icono: 'icon-heart' })}

      <h4 class="titulo-modulo" style="margin-top:22px">Nuevo plan</h4>
      <form id="formPlan">
        <div class="campos-fila-3">
          <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="80"></label>
          <label class="campo"><span>Precio mensual</span><input type="number" name="precioMensual" min="0" step="1000" value="0"></label>
          <label class="campo"><span>Precio anual</span><input type="number" name="precioAnual" min="0" step="1000"></label>
        </div>
        <div class="campos-fila">
          <label class="campo"><span>Descuento general (%)</span><input type="number" name="descuentoGeneralPct" min="0" max="100" step="1" value="0"></label>
          <label class="campo"><span>Color</span><input type="text" name="color" maxlength="20" placeholder="#1B5B46"></label>
        </div>
        <label class="campo"><span>Descripción</span><textarea name="descripcion" maxlength="4000"></textarea></label>
        <p class="campo-ayuda">Los beneficios se añaden desde la ficha del plan una vez creado.</p>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Crear plan</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formPlan', ruta: '/fidelizacion/planes', cajaError: '#error',
      ok: 'Plan creado.', alTerminar: () => mostrar('planes'),
    });
  }

  async function vistaSuscripciones() {
    const datos = await H.api.get('/fidelizacion/suscripciones', { limite: 100 });

    $('#contenido').innerHTML = M.tabla(datos.suscripciones || [], [
      { titulo: 'Cliente', campo: 'cliente_nombre' },
      { titulo: 'Plan', campo: 'plan' },
      { titulo: 'Mascota', valor: (s) => escapar(s.mascota_nombre || 'todas') },
      { titulo: 'Periodicidad', campo: 'periodicidad' },
      { titulo: 'Vigencia', valor: (s) => `${M.cuando(s.inicio)} — ${M.cuando(s.fin)}` },
      { titulo: 'Precio', valor: (s) => escapar(H.moneda(s.precio)) },
      { titulo: 'Estado', valor: (s) => M.estado(s.estado) },
    ], { vacio: 'No hay suscripciones activas.', icono: 'icon-heart' });
  }

  async function vistaRecompensas() {
    const datos = await H.api.get('/fidelizacion/recompensas', { todas: 1 });

    $('#contenido').innerHTML = `
      ${M.tabla(datos.recompensas || [], [
        { titulo: 'Recompensa', valor: (r) => `<strong>${escapar(r.nombre)}</strong><br><span class="campo-ayuda">${escapar(r.descripcion || '')}</span>` },
        { titulo: 'Puntos', valor: (r) => `<strong>${escapar(r.puntos)}</strong>` },
        { titulo: 'Tipo', campo: 'tipo' },
        { titulo: 'Valor', valor: (r) => (r.valor ? escapar(H.moneda(r.valor)) : '—') },
        { titulo: 'Existencias', valor: (r) => escapar(r.existencias ?? 'sin límite') },
        { titulo: 'Estado', valor: (r) => M.estado(r.activo ? 'activo' : 'inactivo') },
      ], { vacio: 'No hay recompensas.', icono: 'icon-heart' })}

      <h4 class="titulo-modulo" style="margin-top:22px">Nueva recompensa</h4>
      <form id="formRecompensa">
        <div class="campos-fila-3">
          <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="120"></label>
          <label class="campo"><span>Puntos *</span><input type="number" name="puntos" required min="1"></label>
          <label class="campo">
            <span>Tipo</span>
            <select name="tipo"><option value="producto">Producto</option><option value="servicio">Servicio</option><option value="descuento">Descuento</option><option value="otro">Otro</option></select>
          </label>
        </div>
        <div class="campos-fila">
          <label class="campo"><span>Valor equivalente</span><input type="number" name="valor" min="0" step="1000"></label>
          <label class="campo"><span>Existencias</span><input type="number" name="existencias" min="0"></label>
        </div>
        <label class="campo"><span>Descripción</span><input type="text" name="descripcion" maxlength="255"></label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Crear recompensa</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formRecompensa', ruta: '/fidelizacion/recompensas', cajaError: '#error',
      ok: 'Recompensa creada.', alTerminar: () => mostrar('recompensas'),
    });
  }

  async function vistaPromociones() {
    const datos = await H.api.get('/fidelizacion/promociones');

    $('#contenido').innerHTML = `
      ${M.tabla(datos.promociones || [], [
        { titulo: 'Promoción', valor: (p) => `<strong>${escapar(p.nombre)}</strong><br><span class="campo-ayuda">${escapar(p.descripcion || '')}</span>` },
        { titulo: 'Segmento', valor: (p) => escapar(String(p.segmento).replace('_', ' ')) },
        { titulo: 'Vigencia', valor: (p) => `${M.cuando(p.desde)}${p.hasta ? ` — ${M.cuando(p.hasta)}` : ''}` },
        { titulo: 'Cupón', valor: (p) => escapar(p.cupon_codigo || '—') },
        { titulo: 'Estado', valor: (p) => M.estado(p.activo ? 'activo' : 'inactivo') },
      ], { vacio: 'No hay promociones.', icono: 'icon-heart' })}

      <h4 class="titulo-modulo" style="margin-top:22px">Nueva promoción</h4>
      <form id="formPromocion">
        <div class="campos-fila">
          <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="120"></label>
          <label class="campo">
            <span>Segmento</span>
            <select name="segmento">
              <option value="todos">Todos</option><option value="nuevos">Clientes nuevos</option>
              <option value="inactivos">Inactivos</option><option value="recurrentes">Recurrentes</option>
              <option value="nivel">Por nivel</option><option value="plan">Con plan</option>
              <option value="cumpleanos">Cumpleaños de la mascota</option>
            </select>
          </label>
        </div>
        <div class="campos-fila">
          <label class="campo"><span>Desde</span><input type="date" name="desde"></label>
          <label class="campo"><span>Hasta</span><input type="date" name="hasta"></label>
        </div>
        <label class="campo"><span>Descripción</span><textarea name="descripcion" maxlength="4000"></textarea></label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Crear promoción</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formPromocion', ruta: '/fidelizacion/promociones', cajaError: '#error',
      ok: 'Promoción creada.', alTerminar: () => mostrar('promociones'),
    });
  }
})();
