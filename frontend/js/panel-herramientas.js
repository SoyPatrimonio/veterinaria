/* ============================================================
   Huellitas — herramientas de los paneles

   1. Paleta de comandos (Ctrl+K o /): ir a cualquier sección,
      buscar un paciente y ejecutar acciones sin pasar por el menú.
   2. Vigilancia de inactividad: avisa antes de que el servidor
      cierre la sesión y no la deja caer mientras alguien está
      escribiendo sin guardar.

   Requiere api.js y panel.js cargados antes. panel.js lo arranca
   desde montarPanel(), con las entradas del menú que la sesión
   puede ver.
   ============================================================ */

(function (global) {
  'use strict';

  const H = global.Huella;
  const { escapar } = H;

  /* --------------------------------------------------------
     Búsqueda difusa

     No hace falta escribir el nombre exacto: "hosp" encuentra
     Hospitalización y "fact car" Facturación (…cartera). Se compara
     sin tildes ni mayúsculas y cada palabra escrita tiene que
     aparecer en el texto de la entrada.
     -------------------------------------------------------- */
  const plano = (texto) => String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** Puntuación de una entrada para lo escrito; 0 si no coincide. */
  function puntuar(entrada, consulta) {
    const palabras = plano(consulta).split(/\s+/).filter(Boolean);
    if (!palabras.length) return 1;

    const titulo = plano(entrada.titulo);
    const todo = `${titulo} ${plano(entrada.detalle)} ${plano(entrada.claves)}`;
    let puntos = 0;
    for (const palabra of palabras) {
      if (!todo.includes(palabra)) return 0;
      // Lo que empieza igual que el título pesa más que lo que aparece en
      // la descripción: "inv" tiene que dar Inventario antes que un
      // "Mascotas en adopción … invitado".
      if (titulo.startsWith(palabra)) puntos += 6;
      else if (new RegExp(`\\b${palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(titulo)) puntos += 4;
      else if (titulo.includes(palabra)) puntos += 2;
      else puntos += 1;
    }
    return puntos;
  }

  /* --------------------------------------------------------
     Paleta de comandos
     -------------------------------------------------------- */
  const RECIENTES = 'huellitas_paleta_recientes';

  function leerRecientes() {
    try { return JSON.parse(localStorage.getItem(RECIENTES)) || []; } catch { return []; }
  }
  function anotarReciente(id) {
    try {
      const lista = [id, ...leerRecientes().filter((x) => x !== id)].slice(0, 5);
      localStorage.setItem(RECIENTES, JSON.stringify(lista));
    } catch { /* sin almacenamiento: la paleta funciona igual */ }
  }

  /** Lo que la paleta puede ofrecer: secciones del menú y acciones. */
  function armarEntradas(usuario, menu) {
    const entradas = [];

    for (const item of menu) {
      entradas.push({
        id: `ir:${item.href}`, grupo: 'Ir a', titulo: item.texto, detalle: item.detalle,
        icono: item.icono, href: H.ruta(item.href),
      });
      for (const sub of item.submenu || []) {
        entradas.push({
          id: `ir:${sub.href}`, grupo: 'Ir a', titulo: `${item.texto} › ${sub.texto}`,
          detalle: item.detalle, icono: item.icono, href: H.ruta(sub.href),
        });
      }
    }

    // Mi perfil no está en los menús del personal, pero lo tienen todos.
    if (!menu.some((i) => i.href === 'cliente/perfil.html')) {
      entradas.push({
        id: 'ir:perfil', grupo: 'Ir a', titulo: 'Mi perfil', detalle: 'Tus datos y contraseña',
        icono: 'icon-user', href: H.ruta('cliente/perfil.html'),
      });
    }

    entradas.push(
      {
        id: 'accion:tema', grupo: 'Acciones', icono: 'icon-ajustes', claves: 'tema oscuro claro noche dark',
        get titulo() { return H.tema.esOscuro() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'; },
        detalle: 'Se recuerda en este navegador',
        ejecutar: () => H.tema.alternar(),
      },
      {
        id: 'accion:seguridad', grupo: 'Acciones', icono: 'icon-shield', claves: 'mfa dos pasos verificacion',
        titulo: 'Seguridad de mi cuenta', detalle: 'Verificación en dos pasos y códigos',
        ejecutar: () => H.abrirMiSeguridad(),
      },
      {
        id: 'accion:salir', grupo: 'Acciones', icono: 'icon-salir', claves: 'salir logout cerrar',
        titulo: 'Cerrar sesión', detalle: usuario.email,
        ejecutar: () => H.cerrarSesion(),
      },
    );

    return entradas;
  }

  function montarPaleta(usuario, menu) {
    const entradas = armarEntradas(usuario, menu);
    const buscaPacientes = usuario.rol !== 'cliente' && H.puede('mascotas.ver_todas') && H.puede('historia.ver_todas');

    const fondo = document.createElement('div');
    fondo.className = 'paleta-fondo';
    fondo.hidden = true;
    fondo.innerHTML = `
      <div class="paleta" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div class="paleta-entrada">
          <svg class="icon"><use href="#icon-buscar"/></svg>
          <input type="text" role="combobox" aria-expanded="true" aria-controls="paletaLista"
                 aria-autocomplete="list" autocomplete="off" spellcheck="false"
                 placeholder="${buscaPacientes ? 'Busca una sección, una acción o un paciente…' : 'Busca una sección o una acción…'}">
          <kbd>Esc</kbd>
        </div>
        <ul class="paleta-lista" id="paletaLista" role="listbox"></ul>
        <p class="paleta-pie">
          <span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Ctrl</kbd><kbd>K</kbd> abrir desde cualquier sitio</span>
        </p>
      </div>`;
    document.body.appendChild(fondo);

    const campo = fondo.querySelector('input');
    const lista = fondo.querySelector('.paleta-lista');
    let visibles = [];
    let elegido = 0;
    let pacientes = [];
    let temporizador = null;
    let consultaPacientes = 0;
    let foco = null;

    function filaHtml(entrada, i) {
      return `<li role="option" id="paleta-op-${i}" data-i="${i}" aria-selected="${i === elegido}"
                  class="${i === elegido ? 'activa' : ''}">
                <svg class="icon"><use href="#${escapar(entrada.icono || 'icon-derecha')}"/></svg>
                <span class="paleta-texto">
                  <strong>${escapar(entrada.titulo)}</strong>
                  ${entrada.detalle ? `<small>${escapar(entrada.detalle)}</small>` : ''}
                </span>
                <span class="paleta-grupo">${escapar(entrada.grupo)}</span>
              </li>`;
    }

    function pintar() {
      const consulta = campo.value.trim();
      let candidatas;

      if (!consulta) {
        // Sin nada escrito: lo usado hace poco primero, luego el resto en el
        // orden del menú, que es el que la gente ya conoce.
        const recientes = leerRecientes();
        const usadas = recientes.map((id) => entradas.find((e) => e.id === id)).filter(Boolean)
          .map((e) => ({ ...e, grupo: 'Recientes', titulo: e.titulo }));
        candidatas = [...usadas, ...entradas.filter((e) => !recientes.includes(e.id))];
      } else {
        candidatas = entradas
          .map((e) => ({ e, p: puntuar(e, consulta) }))
          .filter((x) => x.p > 0)
          .sort((a, b) => b.p - a.p)
          .map((x) => x.e);
      }

      visibles = [...pacientes, ...candidatas].slice(0, 40);
      if (elegido >= visibles.length) elegido = Math.max(0, visibles.length - 1);

      lista.innerHTML = visibles.length
        ? visibles.map(filaHtml).join('')
        : `<li class="paleta-vacia">Nada coincide con «${escapar(consulta)}».</li>`;
      campo.setAttribute('aria-activedescendant', visibles.length ? `paleta-op-${elegido}` : '');
      const activa = lista.querySelector('.activa');
      if (activa) activa.scrollIntoView({ block: 'nearest' });
    }

    /**
     * Pacientes que coinciden con lo escrito, pedidos al servidor.
     *
     * Espera a que se deje de teclear y descarta respuestas viejas: si llega
     * tarde la de "lun" cuando ya se escribió "luna", no pisa a la buena.
     */
    function buscarPacientes() {
      clearTimeout(temporizador);
      const consulta = campo.value.trim();
      if (!buscaPacientes || consulta.length < 2) {
        pacientes = [];
        return;
      }
      const turno = ++consultaPacientes;
      temporizador = setTimeout(async () => {
        try {
          const datos = await H.api.get(`/mascotas?busqueda=${encodeURIComponent(consulta)}&limite=6`);
          if (turno !== consultaPacientes || fondo.hidden) return;
          pacientes = (datos.mascotas || []).map((m) => ({
            id: `mascota:${m.id}`,
            grupo: 'Pacientes',
            icono: 'icon-paw',
            titulo: m.nombre,
            detalle: [m.especie, m.raza, m.cliente_nombre && `de ${m.cliente_nombre}`].filter(Boolean).join(' · '),
            href: `${H.ruta('veterinario/historia.html')}?mascota=${m.id}`,
          }));
          pintar();
        } catch (error) {
          // La búsqueda de pacientes es un extra: si falla, la paleta sigue
          // sirviendo para navegar y no vale la pena interrumpir con un aviso.
          console.warn('[paleta] no se pudo buscar pacientes:', error);
        }
      }, 220);
    }

    function ejecutar(entrada) {
      if (!entrada) return;
      // Los pacientes no se guardan en recientes: es información clínica
      // y quedaría a la vista de quien abra la paleta en ese navegador.
      if (!entrada.id.startsWith('mascota:')) anotarReciente(entrada.id);
      cerrar();
      if (entrada.href) location.href = entrada.href;
      else if (entrada.ejecutar) entrada.ejecutar();
    }

    function abrir() {
      if (!fondo.hidden) return;
      foco = document.activeElement;
      campo.value = '';
      pacientes = [];
      elegido = 0;
      fondo.hidden = false;
      document.body.classList.add('paleta-abierta');
      pintar();
      campo.focus();
    }

    function cerrar() {
      if (fondo.hidden) return;
      fondo.hidden = true;
      document.body.classList.remove('paleta-abierta');
      clearTimeout(temporizador);
      if (foco && foco.focus) foco.focus();
    }

    campo.addEventListener('input', () => {
      elegido = 0;
      pacientes = [];
      pintar();
      buscarPacientes();
    });

    campo.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!visibles.length) return;
        elegido = (elegido + (e.key === 'ArrowDown' ? 1 : -1) + visibles.length) % visibles.length;
        pintar();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        ejecutar(visibles[elegido]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cerrar();
      } else if (e.key === 'Tab') {
        // El diálogo es modal: el foco no se escapa a la página de detrás.
        e.preventDefault();
      }
    });

    lista.addEventListener('mousemove', (e) => {
      const fila = e.target.closest('[data-i]');
      if (fila && Number(fila.dataset.i) !== elegido) {
        elegido = Number(fila.dataset.i);
        pintar();
      }
    });
    lista.addEventListener('click', (e) => {
      const fila = e.target.closest('[data-i]');
      if (fila) ejecutar(visibles[Number(fila.dataset.i)]);
    });
    fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });

    document.addEventListener('keydown', (e) => {
      const atajo = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
      // "/" abre la paleta como en tantas aplicaciones, salvo mientras se
      // escribe en un campo, donde es un carácter más.
      const escribiendo = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
      const barra = e.key === '/' && !escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!atajo && !barra) return;
      // Con un modal propio abierto no se apila otro encima.
      if (document.querySelector('.modal-fondo.abierto, .modal-fondo[aria-hidden="false"]')) return;
      e.preventDefault();
      if (fondo.hidden) abrir(); else cerrar();
    });

    const boton = document.getElementById('btnPaleta');
    if (boton) {
      boton.addEventListener('click', abrir);
      // En Mac el atajo es ⌘K: se le enseña el que le sirve.
      if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
        const kbd = boton.querySelector('kbd');
        if (kbd) kbd.textContent = '⌘ K';
      }
    }

    return { abrir, cerrar };
  }

  /* --------------------------------------------------------
     Inactividad

     El servidor cierra la sesión cuando pasan X minutos sin
     peticiones (SESION_INACTIVIDAD_MIN). Eso tiene dos problemas
     que se resuelven aquí:

     - Quien escribe una evolución larga está trabajando, pero no
       hace peticiones: al guardar descubriría que la sesión murió
       y perdería lo escrito. Mientras haya teclado o ratón, se
       hace una petición ligera de vez en cuando.
     - Quien se fue y dejó la pantalla abierta deja datos clínicos
       a la vista. Un poco antes del cierre se avisa con cuenta
       atrás, y al llegar a cero se cierra también en el navegador.
     -------------------------------------------------------- */
  const CLAVE_ACTIVIDAD = 'huellitas_ultima_actividad';
  const CLAVE_LIMITE = 'huellitas_inactividad_min';
  const AVISO_ANTES_MS = 2 * 60 * 1000;
  const ACTIVO_SI_MENOS_DE_MS = 2 * 60 * 1000;
  const CADA_MS = 15 * 1000;

  const leerNumero = (clave) => { try { return Number(localStorage.getItem(clave)) || 0; } catch { return 0; } };
  const guardar = (clave, valor) => { try { localStorage.setItem(clave, String(valor)); } catch { /* sin almacenamiento */ } };

  function vigilarInactividad() {
    let limiteMin = leerNumero(CLAVE_LIMITE) || 60;
    let aviso = null;
    let mantenerEnCurso = false;
    let ultimaEscritura = 0;

    // El límite real lo dice el servidor. Se pregunta una vez por navegador
    // y se recuerda; la respuesta también cuenta como petición.
    async function mantenerViva() {
      if (mantenerEnCurso) return;
      mantenerEnCurso = true;
      try {
        const datos = await H.api.get('/auth/me');
        if (datos && datos.inactividadMin) {
          limiteMin = Number(datos.inactividadMin);
          guardar(CLAVE_LIMITE, limiteMin);
        }
      } catch (error) {
        console.warn('[inactividad] no se pudo renovar la sesión:', error);
      } finally {
        mantenerEnCurso = false;
      }
    }
    if (!leerNumero(CLAVE_LIMITE)) mantenerViva();

    // Teclado, ratón, toque o rueda cuentan como actividad. Se escribe en
    // localStorage como mucho cada 5 s: un mousemove dispara decenas por
    // segundo y no hace falta tanta precisión.
    const alActuar = () => {
      const ahora = Date.now();
      if (ahora - ultimaEscritura < 5000) return;
      ultimaEscritura = ahora;
      guardar(CLAVE_ACTIVIDAD, ahora);
      if (aviso) ocultarAviso();
    };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'].forEach((tipo) => {
      document.addEventListener(tipo, alActuar, { passive: true, capture: true });
    });
    guardar(CLAVE_ACTIVIDAD, Date.now());

    function mostrarAviso() {
      if (aviso) return;
      aviso = document.createElement('div');
      aviso.className = 'inactividad-fondo';
      aviso.innerHTML = `
        <div class="inactividad-caja" role="alertdialog" aria-modal="true"
             aria-labelledby="inactividadTitulo" aria-describedby="inactividadTexto">
          <h3 id="inactividadTitulo">¿Sigues ahí?</h3>
          <p id="inactividadTexto">Por seguridad, la sesión se cerrará en
             <strong class="inactividad-cuenta" aria-live="polite"></strong>
             si no hay actividad.</p>
          <div class="modal-acciones">
            <button type="button" class="btn btn-outline" data-salir>Cerrar sesión</button>
            <button type="button" class="btn btn-primary" data-seguir>Seguir conectado</button>
          </div>
        </div>`;
      document.body.appendChild(aviso);
      aviso.querySelector('[data-seguir]').addEventListener('click', () => {
        guardar(CLAVE_ACTIVIDAD, Date.now());
        ocultarAviso();
        mantenerViva();
      });
      aviso.querySelector('[data-salir]').addEventListener('click', () => H.cerrarSesion());
      aviso.querySelector('[data-seguir]').focus();
      revisar();
    }

    function ocultarAviso() {
      if (!aviso) return;
      aviso.remove();
      aviso = null;
    }

    function cerrarPorInactividad() {
      ocultarAviso();
      H.sesion.cerrar();
      const destino = encodeURIComponent(location.pathname + location.search + location.hash);
      location.href = `${H.ruta('login.html')}?destino=${destino}&motivo=inactividad`;
    }

    function revisar() {
      if (!H.sesion.activa()) return;
      const ahora = Date.now();
      const limite = limiteMin * 60 * 1000;
      const actividad = leerNumero(CLAVE_ACTIVIDAD) || ahora;
      const peticion = H.ultimaPeticion() || ahora;

      // Hay alguien trabajando pero el servidor no sabe nada de él desde
      // hace un tercio del límite: se le avisa de que la sesión sigue en uso.
      if (ahora - actividad < ACTIVO_SI_MENOS_DE_MS && ahora - peticion > limite / 3) {
        mantenerViva();
        return;
      }

      // El cierre llega cuando vence la última petición; el aviso, un poco
      // antes, solo si de verdad no hay nadie (la actividad también es vieja).
      const vence = peticion + limite;
      const quedan = vence - ahora;
      if (quedan <= 0) return cerrarPorInactividad();
      if (quedan <= AVISO_ANTES_MS && ahora - actividad >= ACTIVO_SI_MENOS_DE_MS) {
        mostrarAviso();
        const s = Math.ceil(quedan / 1000);
        aviso.querySelector('.inactividad-cuenta').textContent =
          s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` : `${s} s`;
      } else if (aviso) {
        ocultarAviso();
      }
    }

    // Cada segundo mientras se ve la cuenta atrás; si no, cada 15 s basta.
    (function ciclo() {
      revisar();
      setTimeout(ciclo, aviso ? 1000 : CADA_MS);
    })();

    // Otra pestaña cerró la sesión o la renovó: esta se entera al momento.
    global.addEventListener('storage', (e) => {
      if (e.key === 'huellitas_token' && !e.newValue) location.href = H.ruta('login.html');
      if (e.key === CLAVE_ACTIVIDAD && aviso) ocultarAviso();
    });

    // Al volver a una pestaña dormida, los temporizadores pudieron no correr.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
  }

  /* -------------------------------------------------------- */

  let montado = false;
  function montar(usuario, menu) {
    if (montado) return;
    montado = true;
    montarPaleta(usuario, menu || []);
    vigilarInactividad();
  }

  H.herramientas = { montar, puntuar };
})(window);
