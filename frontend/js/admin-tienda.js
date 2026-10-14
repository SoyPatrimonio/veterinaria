/* ============================================================
   Tienda — pedidos, domicilios, catálogo y cupones

   El artículo apunta al producto del inventario: vender por la web
   descuenta del mismo stock que vender en el mostrador.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  let mostrar = null;
  let categorias = [];

  // Cómo dijo el cliente que iba a pagar. No es lo mismo que estado_pago: esto
  // es con qué, aquello es si ya entró el dinero.
  const METODO_PAGO = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta: 'Tarjeta',
    en_linea: 'En línea',
  };

  const comoPaga = (p) => METODO_PAGO[p.metodo_pago] || 'Efectivo';

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin'], ['tienda.gestionar', 'pedidos.ver_todos', 'pedidos.gestionar']);
    if (!usuario) return;

    H.prepararModal('modal');
    $('#btnPrincipal').addEventListener('click', abrirArticulo);

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'pedidos',
      vistas: {
        pedidos: vistaPedidos,
        domicilios: vistaDomicilios,
        articulos: vistaArticulos,
        cupones: vistaCupones,
      },
    });
  });

  async function vistaPedidos() {
    const datos = await H.api.get('/tienda/pedidos', { limite: 100 });

    $('#contenido').innerHTML = M.tabla(datos.pedidos || [], [
      { titulo: 'Pedido', valor: (p) => `<strong>${escapar(p.numero)}</strong><br><span class="campo-ayuda">${M.cuando(p.creado_en, true)}</span>` },
      { titulo: 'Cliente', valor: (p) => escapar(p.cliente_nombre || '—') },
      { titulo: 'Entrega', valor: (p) => escapar(p.entrega === 'domicilio' ? 'Domicilio' : 'Recoge en sede') },
      { titulo: 'Total', valor: (p) => escapar(H.moneda(p.total)) },
      { titulo: 'Pago', valor: (p) => `${M.estado(p.estado_pago)}<br><span class="campo-ayuda">${escapar(comoPaga(p))}</span>` },
      { titulo: 'Estado', valor: (p) => M.estado(p.estado) },
      { titulo: '', valor: (p) => `<button type="button" class="btn btn-outline btn-sm" data-pedido="${p.id}">Abrir</button>` },
    ], { vacio: 'No hay pedidos.', icono: 'icon-caja' });

    H.$$('#contenido [data-pedido]').forEach((b) => {
      b.addEventListener('click', () => abrirPedido(Number(b.dataset.pedido)));
    });
  }

  async function abrirPedido(id) {
    H.limpiarError($('#errorModal'));
    $('#cuerpoModal').innerHTML = H.cargando();
    H.abrirModal('modal');

    let datos;
    try {
      datos = await H.api.get(`/tienda/pedidos/${id}`);
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    const p = datos.pedido;
    $('#tituloModal').textContent = `${p.numero} — ${p.cliente_nombre || ''}`;
    $('#subModal').innerHTML =
      `${M.estado(p.estado)} · ${escapar(comoPaga(p))} ${M.estado(p.estado_pago)} · ${escapar(H.moneda(p.total))}`;

    $('#cuerpoModal').innerHTML = `
      ${M.tabla(datos.items || [], [
        { titulo: 'Artículo', campo: 'descripcion' },
        { titulo: 'Cantidad', campo: 'cantidad' },
        { titulo: 'Precio', valor: (i) => escapar(H.moneda(i.precio_unit)) },
        { titulo: 'Total', valor: (i) => escapar(H.moneda(i.total_linea)) },
      ], { vacio: 'Pedido sin artículos.', icono: 'icon-caja' })}

      ${p.receta_url ? `<p class="campo-ayuda" style="margin-top:10px">
        Fórmula adjunta: <a href="${escapar(p.receta_url)}" target="_blank" rel="noopener">ver</a>
      </p>` : ''}

      ${H.puede('pedidos.gestionar', 'pagos.registrar') && p.estado_pago !== 'pagado' && p.estado !== 'cancelado' ? `
        <div class="fila-editable" style="margin-top:16px">
          <p class="campo-ayuda" style="margin:0">
            ${p.metodo_pago === 'efectivo'
              ? `Se cobran ${escapar(H.moneda(p.total))} al entregar o al recoger.`
              : `Pendiente de confirmar el pago por ${escapar(comoPaga(p).toLowerCase())}.`}
          </p>
          <button type="button" class="btn btn-primary btn-sm" id="btnPago">Registrar el pago</button>
        </div>` : ''}

      <h4 class="titulo-modulo" style="margin-top:20px">Seguimiento</h4>
      ${M.tabla(datos.historial || [], [
        { titulo: 'Fecha', valor: (h) => M.cuando(h.creado_en, true) },
        { titulo: 'Estado', valor: (h) => M.estado(h.estado) },
        { titulo: 'Nota', valor: (h) => escapar(h.nota || '—') },
      ], { vacio: 'Sin movimientos.', icono: 'icon-clock' })}

      ${H.puede('pedidos.gestionar') && p.estado !== 'entregado' && p.estado !== 'cancelado' ? `
        <h4 class="titulo-modulo" style="margin-top:20px">Cambiar estado</h4>
        <form id="formEstado">
          <div class="campos-fila">
            <label class="campo">
              <span>Estado *</span>
              <select name="estado" required>
                <option value="confirmado">Confirmado</option>
                <option value="preparando">Preparando</option>
                <option value="enviado">Enviado</option>
                <option value="entregado">Entregado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>
            <label class="campo"><span>Nota</span><input type="text" name="nota" maxlength="255"></label>
          </div>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Actualizar</button></div>
        </form>` : ''}`;

    // Recibir el dinero de un pedido en efectivo es lo que lo deja pagado: no
    // lo hace el cliente al pedirlo ni el repartidor al salir.
    const botonPago = $('#btnPago');
    if (botonPago) {
      botonPago.addEventListener('click', async () => {
        H.limpiarError($('#errorModal'));
        await H.conBoton(botonPago, 'Registrando…', async () => {
          try {
            await H.api.post(`/tienda/pedidos/${id}/pago`, {});
            H.toast('Pago registrado.');
            await abrirPedido(id);
            await mostrar('pedidos');
          } catch (error) {
            H.mostrarError($('#errorModal'), error);
          }
        });
      });
    }

    M.conectarFormulario({
      form: '#formEstado', ruta: `/tienda/pedidos/${id}`, metodo: 'patch',
      cajaError: '#errorModal', ok: 'Pedido actualizado.',
      alTerminar: async () => { await abrirPedido(id); await mostrar('pedidos'); },
    });
  }

  async function vistaDomicilios() {
    const datos = await H.api.get('/tienda/pedidos', { entrega: 'domicilio', limite: 100 });
    const enRuta = (datos.pedidos || []).filter((p) => !['entregado', 'cancelado'].includes(p.estado));

    $('#contenido').innerHTML = M.tabla(enRuta, [
      { titulo: 'Pedido', valor: (p) => `<strong>${escapar(p.numero)}</strong>` },
      { titulo: 'Cliente', valor: (p) => escapar(p.cliente_nombre || '—') },
      { titulo: 'Dirección', valor: (p) => escapar(p.direccion || '—') },
      { titulo: 'Repartidor', valor: (p) => escapar(p.repartidor_nombre || '<span class="campo-ayuda">sin asignar</span>') },
      { titulo: 'Estado', valor: (p) => M.estado(p.estado_domicilio || p.estado) },
      { titulo: '', valor: (p) => `<button type="button" class="btn btn-outline btn-sm" data-pedido="${p.id}">Abrir</button>` },
    ], { vacio: 'No hay domicilios en curso.', icono: 'icon-pin' });

    H.$$('#contenido [data-pedido]').forEach((b) => {
      b.addEventListener('click', () => abrirPedido(Number(b.dataset.pedido)));
    });
  }

  async function vistaArticulos() {
    const [datos, cats] = await Promise.all([
      H.api.get('/tienda/articulos', { todos: 1 }),
      H.api.get('/tienda/categorias'),
    ]);
    categorias = cats.categorias || [];

    $('#contenido').innerHTML = M.tabla(datos.articulos || [], [
      { titulo: 'Artículo', valor: (a) => `<strong>${escapar(a.nombre)}</strong><br><span class="campo-ayuda">${escapar(a.categoria || '')}</span>` },
      { titulo: 'Precio', valor: (a) => escapar(H.moneda(a.precio ?? a.precio_venta)) },
      { titulo: 'Existencias', valor: (a) => escapar(a.existencias ?? a.cantidad ?? '—') },
      { titulo: 'Receta', valor: (a) => (a.requiere_receta ? '<span class="chip chip-aviso">exige fórmula</span>' : '—') },
      { titulo: 'Estado', valor: (a) => M.estado(a.activo ? 'activo' : 'inactivo') },
    ], { vacio: 'El catálogo en línea está vacío.', icono: 'icon-caja' });
  }

  async function vistaCupones() {
    const datos = await H.api.get('/tienda/cupones');

    $('#contenido').innerHTML = `
      ${M.tabla(datos.cupones || [], [
        { titulo: 'Código', valor: (c) => `<strong>${escapar(c.codigo)}</strong>` },
        { titulo: 'Tipo', campo: 'tipo' },
        { titulo: 'Valor', valor: (c) => (c.tipo === 'porcentaje' ? `${escapar(c.valor)} %` : escapar(H.moneda(c.valor))) },
        { titulo: 'Mínimo', valor: (c) => escapar(H.moneda(c.minimo_compra)) },
        { titulo: 'Usos', valor: (c) => `${escapar(c.usos)}${c.usos_maximos ? ` / ${escapar(c.usos_maximos)}` : ''}` },
        { titulo: 'Vigencia', valor: (c) => escapar([c.desde, c.hasta].filter(Boolean).map(H.fechaLarga).join(' — ') || 'sin límite') },
        { titulo: 'Estado', valor: (c) => M.estado(c.activo ? 'activo' : 'inactivo') },
      ], { vacio: 'No hay cupones.', icono: 'icon-recibo' })}

      <h4 class="titulo-modulo" style="margin-top:22px">Nuevo cupón</h4>
      <form id="formCupon">
        <div class="campos-fila-3">
          <label class="campo"><span>Código *</span><input type="text" name="codigo" required maxlength="30"></label>
          <label class="campo">
            <span>Tipo</span>
            <select name="tipo"><option value="porcentaje">Porcentaje</option><option value="valor">Valor fijo</option><option value="envio_gratis">Envío gratis</option></select>
          </label>
          <label class="campo"><span>Valor *</span><input type="number" name="valor" required min="0" step="100"></label>
        </div>
        <div class="campos-fila-3">
          <label class="campo"><span>Compra mínima</span><input type="number" name="minimoCompra" min="0" step="1000" value="0"></label>
          <label class="campo"><span>Desde</span><input type="date" name="desde"></label>
          <label class="campo"><span>Hasta</span><input type="date" name="hasta"></label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Crear cupón</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formCupon', ruta: '/tienda/cupones', cajaError: '#error',
      ok: 'Cupón creado.', alTerminar: () => mostrar('cupones'),
    });
  }

  function abrirArticulo() {
    H.limpiarError($('#errorModal'));
    $('#tituloModal').textContent = 'Nuevo artículo';
    $('#subModal').textContent = 'El artículo apunta a un producto del inventario: el stock es el mismo.';

    $('#cuerpoModal').innerHTML = `
      <form id="formArticulo">
        <div class="campos-fila">
          <label class="campo"><span>Producto (id) *</span><input type="number" name="productoId" required min="1"></label>
          <label class="campo">
            <span>Categoría *</span>
            <select name="categoriaId" required>${M.opciones(categorias, { vacio: 'Selecciona' })}</select>
          </label>
        </div>
        <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="140"></label>
        <label class="campo"><span>Descripción</span><textarea name="descripcion" maxlength="4000"></textarea></label>
        <div class="campos-fila">
          <label class="campo"><span>Imagen (URL)</span><input type="url" name="imagen" maxlength="255"></label>
          <label class="campo"><span>Precio (vacío usa el del inventario)</span><input type="number" name="precio" min="0" step="100"></label>
        </div>
        <div class="campos-fila">
          <label class="campo-check"><input type="checkbox" name="requiereReceta"> Exige fórmula médica</label>
          <label class="campo-check"><input type="checkbox" name="destacado"> Destacado</label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Publicar artículo</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formArticulo', ruta: '/tienda/articulos', cajaError: '#errorModal',
      ok: 'Artículo publicado.',
      alTerminar: async () => { H.cerrarModal('modal'); await mostrar('articulos'); },
    });

    H.abrirModal('modal');
  }
})();
