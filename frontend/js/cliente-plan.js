/* ============================================================
   Plan de salud y puntos — portal del cliente

   El saldo de puntos baja al canjear, pero el NIVEL se calcula con
   los puntos acumulados de por vida: canjear un premio no le hace
   perder a nadie la categoría que ya se ganó.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  let mostrar = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente'], ['planes.ver', 'puntos.ver']);
    if (!usuario) return;

    H.prepararModal('modal');

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'plan',
      vistas: { plan: vistaMiPlan, planes: vistaPlanes, puntos: vistaPuntos },
    });
  });

  async function vistaMiPlan() {
    const datos = await H.api.get('/fidelizacion/beneficios');
    const beneficios = datos.beneficios || [];

    if (!beneficios.length) {
      $('#metricas').innerHTML = '';
      $('#contenido').innerHTML = H.bloqueVacio(
        'No tienes un plan de salud activo. Mira los planes disponibles.', 'icon-heart'
      );
      return;
    }

    const plan = beneficios[0];
    $('#metricas').innerHTML = M.metricas([
      { texto: 'Plan', valor: plan.plan, icono: 'icon-heart' },
      { texto: 'Vence', valor: H.fechaLarga(plan.fin), icono: 'icon-calendar' },
      { texto: 'Beneficios', valor: beneficios.length, icono: 'icon-check' },
    ]);

    $('#contenido').innerHTML = M.tabla(beneficios, [
      { titulo: 'Beneficio', valor: (b) => `<strong>${escapar(b.descripcion)}</strong>` },
      { titulo: 'Tipo', campo: 'tipo' },
      { titulo: 'Periodo', campo: 'periodo' },
      { titulo: 'Usados', campo: 'usados' },
      {
        titulo: 'Te quedan',
        valor: (b) => (b.disponibles === null
          ? '<span class="chip chip-exito">ilimitado</span>'
          : `<strong class="${Number(b.disponibles) === 0 ? 'texto-alerta' : ''}">${escapar(b.disponibles)}</strong>`),
      },
      { titulo: 'Descuento', valor: (b) => (b.descuento_pct ? `${escapar(b.descuento_pct)} %` : '—') },
    ], { vacio: '', icono: 'icon-heart' });
  }

  async function vistaPlanes() {
    const datos = await H.api.get('/fidelizacion/planes');
    const planes = datos.planes || [];

    if (!planes.length) {
      $('#contenido').innerHTML = H.bloqueVacio('No hay planes disponibles ahora mismo.', 'icon-heart');
      return;
    }

    $('#contenido').innerHTML = `<div class="opciones">
      ${planes.map((p) => `
        <article class="opcion">
          <h4>${escapar(p.nombre)}</h4>
          <p class="campo-ayuda">${escapar(p.descripcion || '')}</p>
          <p><strong>${escapar(H.moneda(p.precio_mensual))}</strong> / mes</p>
          ${p.precio_anual ? `<p class="campo-ayuda">${escapar(H.moneda(p.precio_anual))} al año</p>` : ''}
          ${Number(p.descuento_general_pct) > 0
            ? `<span class="chip chip-exito">${escapar(p.descuento_general_pct)} % en todo</span>` : ''}
          ${H.puede('planes.suscribir')
            ? `<button type="button" class="btn btn-primary btn-sm" data-plan="${p.id}">Suscribirme</button>` : ''}
        </article>`).join('')}
    </div>`;

    H.$$('#contenido [data-plan]').forEach((b) => {
      const plan = planes.find((p) => p.id === Number(b.dataset.plan));
      b.addEventListener('click', () => abrirSuscripcion(plan));
    });
  }

  function abrirSuscripcion(plan) {
    H.limpiarError($('#errorModal'));
    $('#tituloModal').textContent = `Suscribirse a ${plan.nombre}`;
    $('#subModal').textContent = 'La suscripción se renueva sola salvo que la canceles.';

    $('#cuerpoModal').innerHTML = `
      <form id="formSuscripcion">
        <input type="hidden" name="planId" value="${plan.id}">
        <label class="campo">
          <span>Periodicidad</span>
          <select name="periodicidad">
            <option value="mensual">Mensual — ${escapar(H.moneda(plan.precio_mensual))}</option>
            ${plan.precio_anual ? `<option value="anual">Anual — ${escapar(H.moneda(plan.precio_anual))}</option>` : ''}
          </select>
        </label>
        <label class="campo-check">
          <input type="checkbox" name="renovacionAutomatica" checked> Renovar automáticamente
        </label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Suscribirme</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formSuscripcion', ruta: '/fidelizacion/suscripciones', cajaError: '#errorModal',
      ok: 'Suscripción creada.',
      alTerminar: async () => { H.cerrarModal('modal'); await mostrar('plan'); },
    });

    H.abrirModal('modal');
  }

  async function vistaPuntos() {
    const [cuenta, recompensas] = await Promise.all([
      H.api.get('/fidelizacion/puntos'),
      H.api.get('/fidelizacion/recompensas'),
    ]);

    const c = cuenta.cuenta || {};

    $('#metricas').innerHTML = M.metricas([
      { texto: 'Puntos disponibles', valor: c.puntos ?? 0, icono: 'icon-heart' },
      { texto: 'Acumulados', valor: c.puntos_historicos ?? 0, icono: 'icon-grafica' },
      { texto: 'Nivel', valor: c.nivel_nombre || '—', icono: 'icon-shield' },
    ]);

    $('#contenido').innerHTML = `
      <h4 class="titulo-modulo">Recompensas</h4>
      <div class="opciones">
        ${(recompensas.recompensas || []).map((r) => {
          const alcanza = Number(c.puntos || 0) >= Number(r.puntos);
          return `<article class="opcion">
            <h4>${escapar(r.nombre)}</h4>
            <p class="campo-ayuda">${escapar(r.descripcion || '')}</p>
            <p><strong>${escapar(r.puntos)} puntos</strong></p>
            ${alcanza
              ? `<button type="button" class="btn btn-primary btn-sm" data-canjear="${r.id}">Canjear</button>`
              : `<span class="campo-ayuda">Te faltan ${escapar(Number(r.puntos) - Number(c.puntos || 0))} puntos</span>`}
          </article>`;
        }).join('') || H.bloqueVacio('No hay recompensas disponibles.', 'icon-heart')}
      </div>

      <h4 class="titulo-modulo" style="margin-top:22px">Movimientos</h4>
      ${M.tabla(cuenta.movimientos || [], [
        { titulo: 'Fecha', valor: (m) => M.cuando(m.fecha) },
        { titulo: 'Motivo', campo: 'motivo' },
        { titulo: 'Tipo', valor: (m) => M.estado(m.tipo) },
        {
          titulo: 'Puntos',
          valor: (m) => (Number(m.puntos) > 0
            ? `<span class="chip chip-exito">+${escapar(m.puntos)}</span>`
            : `<span class="chip chip-aviso">${escapar(m.puntos)}</span>`),
        },
      ], { vacio: 'Todavía no tienes movimientos de puntos.', icono: 'icon-grafica' })}`;

    H.$$('#contenido [data-canjear]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!(await H.confirmar('¿Canjear esta recompensa?'))) return;

        try {
          const datos = await H.api.post(`/fidelizacion/recompensas/${b.dataset.canjear}/canjear`, {});
          H.toast(`Canje realizado. Código: ${datos.canje?.codigo || '—'}`);
          await mostrar('puntos');
        } catch (error) {
          H.toast(error.message, 'error');
        }
      });
    });
  }
})();
