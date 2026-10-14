/* ============================================================
   Gráficas en SVG, sin librerías

   La política de contenido del sitio no deja cargar scripts de
   fuera, y una gráfica de líneas es poco código: se dibuja el SVG
   como texto y se inserta con innerHTML, igual que el resto de las
   listas del panel.
   ============================================================ */

(function (global) {
  'use strict';

  const H = global.Huella;
  const { escapar } = H;

  // Lienzo fijo con viewBox: el SVG se escala solo al ancho de su tarjeta y
  // así no hay que recalcular nada al cambiar el tamaño de la ventana.
  const ANCHO = 640;
  const ALTO = 220;
  const MARGEN = { arriba: 14, derecha: 12, abajo: 26, izquierda: 52 };

  const COLORES = ['#1B5B46', '#F6A723', '#2F6F9E'];

  const areaUtil = {
    ancho: ANCHO - MARGEN.izquierda - MARGEN.derecha,
    alto: ALTO - MARGEN.arriba - MARGEN.abajo,
  };

  /** Redondea el techo de la escala para que las guías caigan en números limpios. */
  function techo(maximo) {
    if (maximo <= 0) return 1;
    const magnitud = 10 ** Math.floor(Math.log10(maximo));
    return Math.ceil(maximo / magnitud) * magnitud;
  }

  function abreviar(valor) {
    const numero = Number(valor) || 0;
    if (Math.abs(numero) >= 1000000) return `${(numero / 1000000).toFixed(1)}M`;
    if (Math.abs(numero) >= 1000) return `${Math.round(numero / 1000)}k`;
    return String(Math.round(numero * 100) / 100);
  }

  /**
   * Gráfica de líneas.
   *
   * `puntos` es [{ etiqueta, valores: [...] }] y `series` describe cada valor.
   * Con un solo punto no se dibuja línea —no hay entre qué dos sitios
   * trazarla—, así que se marca el punto y ya.
   */
  function graficaLineas(puntos, series, opciones = {}) {
    if (!puntos || !puntos.length) {
      return H.bloqueVacio(opciones.vacio || 'Todavía no hay datos para graficar.', 'icon-grafica');
    }

    const valores = puntos.flatMap((p) => p.valores.map((v) => Number(v) || 0));
    const maximo = techo(Math.max(...valores, 0));
    const minimo = opciones.desdeCero === false ? Math.min(...valores, 0) : 0;
    const rango = maximo - minimo || 1;

    const x = (indice) => (puntos.length === 1
      ? MARGEN.izquierda + areaUtil.ancho / 2
      : MARGEN.izquierda + (indice * areaUtil.ancho) / (puntos.length - 1));
    const y = (valor) => MARGEN.arriba + areaUtil.alto - (((Number(valor) || 0) - minimo) / rango) * areaUtil.alto;

    // Cuatro guías horizontales: suficientes para leer el orden de magnitud
    // sin llenar la gráfica de rayas.
    const guias = [0, 0.25, 0.5, 0.75, 1].map((fraccion) => {
      const valor = minimo + rango * fraccion;
      const py = y(valor);
      return `<line x1="${MARGEN.izquierda}" y1="${py}" x2="${ANCHO - MARGEN.derecha}" y2="${py}"
                    stroke="rgba(12,32,26,0.10)" stroke-width="1"/>
              <text x="${MARGEN.izquierda - 8}" y="${py + 4}" text-anchor="end"
                    font-size="10" fill="#6B7C72" font-family="DM Mono, monospace">${abreviar(valor)}</text>`;
    }).join('');

    const trazos = series.map((serie, indiceSerie) => {
      const color = serie.color || COLORES[indiceSerie % COLORES.length];
      const coordenadas = puntos.map((p, i) => `${x(i)},${y(p.valores[indiceSerie])}`);

      const linea = puntos.length === 1
        ? ''
        : `<polyline points="${coordenadas.join(' ')}" fill="none" stroke="${color}"
                     stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;

      // Relleno bajo la primera serie: ayuda a leer el volumen de un vistazo.
      const area = indiceSerie === 0 && puntos.length > 1
        ? `<polygon points="${x(0)},${y(minimo)} ${coordenadas.join(' ')} ${x(puntos.length - 1)},${y(minimo)}"
                    fill="${color}" opacity="0.10"/>`
        : '';

      // Con muchos puntos los círculos se pisan entre sí y ensucian la línea.
      const marcas = puntos.length <= 31
        ? puntos.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.valores[indiceSerie])}" r="3"
                                        fill="#fff" stroke="${color}" stroke-width="2"><title>${escapar(p.etiqueta)}: ${escapar(abreviar(p.valores[indiceSerie]))}</title></circle>`).join('')
        : '';

      return area + linea + marcas;
    }).join('');

    // Las etiquetas del eje se reparten para que no se solapen.
    const paso = Math.max(1, Math.ceil(puntos.length / 8));
    const etiquetas = puntos.map((p, i) => (
      i % paso === 0 || i === puntos.length - 1
        ? `<text x="${x(i)}" y="${ALTO - 8}" text-anchor="middle" font-size="10" fill="#6B7C72"
                 font-family="DM Mono, monospace">${escapar(p.etiqueta)}</text>`
        : ''
    )).join('');

    const leyenda = series.map((serie, i) => `
      <span>
        <i class="grafica-punto" style="background:${serie.color || COLORES[i % COLORES.length]}"></i>
        ${escapar(serie.nombre)}
      </span>`).join('');

    return `<svg class="grafica" viewBox="0 0 ${ANCHO} ${ALTO}" role="img"
                 aria-label="${escapar(opciones.titulo || 'Gráfica')}">
              ${guias}${trazos}${etiquetas}
            </svg>
            <div class="grafica-leyenda">${leyenda}</div>`;
  }

  /**
   * Ranking con barras proporcionales. Se usa para "lo más pedido": una barra
   * comparada con la mayor dice más que una columna de números.
   */
  function ranking(filas, opciones = {}) {
    if (!filas || !filas.length) {
      return H.bloqueVacio(opciones.vacio || 'Sin datos en este periodo.', 'icon-grafica');
    }

    const maximo = Math.max(...filas.map((f) => Number(f.valor) || 0), 1);

    return `<div class="ranking">
      ${filas.map((fila) => `
        <div class="ranking-fila">
          <div class="ranking-texto">
            <strong>${escapar(fila.nombre)}</strong>
            <span>${escapar(fila.texto ?? fila.valor)}</span>
          </div>
          <div class="ranking-barra">
            <i style="width:${Math.max(2, ((Number(fila.valor) || 0) / maximo) * 100)}%"></i>
          </div>
        </div>`).join('')}
    </div>`;
  }

  Object.assign(H, { graficaLineas, ranking });
})(window);
