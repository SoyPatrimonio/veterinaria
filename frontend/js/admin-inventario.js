/* ============================================================
   Administración — inventario, compras y proveedores
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const ETIQUETA_MOVIMIENTO = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' };

  // Lo mismo que acepta el servidor. Comprobarlo también aquí evita subir tres
  // megas para que los devuelvan con un error.
  const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_FOTO = 3 * 1024 * 1024;

  let catalogos = { categorias: [], proveedores: [], ubicaciones: [] };
  let productos = [];
  let proveedores = [];
  let temporizador = null;

  // Qué hacer con la imagen al guardar: subir la elegida, quitar la que ya
  // tiene, o nada. Va aparte del formulario porque la foto viaja en su propia
  // petición, y porque un producto nuevo no tiene id hasta que se crea.
  let foto = { archivo: null, quitar: false };

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin', 'veterinario'], ['inventario.ver']);
    if (!usuario) return;

    ['modalProducto', 'modalMovimiento', 'modalCompra', 'modalProveedor', 'modalDetalleProducto']
      .forEach(H.prepararModal);

    $('#pestanas').addEventListener('click', cambiarPestana);
    $('#btnNuevoProducto').addEventListener('click', () => abrirProducto(null));
    $('#btnNuevaCompra').addEventListener('click', abrirCompra);
    $('#btnNuevoProveedor').addEventListener('click', () => abrirProveedor(null));
    $('#btnAgregarLineaCompra').addEventListener('click', () => agregarLineaCompra());
    $('#formProducto').addEventListener('submit', guardarProducto);
    $('#archivoProducto').addEventListener('change', elegirFoto);
    $('#btnQuitarFoto').addEventListener('click', quitarFoto);
    $('#formMovimiento').addEventListener('submit', guardarMovimiento);
    $('#formCompra').addEventListener('submit', guardarCompra);
    $('#formProveedor').addEventListener('submit', guardarProveedor);
    $('#filtroCategoria').addEventListener('change', cargarProductos);
    $('#filtroStockBajo').addEventListener('change', cargarProductos);
    $('#filtroTipoMovimiento').addEventListener('change', cargarMovimientos);

    $('#inputBusqueda').addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(cargarProductos, 300);
    });

    // Sin los catálogos se pueden ver los productos pero no crear ni mover
    // nada, así que el fallo se avisa en vez de dejar los desplegables vacíos
    // sin explicación.
    try {
      catalogos = await H.api.get('/inventario/catalogos');
      $('#filtroCategoria').innerHTML = `<option value="">Todas las categorías</option>${
        catalogos.categorias.map((c) => `<option value="${c.id}">${escapar(c.nombre)}</option>`).join('')}`;
    } catch (error) {
      console.error('[inventario] no se pudieron cargar los catálogos:', error);
      H.toast('No se pudieron cargar las categorías y ubicaciones.', 'error');
    }

    await Promise.all([cargarProductos(), cargarAlertas()]);
  });

  /* --------------------------------------------------------
     Productos
     -------------------------------------------------------- */

  async function cargarProductos() {
    $('#listaProductos').innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/inventario/productos', {
        busqueda: $('#inputBusqueda').value.trim() || undefined,
        categoriaId: $('#filtroCategoria').value || undefined,
        soloStockBajo: $('#filtroStockBajo').checked ? 1 : undefined,
        limite: 200,
      });
      productos = datos.productos;
    } catch (error) {
      $('#listaProductos').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    pintarProductos();
  }

  function pintarProductos() {
    const caja = $('#listaProductos');

    if (!productos.length) {
      caja.innerHTML = H.bloqueVacio('No hay productos con ese criterio.', 'icon-caja');
      return;
    }

    caja.innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr>
            <th>Producto</th><th>Categoría</th><th>Existencia</th>
            <th>Precio venta</th><th>Vencimiento</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${productos.map((p) => `
            <tr>
              <td>
                <div class="con-foto">
                  ${cuadroFoto(p.imagen, true)}
                  <div>
                    <strong>${escapar(p.nombre)}</strong>
                    ${p.sku ? `<br><span class="campo-ayuda">${escapar(p.sku)}</span>` : ''}
                  </div>
                </div>
              </td>
              <td>${escapar(p.categoria)}</td>
              <td>
                <strong>${escapar(p.cantidad)}</strong> ${escapar(p.unidad)}
                ${p.stock_bajo ? '<br><span class="chip chip-aviso">Mínimo ' + escapar(p.stock_minimo) + '</span>' : ''}
              </td>
              <td>${escapar(H.moneda(p.precio_venta))}</td>
              <td>${p.proximo_vencimiento ? escapar(H.fechaLarga(p.proximo_vencimiento)) : '—'}</td>
              <td class="acciones">
                <button type="button" class="btn btn-outline btn-sm" data-detalle="${p.id}">Ver</button>
                <button type="button" class="btn btn-outline btn-sm" data-mover="${p.id}">Mover</button>
                <button type="button" class="btn btn-outline btn-sm" data-editar="${p.id}">Editar</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    conectar(caja, 'detalle', verProducto);
    conectar(caja, 'mover', abrirMovimiento);
    conectar(caja, 'editar', abrirProducto);
  }

  function conectar(raiz, atributo, accion) {
    H.$$(`[data-${atributo}]`, raiz).forEach((btn) => {
      btn.addEventListener('click', () => accion(Number(btn.dataset[atributo])));
    });
  }

  async function verProducto(id) {
    $('#detalleProducto').innerHTML = H.cargando();
    H.abrirModal('modalDetalleProducto');

    try {
      const datos = await H.api.get(`/inventario/productos/${id}`);
      const p = datos.producto;

      $('#detalleProducto').innerHTML = `
        <div class="con-foto">
          ${cuadroFoto(p.imagen, false)}
          <div>
            <h3>${escapar(p.nombre)}</h3>
            <p class="modal-sub">${escapar(p.categoria)}${p.proveedor ? ` · ${escapar(p.proveedor)}` : ''}</p>
          </div>
        </div>

        <div class="constantes">
          <div class="constante"><span>Existencia</span><strong>${escapar(p.cantidad)}</strong></div>
          <div class="constante"><span>Mínimo</span><strong>${escapar(p.stock_minimo)}</strong></div>
          <div class="constante"><span>Compra</span><strong>${escapar(H.moneda(p.precio_compra))}</strong></div>
          <div class="constante"><span>Venta</span><strong>${escapar(H.moneda(p.precio_venta))}</strong></div>
        </div>

        <h4 style="font-family:var(--font-body);font-size:.9rem;margin:20px 0 10px">Dónde está</h4>
        ${datos.existencias.length
          ? `<div class="tabla-envoltura">
              <table class="tabla">
                <thead><tr><th>Ubicación</th><th>Sede</th><th>Lote</th><th>Cantidad</th></tr></thead>
                <tbody>
                  ${datos.existencias.map((e) => `
                    <tr>
                      <td>${escapar(e.ubicacion)}</td>
                      <td>${escapar(e.sede || '—')}</td>
                      <td>${escapar(e.lote || '—')}${e.fecha_vencimiento ? `<br><span class="campo-ayuda">vence ${escapar(H.fechaLarga(e.fecha_vencimiento))}</span>` : ''}</td>
                      <td><strong>${escapar(e.cantidad)}</strong></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>`
          : H.bloqueVacio('Este producto no tiene existencias repartidas por ubicación.', 'icon-caja')}

        <h4 style="font-family:var(--font-body);font-size:.9rem;margin:20px 0 10px">Últimos movimientos</h4>
        ${tablaMovimientos(datos.movimientos)}`;
    } catch (error) {
      $('#detalleProducto').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function abrirProducto(id) {
    const form = $('#formProducto');
    H.limpiarError($('#errorProducto'));
    form.reset();

    $('#selectCategoria').innerHTML = catalogos.categorias
      .map((c) => `<option value="${c.id}">${escapar(c.nombre)}</option>`).join('');
    $('#selectProveedor').innerHTML = `<option value="">Sin proveedor</option>${
      catalogos.proveedores.map((p) => `<option value="${p.id}">${escapar(p.nombre)}</option>`).join('')}`;

    if (id) {
      const p = productos.find((x) => x.id === id);
      $('#tituloProducto').textContent = `Editar ${p.nombre}`;
      form.id.value = p.id;
      form.nombre.value = p.nombre;
      form.categoriaId.value = p.categoria_id;
      form.proveedorId.value = p.proveedor_id || '';
      form.sku.value = p.sku || '';
      form.unidad.value = p.unidad;
      form.stockMinimo.value = p.stock_minimo;
      form.precioCompra.value = p.precio_compra;
      form.precioVenta.value = p.precio_venta;
      form.activo.value = p.activo ? '1' : '0';
      form.descripcion.value = p.descripcion || '';
      form.requiereLote.checked = Boolean(p.requiere_lote);
    } else {
      $('#tituloProducto').textContent = 'Nuevo producto';
      form.id.value = '';
      form.unidad.value = 'unidad';
    }

    // form.reset() ya vació el selector de archivo; falta olvidar lo que se
    // hubiera elegido la vez anterior y volver a pintar la foto guardada.
    foto = { archivo: null, quitar: false };
    pintarPrevia(fotoGuardada());

    H.abrirModal('modalProducto');
  }

  async function guardarProducto(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorProducto');
    H.limpiarError(caja);

    const cuerpo = {
      nombre: form.nombre.value.trim(),
      categoriaId: Number(form.categoriaId.value),
      proveedorId: form.proveedorId.value ? Number(form.proveedorId.value) : null,
      sku: form.sku.value.trim() || null,
      unidad: form.unidad.value.trim() || 'unidad',
      stockMinimo: Number(form.stockMinimo.value || 0),
      precioCompra: Number(form.precioCompra.value || 0),
      precioVenta: Number(form.precioVenta.value || 0),
      requiereLote: form.requiereLote.checked,
      activo: form.activo.value === '1',
      descripcion: form.descripcion.value.trim() || null,
    };

    if (!cuerpo.nombre) return H.mostrarError(caja, new Error('Escribe el nombre del producto.'));

    const editando = Boolean(form.id.value);

    await H.conBoton($('#btnGuardarProducto'), 'Guardando…', async () => {
      try {
        let id = Number(form.id.value);
        if (editando) {
          await H.api.put(`/inventario/productos/${id}`, cuerpo);
        } else {
          // La foto necesita el id, y un producto nuevo no lo tiene hasta que
          // el servidor lo crea; por eso se guarda primero y se sube después.
          const creado = await H.api.post('/inventario/productos', cuerpo);
          id = creado.producto.id;
        }

        const falloFoto = await guardarFotoDe(id);
        if (falloFoto) H.toast(falloFoto, 'error');
        else H.toast(editando ? 'Producto actualizado.' : 'Producto creado.');

        H.cerrarModal('modalProducto');
        await Promise.all([cargarProductos(), cargarAlertas()]);
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Foto del producto

     La imagen no cabe en el JSON del formulario: va como multipart y en su
     propia petición. Así que aquí solo se recuerda qué habría que hacer con
     ella —subir la elegida o quitar la que hay— y se ejecuta al guardar,
     cuando ya se sabe el id del producto.
     -------------------------------------------------------- */

  /** El cuadro de la foto: el mismo en el listado, en la ficha y en el formulario. */
  function cuadroFoto(url, mini) {
    const clases = `foto-cuadro${mini ? ' mini' : ''}`;
    return url
      ? `<div class="${clases}"><img src="${escapar(url)}" alt=""></div>`
      : `<div class="${clases}"><svg class="icon"><use href="#icon-caja"/></svg></div>`;
  }

  /** La foto que el producto que se está editando ya tiene guardada. */
  function fotoGuardada() {
    const id = Number($('#formProducto').id.value);
    const producto = id ? productos.find((p) => p.id === id) : null;
    return producto ? producto.imagen : null;
  }

  function pintarPrevia(url) {
    const caja = $('#previaProducto');

    // La vista previa de un archivo recién elegido es una data: URL de varios
    // megas. Se asigna por propiedad y no dentro de una plantilla para no
    // recorrerla entera escapándola carácter a carácter.
    if (url) {
      caja.innerHTML = '';
      const img = document.createElement('img');
      img.alt = '';
      img.src = url;
      caja.appendChild(img);
    } else {
      caja.innerHTML = '<svg class="icon"><use href="#icon-caja"/></svg>';
    }

    $('#btnQuitarFoto').hidden = !url;
  }

  function elegirFoto(evento) {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    const error = !TIPOS_FOTO.includes(archivo.type)
      ? 'La foto tiene que ser JPG, PNG o WebP.'
      : archivo.size > MAX_FOTO ? 'La foto no puede pasar de 3 MB.' : null;

    if (error) {
      evento.target.value = '';
      return H.mostrarError($('#errorProducto'), new Error(error));
    }

    H.limpiarError($('#errorProducto'));
    foto = { archivo, quitar: false };

    // Se lee como data: URL en vez de con URL.createObjectURL() porque la
    // política de contenido de estas páginas no admite blob: en las imágenes.
    const lector = new FileReader();
    lector.onload = () => pintarPrevia(lector.result);
    lector.onerror = () => H.mostrarError($('#errorProducto'), new Error('No se pudo leer esa imagen.'));
    lector.readAsDataURL(archivo);
  }

  function quitarFoto() {
    $('#archivoProducto').value = '';

    // Si lo que se ve es una foto recién elegida, quitarla es descartar esa
    // elección y volver a la que el producto ya tenía; no borrar nada.
    if (foto.archivo) {
      foto = { archivo: null, quitar: false };
      pintarPrevia(fotoGuardada());
      return;
    }

    foto = { archivo: null, quitar: true };
    pintarPrevia(null);
  }

  /**
   * Sube o quita la foto del producto que se acaba de guardar.
   *
   * Devuelve null si fue bien y el aviso que hay que dar si falló. No lanza a
   * propósito: los datos ya quedaron guardados, y presentar el fallo como un
   * error del formulario haría pensar que se perdió el producto entero.
   */
  async function guardarFotoDe(id) {
    try {
      if (foto.archivo) {
        const cuerpo = new FormData();
        cuerpo.append('foto', foto.archivo);
        await H.api.post(`/inventario/productos/${id}/foto`, cuerpo);
      } else if (foto.quitar) {
        await H.api.del(`/inventario/productos/${id}/foto`);
      }
      return null;
    } catch (error) {
      return `Los datos se guardaron, pero la foto no: ${error.message}`;
    }
  }

  /* --------------------------------------------------------
     Movimientos
     -------------------------------------------------------- */

  function abrirMovimiento(productoId) {
    const producto = productos.find((p) => p.id === productoId);
    const form = $('#formMovimiento');
    H.limpiarError($('#errorMovimiento'));
    form.reset();

    form.productoId.value = producto.id;
    $('#tituloMovimiento').textContent = `Mover stock de ${producto.nombre}`;
    $('#subtituloMovimiento').textContent =
      `Ahora hay ${producto.cantidad} ${producto.unidad}(s). En un ajuste, la cantidad es el total que queda.`;

    $('#selectUbicacion').innerHTML = `<option value="">Sin ubicación concreta</option>${
      catalogos.ubicaciones.map((u) => `
        <option value="${u.id}">${escapar(u.nombre)}${u.sede ? ` — ${escapar(u.sede)}` : ''}</option>`).join('')}`;

    H.abrirModal('modalMovimiento');
  }

  async function guardarMovimiento(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorMovimiento');
    H.limpiarError(caja);

    const cuerpo = {
      productoId: Number(form.productoId.value),
      tipo: form.tipo.value,
      cantidad: Number(form.cantidad.value),
      ubicacionId: form.ubicacionId.value ? Number(form.ubicacionId.value) : null,
      motivo: form.motivo.value.trim() || null,
    };

    await H.conBoton($('#btnGuardarMovimiento'), 'Registrando…', async () => {
      try {
        await H.api.post('/inventario/movimientos', cuerpo);
        H.toast('Movimiento registrado.');
        H.cerrarModal('modalMovimiento');
        await Promise.all([cargarProductos(), cargarAlertas(), cargarMovimientos()]);
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  async function cargarMovimientos() {
    const caja = $('#listaMovimientos');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/inventario/movimientos', {
        tipo: $('#filtroTipoMovimiento').value || undefined,
        limite: 150,
      });
      caja.innerHTML = tablaMovimientos(datos.movimientos);
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function tablaMovimientos(movimientos) {
    if (!movimientos.length) return H.bloqueVacio('Sin movimientos registrados.', 'icon-carpeta');

    return `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th><th>Quién</th></tr>
        </thead>
        <tbody>
          ${movimientos.map((m) => `
            <tr>
              <td>${escapar(H.fechaLarga(m.creado_en))}<br><span class="campo-ayuda">${escapar(H.hora12(m.creado_en))}</span></td>
              <td>${escapar(m.producto)}</td>
              <td>
                <span class="chip ${m.tipo === 'entrada' ? 'chip-exito' : m.tipo === 'salida' ? 'chip-aviso' : 'chip-info'}">
                  ${escapar(ETIQUETA_MOVIMIENTO[m.tipo] || m.tipo)}
                </span>
              </td>
              <td><strong>${escapar(m.cantidad)}</strong> ${escapar(m.unidad)}</td>
              <td>${escapar(m.motivo || '—')}${m.referencia ? `<br><span class="campo-ayuda">${escapar(m.referencia)}</span>` : ''}</td>
              <td>${escapar(m.usuario || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  /* --------------------------------------------------------
     Alertas y métricas
     -------------------------------------------------------- */

  async function cargarAlertas() {
    try {
      const datos = await H.api.get('/inventario/alertas', { dias: 60 });
      pintarMetricas(datos.contadores);

      $('#listaStockBajo').innerHTML = datos.stockBajo.length
        ? `<div class="tabla-envoltura">
            <table class="tabla">
              <thead><tr><th>Producto</th><th>Categoría</th><th>Quedan</th><th>Mínimo</th></tr></thead>
              <tbody>
                ${datos.stockBajo.map((p) => `
                  <tr>
                    <td><strong>${escapar(p.nombre)}</strong></td>
                    <td>${escapar(p.categoria)}</td>
                    <td><span class="chip ${p.cantidad === 0 ? 'chip-error' : 'chip-aviso'}">
                      ${escapar(p.cantidad)} ${escapar(p.unidad)}</span></td>
                    <td>${escapar(p.stock_minimo)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        : H.bloqueVacio('Ningún producto está por debajo del mínimo.', 'icon-check');

      $('#listaPorVencer').innerHTML = datos.porVencer.length
        ? `<div class="tabla-envoltura">
            <table class="tabla">
              <thead><tr><th>Producto</th><th>Lote</th><th>Vence</th><th>Cantidad</th></tr></thead>
              <tbody>
                ${datos.porVencer.map((l) => `
                  <tr>
                    <td><strong>${escapar(l.producto)}</strong></td>
                    <td>${escapar(l.codigo)}</td>
                    <td>${escapar(H.fechaLarga(l.fecha_vencimiento))}
                      <br><span class="chip ${l.dias < 0 ? 'chip-error' : 'chip-aviso'}">
                        ${l.dias < 0 ? `vencido hace ${Math.abs(l.dias)} días` : `en ${l.dias} días`}</span>
                    </td>
                    <td>${escapar(l.cantidad)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        : H.bloqueVacio('Ningún lote vence en los próximos dos meses.', 'icon-check');
    } catch (error) {
      $('#metricas').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintarMetricas(contadores) {
    $('#metricas').innerHTML = `<div class="rejilla-metricas">
      <article class="metrica">
        <span class="metrica-icono"><svg class="icon"><use href="#icon-caja"/></svg></span>
        <div><strong>${escapar(contadores.productos)}</strong><span>Productos activos</span></div>
      </article>
      <article class="metrica ${Number(contadores.bajos) ? 'acento' : ''}">
        <span class="metrica-icono"><svg class="icon"><use href="#icon-alerta"/></svg></span>
        <div><strong>${escapar(contadores.bajos)}</strong><span>En mínimos</span></div>
      </article>
      <article class="metrica ${Number(contadores.agotados) ? 'aviso' : ''}">
        <span class="metrica-icono"><svg class="icon"><use href="#icon-cross"/></svg></span>
        <div><strong>${escapar(contadores.agotados)}</strong><span>Agotados</span></div>
      </article>
      <article class="metrica">
        <span class="metrica-icono"><svg class="icon"><use href="#icon-grafica"/></svg></span>
        <div><strong>${escapar(H.moneda(contadores.valor_inventario))}</strong><span>Valor al costo</span></div>
      </article>
    </div>`;
  }

  /* --------------------------------------------------------
     Compras
     -------------------------------------------------------- */

  function abrirCompra() {
    const form = $('#formCompra');
    H.limpiarError($('#errorCompra'));
    form.reset();

    $('#selectProveedorCompra').innerHTML = catalogos.proveedores
      .map((p) => `<option value="${p.id}">${escapar(p.nombre)}</option>`).join('');
    $('#selectUbicacionCompra').innerHTML = `<option value="">Sin ubicación concreta</option>${
      catalogos.ubicaciones.map((u) => `
        <option value="${u.id}">${escapar(u.nombre)}${u.sede ? ` — ${escapar(u.sede)}` : ''}</option>`).join('')}`;

    form.fecha.value = H.fechaHoyISO();
    $('#filasCompra').innerHTML = '';
    agregarLineaCompra();
    recalcularCompra();

    H.abrirModal('modalCompra');
  }

  function agregarLineaCompra() {
    const opciones = productos
      .map((p) => `<option value="${p.id}" data-precio="${p.precio_compra}" data-lote="${p.requiere_lote ? 1 : 0}">
                     ${escapar(p.nombre)}
                   </option>`).join('');

    const fila = document.createElement('div');
    fila.className = 'fila-editable';
    fila.dataset.linea = '1';
    fila.innerHTML = `
      <div>
        <label class="campo">
          <span>Producto *</span>
          <select data-campo="productoId"><option value="">Elige uno</option>${opciones}</select>
        </label>
        <div class="campos-fila">
          <label class="campo">
            <span>Cantidad *</span>
            <input type="number" data-campo="cantidad" min="1" step="1" value="1">
          </label>
          <label class="campo">
            <span>Precio unitario</span>
            <input type="number" data-campo="precioUnit" min="0" step="100" value="0">
          </label>
        </div>
        <div class="campos-fila" data-campos-lote hidden>
          <label class="campo">
            <span>Lote</span>
            <input type="text" data-campo="lote" maxlength="60">
          </label>
          <label class="campo">
            <span>Vencimiento</span>
            <input type="date" data-campo="fechaVencimiento">
          </label>
        </div>
      </div>
      <button type="button" class="btn btn-peligro btn-sm" data-quitar>Quitar</button>`;

    const select = fila.querySelector('[data-campo="productoId"]');
    select.addEventListener('change', () => {
      const opcion = select.options[select.selectedIndex];
      fila.querySelector('[data-campo="precioUnit"]').value = opcion.dataset.precio || 0;
      // Los campos de lote solo aparecen si el producto los exige: pedirlos
      // siempre llenaría la base de lotes inventados.
      fila.querySelector('[data-campos-lote]').hidden = opcion.dataset.lote !== '1';
      recalcularCompra();
    });

    fila.querySelectorAll('input').forEach((campo) => campo.addEventListener('input', recalcularCompra));
    fila.querySelector('[data-quitar]').addEventListener('click', () => {
      fila.remove();
      recalcularCompra();
    });

    $('#filasCompra').appendChild(fila);
  }

  function leerLineasCompra() {
    return H.$$('[data-linea]', $('#filasCompra')).map((fila) => {
      const valor = (campo) => fila.querySelector(`[data-campo="${campo}"]`).value.trim();
      return {
        productoId: valor('productoId') ? Number(valor('productoId')) : null,
        cantidad: Number(valor('cantidad') || 0),
        precioUnit: Number(valor('precioUnit') || 0),
        lote: valor('lote') || null,
        fechaVencimiento: valor('fechaVencimiento') || null,
      };
    }).filter((l) => l.productoId && l.cantidad > 0);
  }

  function recalcularCompra() {
    const lineas = leerLineasCompra();
    const subtotal = lineas.reduce((suma, l) => suma + l.cantidad * l.precioUnit, 0);
    const impuestos = Number($('#formCompra').impuestos.value || 0);

    $('#totalesCompra').innerHTML = `
      <div><span>Subtotal</span><span>${escapar(H.moneda(subtotal))}</span></div>
      <div><span>Impuestos</span><span>${escapar(H.moneda(impuestos))}</span></div>
      <div><span>Total</span><span>${escapar(H.moneda(subtotal + impuestos))}</span></div>`;
  }

  async function guardarCompra(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorCompra');
    H.limpiarError(caja);

    const lineas = leerLineasCompra();
    if (!lineas.length) return H.mostrarError(caja, new Error('Añade al menos un producto a la compra.'));

    const cuerpo = {
      proveedorId: Number(form.proveedorId.value),
      fecha: form.fecha.value || undefined,
      ubicacionId: form.ubicacionId.value ? Number(form.ubicacionId.value) : null,
      impuestos: Number(form.impuestos.value || 0),
      notas: form.notas.value.trim() || null,
      lineas,
    };

    await H.conBoton($('#btnGuardarCompra'), 'Registrando…', async () => {
      try {
        await H.api.post('/inventario/compras', cuerpo);
        H.toast('Compra registrada: el stock ya está actualizado.');
        H.cerrarModal('modalCompra');
        await Promise.all([cargarProductos(), cargarAlertas(), cargarCompras(), cargarMovimientos()]);
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  async function cargarCompras() {
    const caja = $('#listaCompras');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/inventario/compras', { limite: 50 });

      caja.innerHTML = datos.compras.length
        ? `<div class="tabla-envoltura">
            <table class="tabla">
              <thead><tr><th>Número</th><th>Fecha</th><th>Proveedor</th><th>Líneas</th><th>Total</th><th>Estado</th></tr></thead>
              <tbody>
                ${datos.compras.map((c) => `
                  <tr>
                    <td><strong>${escapar(c.numero)}</strong></td>
                    <td>${escapar(H.fechaLarga(c.fecha))}</td>
                    <td>${escapar(c.proveedor)}</td>
                    <td>${escapar(c.lineas)}</td>
                    <td>${escapar(H.moneda(c.total))}</td>
                    <td><span class="insignia insignia-${c.estado === 'recibida' ? 'atendida' : 'pendiente'}">
                      ${escapar(c.estado)}</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        : H.bloqueVacio('Todavía no hay compras registradas.', 'icon-caja');
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  /* --------------------------------------------------------
     Proveedores
     -------------------------------------------------------- */

  async function cargarProveedores() {
    const caja = $('#listaProveedores');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/inventario/proveedores', { todos: 1 });
      proveedores = datos.proveedores;

      caja.innerHTML = proveedores.length
        ? `<div class="tabla-envoltura">
            <table class="tabla">
              <thead><tr><th>Proveedor</th><th>NIT</th><th>Contacto</th><th>Teléfono</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                ${proveedores.map((p) => `
                  <tr>
                    <td><strong>${escapar(p.nombre)}</strong></td>
                    <td>${escapar(p.nit || '—')}</td>
                    <td>${escapar(p.contacto || '—')}${p.email ? `<br><span class="campo-ayuda">${escapar(p.email)}</span>` : ''}</td>
                    <td>${escapar(p.telefono || '—')}</td>
                    <td><span class="insignia insignia-${p.activo ? 'activo' : 'inactivo'}">
                      ${p.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td class="acciones">
                      <button type="button" class="btn btn-outline btn-sm" data-proveedor="${p.id}">Editar</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        : H.bloqueVacio('Todavía no hay proveedores registrados.', 'icon-users');

      conectar(caja, 'proveedor', abrirProveedor);
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function abrirProveedor(id) {
    const form = $('#formProveedor');
    H.limpiarError($('#errorProveedor'));
    form.reset();

    if (id) {
      const p = proveedores.find((x) => x.id === id);
      $('#tituloProveedor').textContent = `Editar ${p.nombre}`;
      form.id.value = p.id;
      form.nombre.value = p.nombre;
      form.nit.value = p.nit || '';
      form.contacto.value = p.contacto || '';
      form.telefono.value = p.telefono || '';
      form.email.value = p.email || '';
      form.direccion.value = p.direccion || '';
    } else {
      $('#tituloProveedor').textContent = 'Nuevo proveedor';
      form.id.value = '';
    }

    H.abrirModal('modalProveedor');
  }

  async function guardarProveedor(evento) {
    evento.preventDefault();
    const form = evento.target;
    const caja = $('#errorProveedor');
    H.limpiarError(caja);

    const cuerpo = {
      nombre: form.nombre.value.trim(),
      nit: form.nit.value.trim() || null,
      contacto: form.contacto.value.trim() || null,
      telefono: form.telefono.value.trim() || null,
      email: form.email.value.trim() || null,
      direccion: form.direccion.value.trim() || null,
    };

    if (!cuerpo.nombre) return H.mostrarError(caja, new Error('Escribe el nombre del proveedor.'));

    await H.conBoton($('#btnGuardarProveedor'), 'Guardando…', async () => {
      try {
        if (form.id.value) {
          await H.api.put(`/inventario/proveedores/${form.id.value}`, cuerpo);
          H.toast('Proveedor actualizado.');
        } else {
          await H.api.post('/inventario/proveedores', cuerpo);
          H.toast('Proveedor creado.');
        }
        H.cerrarModal('modalProveedor');

        // La lista de los desplegables sale de los catálogos, así que se
        // vuelven a pedir para que el proveedor nuevo aparezca al comprar.
        catalogos = await H.api.get('/inventario/catalogos');
        await cargarProveedores();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Pestañas
     -------------------------------------------------------- */

  const YA_CARGADA = new Set(['productos', 'alertas']);

  function cambiarPestana(evento) {
    const boton = evento.target.closest('[data-pestana]');
    if (!boton) return;

    const destino = boton.dataset.pestana;
    H.$$('#pestanas button').forEach((b) => b.classList.toggle('activa', b === boton));

    ['productos', 'alertas', 'movimientos', 'compras', 'proveedores'].forEach((nombre) => {
      const seccion = document.getElementById(`panel${nombre[0].toUpperCase()}${nombre.slice(1)}`);
      seccion.hidden = nombre !== destino;
    });

    // Cada pestaña pide sus datos la primera vez que se abre: cargarlo todo al
    // entrar serían cinco consultas para ver una sola tabla.
    if (YA_CARGADA.has(destino)) return;
    YA_CARGADA.add(destino);

    if (destino === 'movimientos') cargarMovimientos();
    if (destino === 'compras') cargarCompras();
    if (destino === 'proveedores') cargarProveedores();
  }
})();
