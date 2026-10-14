/* ============================================================
   Tienda del portal — catálogo y carrito

   Los medicamentos exigen fórmula: si el carrito lleva alguno, el
   pedido no se puede confirmar sin adjuntarla. La tienda no es un
   mostrador de venta libre de antibióticos.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  let mostrar = null;
  let carrito = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente'], ['tienda.comprar']);
    if (!usuario) return;

    H.prepararModal('modal');

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'catalogo',
      vistas: { catalogo: vistaCatalogo, carrito: vistaCarrito },
    });
  });

  async function vistaCatalogo() {
    const [datos, cats] = await Promise.all([
      H.api.get('/tienda/articulos'),
      H.api.get('/tienda/categorias'),
    ]);

    const articulos = datos.articulos || [];
    const categorias = cats.categorias || [];

    if (!articulos.length) {
      $('#contenido').innerHTML = H.bloqueVacio('Todavía no hay productos publicados.', 'icon-caja');
      return;
    }

    const porCategoria = categorias.map((c) => ({
      categoria: c,
      items: articulos.filter((a) => a.categoria_id === c.id),
    })).filter((g) => g.items.length);

    $('#contenido').innerHTML = porCategoria.map((g) => `
      <h4 class="titulo-modulo">${escapar(g.categoria.nombre)}</h4>
      <div class="rejilla-mascotas" style="margin-bottom:22px">
        ${g.items.map((a) => `
          <article class="mascota">
            ${a.imagen ? `<img class="mascota-foto" src="${escapar(H.rutaImagen(a.imagen))}" alt="${escapar(a.nombre)}" loading="lazy">` : ''}
            <div class="mascota-cuerpo">
              <h4>${escapar(a.nombre)}</h4>
              <p class="campo-ayuda">${escapar(String(a.descripcion || '').slice(0, 90))}</p>
              <p><strong>${escapar(H.moneda(a.precio ?? a.precio_venta))}</strong></p>
              ${a.requiere_receta ? '<span class="chip chip-aviso">necesita fórmula</span>' : ''}
              ${Number(a.existencias ?? a.cantidad ?? 0) > 0
                ? `<button type="button" class="btn btn-primary btn-sm" data-agregar="${a.id}">Añadir</button>`
                : '<span class="chip chip-error">agotado</span>'}
            </div>
          </article>`).join('')}
      </div>`).join('');

    H.$$('#contenido [data-agregar]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await H.api.post('/tienda/carrito', { articuloId: Number(b.dataset.agregar), cantidad: 1 });
          H.toast('Añadido al carrito.');
        } catch (error) {
          H.toast(error.message, 'error');
        }
      });
    });
  }

  async function vistaCarrito() {
    const datos = await H.api.get('/tienda/carrito');
    carrito = datos.carrito || {};
    const items = carrito.items || [];

    if (!items.length) {
      $('#contenido').innerHTML = H.bloqueVacio('Tu carrito está vacío.', 'icon-caja');
      return;
    }

    const exigeReceta = items.some((i) => i.requiere_receta);

    $('#contenido').innerHTML = `
      ${M.tabla(items, [
        { titulo: 'Artículo', valor: (i) => `${escapar(i.nombre)}${i.requiere_receta ? ' <span class="chip chip-aviso">fórmula</span>' : ''}` },
        { titulo: 'Cantidad', campo: 'cantidad' },
        { titulo: 'Precio', valor: (i) => escapar(H.moneda(i.precio_unit)) },
        { titulo: 'Total', valor: (i) => escapar(H.moneda(Number(i.precio_unit) * Number(i.cantidad))) },
        { titulo: '', valor: (i) => `<button type="button" class="btn btn-peligro btn-sm" data-quitar="${i.articulo_id || i.id}">Quitar</button>` },
      ], { vacio: '', icono: 'icon-caja' })}

      <dl class="constantes" style="margin-top:16px">
        <div class="constante"><dt>Subtotal</dt><dd>${escapar(H.moneda(carrito.subtotal || 0))}</dd></div>
        ${carrito.descuento ? `<div class="constante"><dt>Descuento</dt><dd>-${escapar(H.moneda(carrito.descuento))}</dd></div>` : ''}
        <div class="constante"><dt>Total</dt><dd><strong>${escapar(H.moneda(carrito.total || carrito.subtotal || 0))}</strong></dd></div>
      </dl>

      <form id="formCupon" class="fila-editable" style="margin-top:14px">
        <label class="campo"><span>Cupón</span><input type="text" name="codigo" maxlength="30" placeholder="CODIGO"></label>
        <button type="submit" class="btn btn-outline">Aplicar</button>
      </form>

      <h4 class="titulo-modulo" style="margin-top:22px">Finalizar pedido</h4>
      <form id="formPedido">
        <div class="campos-fila">
          <label class="campo">
            <span>Entrega</span>
            <select name="entrega" id="selectorEntrega">
              <option value="domicilio">A domicilio</option>
              <option value="recoger">Recoger en la sede</option>
            </select>
          </label>
          <label class="campo"><span>Teléfono</span><input type="text" name="telefono" maxlength="30"></label>
        </div>

        <label class="campo">
          <span>Cómo lo pagas</span>
          <select name="metodoPago">
            <option value="efectivo">Efectivo al recibir o al recoger</option>
            <option value="transferencia">Transferencia o Nequi</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="en_linea">Pago en línea</option>
          </select>
          <small class="campo-ayuda">
            El pedido queda con el pago pendiente hasta que la clínica lo registre.
          </small>
        </label>

        <div id="camposDomicilio">
          <label class="campo"><span>Dirección *</span><input type="text" name="direccion" maxlength="180"></label>
          <div class="campos-fila">
            <label class="campo"><span>Barrio</span><input type="text" name="barrio" maxlength="80"></label>
            <label class="campo"><span>Ciudad</span><input type="text" name="ciudad" maxlength="80"></label>
          </div>
          <label class="campo"><span>Indicaciones</span><input type="text" name="indicaciones" maxlength="255" placeholder="Torre, apartamento, punto de referencia…"></label>
        </div>

        ${exigeReceta ? `
          <label class="campo">
            <span>Fórmula médica (URL) *</span>
            <input type="url" name="recetaUrl" maxlength="255" required>
            <small class="campo-ayuda">
              Tu pedido lleva medicamentos: sin la fórmula del veterinario no podemos despacharlo.
            </small>
          </label>` : ''}

        <label class="campo"><span>Notas</span><input type="text" name="notas" maxlength="255"></label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Confirmar pedido</button></div>
      </form>`;

    // Los campos de dirección solo tienen sentido si el pedido es a domicilio.
    const selector = $('#selectorEntrega');
    const alternar = () => { $('#camposDomicilio').hidden = selector.value !== 'domicilio'; };
    selector.addEventListener('change', alternar);
    alternar();

    // Quitar una línea es dejarla en cero: DELETE /tienda/carrito vacía el
    // carrito entero y no acepta un artículo detrás, así que la ruta con :id
    // no existía y el botón devolvía un 404.
    H.$$('#contenido [data-quitar]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await H.api.patch(`/tienda/carrito/${b.dataset.quitar}`, { cantidad: 0 });
          await mostrar('carrito');
        } catch (error) { H.toast(error.message, 'error'); }
      });
    });

    M.conectarFormulario({
      form: '#formCupon', ruta: '/tienda/carrito/cupon', cajaError: '#error',
      ok: 'Cupón aplicado.', alTerminar: () => mostrar('carrito'),
    });

    M.conectarFormulario({
      form: '#formPedido', ruta: '/tienda/pedidos', cajaError: '#error',
      ok: 'Pedido confirmado.',
      antesDeEnviar: (cuerpo) => {
        if (cuerpo.entrega === 'domicilio' && !cuerpo.direccion) {
          H.mostrarError($('#error'), new Error('Para un envío a domicilio hace falta la dirección.'));
          return false;
        }
        return cuerpo;
      },
      alTerminar: () => { location.href = H.ruta('cliente/pedidos.html'); },
    });
  }
})();
