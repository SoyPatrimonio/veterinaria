/* ============================================================
   Caja por sede

   El cuadre se hace solo contra el EFECTIVO: lo que entró por
   tarjeta o transferencia no está en el cajón, así que exigir que
   coincida con el conteo físico no tendría sentido.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  let cajas = [];
  let aperturaAbierta = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin'], ['caja.operar', 'caja.gestionar']);
    if (!usuario) return;

    H.prepararModal('modal');

    M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'abiertas',
      vistas: { abiertas: vistaCajas, historial: vistaHistorial },
    });
  });

  async function vistaCajas() {
    const datos = await H.api.get('/operaciones/cajas');
    cajas = datos.cajas || [];

    const abiertas = cajas.filter((c) => c.apertura_id);
    $('#metricas').innerHTML = M.metricas([
      { texto: 'Cajas', valor: cajas.length, icono: 'icon-recibo' },
      { texto: 'Abiertas ahora', valor: abiertas.length, icono: 'icon-clock' },
    ]);

    $('#contenido').innerHTML = M.tabla(cajas, [
      { titulo: 'Caja', valor: (c) => `<strong>${escapar(c.nombre)}</strong>` },
      { titulo: 'Sede', campo: 'sede_nombre' },
      {
        titulo: 'Estado',
        valor: (c) => (c.apertura_id
          ? `<span class="insignia insignia-abierta">abierta</span>`
          : `<span class="insignia insignia-cerrado">cerrada</span>`),
      },
      { titulo: 'Abrió', valor: (c) => escapar(c.abierta_por_nombre || '—') },
      { titulo: 'Desde', valor: (c) => M.cuando(c.apertura, true) },
      {
        titulo: '',
        valor: (c) => (c.apertura_id
          ? `<button type="button" class="btn btn-primary btn-sm" data-abrir="${c.apertura_id}">Ver turno</button>`
          : `<button type="button" class="btn btn-outline btn-sm" data-nueva="${c.id}">Abrir caja</button>`),
      },
    ], { vacio: 'No hay cajas registradas.', icono: 'icon-recibo' });

    H.$$('#contenido [data-nueva]').forEach((b) => {
      b.addEventListener('click', () => abrirApertura(Number(b.dataset.nueva)));
    });
    H.$$('#contenido [data-abrir]').forEach((b) => {
      b.addEventListener('click', () => verTurno(Number(b.dataset.abrir)));
    });
  }

  function abrirApertura(cajaId) {
    const caja = cajas.find((c) => c.id === cajaId);

    $('#tituloModal').textContent = `Abrir ${caja.nombre}`;
    $('#subModal').textContent = 'La base inicial queda como primer movimiento del turno.';
    H.limpiarError($('#errorModal'));

    $('#cuerpoModal').innerHTML = `
      <form id="formApertura">
        <input type="hidden" name="cajaId" value="${cajaId}">
        <label class="campo">
          <span>Base inicial</span>
          <input type="number" name="baseInicial" min="0" step="100" value="0">
        </label>
        <label class="campo">
          <span>Observaciones</span>
          <input type="text" name="observaciones" maxlength="255">
        </label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Abrir caja</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formApertura',
      ruta: '/operaciones/cajas/apertura',
      cajaError: '#errorModal',
      ok: 'Caja abierta.',
      alTerminar: async () => {
        H.cerrarModal('modal');
        await vistaCajas();
      },
    });

    H.abrirModal('modal');
  }

  async function verTurno(aperturaId) {
    H.limpiarError($('#errorModal'));
    $('#cuerpoModal').innerHTML = H.cargando();
    H.abrirModal('modal');

    try {
      aperturaAbierta = await H.api.get(`/operaciones/cajas/apertura/${aperturaId}`);
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    pintarTurno();
  }

  function pintarTurno() {
    const a = aperturaAbierta.apertura;
    const movimientos = aperturaAbierta.movimientos || [];
    const esperado = Number(aperturaAbierta.esperado || 0);

    $('#tituloModal').textContent = `${a.caja} — turno abierto`;
    $('#subModal').textContent =
      `Abrió ${a.abierta_por_nombre} el ${H.fechaLarga(a.apertura)} a las ${H.hora12(a.apertura)}`;

    $('#cuerpoModal').innerHTML = `
      <div class="rejilla-metricas" style="margin-bottom:18px">
        ${M.metricas([
          { texto: 'Base inicial', valor: H.moneda(a.base_inicial), icono: 'icon-recibo' },
          { texto: 'Efectivo esperado', valor: H.moneda(esperado), icono: 'icon-caja' },
          { texto: 'Movimientos', valor: movimientos.length, icono: 'icon-grafica' },
        ])}
      </div>

      ${M.tabla(movimientos, [
        { titulo: 'Hora', valor: (m) => escapar(H.hora12(m.fecha)) },
        { titulo: 'Tipo', valor: (m) => M.estado(m.tipo) },
        { titulo: 'Concepto', campo: 'concepto' },
        { titulo: 'Método', campo: 'metodo' },
        { titulo: 'Valor', valor: (m) => escapar(H.moneda(m.valor)) },
      ], { vacio: 'Sin movimientos todavía.', icono: 'icon-recibo' })}

      <h4 class="titulo-modulo" style="margin-top:22px">Registrar movimiento</h4>
      <form id="formMovimiento">
        <div class="campos-fila-3">
          <label class="campo">
            <span>Tipo *</span>
            <select name="tipo" required>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
          </label>
          <label class="campo">
            <span>Método</span>
            <select name="metodo">
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="en_linea">En línea</option>
            </select>
          </label>
          <label class="campo">
            <span>Valor *</span>
            <input type="number" name="valor" min="1" step="100" required>
          </label>
        </div>
        <label class="campo">
          <span>Concepto *</span>
          <input type="text" name="concepto" required maxlength="180" placeholder="Compra de insumos, pago a domiciliario…">
        </label>
        <div class="modal-acciones"><button type="submit" class="btn btn-outline">Registrar movimiento</button></div>
      </form>

      <h4 class="titulo-modulo" style="margin-top:22px">Cerrar turno</h4>
      <form id="formCierre">
        <label class="campo">
          <span>Efectivo contado *</span>
          <input type="number" name="totalContado" min="0" step="50" required>
          <small class="campo-ayuda">
            Se compara solo con el efectivo (${escapar(H.moneda(esperado))}); lo cobrado
            con tarjeta o transferencia no está en el cajón.
          </small>
        </label>
        <label class="campo">
          <span>Observaciones</span>
          <input type="text" name="observaciones" maxlength="255">
        </label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Cerrar y cuadrar</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formMovimiento',
      ruta: `/operaciones/cajas/apertura/${a.id}/movimientos`,
      cajaError: '#errorModal',
      ok: 'Movimiento registrado.',
      alTerminar: () => verTurno(a.id),
    });

    M.conectarFormulario({
      form: '#formCierre',
      ruta: `/operaciones/cajas/apertura/${a.id}/cierre`,
      cajaError: '#errorModal',
      ok: 'Turno cerrado.',
      alTerminar: async () => {
        H.cerrarModal('modal');
        await vistaCajas();
      },
    });
  }

  async function vistaHistorial() {
    const datos = await H.api.get('/operaciones/cajas/historial');
    const aperturas = datos.aperturas || [];

    $('#contenido').innerHTML = M.tabla(aperturas, [
      { titulo: 'Caja', campo: 'caja' },
      { titulo: 'Sede', campo: 'sede_nombre' },
      { titulo: 'Abrió', valor: (a) => `${escapar(a.abierta_por_nombre)}<br><span class="campo-ayuda">${M.cuando(a.apertura, true)}</span>` },
      { titulo: 'Cerró', valor: (a) => (a.cierre ? `${escapar(a.cerrada_por_nombre || '—')}<br><span class="campo-ayuda">${M.cuando(a.cierre, true)}</span>` : '—') },
      { titulo: 'Esperado', valor: (a) => escapar(H.moneda(a.total_esperado || 0)) },
      { titulo: 'Contado', valor: (a) => escapar(H.moneda(a.total_contado || 0)) },
      {
        titulo: 'Diferencia',
        valor: (a) => {
          const dif = Number(a.diferencia || 0);
          if (a.estado !== 'cerrada') return '—';
          // Sobrar también es un descuadre: significa que algo no se registró.
          return dif === 0
            ? '<span class="chip chip-exito">cuadra</span>'
            : `<span class="texto-alerta">${escapar(H.moneda(dif))}</span>`;
        },
      },
    ], { vacio: 'No hay turnos cerrados todavía.', icono: 'icon-recibo' });
  }
})();
