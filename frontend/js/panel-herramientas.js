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
        id: 'accion:calculadora', grupo: 'Herramientas', icono: 'icon-syringe',
        claves: 'dosis mg kg infusion cri goteo gotas fluidos calcular',
        titulo: 'Calculadora clínica', detalle: 'Dosis por peso, infusión continua y goteo',
        disponible: () => Boolean(H.calculadora) && usuario.rol !== 'cliente',
        ejecutar: () => H.calculadora.abrir(),
      },
      {
        id: 'accion:atajos', grupo: 'Ayuda', icono: 'icon-ajustes', claves: 'atajos teclado ayuda shortcuts',
        titulo: 'Atajos de teclado', detalle: 'Pulsa ? en cualquier pantalla',
        ejecutar: () => setTimeout(() => abrirAtajos(), 30),
      },
      {
        id: 'accion:imprimir', grupo: 'Herramientas', icono: 'icon-recibo', claves: 'imprimir pdf papel print',
        titulo: 'Imprimir esta página', detalle: 'Sin menú ni botones, en colores claros',
        ejecutar: () => setTimeout(() => global.print(), 50),
      },
      {
        id: 'accion:letra', grupo: 'Acciones', icono: 'icon-ajustes', claves: 'letra texto tamaño grande zoom leer accesibilidad',
        get titulo() {
          return { normal: 'Letra más grande', grande: 'Letra aún más grande', 'muy-grande': 'Letra de tamaño normal' }[H.letra.actual()];
        },
        detalle: 'Se recuerda en este navegador',
        ejecutar: () => H.letra.siguiente(),
      },
      {
        id: 'accion:instalar', grupo: 'Acciones', icono: 'icon-mas', claves: 'app instalar escritorio celular telefono',
        titulo: 'Instalar la app', detalle: 'Ábrela desde tu escritorio o pantalla de inicio',
        disponible: () => H.app.puedeInstalar(),
        ejecutar: () => H.app.instalar(),
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
    const todas = armarEntradas(usuario, menu);
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
      // Algunas acciones dependen del momento (instalar solo cuando el
      // navegador lo permite).
      const entradas = todas.filter((e) => !e.disponible || e.disponible());
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

  /* --------------------------------------------------------
     Descargas protegidas

     Cualquier botón con data-descargar="/ruta/de/la/api" baja el
     archivo con la sesión (PDF, calendario…), y data-archivo le da
     nombre. Delegado en el documento para que sirva también en las
     tarjetas que las páginas pintan después de cargar.
     -------------------------------------------------------- */
  function conectarDescargas() {
    document.addEventListener('click', async (e) => {
      const boton = e.target.closest('[data-descargar]');
      if (!boton) return;
      e.preventDefault();
      await H.conBoton(boton, boton.dataset.cargando || 'Preparando…', async () => {
        try {
          await H.api.descargar(boton.dataset.descargar, boton.dataset.archivo || 'archivo');
          if (boton.dataset.listo) H.toast(boton.dataset.listo, 'ok');
        } catch (error) {
          H.toast(error.message, 'error');
        }
      });
    });
  }

  /* --------------------------------------------------------
     Exportar tablas a Excel

     Cada tabla del sistema (table.tabla) recibe un botón que la baja
     como CSV, tal cual se está viendo: con los filtros y la búsqueda
     que tenga puestos. Se hace en el navegador con lo que ya está en
     pantalla, así que no exporta nada que la persona no pueda ver.
     -------------------------------------------------------- */

  /**
   * Celda segura para Excel.
   *
   * Un texto que empieza por = + @ (o - seguido de algo que no es un número)
   * Excel lo ejecuta como fórmula: un nombre de mascota escrito como
   * =HYPERLINK(...) por un cliente se convertiría en un enlace activo en el
   * computador de la clínica. Se antepone un apóstrofo, que Excel muestra
   * como texto.
   */
  function celdaCsv(valor) {
    let texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
    if (/^[=+@\t\r]/.test(texto) || /^-(?![\d.,]+$)/.test(texto)) texto = `'${texto}`;
    return `"${texto.replace(/"/g, '""')}"`;
  }

  /**
   * Filas → CSV para Excel en español: separador «;» (la coma es el decimal),
   * BOM para que respete las tildes y saltos CRLF.
   */
  function aCsv(filas) {
    return `﻿${filas.map((fila) => fila.map(celdaCsv).join(';')).join('\r\n')}\r\n`;
  }

  /** Lo que muestra la tabla, sin la columna de botones ni las filas de "vacío". */
  function filasDeTabla(tabla) {
    const cabeceras = [...tabla.querySelectorAll('thead th')].map((th) => th.textContent.replace(/\s+/g, ' ').trim());
    const columnas = cabeceras.map((t, i) => i).filter((i) => cabeceras[i] && !/^acci(o|ó)n(es)?$/i.test(cabeceras[i]));
    // Las filas que esconde el filtro de la tabla no se exportan.
    const cuerpo = [...tabla.querySelectorAll('tbody tr')]
      .filter((tr) => !tr.hidden)
      .map((tr) => [...tr.children])
      .filter((celdas) => celdas.length === cabeceras.length)
      .map((celdas) => columnas.map((i) => textoDeCelda(celdas[i])));
    return { cabecera: columnas.map((i) => cabeceras[i]), cuerpo };
  }

  /**
   * El dato de la celda sin lo que es interfaz: botones, campos y las notas
   * pequeñas como "(tú)", que en pantalla orientan y en una hoja de cálculo
   * ensucian la columna. Una celda puede marcar más con data-no-exportar.
   */
  function textoDeCelda(celda) {
    const copia = celda.cloneNode(true);
    copia.querySelectorAll('button, input, select, textarea, span.campo-ayuda, [data-no-exportar]')
      .forEach((el) => el.remove());
    return copia.textContent;
  }

  function nombreArchivo() {
    const titulo = (document.querySelector('.contenido-cabecera h1')?.textContent || document.title || 'tabla')
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    return `${titulo || 'tabla'}-${H.fechaHoyISO ? H.fechaHoyISO() : new Date().toISOString().slice(0, 10)}.csv`;
  }

  function exportarTabla(tabla) {
    const { cabecera, cuerpo } = filasDeTabla(tabla);
    if (!cuerpo.length) {
      H.toast('No hay filas para exportar con los filtros actuales.', 'aviso');
      return;
    }
    const archivo = new Blob([aCsv([cabecera, ...cuerpo])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo();
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    H.toast(`${cuerpo.length} ${cuerpo.length === 1 ? 'fila exportada' : 'filas exportadas'}. Ábrelo con Excel.`, 'ok');
  }

  /* --------------------------------------------------------
     Ordenar y filtrar tablas

     Clic en un encabezado ordena por esa columna (otro clic invierte);
     el campo "Filtrar" esconde las filas que no contienen lo escrito.
     Todo en el navegador, sobre lo que ya está pintado: no pide nada
     nuevo al servidor ni cambia lo que la página tiene cargado.
     -------------------------------------------------------- */
  const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };

  /**
   * Cómo se compara el texto de una celda.
   *
   * Las tablas muestran números a la colombiana ("$ 1.250.000", "24,5 kg") y
   * fechas como las escribe H.fechaLarga ("10 ene 2026"). Comparadas como
   * texto, "$ 9.000" quedaría por encima de "$ 10.000" y diciembre antes que
   * enero; por eso se reconocen y se ordenan por su valor.
   */
  function claveOrden(texto) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!t || t === '—' || t === '-') return { tipo: 'vacio', valor: 0 };

    const fecha = /^(\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)\.? (\d{4})/i.exec(t);
    if (fecha) {
      return { tipo: 'numero', valor: Number(fecha[3]) * 10000 + MESES[fecha[2].toLowerCase()] * 100 + Number(fecha[1]) };
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (iso) return { tipo: 'numero', valor: Number(`${iso[1]}${iso[2]}${iso[3]}`) };

    // Número con adornos: moneda, unidades, signo. Punto de miles y coma decimal.
    const numero = /^[$\s]*(-?)\s*\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:\s*[a-zA-Z%µ/]{0,6})?$/.exec(t);
    if (numero) {
      const entero = numero[2].replace(/\./g, '');
      return { tipo: 'numero', valor: Number(`${numero[1]}${entero}.${numero[3] || 0}`) };
    }
    return { tipo: 'texto', valor: t };
  }

  const ordenTexto = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

  /** Compara dos celdas; las vacías van siempre al final. */
  function compararCeldas(a, b) {
    const x = claveOrden(a);
    const y = claveOrden(b);
    if (x.tipo === 'vacio' || y.tipo === 'vacio') return (x.tipo === 'vacio') - (y.tipo === 'vacio');
    if (x.tipo === 'numero' && y.tipo === 'numero') return x.valor - y.valor;
    return ordenTexto.compare(String(x.valor), String(y.valor));
  }

  /** ¿La fila contiene todas las palabras escritas? Sin tildes ni mayúsculas. */
  function coincideFiltro(texto, consulta) {
    const palabras = plano(consulta).split(/\s+/).filter(Boolean);
    const contenido = plano(texto);
    return palabras.every((p) => contenido.includes(p));
  }

  const FILAS_TABLA_LARGA = 15;

  const filasDeDatos = (tabla) => {
    const columnas = tabla.querySelectorAll('thead th').length;
    return [...tabla.querySelectorAll('tbody tr')].filter((tr) => tr.children.length === columnas);
  };

  /**
   * Filtro y orden de cada contenedor de tabla.
   *
   * Muchas páginas, al recargar sus datos (cambiar un filtro propio, guardar
   * algo), reemplazan el contenedor entero: tabla y barra nuevas. Sin esta
   * memoria se perdería lo escrito en "Filtrar" y el orden elegido justo
   * cuando se está trabajando con ellos. Se guarda por el elemento
   * contenedor, que es el que sobrevive al repintado.
   */
  const memoria = new WeakMap();
  const recordar = (tabla, cambios) => {
    const contenedor = (tabla.closest('.tabla-envoltura') || tabla).parentElement;
    if (contenedor) memoria.set(contenedor, { ...memoria.get(contenedor), ...cambios });
  };

  function ordenarPor(tabla, th) {
    const indice = [...th.parentElement.children].indexOf(th);
    const ascendente = th.getAttribute('aria-sort') !== 'ascending';
    recordar(tabla, { orden: { indice, ascendente } });
    aplicarOrden(tabla, indice, ascendente);
  }

  function aplicarOrden(tabla, indice, ascendente) {
    const th = tabla.querySelectorAll('thead th')[indice];
    if (!th) return;
    tabla.querySelectorAll('thead th[aria-sort]').forEach((otro) => otro.setAttribute('aria-sort', 'none'));
    th.setAttribute('aria-sort', ascendente ? 'ascending' : 'descending');

    const filas = filasDeDatos(tabla);
    const cuerpo = filas[0] && filas[0].parentElement;
    if (!cuerpo) return;
    // Ordenación estable: a igualdad, se respeta el orden en que llegaron.
    filas
      .map((tr, i) => ({ tr, i, texto: textoDeCelda(tr.children[indice]) }))
      .sort((a, b) => (compararCeldas(a.texto, b.texto) * (ascendente ? 1 : -1)) || a.i - b.i)
      .forEach(({ tr }) => cuerpo.appendChild(tr));
  }

  function filtrar(tabla, consulta, contador) {
    const filas = filasDeDatos(tabla);
    let visibles = 0;
    for (const tr of filas) {
      const coincide = !consulta || coincideFiltro(tr.textContent, consulta);
      tr.hidden = !coincide;
      if (coincide) visibles += 1;
    }
    if (contador) contador.textContent = consulta ? `${visibles} de ${filas.length}` : '';
  }

  /** La tabla que corresponde a una barra de herramientas. */
  function tablaDe(barra) {
    const siguiente = barra.nextElementSibling;
    return siguiente && (siguiente.matches('table') ? siguiente : siguiente.querySelector('table.tabla'));
  }

  /**
   * Prepara cada tabla: encabezados ordenables y la barra con el filtro y
   * "Exportar a Excel". Sirve también para las tablas que las páginas
   * pintan después de cargar; si una página repinta la tabla dentro del
   * mismo contenedor, la barra se reutiliza (con el filtro que tuviera
   * escrito) en vez de duplicarse.
   */
  function mejorarTablas() {
    const preparar = (tabla) => {
      tabla.dataset.exportable = '1';
      const cabeceras = [...tabla.querySelectorAll('thead th')];
      if (!cabeceras.length) return;

      cabeceras.forEach((th) => {
        const texto = th.textContent.trim();
        if (!texto || /^acci(o|ó)n(es)?$/i.test(texto)) return;
        th.setAttribute('aria-sort', 'none');
        th.classList.add('th-ordenable');
        th.tabIndex = 0;
        th.title = 'Ordenar por esta columna';
      });

      const ancla = tabla.closest('.tabla-envoltura') || tabla;
      // Una tabla larga se desplaza dentro de su caja con el encabezado
      // fijo: al bajar por cien facturas se sigue viendo qué es cada columna.
      if (ancla !== tabla) ancla.classList.toggle('tabla-larga', filasDeDatos(tabla).length > FILAS_TABLA_LARGA);
      let barra = ancla.previousElementSibling;
      if (!barra || !barra.classList.contains('tabla-herramientas')) {
        ancla.insertAdjacentHTML('beforebegin', `
          <div class="tabla-herramientas">
            <label class="tabla-filtro">
              <svg class="icon"><use href="#icon-buscar"/></svg>
              <input type="search" placeholder="Filtrar en la tabla…" aria-label="Filtrar las filas de la tabla" data-filtro-tabla>
              <small aria-live="polite"></small>
            </label>
            <button type="button" class="btn btn-outline btn-sm" data-exportar-tabla
                    title="Descarga lo que ves en la tabla, con los filtros actuales">
              <svg class="icon"><use href="#icon-recibo"/></svg> Exportar a Excel
            </button>
          </div>`);
        barra = ancla.previousElementSibling;
      }

      // Lo que tenía este contenedor antes de repintarse.
      const anterior = memoria.get(barra.parentElement) || {};
      const campo = barra.querySelector('[data-filtro-tabla]');
      if (campo && !campo.value && anterior.filtro) campo.value = anterior.filtro;
      if (anterior.orden) aplicarOrden(tabla, anterior.orden.indice, anterior.orden.ascendente);
      if (campo && campo.value) filtrar(tabla, campo.value, barra.querySelector('.tabla-filtro small'));
    };

    const revisar = () => document.querySelectorAll('table.tabla:not([data-exportable])').forEach(preparar);
    let pendiente = null;
    new MutationObserver(() => {
      clearTimeout(pendiente);
      pendiente = setTimeout(revisar, 120);
    }).observe(document.body, { childList: true, subtree: true });
    revisar();

    document.addEventListener('click', (e) => {
      const exportar = e.target.closest('[data-exportar-tabla]');
      if (exportar) {
        const tabla = tablaDe(exportar.closest('.tabla-herramientas'));
        if (tabla) exportarTabla(tabla);
        return;
      }
      const th = e.target.closest('th.th-ordenable');
      if (th) ordenarPor(th.closest('table'), th);
    });
    document.addEventListener('keydown', (e) => {
      const th = e.target.closest && e.target.closest('th.th-ordenable');
      if (th && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        ordenarPor(th.closest('table'), th);
      }
    });
    document.addEventListener('input', (e) => {
      if (!e.target.matches('[data-filtro-tabla]')) return;
      const barra = e.target.closest('.tabla-herramientas');
      const tabla = tablaDe(barra);
      if (!tabla) return;
      recordar(tabla, { filtro: e.target.value });
      filtrar(tabla, e.target.value, barra.querySelector('.tabla-filtro small'));
    });
  }

  /* --------------------------------------------------------
     Formularios: cambios sin guardar y contador de caracteres
     -------------------------------------------------------- */

  /**
   * ¿Este formulario tiene trabajo que se perdería al salir?
   *
   * Solo cuentan los de un modal abierto (alta y edición) y los que llevan
   * un texto largo escrito (una evolución, un motivo): los filtros y
   * buscadores de las páginas no, porque avisar al cambiar de página por un
   * filtro escrito sería ruido y la gente aprendería a ignorar el aviso.
   */
  function tieneTrabajo(form) {
    if (!form.isConnected || !sucios.has(form)) return false;
    if (form.closest('.paleta-fondo, #modalCalculadora')) return false;
    if (form.closest('.modal-fondo')) return form.closest('.modal-fondo').classList.contains('abierto');
    return [...form.querySelectorAll('textarea')].some((t) => t.value.trim().length > 0);
  }
  const sucios = new WeakSet();

  function protegerCambios() {
    document.addEventListener('input', (e) => {
      const form = e.target.form || (e.target.closest && e.target.closest('form'));
      if (form && !e.target.matches('[data-filtro-tabla], [type="search"]')) sucios.add(form);
    });
    // Guardado o vaciado: ya no hay nada que perder.
    document.addEventListener('submit', (e) => sucios.delete(e.target), true);
    document.addEventListener('reset', (e) => sucios.delete(e.target), true);

    global.addEventListener('beforeunload', (e) => {
      // Cerrar por inactividad también sale de la página: ahí no se pregunta.
      if (!H.sesion.activa()) return;
      if ([...document.forms].some(tieneTrabajo)) {
        e.preventDefault();
        e.returnValue = ''; // los navegadores muestran su propio texto
      }
    });
  }

  /** "120 / 1000" bajo cada textarea con maxlength, en aviso cerca del tope. */
  function contadoresDeTexto() {
    const preparar = (area) => {
      area.dataset.contador = '1';
      const contador = document.createElement('small');
      contador.className = 'contador-texto';
      contador.setAttribute('aria-live', 'polite');
      area.insertAdjacentElement('afterend', contador);
      const pintar = () => {
        const max = Number(area.maxLength);
        const usados = area.value.length;
        contador.textContent = `${usados.toLocaleString('es-CO')} / ${max.toLocaleString('es-CO')}`;
        contador.classList.toggle('cerca', usados >= max * 0.9);
      };
      area.addEventListener('input', pintar);
      area.form && area.form.addEventListener('reset', () => setTimeout(pintar));
      pintar();
    };
    const revisar = () => document.querySelectorAll('textarea[maxlength]:not([data-contador])').forEach(preparar);
    new MutationObserver(() => revisar()).observe(document.body, { childList: true, subtree: true });
    revisar();
  }

  /* --------------------------------------------------------
     Navegación: volver arriba y ayuda de atajos
     -------------------------------------------------------- */

  function botonArriba() {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'volver-arriba';
    boton.hidden = true;
    boton.setAttribute('aria-label', 'Volver arriba');
    boton.innerHTML = '<svg class="icon icon-linea" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    document.body.appendChild(boton);
    boton.addEventListener('click', () => {
      const suave = !global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      global.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
      const titulo = document.querySelector('.contenido-cabecera h1');
      if (titulo) { titulo.tabIndex = -1; titulo.focus({ preventScroll: true }); }
    });
    let pendiente = false;
    global.addEventListener('scroll', () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        boton.hidden = global.scrollY < 700;
        pendiente = false;
      });
    }, { passive: true });
  }

  const ATAJOS = [
    ['Ctrl K  ·  /', 'Abrir la paleta: ir a una sección, buscar pacientes, acciones'],
    ['↑ ↓  ·  Enter', 'Moverse en la paleta y abrir lo elegido'],
    ['Esc', 'Cerrar la paleta o la ventana abierta'],
    ['?', 'Mostrar esta ayuda'],
    ['Clic en un encabezado', 'Ordenar la tabla por esa columna (otro clic invierte)'],
  ];

  function ayudaAtajos() {
    const ID = 'modalAtajos';
    let fondo = null;
    const abrir = () => {
      if (!fondo) {
        fondo = document.createElement('div');
        fondo.className = 'modal-fondo';
        fondo.id = ID;
        fondo.setAttribute('aria-hidden', 'true');
        fondo.innerHTML = `
          <div class="modal-caja modal-estrecho" role="dialog" aria-modal="true" aria-labelledby="atajosTitulo">
            <button type="button" class="modal-cerrar" data-cerrar aria-label="Cerrar">✕</button>
            <h3 id="atajosTitulo">Atajos de teclado</h3>
            <dl class="lista-atajos">
              ${ATAJOS.map(([tecla, que]) => `<div><dt>${tecla.split('  ·  ').map((t) => `<kbd>${escapar(t)}</kbd>`).join(' o ')}</dt><dd>${escapar(que)}</dd></div>`).join('')}
            </dl>
          </div>`;
        document.body.appendChild(fondo);
        H.prepararModal(ID);
      }
      H.abrirModal(ID);
    };

    document.addEventListener('keydown', (e) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const escribiendo = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
      if (escribiendo || document.querySelector('.modal-fondo.abierto') || !document.querySelector('.paleta-fondo[hidden]')) return;
      e.preventDefault();
      abrir();
    });
    return abrir;
  }

  /* --------------------------------------------------------
     App instalable y conexión
     -------------------------------------------------------- */

  /** "Instalar app" en el pie de la barra, solo cuando se puede. */
  function botonInstalar() {
    const seguridad = document.getElementById('btnMiSeguridad');
    if (!seguridad || H.app.instalada()) return;

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn-salir btn-instalar';
    boton.id = 'btnInstalar';
    boton.hidden = !H.app.puedeInstalar();
    boton.innerHTML = '<svg class="icon"><use href="#icon-mas"/></svg> Instalar la app';
    seguridad.before(boton);

    boton.addEventListener('click', async () => {
      if (await H.app.instalar()) H.toast('¡Listo! Ya puedes abrir Huellitas desde tu escritorio o tu teléfono.', 'ok');
      boton.hidden = !H.app.puedeInstalar();
    });
    document.addEventListener('huellitas:instalable', () => { boton.hidden = false; });
    document.addEventListener('huellitas:instalada', () => { boton.hidden = true; });
  }

  /**
   * Franja de "sin conexión".
   *
   * Sin ella, lo primero que se ve al perder la red es un error al guardar.
   * Avisarlo antes evita escribir una nota entera que luego no se puede
   * enviar.
   */
  function avisoConexion() {
    const franja = document.createElement('div');
    franja.className = 'franja-conexion';
    franja.setAttribute('role', 'status');
    franja.hidden = navigator.onLine;
    franja.textContent = 'Sin conexión. Lo que hagas no se guardará hasta que vuelva internet.';
    document.body.appendChild(franja);

    global.addEventListener('offline', () => { franja.hidden = false; });
    global.addEventListener('online', () => {
      franja.hidden = true;
      H.toast('Conexión recuperada.', 'ok');
    });
  }

  /* -------------------------------------------------------- */

  let montado = false;
  function montar(usuario, menu) {
    if (montado) return;
    montado = true;
    montarPaleta(usuario, menu || []);
    vigilarInactividad();
    conectarDescargas();
    botonInstalar();
    avisoConexion();
    mejorarTablas();
    protegerCambios();
    contadoresDeTexto();
    botonArriba();
    abrirAtajos = ayudaAtajos();
  }

  // La paleta ofrece la ayuda de atajos; se conecta al montar.
  let abrirAtajos = () => {};

  H.herramientas = { montar, puntuar, aCsv, celdaCsv, filasDeTabla, claveOrden, compararCeldas, coincideFiltro };
})(window);
