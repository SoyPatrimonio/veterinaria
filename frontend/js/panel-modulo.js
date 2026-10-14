/* ============================================================
   Utilidades para los módulos de administración

   Las páginas de personal, equipos, bioseguridad, caja, tienda,
   fidelización, comunidad, PQRS e integraciones son todas la misma
   forma: pestañas, una tabla y un formulario. Esto es lo repetido,
   sacado a un sitio. No es un framework: son cuatro funciones que
   siguen devolviendo HTML plano, igual que el resto del panel.

   Requiere api.js y panel.js cargados antes.
   ============================================================ */

(function (global) {
  'use strict';

  const H = global.Huella;
  const { $, escapar } = H;

  /**
   * Pinta una tabla a partir de una lista de columnas.
   *
   * Cada columna es { titulo, campo } o { titulo, valor: fila => html }.
   * `valor` recibe la fila y devuelve HTML ya escapado por quien lo escribe;
   * `campo` lee la propiedad y la escapa aquí, que es el caso normal.
   */
  function tabla(filas, columnas, ajustes = {}) {
    if (!filas.length) {
      return H.bloqueVacio(ajustes.vacio || 'No hay registros.', ajustes.icono || 'icon-carpeta');
    }

    const cabecera = columnas.map((c) => `<th>${escapar(c.titulo || '')}</th>`).join('');

    const cuerpo = filas.map((fila) => {
      const celdas = columnas.map((c) => {
        const contenido = c.valor ? c.valor(fila) : escapar(fila[c.campo] ?? '—');
        return `<td${c.clase ? ` class="${c.clase}"` : ''}>${contenido}</td>`;
      }).join('');

      return `<tr>${celdas}</tr>`;
    }).join('');

    return `<div class="tabla-envoltura">
      <table class="tabla"><thead><tr>${cabecera}</tr></thead><tbody>${cuerpo}</tbody></table>
    </div>`;
  }

  /** Insignia de estado con el color que ya define panel.css. */
  function estado(valor, etiquetas = {}) {
    if (!valor) return '—';
    return `<span class="insignia insignia-${escapar(valor)}">${escapar(etiquetas[valor] || String(valor).replace(/_/g, ' '))}</span>`;
  }

  /** Fecha + hora en una celda, o solo fecha si no trae hora. */
  function cuando(valor, conHora = false) {
    if (!valor) return '—';
    return conHora
      ? `${escapar(H.fechaLarga(valor))} ${escapar(H.hora12(valor))}`
      : escapar(H.fechaLarga(valor));
  }

  /**
   * Lee un formulario respetando los tipos.
   *
   * Los checkbox salen como booleano y los number como número; el resto como
   * texto recortado. Los campos vacíos NO se incluyen: mandar '' donde zod
   * espera un número opcional lo hace fallar con un mensaje confuso.
   */
  function leerFormulario(form) {
    const cuerpo = {};

    Array.from(form.elements).forEach((campo) => {
      if (!campo.name || campo.disabled) return;

      if (campo.type === 'checkbox') {
        cuerpo[campo.name] = campo.checked;
        return;
      }
      if (campo.type === 'radio') {
        if (campo.checked) cuerpo[campo.name] = campo.value;
        return;
      }

      const texto = String(campo.value).trim();
      if (texto === '') return;
      cuerpo[campo.name] = campo.type === 'number' ? Number(texto) : texto;
    });

    return cuerpo;
  }

  /**
   * Conecta un formulario a un endpoint.
   *
   * `alTerminar` se llama solo si el envío salió bien; el error se pinta en la
   * caja indicada y NO se recarga nada, para que quien escribió no pierda lo
   * que llevaba.
   */
  function conectarFormulario({ form, ruta, metodo = 'post', cajaError, ok, alTerminar, antesDeEnviar }) {
    const elemento = typeof form === 'string' ? $(form) : form;
    if (!elemento) return;

    elemento.addEventListener('submit', async (e) => {
      e.preventDefault();

      const caja = typeof cajaError === 'string' ? $(cajaError) : cajaError;
      H.limpiarError(caja);

      let cuerpo = leerFormulario(elemento);
      if (antesDeEnviar) {
        cuerpo = antesDeEnviar(cuerpo, elemento);
        if (cuerpo === false) return;
      }

      const boton = elemento.querySelector('button[type="submit"]');
      await H.conBoton(boton, 'Guardando…', async () => {
        try {
          // La respuesta se le pasa a alTerminar porque lo que se acaba de
          // crear trae su id, y sin él no se puede encadenar nada que lo
          // necesite: subir la foto de la publicación, por ejemplo.
          const respuesta = await H.api[metodo](ruta, cuerpo);
          H.toast(ok || 'Guardado.');
          if (alTerminar) await alTerminar(respuesta);
        } catch (error) {
          if (caja) H.mostrarError(caja, error);
          else H.toast(error.message, 'error');
        }
      });
    });
  }

  /**
   * Pestañas de un módulo.
   *
   * `vistas` es { nombre: funcionAsincrona }. La función pinta dentro del
   * contenedor y puede fallar: si lo hace, se muestra el error en vez de
   * dejar la pantalla en "Cargando…" para siempre.
   */
  function pestanas({ contenedorPestanas, contenedor, vistas, inicial }) {
    const barra = typeof contenedorPestanas === 'string' ? $(contenedorPestanas) : contenedorPestanas;
    const caja = typeof contenedor === 'string' ? $(contenedor) : contenedor;

    /**
     * La pestaña que pide la dirección, o null.
     *
     * El submenú del menú lateral enlaza pestañas concretas
     * (`admin/comunidad.html#adopciones`), así que la de arranque puede venir
     * en el '#'. Se comprueba contra las vistas declaradas: un '#' escrito a
     * mano o heredado de otra página no puede dejar la pantalla en blanco.
     */
    function deLaDireccion() {
      const nombre = decodeURIComponent(location.hash.replace(/^#/, ''));
      return Object.prototype.hasOwnProperty.call(vistas, nombre) ? nombre : null;
    }

    async function mostrar(nombre) {
      const destino = vistas[nombre] ? nombre : inicial;

      H.$$('button', barra).forEach((b) => b.classList.toggle('activa', b.dataset.pestana === destino));

      // Se deja el '#' al día para que recargar o compartir la dirección
      // vuelva a la misma pestaña. Con replaceState y no tocando
      // location.hash: cambiar de pestaña no es navegar, y llenaría el
      // historial de pasos que el botón «atrás» tendría que deshacer uno a
      // uno. replaceState tampoco dispara hashchange, así que no se muerde la
      // cola con la escucha de abajo.
      if (location.hash.replace(/^#/, '') !== destino) {
        history.replaceState(null, '', `#${destino}`);
      }

      // El menú lateral resalta la pestaña abierta dentro de su submenú, y no
      // tiene otra forma de enterarse de un cambio hecho desde la página.
      document.dispatchEvent(new CustomEvent('panel:pestana', { detail: destino }));

      caja.innerHTML = H.cargando();

      try {
        await vistas[destino]();
      } catch (error) {
        H.pintarErrorEnCaja(caja, error);
      }
    }

    barra.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-pestana]');
      if (boton) mostrar(boton.dataset.pestana);
    });

    // Pulsar un enlace del submenú estando ya en la página no recarga nada:
    // solo cambia el '#', y esto es lo que lo convierte en un cambio de vista.
    window.addEventListener('hashchange', () => {
      const destino = deLaDireccion();
      if (destino) mostrar(destino);
    });

    mostrar(deLaDireccion() || inicial);
    return mostrar;
  }

  /** Opciones de un <select> a partir de una lista. */
  function opciones(lista, { valor = 'id', texto = 'nombre', vacio = null, seleccionado = null } = {}) {
    const cabeza = vacio ? `<option value="">${escapar(vacio)}</option>` : '';

    return cabeza + lista.map((x) => {
      const v = x[valor];
      const marca = seleccionado !== null && String(seleccionado) === String(v) ? ' selected' : '';
      return `<option value="${escapar(v)}"${marca}>${escapar(typeof texto === 'function' ? texto(x) : x[texto])}</option>`;
    }).join('');
  }

  /** Tarjetas de métrica de la cabecera de un módulo. */
  function metricas(lista) {
    return lista.map((m) => `
      <article class="metrica">
        <span class="metrica-icono"><svg class="icon"><use href="#${escapar(m.icono || 'icon-panel')}"/></svg></span>
        <div class="contador-vivo">
          ${escapar(m.valor ?? 0)}${escapar(m.sufijo || '')}
          <small>${escapar(m.texto)}</small>
        </div>
      </article>`).join('');
  }

  H.modulo = { tabla, estado, cuando, leerFormulario, conectarFormulario, pestanas, opciones, metricas };
})(window);
