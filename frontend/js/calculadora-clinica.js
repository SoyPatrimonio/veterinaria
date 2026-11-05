/* ============================================================
   Huellitas — calculadora clínica

   Tres cálculos que en consulta se hacen a mano, con prisa y con
   el paciente en la mesa:
   - Dosis por peso: mg totales, mL del frasco y tabletas.
   - Infusión continua (CRI): mL/h del fármaco, o cuánto añadir a la
     bolsa de fluidos.
   - Goteo: gotas por minuto para un ritmo en mL/h.

   No trae ninguna base de fármacos ni dosis sugeridas, a propósito:
   cada número lo escribe el veterinario y la calculadora solo hace
   la aritmética. Una dosis precargada que quede mal es un error que
   nadie revisa; una multiplicación, no.

   Las fórmulas son funciones puras (H.calculadora.calcular) y tienen
   pruebas en backend/test/calculadora-clinica.test.js.
   Requiere api.js y panel.js.
   ============================================================ */

(function (global) {
  'use strict';

  const H = global.Huella;

  /* --------------------------------------------------------
     Fórmulas
     -------------------------------------------------------- */

  /** Redondea a `decimales` sin arrastrar el 0.1 + 0.2 de la coma flotante. */
  function redondear(valor, decimales = 2) {
    const factor = 10 ** decimales;
    return Math.round((valor + Number.EPSILON) * factor) / factor;
  }

  /** Número positivo o error con el nombre del campo. */
  function positivo(valor, campo) {
    const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : Number(valor);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Escribe ${campo} (un número mayor que cero).`);
    return n;
  }

  /** Igual, pero el campo puede quedar vacío. */
  function opcional(valor, campo) {
    if (valor === undefined || valor === null || String(valor).trim() === '') return null;
    return positivo(valor, campo);
  }

  /**
   * Dosis por peso.
   * mg = kg × mg/kg; mL = mg ÷ (mg/mL); tabletas = mg ÷ (mg/tableta).
   * Las tabletas se redondean al cuarto, que es lo que se puede partir.
   */
  function dosis({ pesoKg, dosisMgKg, concentracionMgMl, mgPorTableta }) {
    const peso = positivo(pesoKg, 'el peso');
    const porKg = positivo(dosisMgKg, 'la dosis (mg/kg)');
    const conc = opcional(concentracionMgMl, 'la concentración (mg/mL)');
    const tableta = opcional(mgPorTableta, 'los mg por tableta');

    const mg = peso * porKg;
    const resultado = { mg: redondear(mg, 3) };
    if (conc) resultado.ml = redondear(mg / conc, 3);
    if (tableta) {
      resultado.tabletas = redondear(mg / tableta, 3);
      resultado.tabletasPartidas = Math.round((mg / tableta) * 4) / 4;
    }
    resultado.avisos = avisosDePeso(peso);
    if (resultado.ml !== undefined && resultado.ml < 0.05) {
      resultado.avisos.push('El volumen es muy pequeño para medirlo con precisión: considera diluir.');
    }
    if (resultado.tabletas !== undefined && Math.abs(resultado.tabletas - resultado.tabletasPartidas) > 0.05) {
      resultado.avisos.push('La dosis no cae justo en un cuarto de tableta: el redondeo la cambia.');
    }
    return resultado;
  }

  /**
   * Infusión continua.
   *
   * mg/h = dosis × kg (pasando µg/kg/min a mg/kg/h: × 60 ÷ 1000).
   * Sin bolsa: mL/h del fármaco puro = (mg/h) ÷ (mg/mL).
   * Con bolsa: mg a añadir = (mg/h ÷ ritmo de fluidos) × volumen de la bolsa,
   * y mL de fármaco = esos mg ÷ concentración.
   */
  function infusion({ pesoKg, dosis: valorDosis, unidad, concentracionMgMl, ritmoFluidosMlH, volumenBolsaMl }) {
    const peso = positivo(pesoKg, 'el peso');
    const d = positivo(valorDosis, 'la dosis');
    const conc = positivo(concentracionMgMl, 'la concentración (mg/mL)');
    if (unidad !== 'ug/kg/min' && unidad !== 'mg/kg/h') throw new Error('Elige la unidad de la dosis.');
    const ritmo = opcional(ritmoFluidosMlH, 'el ritmo de fluidos (mL/h)');
    const bolsa = opcional(volumenBolsaMl, 'el volumen de la bolsa (mL)');
    if ((ritmo && !bolsa) || (!ritmo && bolsa)) {
      throw new Error('Para calcular la bolsa hacen falta el ritmo de fluidos y el volumen de la bolsa.');
    }

    const mgKgH = unidad === 'ug/kg/min' ? (d * 60) / 1000 : d;
    const mgH = mgKgH * peso;
    const resultado = {
      mgKgH: redondear(mgKgH, 4),
      mgH: redondear(mgH, 3),
      mlH: redondear(mgH / conc, 3),
      avisos: avisosDePeso(peso),
    };
    if (ritmo && bolsa) {
      const mgEnBolsa = (mgH / ritmo) * bolsa;
      resultado.mgEnBolsa = redondear(mgEnBolsa, 2);
      resultado.mlFarmacoEnBolsa = redondear(mgEnBolsa / conc, 2);
      resultado.horasBolsa = redondear(bolsa / ritmo, 1);
      if (mgEnBolsa / conc > bolsa * 0.1) {
        resultado.avisos.push('El fármaco ocupa más del 10 % de la bolsa: retira ese volumen de fluido antes de añadirlo.');
      }
    }
    return resultado;
  }

  /**
   * Goteo.
   * gotas/min = mL/h × factor (gotas/mL) ÷ 60. El ritmo puede venir dado o
   * salir de un volumen total en cierto número de horas.
   */
  function goteo({ mlH, volumenMl, horas, factorGotasMl }) {
    const factor = positivo(factorGotasMl, 'el factor de goteo (gotas/mL)');
    let ritmo = opcional(mlH, 'el ritmo (mL/h)');
    if (!ritmo) {
      ritmo = positivo(volumenMl, 'el volumen total (mL)') / positivo(horas, 'las horas');
    }
    const gotasMin = (ritmo * factor) / 60;
    return {
      mlH: redondear(ritmo, 2),
      gotasMin: redondear(gotasMin, 1),
      segundosPorGota: redondear(60 / gotasMin, 1),
      avisos: gotasMin > 120
        ? ['Más de 2 gotas por segundo no se pueden contar: usa una bomba de infusión o un equipo de menos gotas/mL.']
        : [],
    };
  }

  function avisosDePeso(peso) {
    if (peso > 100) return ['Revisa el peso: más de 100 kg. ¿Está en kilos y no en libras o gramos?'];
    if (peso < 0.05) return ['Revisa el peso: menos de 50 g. ¿Está en kilos?'];
    return [];
  }

  const calcular = { dosis, infusion, goteo, redondear };

  /* --------------------------------------------------------
     Interfaz
     -------------------------------------------------------- */
  const ID = 'modalCalculadora';
  const numero = (valor, unidad) => `<strong>${Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 3 })}</strong> ${unidad}`;

  const campo = (nombre, etiqueta, extra = '') => `
    <label class="campo">
      <span>${etiqueta}</span>
      <input type="text" inputmode="decimal" name="${nombre}" autocomplete="off" ${extra}>
    </label>`;

  function construir() {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.id = ID;
    fondo.setAttribute('aria-hidden', 'true');
    fondo.innerHTML = `
      <div class="modal-caja calculadora" role="dialog" aria-modal="true" aria-labelledby="calcTitulo">
        <button type="button" class="modal-cerrar" data-cerrar aria-label="Cerrar">✕</button>
        <h3 id="calcTitulo">Calculadora clínica</h3>
        <p class="modal-sub">Solo hace la aritmética con los valores que escribas. Verifica siempre
           la dosis con la literatura y tu criterio clínico.</p>

        <div class="pestanas" role="tablist">
          <button type="button" class="activa" data-calc="dosis" role="tab" aria-selected="true">Dosis por peso</button>
          <button type="button" data-calc="infusion" role="tab" aria-selected="false">Infusión continua</button>
          <button type="button" data-calc="goteo" role="tab" aria-selected="false">Goteo</button>
        </div>

        <form data-calc-panel="dosis" novalidate>
          <div class="campos-fila">
            ${campo('pesoKg', 'Peso (kg) *')}
            ${campo('dosisMgKg', 'Dosis (mg/kg) *')}
          </div>
          <div class="campos-fila">
            ${campo('concentracionMgMl', 'Concentración (mg/mL)', 'placeholder="Si es líquido"')}
            ${campo('mgPorTableta', 'mg por tableta', 'placeholder="Si es oral sólido"')}
          </div>
        </form>

        <form data-calc-panel="infusion" novalidate hidden>
          <div class="campos-fila">
            ${campo('pesoKg', 'Peso (kg) *')}
            <label class="campo">
              <span>Dosis *</span>
              <span class="calc-dosis-unidad">
                <input type="text" inputmode="decimal" name="dosis" autocomplete="off">
                <select name="unidad" aria-label="Unidad de la dosis">
                  <option value="ug/kg/min">µg/kg/min</option>
                  <option value="mg/kg/h">mg/kg/h</option>
                </select>
              </span>
            </label>
          </div>
          ${campo('concentracionMgMl', 'Concentración del fármaco (mg/mL) *')}
          <div class="campos-fila">
            ${campo('ritmoFluidosMlH', 'Ritmo de fluidos (mL/h)', 'placeholder="Para diluir en bolsa"')}
            ${campo('volumenBolsaMl', 'Volumen de la bolsa (mL)', 'placeholder="Ej. 500"')}
          </div>
        </form>

        <form data-calc-panel="goteo" novalidate hidden>
          ${campo('mlH', 'Ritmo (mL/h)', 'placeholder="O usa volumen y horas"')}
          <div class="campos-fila">
            ${campo('volumenMl', 'Volumen total (mL)')}
            ${campo('horas', 'En cuántas horas')}
          </div>
          <label class="campo">
            <span>Equipo de goteo *</span>
            <select name="factorGotasMl">
              <option value="10">Macrogoteo 10 gotas/mL</option>
              <option value="15">Macrogoteo 15 gotas/mL</option>
              <option value="20" selected>Macrogoteo 20 gotas/mL</option>
              <option value="60">Microgoteo 60 gotas/mL</option>
            </select>
          </label>
        </form>

        <div class="calc-resultado" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(fondo);
    H.prepararModal(ID);

    const resultado = fondo.querySelector('.calc-resultado');
    let activa = 'dosis';

    const pintores = {
      dosis: (r) => [
        `Total: ${numero(r.mg, 'mg')}`,
        r.ml !== undefined && `Volumen: ${numero(r.ml, 'mL')}`,
        r.tabletas !== undefined && `Tabletas: ${numero(r.tabletas, '')} → <strong>${fraccion(r.tabletasPartidas)}</strong> partiendo en cuartos`,
      ],
      infusion: (r) => [
        `Fármaco: ${numero(r.mgH, 'mg/h')} (${numero(r.mgKgH, 'mg/kg/h')})`,
        `Sin diluir: ${numero(r.mlH, 'mL/h')} del frasco`,
        r.mgEnBolsa !== undefined &&
          `En la bolsa: añade ${numero(r.mlFarmacoEnBolsa, 'mL')} (${numero(r.mgEnBolsa, 'mg')}); dura ${numero(r.horasBolsa, 'h')}`,
      ],
      goteo: (r) => [
        `Ritmo: ${numero(r.mlH, 'mL/h')}`,
        `Goteo: ${numero(r.gotasMin, 'gotas/min')}`,
        `Una gota cada ${numero(r.segundosPorGota, 's')}`,
      ],
    };

    function recalcular() {
      const form = fondo.querySelector(`[data-calc-panel="${activa}"]`);
      const datos = Object.fromEntries(new FormData(form).entries());
      // Sin nada escrito todavía no se regaña a nadie.
      if (!Object.entries(datos).some(([k, v]) => v && !['unidad', 'factorGotasMl'].includes(k))) {
        resultado.innerHTML = '';
        return;
      }
      try {
        const r = calcular[activa](datos);
        const lineas = pintores[activa](r).filter(Boolean);
        resultado.innerHTML = `
          <ul class="calc-lineas">${lineas.map((l) => `<li>${l}</li>`).join('')}</ul>
          ${r.avisos.map((a) => `<p class="calc-aviso">${H.escapar(a)}</p>`).join('')}`;
      } catch (error) {
        resultado.innerHTML = `<p class="calc-falta">${H.escapar(error.message)}</p>`;
      }
    }

    fondo.addEventListener('input', recalcular);
    fondo.addEventListener('change', recalcular);
    fondo.querySelectorAll('form').forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));
    fondo.querySelectorAll('[data-calc]').forEach((boton) => {
      boton.addEventListener('click', () => {
        activa = boton.dataset.calc;
        fondo.querySelectorAll('[data-calc]').forEach((b) => {
          b.classList.toggle('activa', b === boton);
          b.setAttribute('aria-selected', String(b === boton));
        });
        fondo.querySelectorAll('[data-calc-panel]').forEach((p) => { p.hidden = p.dataset.calcPanel !== activa; });
        recalcular();
      });
    });

    return { fondo, recalcular };
  }

  function fraccion(valor) {
    const entero = Math.floor(valor);
    const resto = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' }[Math.round((valor - entero) * 100) / 100];
    if (!entero && resto) return `${resto} tableta`;
    return `${entero}${resto ? ` ${resto}` : ''} ${entero === 1 && !resto ? 'tableta' : 'tabletas'}`;
  }

  let ui = null;

  /** Abre la calculadora; `peso` (kg) rellena el peso en las tres pestañas. */
  function abrir({ peso } = {}) {
    if (!ui) ui = construir();
    if (peso) {
      ui.fondo.querySelectorAll('[name="pesoKg"]').forEach((i) => { i.value = String(peso).replace('.', ','); });
    }
    H.abrirModal(ID);
    ui.recalcular();
  }

  H.calculadora = { abrir, calcular, fraccion };
})(window);
