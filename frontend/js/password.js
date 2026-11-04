/* ============================================================
   Huellitas — guía de contraseñas en el navegador

   Las reglas son copia de backend/src/utils/politicaPassword.js:
   si cambia una allí, se cambia aquí. El servidor es quien decide;
   esto solo enseña, mientras se escribe, qué falta.

   Uso:
     H.password.adjuntar(input, { confirmar, datos, generar })
     H.password.validar(valor, datos)  → mensaje de error o null

   Requiere api.js cargado antes.
   ============================================================ */

(function (global) {
  'use strict';

  const H = global.Huella;

  const LARGO_MINIMO = 8;
  const BYTES_MAXIMOS = 72;

  const REGLAS = [
    { id: 'largo',     texto: `Al menos ${LARGO_MINIMO} caracteres`, cumple: (v) => [...v].length >= LARGO_MINIMO },
    { id: 'minuscula', texto: 'Una letra minúscula',                 cumple: (v) => /\p{Ll}/u.test(v) },
    { id: 'mayuscula', texto: 'Una letra mayúscula',                 cumple: (v) => /\p{Lu}/u.test(v) },
    { id: 'numero',    texto: 'Un número',                           cumple: (v) => /\p{Nd}/u.test(v) },
    { id: 'especial',  texto: 'Un carácter especial (! @ # $ …)', cumple: (v) => /[^\p{L}\p{N}\s]/u.test(v) },
  ];

  const PROHIBIDAS = [
    'huellitas', 'password', 'contrasena', 'qwerty', 'admin', 'veterinaria',
    'mascota', 'perro', 'gato', 'bienvenido', 'clave',
  ];

  const plano = (v) => String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nucleo = (v) => plano(v).replace(/^[^a-z]+/, '').replace(/[^a-z]+$/, '');
  const bytes = (v) => new TextEncoder().encode(v).length;

  function esPredecible(v) {
    const n = nucleo(v);
    return PROHIBIDAS.includes(n) || n.includes('huellitas') || /(.)\1{3,}/u.test(v);
  }

  function contieneDatosPersonales(v, { nombre, email } = {}) {
    const p = plano(v);
    const piezas = [];
    if (email) piezas.push(plano(String(email).split('@')[0]));
    if (nombre) piezas.push(...plano(nombre).split(/[^a-z0-9]+/));
    return piezas.some((pieza) => pieza.length >= 4 && p.includes(pieza));
  }

  /** El mismo orden de comprobaciones que el servidor, con sus mismos mensajes. */
  function validar(valor, datos) {
    const faltan = REGLAS.filter((r) => !r.cumple(valor));
    if (faltan.length) {
      return `A la contraseña le falta: ${faltan.map((r) => r.texto.toLowerCase()).join(', ')}.`;
    }
    if (bytes(valor) > BYTES_MAXIMOS) {
      return 'La contraseña es demasiado larga: usa menos de 72 caracteres.';
    }
    if (esPredecible(valor)) {
      return 'Esa contraseña es demasiado fácil de adivinar. No uses el nombre de la clínica, una palabra común con números detrás ni la misma tecla repetida.';
    }
    if (datos && contieneDatosPersonales(valor, datos)) {
      return 'La contraseña no puede contener tu nombre ni tu correo.';
    }
    return null;
  }

  /**
   * Qué tan difícil es de adivinar, de 0 a 4.
   *
   * No es una medida de entropía de verdad, es una orientación: cumplir las
   * reglas da el nivel "aceptable", y cada tramo de largo por encima suma.
   * Doce caracteres variados valen más que ocho rebuscados.
   */
  function fuerza(valor, datos) {
    if (!valor) return 0;
    const cumplidas = REGLAS.filter((r) => r.cumple(valor)).length;
    if (cumplidas < REGLAS.length || validar(valor, datos)) return cumplidas >= 3 ? 1 : 0;

    const largo = [...valor].length;
    const distintos = new Set(valor).size;
    let nivel = 2;
    if (largo >= 12 && distintos >= 8) nivel = 3;
    if (largo >= 16 && distintos >= 10) nivel = 4;
    return nivel;
  }

  const NIVELES = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];

  /**
   * Una contraseña aleatoria que cumple todas las reglas.
   *
   * Sale de crypto.getRandomValues, no de Math.random. Se dejan fuera los
   * caracteres que se confunden al dictarla o copiarla a mano (0/O, 1/l/I).
   */
  function generar(largo = 16) {
    const grupos = [
      'abcdefghijkmnpqrstuvwxyz',
      'ABCDEFGHJKLMNPQRSTUVWXYZ',
      '23456789',
      '!@#$%&*?-_.+=',
    ];
    const todos = grupos.join('');
    const azar = (n) => {
      const buf = new Uint32Array(1);
      global.crypto.getRandomValues(buf);
      return buf[0] % n;
    };

    let resultado;
    do {
      const chars = grupos.map((g) => g[azar(g.length)]);
      while (chars.length < largo) chars.push(todos[azar(todos.length)]);
      // Fisher–Yates: el primer carácter de cada grupo no queda siempre al principio.
      for (let i = chars.length - 1; i > 0; i--) {
        const j = azar(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      resultado = chars.join('');
    } while (validar(resultado));
    return resultado;
  }

  /* --------------------------------------------------------
     Interfaz
     -------------------------------------------------------- */

  const OJO = '<svg viewBox="0 0 24 24" class="icon icon-linea" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OJO_TACHADO = '<svg viewBox="0 0 24 24" class="icon icon-linea" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  // input → función que lo muestra u oculta, para que el generador pueda
  // enseñar la contraseña que acaba de poner sin duplicar el estado del botón.
  const visibilidad = new WeakMap();

  /** Pone el botón de mostrar/ocultar dentro del campo. */
  function conOjo(input) {
    if (input.parentElement.classList.contains('pw-caja')) return;

    const caja = document.createElement('span');
    caja.className = 'pw-caja';
    input.parentNode.insertBefore(caja, input);
    caja.appendChild(input);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'pw-ojo';
    caja.appendChild(boton);

    function poner(visible) {
      input.type = visible ? 'text' : 'password';
      boton.innerHTML = visible ? OJO_TACHADO : OJO;
      boton.setAttribute('aria-pressed', String(visible));
      boton.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    }
    poner(false);
    visibilidad.set(input, poner);

    boton.addEventListener('click', () => {
      poner(input.type === 'password');
      input.focus();
    });

    // Un formulario que se vacía vuelve a ocultar lo que se escriba después.
    if (input.form) input.form.addEventListener('reset', () => poner(false));
  }

  let secuencia = 0;

  /**
   * La guía vive dentro del <label> para no romper las filas en rejilla, y
   * eso la metería entera en el nombre que un lector de pantalla da al campo.
   * Se le dice al campo cuál es su nombre —el título del label— y cuál su
   * descripción —la guía—.
   */
  function describir(input, descripcion) {
    descripcion.id = `pw-desc-${++secuencia}`;
    input.setAttribute('aria-describedby', descripcion.id);

    const titulo = input.closest('.campo')?.querySelector(':scope > span:not(.pw-caja)');
    if (titulo) {
      titulo.id = titulo.id || `pw-titulo-${secuencia}`;
      input.setAttribute('aria-labelledby', titulo.id);
    }
  }

  /**
   * Convierte un campo de contraseña nueva en uno con guía.
   *
   * - confirmar: el input de "repite la contraseña", para avisar si no coincide.
   * - datos:     función que devuelve { nombre, email } del formulario, para
   *              avisar si la contraseña los repite.
   * - generar:   true para ofrecer una contraseña aleatoria (útil cuando un
   *              administrador crea la cuenta de otra persona).
   */
  function adjuntar(input, { confirmar, datos, generar: conGenerador = false } = {}) {
    if (!input || input.dataset.pwGuia) return;
    input.dataset.pwGuia = '1';

    conOjo(input);
    if (confirmar) conOjo(confirmar);

    // Quita la ayuda fija que había antes: la guía la reemplaza.
    const campo = input.closest('.campo');
    const ayudaVieja = campo && campo.querySelector('.campo-ayuda');
    if (ayudaVieja) ayudaVieja.remove();

    const guia = document.createElement('div');
    guia.className = 'pw-guia';
    guia.innerHTML = `
      <div class="pw-medidor" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p class="pw-nivel" aria-live="polite"></p>
      <ul class="pw-reglas">
        ${REGLAS.map((r) => `<li data-regla="${r.id}">${H.escapar ? H.escapar(r.texto) : r.texto}</li>`).join('')}
      </ul>
      <p class="pw-aviso" hidden></p>
      ${conGenerador ? '<button type="button" class="link-btn pw-generar">Generar una contraseña segura</button>' : ''}`;
    (campo || input.parentElement.parentElement).appendChild(guia);
    describir(input, guia);

    const barras = guia.querySelectorAll('.pw-medidor span');
    const nivel = guia.querySelector('.pw-nivel');
    const aviso = guia.querySelector('.pw-aviso');

    let avisoConfirmar = null;
    if (confirmar) {
      avisoConfirmar = document.createElement('p');
      avisoConfirmar.className = 'pw-coincide';
      avisoConfirmar.hidden = true;
      (confirmar.closest('.campo') || confirmar.parentElement.parentElement).appendChild(avisoConfirmar);
      describir(confirmar, avisoConfirmar);
    }

    function pintar() {
      const v = input.value;
      const d = datos ? datos() : null;

      for (const r of REGLAS) {
        guia.querySelector(`[data-regla="${r.id}"]`).classList.toggle('ok', Boolean(v) && r.cumple(v));
      }

      const n = fuerza(v, d);
      guia.dataset.nivel = v ? String(n) : '';
      barras.forEach((b, i) => b.classList.toggle('llena', Boolean(v) && i < Math.max(n, 1)));
      nivel.textContent = v ? `Seguridad: ${NIVELES[n]}` : '';

      // Los avisos que no son una regla de la lista se dicen aparte, y solo
      // cuando las reglas ya se cumplen: antes serían ruido.
      const todas = REGLAS.every((r) => r.cumple(v));
      const error = todas ? validar(v, d) : null;
      aviso.hidden = !error;
      aviso.textContent = error || '';

      if (avisoConfirmar) {
        const escrita = confirmar.value;
        avisoConfirmar.hidden = !escrita;
        const igual = escrita === v;
        avisoConfirmar.classList.toggle('ok', igual);
        avisoConfirmar.textContent = igual ? 'Las contraseñas coinciden.' : 'Las contraseñas no coinciden.';
      }
    }

    // Se escucha el formulario entero: el aviso de datos personales depende
    // también de lo que se escriba en el nombre y el correo.
    if (input.form) {
      input.form.addEventListener('input', pintar);
      input.form.addEventListener('reset', () => setTimeout(pintar));
    } else {
      input.addEventListener('input', pintar);
      if (confirmar) confirmar.addEventListener('input', pintar);
    }

    const boton = guia.querySelector('.pw-generar');
    if (boton) {
      boton.addEventListener('click', () => {
        const nueva = generar();
        input.value = nueva;
        if (confirmar) confirmar.value = nueva;
        visibilidad.get(input)(true);
        pintar();
        input.select();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(nueva).then(
            () => H.toast && H.toast('Contraseña generada y copiada al portapapeles.', 'ok'),
            () => {}
          );
        }
      });
    }

    pintar();
  }

  H.password = { REGLAS, validar, fuerza, generar, adjuntar, conOjo };
})(window);
