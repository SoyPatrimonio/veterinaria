/* ============================================================
   Huellitas de Amor — página pública
   Las secciones de servicios y equipo se llenan desde la API;
   si el backend no responde, se conserva el contenido del HTML.
   ============================================================ */

const H = window.Huella;

/* ============================================================
   WhatsApp — el único sitio donde se escribe el número

   PENDIENTE: reemplazar por el número real de la clínica. Formato
   internacional y solo dígitos: 57 (Colombia) + los 10 del celular.
   Al cambiarlo aquí quedan actualizados el botón del encabezado, el
   del hero, el de "Nosotros", el de contacto, el del pie y el botón
   flotante, además del número que se muestra en pantalla.
   ============================================================ */
const WHATSAPP = '573000000000';

const MENSAJES_WA = {
  cita: 'Hola, quiero agendar una cita para mi mascota en Huellitas de Amor.',
  ubicacion: 'Hola, ¿me ayudan con las indicaciones para llegar a la veterinaria en Sogamoso?',
  testimonio: 'Hola, quiero contarles cómo me fue en Huellitas de Amor.',
};

document.addEventListener('DOMContentLoaded', () => {
  initWhatsapp();
  initHeaderScroll();
  initMobileNav();
  initNavMenus();
  initReveal();
  initServiceModal();
  initAdopcionModal();
  initTienda();
  initTestimonios();
  initSesion();
  cargarServicios();
  cargarEquipo();
  cargarAdopciones();
  cargarTestimonios();
});

/* ============================================================
   Interacciones de la página (sin cambios respecto al diseño)
   ============================================================ */

/**
 * Arma el enlace wa.me de todo lo que lleve data-wa y escribe el número
 * legible en los data-wa-numero. El texto del mensaje sale de MENSAJES_WA
 * según el valor del atributo (cita, ubicacion, testimonio).
 */
function initWhatsapp() {
  const numero = WHATSAPP.replace(/\D/g, '');

  document.querySelectorAll('[data-wa]').forEach((enlace) => {
    const mensaje = MENSAJES_WA[enlace.dataset.wa] || MENSAJES_WA.cita;
    enlace.href = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  });

  // 573001234567 -> +57 300 123 4567
  const legible = numero.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})$/, '+$1 $2 $3 $4');
  document.querySelectorAll('[data-wa-numero]').forEach((el) => {
    el.textContent = legible;
  });
}

function initHeaderScroll() {
  const header = document.getElementById('siteHeader');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const header = document.getElementById('siteHeader');
  const nav = document.getElementById('mainNav');

  toggle.addEventListener('click', () => {
    const isOpen = header.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    if (!isOpen) cerrarFichas();
  });

  // Delegado, no un listener por enlace: las filas de servicios, equipo y
  // portal se vuelven a pintar con los datos de la API después de esto.
  nav.addEventListener('click', (evento) => {
    if (!evento.target.closest('a')) return;
    header.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    cerrarFichas();
  });
}

/* ============================================================
   Fichas del menú

   En escritorio se abren con el cursor o con el tabulador (CSS).
   En el móvil el menú es una lista, así que cada opción lleva un
   botón de flecha que despliega su ficha.
   ============================================================ */

function initNavMenus() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    const boton = item.querySelector('.nav-desplegar');
    if (!boton) return;

    boton.addEventListener('click', (evento) => {
      // Sin esto, el click seguía subiendo hasta el listener de "fuera del
      // menú" de abajo y cerraba la ficha en el mismo instante en que se abría.
      evento.stopPropagation();
      const abrir = !item.classList.contains('abierto');
      cerrarFichas();
      item.classList.toggle('abierto', abrir);
      boton.setAttribute('aria-expanded', String(abrir));
    });
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    cerrarFichas();
    // En escritorio la ficha también se mantiene abierta por el foco.
    const activo = document.activeElement;
    if (activo && activo.closest('.nav-panel')) activo.blur();
  });

  // En dispositivos táctiles sin mouse la ficha se abre con el botón de
  // arriba y no hay forma de "dejar de pasar el cursor" para cerrarla: sin
  // este cierre al tocar cualquier otro lado, se quedaría abierta encima
  // del resto de la página.
  document.addEventListener('click', (evento) => {
    if (!evento.target.closest('.nav-item')) cerrarFichas();
  });
}

function cerrarFichas() {
  document.querySelectorAll('.nav-item.abierto').forEach((item) => {
    item.classList.remove('abierto');
    const boton = item.querySelector('.nav-desplegar');
    if (boton) boton.setAttribute('aria-expanded', 'false');
  });
}

/** Fila de una ficha del menú: icono o foto, título, detalle y dato al costado. */
function filaMenu({ href, icono, foto, titulo, detalle, dato }) {
  const marca = foto
    ? `<span class="nav-fila-foto"><img src="${H.escapar(foto)}" alt=""></span>`
    : `<span class="nav-fila-icono"><svg class="icon"><use href="#${H.escapar(icono || 'icon-paw')}"/></svg></span>`;

  return `<a class="nav-fila" href="${H.escapar(href)}">
      ${marca}
      <span class="nav-fila-cuerpo">
        <strong>${H.escapar(titulo)}</strong>
        <small>${H.escapar(detalle)}</small>
      </span>
      ${dato ? `<span class="nav-fila-dato">${H.escapar(dato)}</span>` : ''}
    </a>`;
}

function initReveal() {
  const items = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  items.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`;
    observer.observe(el);
  });
}

/** Vuelve a observar tarjetas creadas después de la carga inicial. */
function revelar(contenedor) {
  contenedor.querySelectorAll('.reveal').forEach((el, i) => {
    setTimeout(() => el.classList.add('is-visible'), Math.min(i, 6) * 60);
  });
}

/* ============================================================
   Sesión: cabecera, portal y llamados a la acción
   ============================================================ */

function initSesion() {
  const usuario = H.sesion.usuario();
  const loginTrigger = document.getElementById('loginTrigger');
  const chip = document.getElementById('accountChip');
  const portalBox = document.getElementById('portalBox');
  const acciones = document.getElementById('ctaAcciones');
  const ctaAgendar = document.getElementById('ctaAgendar');

  // Cierre de sesión y menú de la cuenta
  const chipBtn = document.getElementById('accountChipBtn');
  if (chipBtn) {
    chipBtn.addEventListener('click', () => chip.classList.toggle('is-open'));
    document.addEventListener('click', (e) => {
      if (chip && !chip.contains(e.target)) chip.classList.remove('is-open');
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      H.sesion.cerrar();
      location.reload();
    });
  }

  if (!usuario) {
    if (ctaAgendar) ctaAgendar.href = H.ruta('registro.html');
    if (portalBox) {
      portalBox.innerHTML = `
        <div class="portal-guest">
          <span class="portal-guest-icon"><svg class="icon"><use href="#icon-user"/></svg></span>
          <h3>Inicia sesión para ver tu portal</h3>
          <p>Los clientes gestionan sus mascotas y citas. Los veterinarios y el personal de la clínica tienen su propio panel.</p>
          <div class="portal-guest-actions">
            <a class="btn btn-primary" href="${H.ruta('registro.html')}"><svg class="icon"><use href="#icon-paw"/></svg> Crear cuenta</a>
            <a class="btn btn-outline" style="width:auto" href="${H.ruta('login.html')}">Ya tengo cuenta</a>
          </div>
        </div>`;
    }
    return;
  }

  // Con sesión iniciada
  const panel = H.panelDe(usuario.rol);
  const ROLES = { cliente: 'Cliente', veterinario: 'Veterinario', admin: 'Administración' };

  if (loginTrigger) loginTrigger.hidden = true;
  if (chip) {
    chip.hidden = false;
    document.getElementById('accountAvatar').textContent = (usuario.nombre || 'U').trim().charAt(0).toUpperCase();
    document.getElementById('accountName').textContent = usuario.nombre.split(' ')[0];
    document.getElementById('accountRole').textContent = ROLES[usuario.rol] || usuario.rol;
    document.getElementById('enlacePanel').href = panel;
  }

  if (ctaAgendar) {
    ctaAgendar.href = usuario.rol === 'cliente' ? H.ruta('cliente/agendar.html') : panel;
  }

  if (acciones) {
    acciones.innerHTML = usuario.rol === 'cliente'
      ? `<a href="${H.ruta('cliente/agendar.html')}" class="btn btn-primary" style="justify-content:center">
           <svg class="icon"><use href="#icon-calendar"/></svg> Agendar una cita
         </a>
         <a href="${H.ruta('cliente/citas.html')}" class="btn btn-outline">Ver mis citas</a>`
      : `<a href="${panel}" class="btn btn-primary" style="justify-content:center">Ir a mi panel</a>`;
  }

  pintarMenuPortal(usuario, panel);

  if (portalBox) pintarPortal(portalBox, usuario, panel);
}

/* ============================================================
   Ficha "Portal" del menú

   Sin sesión queda lo que trae el HTML: qué encuentra cada rol al
   entrar. Con sesión pasa a ser un acceso directo a las pantallas
   del panel que le toca, con sus números cuando la API responde.
   ============================================================ */

const SECCIONES_PORTAL = {
  cliente: [
    { href: 'cliente/mascotas.html', icono: 'icon-paw',      titulo: 'Mis mascotas', detalle: 'Fichas, fotos y vacunas',    dato: (r) => contar(r.mascotas, 'mascota', 'mascotas') },
    { href: 'cliente/agendar.html',  icono: 'icon-calendar', titulo: 'Agendar cita', detalle: 'Elige servicio, día y hora' },
    { href: 'cliente/citas.html',    icono: 'icon-clock',    titulo: 'Mis citas',    detalle: 'Próximas y anteriores',      dato: (r) => contar(r.proximas, 'próxima', 'próximas') },
  ],
  veterinario: [
    { href: 'veterinario/agenda.html',    icono: 'icon-calendar', titulo: 'Mi agenda',  detalle: 'Citas del día y horarios',  dato: (r) => (r.hoy ? `${r.hoy} hoy` : '') },
    { href: 'veterinario/pacientes.html', icono: 'icon-paw',      titulo: 'Pacientes',  detalle: 'Historia de cada mascota',  dato: (r) => contar(r.pacientes, 'paciente', 'pacientes') },
    { href: 'veterinario/dashboard.html', icono: 'icon-stetho',   titulo: 'Resumen',    detalle: 'Tu día de un vistazo' },
  ],
  admin: [
    { href: 'admin/citas.html',     icono: 'icon-calendar', titulo: 'Citas',     detalle: 'Todas las citas de la clínica', dato: (r) => (r.citasHoy ? `${r.citasHoy} hoy` : '') },
    { href: 'admin/usuarios.html',  icono: 'icon-user',     titulo: 'Usuarios',  detalle: 'Cuentas, roles y bloqueos',     dato: (r) => contar(r.clientes, 'cliente', 'clientes') },
    { href: 'admin/seguridad.html', icono: 'icon-shield',   titulo: 'Seguridad', detalle: 'Accesos, auditoría y permisos' },
  ],
};

const NOMBRE_PORTAL = { cliente: 'Portal del cliente', veterinario: 'Panel veterinario', admin: 'Administración' };

function contar(valor, singular, plural) {
  const n = Number(valor || 0);
  if (!n) return '';
  return `${n} ${n === 1 ? singular : plural}`;
}

function pintarMenuPortal(usuario, panel, resumen) {
  const lista = document.getElementById('navPortal');
  const estado = document.getElementById('navPortalEstado');
  const pie = document.getElementById('navPortalPie');
  if (!lista) return;

  const secciones = SECCIONES_PORTAL[usuario.rol] || [];
  if (!secciones.length) return;

  if (estado) estado.textContent = NOMBRE_PORTAL[usuario.rol] || usuario.rol;

  lista.innerHTML = secciones.map((s) => filaMenu({
    href: H.ruta(s.href),
    icono: s.icono,
    titulo: s.titulo,
    detalle: s.detalle,
    dato: resumen && s.dato ? s.dato(resumen) : '',
  })).join('');

  if (pie) {
    pie.innerHTML = `<a class="btn btn-primary" href="${panel}">Ir a mi panel</a>`;
  }
}

async function pintarPortal(caja, usuario, panel) {
  caja.innerHTML = `
    <div class="portal-head">
      <div class="portal-welcome">
        <span class="portal-avatar">${H.escapar(usuario.nombre.charAt(0).toUpperCase())}</span>
        <div>
          <h3>Hola, ${H.escapar(usuario.nombre.split(' ')[0])}</h3>
          <span>Cargando tu resumen…</span>
        </div>
      </div>
      <a href="${panel}" class="btn btn-primary">Ir a mi panel</a>
    </div>`;

  try {
    const datos = await H.api.get('/dashboard', undefined, { sinRedirigir: true });
    const r = datos.resumen || {};

    // La misma respuesta le pone los números a la ficha "Portal" del menú.
    pintarMenuPortal(usuario, panel, r);

    const metricas = usuario.rol === 'cliente'
      ? [[r.proximas, 'Citas próximas'], [r.mascotas, 'Mascotas'], [r.pendientes, 'Por confirmar']]
      : usuario.rol === 'veterinario'
        ? [[r.hoy, 'Citas hoy'], [r.proximas, 'Próximas'], [r.pacientes, 'Pacientes']]
        : [[r.citasHoy, 'Citas hoy'], [r.clientes, 'Clientes'], [r.mascotas, 'Mascotas']];

    caja.innerHTML = `
      <div class="portal-head">
        <div class="portal-welcome">
          <span class="portal-avatar">${H.escapar(usuario.nombre.charAt(0).toUpperCase())}</span>
          <div>
            <h3>Hola, ${H.escapar(usuario.nombre.split(' ')[0])}</h3>
            <span>${H.escapar({ cliente: 'Portal del cliente', veterinario: 'Panel veterinario', admin: 'Administración' }[usuario.rol])}</span>
          </div>
        </div>
        <a href="${panel}" class="btn btn-primary">Ir a mi panel</a>
      </div>
      <div class="portal-stats">
        ${metricas.map(([valor, texto]) => `
          <div class="portal-stat"><strong>${H.escapar(valor ?? 0)}</strong><span>${H.escapar(texto)}</span></div>`).join('')}
      </div>`;
  } catch (error) {
    // Si la API no responde, al menos queda el acceso al panel. El aviso ya se
    // ve en pantalla; en consola queda el motivo, que es lo que hace falta para
    // saber si fue la sesión, la red o el servidor.
    console.warn('[landing] no se pudo cargar el resumen del portal:', error);
    caja.querySelector('.portal-welcome span').textContent = 'No pudimos cargar el resumen en este momento.';
  }
}

/* ============================================================
   Servicios desde la API
   ============================================================ */

async function cargarServicios() {
  const rejilla = document.querySelector('.cards-grid');
  if (!rejilla) return;

  try {
    const datos = await H.api.get('/servicios', undefined, { sinRedirigir: true });
    if (!datos.servicios || !datos.servicios.length) return;

    rejilla.innerHTML = datos.servicios.slice(0, 6).map((s) => {
      const icono = s.icono || 'icon-stetho';
      const precio = Number(s.precio) > 0 ? `Desde ${H.moneda(s.precio)}` : 'Sin costo';
      const descripcion = s.descripcion || 'Consulta los detalles con nuestro equipo.';

      return `<button type="button" class="card reveal"
                data-service="${H.escapar(s.nombre)}"
                data-icon="${H.escapar(icono)}"
                data-duration="${H.escapar(s.duracion_min)} min"
                data-price="${H.escapar(precio)}"
                data-detail="${H.escapar(descripcion)}"
                data-includes="${H.escapar(s.requisitos || 'Atención con veterinarios certificados')}">
          <span class="card-icon"><svg class="icon"><use href="#${H.escapar(icono)}"/></svg></span>
          <h3>${H.escapar(s.nombre)}</h3>
          <p>${H.escapar(descripcion.slice(0, 120))}</p>
          <span class="card-cta">Ver detalles <span aria-hidden="true">→</span></span>
        </button>`;
    }).join('');

    revelar(rejilla);
    initServiceModal();
    pintarMenuServicios(datos.servicios);
  } catch (error) {
    // Se conservan las tarjetas de ejemplo del HTML: la landing es pública y
    // tiene que verse aunque la API esté caída. Queda en consola porque, si no,
    // los precios de ejemplo pasarían por buenos sin ninguna señal.
    console.warn('[landing] no se pudieron cargar los servicios, se muestran los de ejemplo:', error);
  }
}

/** La ficha del menú muestra los mismos servicios, con duración y precio. */
function pintarMenuServicios(servicios) {
  const caja = document.getElementById('navServicios');
  if (!caja) return;

  caja.innerHTML = servicios.slice(0, 6).map((s) => {
    const precio = Number(s.precio) > 0 ? H.moneda(s.precio) : 'Sin costo';
    return filaMenu({
      href: '#servicios',
      icono: s.icono || 'icon-stetho',
      titulo: s.nombre,
      detalle: s.descripcion || 'Consulta los detalles con nuestro equipo.',
      dato: `${s.duracion_min} min · ${precio}`,
    });
  }).join('');
}

/* ============================================================
   Equipo desde la API
   ============================================================ */

async function cargarEquipo() {
  const rejilla = document.querySelector('.team-grid');
  if (!rejilla) return;

  try {
    const datos = await H.api.get('/veterinarios', undefined, { sinRedirigir: true });
    if (!datos.veterinarios || !datos.veterinarios.length) return;

    rejilla.innerHTML = datos.veterinarios.slice(0, 4).map((v) => `
      <article class="team-card reveal">
        <div class="team-photo">
          ${v.foto
            ? `<img src="${H.escapar(v.foto)}" alt="${H.escapar(v.nombre)}">`
            : '<svg class="icon"><use href="#icon-stetho"/></svg>'}
        </div>
        <h3>${H.escapar(v.nombre)}</h3>
        <p class="team-role">${H.escapar(H.ETIQUETA_ESPECIALIDAD[v.especialidad] || v.especialidad)}</p>
        <p class="team-reg">Tarjeta profesional ${H.escapar(v.licencia)}</p>
      </article>`).join('');

    revelar(rejilla);
    pintarMenuEquipo(datos.veterinarios);
  } catch (error) {
    // Igual que con los servicios: se conserva el equipo de ejemplo del HTML y
    // el motivo queda en consola.
    console.warn('[landing] no se pudo cargar el equipo, se muestra el de ejemplo:', error);
  }
}

function pintarMenuEquipo(veterinarios) {
  const caja = document.getElementById('navEquipo');
  if (!caja) return;

  caja.innerHTML = veterinarios.slice(0, 5).map((v) => filaMenu({
    href: '#equipo',
    foto: v.foto || '',
    icono: 'icon-stetho',
    titulo: v.nombre,
    detalle: H.ETIQUETA_ESPECIALIDAD[v.especialidad] || v.especialidad,
    dato: v.licencia,
  })).join('');
}

/* ============================================================
   Modal de detalle de servicio
   ============================================================ */

function initServiceModal() {
  const cards = document.querySelectorAll('.card[data-service]');
  const overlay = document.getElementById('serviceModal');
  if (!cards.length || !overlay) return;

  const modalIcon = document.getElementById('modalIcon').querySelector('use');
  const modalTitle = document.getElementById('modalTitle');
  const modalDetail = document.getElementById('modalDetail');
  const modalIncludes = document.getElementById('modalIncludes');
  const modalDuration = document.getElementById('modalDuration');
  const modalPrice = document.getElementById('modalPrice');
  const modalCta = document.getElementById('modalCta');
  const closeBtn = document.getElementById('modalClose');

  let lastFocused = null;

  const openModal = (card) => {
    const { service, icon, detail, includes, duration, price } = card.dataset;

    modalIcon.setAttribute('href', `#${icon}`);
    modalTitle.textContent = service;
    modalDetail.textContent = detail;
    modalDuration.textContent = `⏱ ${duration}`;
    modalPrice.textContent = price;

    modalIncludes.innerHTML = '';
    (includes || '').split(',').forEach((item) => {
      if (!item.trim()) return;
      const li = document.createElement('li');
      li.textContent = item.trim();
      modalIncludes.appendChild(li);
    });

    // El botón lleva al agendamiento real según haya sesión o no.
    const usuario = H.sesion.usuario();
    modalCta.href = !usuario
      ? H.ruta('registro.html')
      : usuario.rol === 'cliente' ? H.ruta('cliente/agendar.html') : H.panelDe(usuario.rol);

    lastFocused = document.activeElement;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    closeBtn.focus();
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  };

  cards.forEach((card) => {
    if (card.dataset.conectado) return;
    card.dataset.conectado = '1';
    card.addEventListener('click', () => openModal(card));
  });

  if (!overlay.dataset.conectado) {
    overlay.dataset.conectado = '1';
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
    });
  }
}

/* ============================================================
   Adopciones — del tablero al formulario

   Las tarjetas del tablero están escritas en el HTML, cada una con su
   foto y su encuadre, y llevan el id de su publicación en
   data-publicacion. Aquí se le pregunta a la API por esas
   publicaciones: las que siguen disponibles cambian su enlace por el
   botón que abre el formulario, y las que ya tienen hogar lo dicen.

   Si la API no responde, las tarjetas se quedan con el enlace a
   contacto que traen del HTML. El tablero es lo primero que mira quien
   entra a adoptar y no puede quedarse mudo por un fallo de red.

   El formulario NO pide cuenta: quien adopta casi nunca es cliente de
   la clínica todavía, y obligarlo a registrarse antes de preguntar es
   perder a la familia en la puerta. Lo que escriba lo lee la
   administración en Comunidad → Solicitudes, que es donde se prepara
   la entrevista.
   ============================================================ */

const ADOPCION_CERRADA = {
  reservado: 'Otra familia va adelante',
  adoptado: 'Ya encontró hogar',
  retirado: 'Publicación cerrada',
};

let publicacionAbierta = null;
let focoPrevioAdopcion = null;

async function cargarAdopciones() {
  const tarjetas = document.querySelectorAll('.pet-card[data-publicacion]');
  if (!tarjetas.length) return;

  let publicaciones;
  try {
    // 'todos' y no 'disponible': hace falta distinguir la mascota que ya fue
    // adoptada —y se marca en su tarjeta— de la que todavía no está en la
    // base, que se deja tal como viene del HTML.
    const datos = await H.api.get(
      '/comunidad/adopciones', { estado: 'todos', limite: 200 }, { sinRedirigir: true }
    );
    publicaciones = datos.publicaciones || [];
  } catch (error) {
    console.warn('[landing] no se pudo consultar el tablero de adopciones:', error);
    return;
  }

  const porId = new Map(publicaciones.map((p) => [String(p.id), p]));

  tarjetas.forEach((tarjeta) => {
    const publicacion = porId.get(tarjeta.dataset.publicacion);
    if (!publicacion) return;

    if (publicacion.estado === 'disponible') activarAdopcion(tarjeta, publicacion);
    else cerrarTarjeta(tarjeta, publicacion);
  });
}

/**
 * Cambia el enlace de la tarjeta por un botón que abre el formulario.
 *
 * Se conserva el texto que ya tenía ("Quiero adoptarlo →" o "adoptarla"),
 * que está escrito en el género de cada mascota.
 */
function activarAdopcion(tarjeta, publicacion) {
  const enlace = tarjeta.querySelector('.pet-link');
  if (!enlace) return;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'pet-link';
  boton.innerHTML = enlace.innerHTML;
  boton.addEventListener('click', () => abrirAdopcion(publicacion));

  enlace.replaceWith(boton);
}

/** La mascota ya no está disponible: se dice y se quita la invitación. */
function cerrarTarjeta(tarjeta, publicacion) {
  const enlace = tarjeta.querySelector('.pet-link');
  if (!enlace) return;

  const aviso = document.createElement('span');
  aviso.className = 'pet-link pet-link-cerrado';
  aviso.textContent = ADOPCION_CERRADA[publicacion.estado] || 'Ya no está disponible';

  enlace.replaceWith(aviso);
  tarjeta.classList.add('pet-card-cerrada');
}

function initAdopcionModal() {
  const overlay = document.getElementById('adopcionModal');
  const form = document.getElementById('adopcionForm');
  if (!overlay || !form) return;

  // El sello que el servidor exige a los formularios abiertos se firma al
  // cargar la página y tarda unos segundos en valer: hay que pedirlo aquí y
  // no al enviar. Esto además mete el campo trampa dentro del formulario.
  H.prepararFormularioPublico(form);

  document.getElementById('adopcionClose').addEventListener('click', cerrarAdopcion);
  document.getElementById('adopcionListo').addEventListener('click', cerrarAdopcion);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarAdopcion();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) cerrarAdopcion();
  });

  form.addEventListener('submit', enviarSolicitud);
}

function abrirAdopcion(publicacion) {
  const overlay = document.getElementById('adopcionModal');
  const form = document.getElementById('adopcionForm');
  if (!overlay || !form) return;

  publicacionAbierta = publicacion;

  document.getElementById('adopcionTitulo').textContent = `Quiero adoptar a ${publicacion.nombre}`;
  document.getElementById('adopcionMotivoEtiqueta').textContent =
    `¿Por qué quieres adoptar a ${publicacion.nombre}? *`;

  form.reset();
  form.hidden = false;
  document.getElementById('adopcionExito').hidden = true;
  H.limpiarError(document.getElementById('adopcionError'));

  // A quien ya entró con su cuenta se le ahorra escribir lo que la clínica ya
  // sabe. El formulario es el mismo: la solicitud queda ligada a su usuario.
  const usuario = H.sesion.usuario();
  if (usuario) {
    form.elements.nombre.value = usuario.nombre || '';
    form.elements.email.value = usuario.email || '';
    form.elements.telefono.value = usuario.telefono || '';
  }

  focoPrevioAdopcion = document.activeElement;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  form.elements.nombre.focus();
}

function cerrarAdopcion() {
  const overlay = document.getElementById('adopcionModal');
  if (!overlay) return;

  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (focoPrevioAdopcion) focoPrevioAdopcion.focus();
}

async function enviarSolicitud(e) {
  e.preventDefault();
  if (!publicacionAbierta) return;

  const form = e.target;
  const cuerpo = leerFormulario(form);

  // `compromiso` es una casilla de esta pantalla, no un campo de la API: se
  // comprueba aquí y se quita del cuerpo antes de enviarlo.
  const aceptado = cuerpo.compromiso;
  delete cuerpo.compromiso;

  if (!aceptado) {
    errorAdopcion('Confirma que aceptas la entrevista y el seguimiento.');
    return;
  }
  if (!cuerpo.motivo || cuerpo.motivo.length < 20) {
    errorAdopcion('Cuéntanos en un par de líneas por qué quieres adoptarlo.');
    return;
  }

  H.limpiarError(document.getElementById('adopcionError'));
  const boton = form.querySelector('button[type="submit"]');

  await H.conBoton(boton, 'Enviando…', async () => {
    try {
      const datos = await H.api.post(
        `/comunidad/adopciones/${publicacionAbierta.id}/solicitudes`,
        await H.conAntiBots(cuerpo, form),
        { sinRedirigir: true }
      );

      form.hidden = true;
      document.getElementById('adopcionExitoTexto').textContent =
        datos.mensaje || 'Te contactamos para la entrevista.';
      document.getElementById('adopcionExito').hidden = false;
    } catch (error) {
      errorAdopcion(error);
    }
  });
}

function errorAdopcion(error) {
  H.mostrarError(
    document.getElementById('adopcionError'),
    typeof error === 'string' ? new Error(error) : error
  );
}

/**
 * El cuerpo que se manda a la API a partir del formulario.
 *
 * Los campos vacíos no se envían: la ciudad o el documento son opcionales,
 * pero '' no es ni un número ni una de las opciones de "tipo de vivienda", y
 * el servidor los rechazaría con un error que no le dice nada a quien
 * escribe.
 */
function leerFormulario(form) {
  const cuerpo = {};

  Array.from(form.elements).forEach((campo) => {
    if (!campo.name || campo.disabled) return;

    if (campo.type === 'checkbox') {
      cuerpo[campo.name] = campo.checked;
      return;
    }

    // De un grupo de radios solo cuenta el marcado; si se leyeran todos,
    // ganaría el último del HTML en vez del que eligió la persona.
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

/* ============================================================
   Testimonios — los comentarios de la página

   Se leen y se escriben sin cuenta: quien deja el suyo lo ve
   publicado en la lista de al lado en el momento, sin recargar y
   sin que nadie lo apruebe antes. Lo que decide si entra es el
   filtro de palabras del servidor, no este archivo.

   Si la API no responde se queda el comentario de ejemplo del
   HTML, como en el resto de la landing.
   ============================================================ */

const TESTIMONIOS_VISIBLES = 3;

function initTestimonios() {
  const form = document.getElementById('testimonioForm');
  if (!form) return;

  // El sello que el servidor exige a los formularios abiertos tarda unos
  // segundos en valer: se pide al cargar la página y no al enviar. Esto
  // además mete el campo trampa dentro del formulario.
  H.prepararFormularioPublico(form);

  form.addEventListener('submit', enviarTestimonio);

  const otro = document.getElementById('testimonioOtro');
  if (otro) otro.addEventListener('click', () => volverAlFormulario(form));
}

async function cargarTestimonios() {
  const lista = document.getElementById('testimoniosLista');
  if (!lista) return;

  try {
    const datos = await H.api.get(
      '/comunidad/testimonios', { limite: TESTIMONIOS_VISIBLES }, { sinRedirigir: true }
    );
    if (!datos.testimonios || !datos.testimonios.length) return;

    lista.innerHTML = datos.testimonios.map(tarjetaTestimonio).join('');
    lista.dataset.desdeApi = '1';
    revelar(lista);
  } catch (error) {
    console.warn('[landing] no se pudieron cargar los comentarios, se muestra el de ejemplo:', error);
  }
}

function tarjetaTestimonio(testimonio) {
  return `
    <blockquote class="testimonio-card reveal">
      <svg class="icon quote-icon"><use href="#icon-heart"/></svg>
      <p>"${H.escapar(testimonio.mensaje)}"</p>
      <footer>
        <span class="autor">${H.escapar(testimonio.nombre)}</span>
        <span class="cargo">${H.escapar(H.fechaLarga(testimonio.creado_en))}</span>
      </footer>
    </blockquote>`;
}

/**
 * Pone el comentario recién publicado arriba del todo.
 *
 * No se vuelve a pedir la lista entera: el servidor devuelve el comentario ya
 * guardado. Mientras no había ninguno publicado, la lista mostraba el de
 * ejemplo del HTML; el primero de verdad lo reemplaza.
 */
function ponerTestimonio(testimonio) {
  const lista = document.getElementById('testimoniosLista');
  if (!lista || !testimonio) return;

  if (lista.dataset.desdeApi !== '1') {
    lista.innerHTML = '';
    lista.dataset.desdeApi = '1';
  }

  lista.insertAdjacentHTML('afterbegin', tarjetaTestimonio(testimonio));
  Array.from(lista.children).slice(TESTIMONIOS_VISIBLES).forEach((tarjeta) => tarjeta.remove());
  revelar(lista);
}

async function enviarTestimonio(e) {
  e.preventDefault();

  const form = e.target;
  const cuerpo = leerFormulario(form);

  // Los mismos mínimos que el esquema del servidor, dichos con palabras que
  // le sirvan a quien está escribiendo.
  if (!cuerpo.nombre) {
    errorTestimonio('Dinos con qué nombre quieres que aparezca tu comentario.');
    return;
  }
  if (!cuerpo.mensaje || cuerpo.mensaje.length < 15) {
    errorTestimonio('Cuéntanos un poco más: en una línea no se entiende cómo te fue.');
    return;
  }

  H.limpiarError(document.getElementById('testimonioError'));
  const boton = form.querySelector('button[type="submit"]');

  await H.conBoton(boton, 'Publicando…', async () => {
    try {
      const datos = await H.api.post(
        '/comunidad/testimonios',
        await H.conAntiBots(cuerpo, form),
        { sinRedirigir: true }
      );

      ponerTestimonio(datos.testimonio);

      form.hidden = true;
      document.getElementById('testimonioExitoTexto').textContent =
        datos.mensaje || 'Tu comentario ya está publicado.';
      document.getElementById('testimonioExito').hidden = false;
    } catch (error) {
      errorTestimonio(error);
    }
  });
}

function volverAlFormulario(form) {
  form.reset();
  form.hidden = false;
  document.getElementById('testimonioExito').hidden = true;
  H.limpiarError(document.getElementById('testimonioError'));
  form.elements.nombre.focus();
}

function errorTestimonio(error) {
  H.mostrarError(
    document.getElementById('testimonioError'),
    typeof error === 'string' ? new Error(error) : error
  );
}

/* ============================================================
   Tienda y carrito

   El catálogo es público, así que la vitrina se pinta sin sesión y el
   carrito vive en este navegador. La cuenta solo hace falta al pagar:
   el pedido queda a nombre de un cliente, descuenta del mismo
   inventario que el mostrador y se sigue desde el portal.

   Si la API no responde se quedan las tarjetas escritas en el HTML,
   que no llevan artículo y por eso solo invitan a escribir.
   ============================================================ */

const CLAVE_CARRITO = 'huellitas_carrito';
const POR_TANDA = 12;

let catalogo = [];
let categoriaActiva = 'todo';
let visibles = POR_TANDA;
// Pasarelas en línea que hoy tienen credenciales. Suele estar vacío: mientras
// no las haya, no se pinta un botón de pago que no cobraría nada.
let pasarelas = [];
let focoPrevioPago = null;

function initTienda() {
  conectarVitrina();
  conectarCarrito();
  conectarPago();
  pintarContadorCarrito();
  cargarCatalogo();
}

/* ------------------------------------------------------------
   La vitrina
   ------------------------------------------------------------ */

async function cargarCatalogo() {
  try {
    const [datos, cats] = await Promise.all([
      H.api.get('/tienda/articulos', { limite: 200 }, { sinRedirigir: true }),
      H.api.get('/tienda/categorias', undefined, { sinRedirigir: true }),
    ]);

    // Los medicamentos con fórmula no se venden desde la página pública: sin
    // la receta adjunta el pedido no se puede despachar y aquí no hay dónde
    // adjuntarla. Se piden desde el portal, que sí la pide.
    catalogo = (datos.articulos || []).filter((a) => !Number(a.requiere_receta));
    if (!catalogo.length) return;

    pintarFiltros(cats.categorias || []);
    pintarCatalogo();
    pintarMenuTienda();
  } catch (error) {
    console.warn('[tienda] no se pudo leer el catálogo:', error);
  }
}

/**
 * La ficha "Tienda" del menú, con los destacados del catálogo.
 *
 * Sin esto se quedaba con cuatro productos escritos a mano, con su foto y su
 * precio: en cuanto la clínica cambia una tarifa, el menú miente.
 */
function pintarMenuTienda() {
  const caja = document.getElementById('navTienda');
  if (!caja) return;

  const destacados = catalogo.filter((a) => Number(a.destacado) && Number(a.existencias) > 0);
  const lista = (destacados.length >= 4 ? destacados : catalogo).slice(0, 4);
  if (!lista.length) return;

  caja.innerHTML = lista.map((a) => filaMenu({
    href: '#tienda',
    foto: H.rutaImagen(a.imagen),
    icono: 'icon-bone',
    titulo: a.nombre,
    detalle: String(a.descripcion || a.categoria || '').slice(0, 60),
    dato: H.moneda(a.precio),
  })).join('');
}

function pintarFiltros(categorias) {
  const caja = document.getElementById('shopFiltros');
  if (!caja) return;

  const conArticulos = categorias.filter((c) => catalogo.some((a) => a.categoria_id === c.id));
  if (conArticulos.length < 2) return;

  caja.innerHTML = [{ id: 'todo', nombre: 'Todo' }, ...conArticulos]
    .map((c) => `
      <button type="button" class="shop-filtro${c.id === 'todo' ? ' activo' : ''}" data-cat="${c.id}">
        ${H.escapar(c.nombre)}
      </button>`)
    .join('');
  caja.hidden = false;

  caja.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-cat]');
    if (!boton) return;

    categoriaActiva = boton.dataset.cat === 'todo' ? 'todo' : Number(boton.dataset.cat);
    visibles = POR_TANDA;
    caja.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('activo', b === boton));
    pintarCatalogo();
  });
}

/** Los artículos del filtro activo. */
function delFiltro() {
  return categoriaActiva === 'todo'
    ? catalogo
    : catalogo.filter((a) => a.categoria_id === categoriaActiva);
}

function pintarCatalogo() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;

  const lista = delFiltro();
  grid.innerHTML = lista.slice(0, visibles).map(tarjetaArticulo).join('');
  revelar(grid);

  const mas = document.getElementById('shopMas');
  const boton = document.getElementById('shopMasBtn');
  const faltan = lista.length - visibles;

  if (mas && boton) {
    mas.hidden = faltan <= 0;
    boton.textContent = `Ver ${Math.min(faltan, POR_TANDA)} productos más`;
  }
}

function tarjetaArticulo(articulo) {
  const agotado = Number(articulo.existencias) <= 0;
  const foto = H.rutaImagen(articulo.imagen);
  const etiqueta = Number(articulo.destacado) ? '<span class="shop-tag">Recomendado</span>' : '';

  return `
    <article class="shop-card reveal">
      <div class="shop-img">
        ${foto
          ? `<img loading="lazy" decoding="async" src="${H.escapar(foto)}" alt="${H.escapar(articulo.nombre)}">`
          : `<span class="shop-sin-foto"><svg class="icon"><use href="#icon-paw"/></svg></span>`}
        ${etiqueta}
      </div>
      <p class="shop-cat">${H.escapar(articulo.categoria || '')}</p>
      <h3>${H.escapar(articulo.nombre)}</h3>
      <p class="shop-price">${H.escapar(H.moneda(articulo.precio))}</p>
      ${agotado
        ? '<button class="btn btn-outline" disabled>Agotado</button>'
        : `<button class="btn btn-outline add-to-cart" data-articulo="${articulo.id}">Agregar</button>`}
    </article>`;
}

function conectarVitrina() {
  const grid = document.getElementById('shopGrid');
  const masBtn = document.getElementById('shopMasBtn');
  if (!grid) return;

  // Delegado, no un listener por tarjeta: la rejilla se vuelve a pintar cada
  // vez que se cambia de filtro o se piden más productos.
  grid.addEventListener('click', (evento) => {
    const boton = evento.target.closest('.add-to-cart');
    if (!boton) return;

    const articulo = catalogo.find((a) => a.id === Number(boton.dataset.articulo));

    // Las tarjetas de respaldo del HTML no tienen artículo: sin catálogo no
    // hay carrito que valga, así que se invita a escribir.
    if (!articulo) {
      const nombre = boton.closest('.shop-card').querySelector('h3').textContent.trim();
      avisoFlotante(`${nombre}: escríbenos y coordinamos la entrega.`);
      return;
    }

    agregarAlCarrito(articulo);
  });

  if (masBtn) {
    masBtn.addEventListener('click', () => {
      visibles += POR_TANDA;
      pintarCatalogo();
    });
  }
}

/* ------------------------------------------------------------
   El carrito, guardado en este navegador
   ------------------------------------------------------------ */

function carrito() {
  try {
    const crudo = localStorage.getItem(CLAVE_CARRITO);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function guardarCarrito(lista) {
  try {
    localStorage.setItem(CLAVE_CARRITO, JSON.stringify(lista));
  } catch (error) {
    // Navegación privada con el almacenamiento bloqueado: el carrito se pierde
    // al recargar, pero la compra en curso sigue funcionando.
    console.warn('[tienda] no se pudo guardar el carrito:', error);
  }
  pintarContadorCarrito();
}

function totalCarrito() {
  return carrito().reduce((suma, i) => suma + Number(i.precio) * Number(i.cantidad), 0);
}

function agregarAlCarrito(articulo) {
  const lista = carrito();
  const linea = lista.find((i) => i.id === articulo.id);
  const existencias = Number(articulo.existencias);

  if ((linea ? linea.cantidad : 0) + 1 > existencias) {
    avisoFlotante(`Solo quedan ${existencias} unidades de ${articulo.nombre}.`);
    return;
  }

  if (linea) {
    linea.cantidad += 1;
  } else {
    lista.push({
      id: articulo.id,
      nombre: articulo.nombre,
      precio: Number(articulo.precio),
      imagen: articulo.imagen || '',
      cantidad: 1,
    });
  }

  guardarCarrito(lista);
  avisoFlotante(`${articulo.nombre} va en tu carrito.`);
}

function cambiarCantidad(id, delta) {
  const lista = carrito();
  const linea = lista.find((i) => i.id === id);
  if (!linea) return;

  const articulo = catalogo.find((a) => a.id === id);
  const tope = articulo ? Number(articulo.existencias) : linea.cantidad + delta;

  if (linea.cantidad + delta > tope) {
    avisoFlotante(`Solo quedan ${tope} unidades de ${linea.nombre}.`);
    return;
  }

  linea.cantidad += delta;
  guardarCarrito(linea.cantidad > 0 ? lista : lista.filter((i) => i.id !== id));
  pintarCarrito();
}

function quitarDelCarrito(id) {
  guardarCarrito(carrito().filter((i) => i.id !== id));
  pintarCarrito();
}

function pintarContadorCarrito() {
  const cuenta = document.getElementById('carritoCuenta');
  if (!cuenta) return;

  const unidades = carrito().reduce((suma, i) => suma + Number(i.cantidad), 0);
  cuenta.textContent = unidades > 99 ? '99+' : String(unidades);
  cuenta.hidden = unidades === 0;
}

function pintarCarrito() {
  const lista = document.getElementById('carritoLista');
  const pie = document.getElementById('carritoPie');
  if (!lista || !pie) return;

  const items = carrito();

  if (!items.length) {
    lista.innerHTML = `
      <div class="carrito-vacio">
        <span class="carrito-vacio-icono"><svg class="icon"><use href="#icon-cart"/></svg></span>
        <p>Todavía no has agregado nada.</p>
        <a class="btn btn-outline" href="#tienda" id="carritoIrTienda">Ver la tienda</a>
      </div>`;
    pie.hidden = true;
    return;
  }

  lista.innerHTML = items.map((i) => {
    const foto = H.rutaImagen(i.imagen);
    return `
      <article class="carrito-item">
        <div class="carrito-item-foto">
          ${foto ? `<img loading="lazy" src="${H.escapar(foto)}" alt="${H.escapar(i.nombre)}">` : ''}
        </div>
        <div class="carrito-item-cuerpo">
          <h4>${H.escapar(i.nombre)}</h4>
          <p class="carrito-item-precio">${H.escapar(H.moneda(i.precio))} c/u</p>
          <div class="carrito-cantidad">
            <button type="button" data-menos="${i.id}" aria-label="Quitar una unidad">−</button>
            <span>${i.cantidad}</span>
            <button type="button" data-mas="${i.id}" aria-label="Agregar una unidad">+</button>
            <button type="button" class="carrito-quitar" data-quitar="${i.id}">Quitar</button>
          </div>
        </div>
        <p class="carrito-item-total">${H.escapar(H.moneda(Number(i.precio) * Number(i.cantidad)))}</p>
      </article>`;
  }).join('');

  document.getElementById('carritoTotal').textContent = H.moneda(totalCarrito());
  pie.hidden = false;
}

function conectarCarrito() {
  const boton = document.getElementById('carritoBoton');
  const panel = document.getElementById('carritoPanel');
  const velo = document.getElementById('carritoVelo');
  const lista = document.getElementById('carritoLista');
  if (!boton || !panel || !velo || !lista) return;

  boton.addEventListener('click', abrirCarrito);
  velo.addEventListener('click', cerrarCarrito);
  document.getElementById('carritoCerrar').addEventListener('click', cerrarCarrito);
  document.getElementById('carritoPagar').addEventListener('click', irAPagar);

  document.getElementById('carritoVaciar').addEventListener('click', () => {
    guardarCarrito([]);
    pintarCarrito();
  });

  lista.addEventListener('click', (evento) => {
    const objetivo = evento.target.closest('[data-menos],[data-mas],[data-quitar],#carritoIrTienda');
    if (!objetivo) return;

    if (objetivo.id === 'carritoIrTienda') { cerrarCarrito(); return; }
    if (objetivo.dataset.menos) cambiarCantidad(Number(objetivo.dataset.menos), -1);
    else if (objetivo.dataset.mas) cambiarCantidad(Number(objetivo.dataset.mas), 1);
    else quitarDelCarrito(Number(objetivo.dataset.quitar));
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && panel.classList.contains('abierto')) cerrarCarrito();
  });
}

function abrirCarrito() {
  const panel = document.getElementById('carritoPanel');
  const velo = document.getElementById('carritoVelo');

  pintarCarrito();
  velo.hidden = false;
  panel.classList.add('abierto');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('carritoBoton').setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  document.getElementById('carritoCerrar').focus();
}

function cerrarCarrito() {
  const panel = document.getElementById('carritoPanel');
  const velo = document.getElementById('carritoVelo');

  panel.classList.remove('abierto');
  panel.setAttribute('aria-hidden', 'true');
  velo.hidden = true;
  document.getElementById('carritoBoton').setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

/* ------------------------------------------------------------
   Finalizar la compra
   ------------------------------------------------------------ */

/**
 * Del carrito al pago.
 *
 * No pide cuenta: comprar un juguete no tiene por qué obligar a registrarse.
 * Con el nombre y el teléfono la clínica ya puede entregar y cobrar. Si hay
 * sesión de cliente el pedido queda a su nombre y le sale en "Mis pedidos".
 */
function irAPagar() {
  if (!carrito().length) return;

  cerrarCarrito();
  abrirPago();
}

async function abrirPago() {
  const overlay = document.getElementById('pagoModal');
  const form = document.getElementById('pagoForm');
  if (!overlay || !form) return;

  const usuario = H.sesion.usuario();

  form.reset();
  form.hidden = false;
  document.getElementById('pagoExito').hidden = true;
  H.limpiarError(document.getElementById('pagoError'));

  // A quien ya entró con su cuenta se le ahorra escribir lo que la clínica ya
  // sabe; el pedido queda ligado a su ficha de cliente.
  if (usuario) {
    form.elements.nombre.value = usuario.nombre || '';
    form.elements.email.value = usuario.email || '';
    form.elements.telefono.value = usuario.telefono || '';
  }

  document.getElementById('pagoSub').textContent = usuario
    ? 'Confirma a dónde va el pedido y con qué lo pagas.'
    : 'No hace falta crear una cuenta. Con estos datos coordinamos la entrega y el cobro.';

  document.getElementById('pagoTotal').textContent = H.moneda(totalCarrito());

  alternarDomicilio();
  pintarMetodosPago();

  focoPrevioPago = document.activeElement;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  form.elements[usuario ? 'telefono' : 'nombre'].focus();

  // Las pasarelas en línea solo tienen sentido con cuenta: la transacción va a
  // nombre de alguien y se sigue desde el portal. Sin sesión ni se consultan,
  // que además la ruta pide permiso.
  if (!usuario) { pasarelas = []; return; }

  // Va después de abrir para no dejar el botón esperando por una consulta que
  // casi siempre devuelve una lista vacía; cuando llega, se repinta.
  try {
    const datos = await H.api.get('/integraciones/pagos/metodos', undefined, { sinRedirigir: true });
    pasarelas = datos.metodos || [];
    if (pasarelas.length) pintarMetodosPago();
  } catch (error) {
    console.warn('[tienda] no se pudieron leer los métodos de pago:', error);
  }
}

function cerrarPago() {
  const overlay = document.getElementById('pagoModal');
  if (!overlay) return;

  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (focoPrevioPago) focoPrevioPago.focus();
}

/**
 * Los métodos que se pueden elegir.
 *
 * Efectivo y transferencia son de la clínica y no dependen de nadie más. Los
 * de la lista salen de /integraciones/pagos/metodos, que solo devuelve las
 * pasarelas con credenciales puestas: si Wompi no está configurado, no
 * aparece un botón que no cobraría nada.
 */
function pintarMetodosPago() {
  const caja = document.getElementById('pagoOpciones');
  if (!caja) return;

  const elegido = (caja.querySelector('input[name="metodoPago"]:checked') || {}).value || 'efectivo';
  const recoge = document.getElementById('pagoEntrega').value === 'recoger';

  const opciones = [
    {
      valor: 'efectivo',
      titulo: 'Efectivo',
      detalle: recoge
        ? 'Pagas al recoger el pedido en la clínica.'
        : 'Pagas al recibir el pedido. El repartidor lleva cambio.',
    },
    {
      valor: 'transferencia',
      titulo: 'Transferencia o Nequi',
      detalle: 'Te escribimos con los datos de la cuenta y despachamos al confirmar el pago.',
    },
    ...pasarelas.map((p) => ({
      valor: `linea:${p.id}`,
      titulo: p.nombre,
      detalle: `Pago en línea${p.proveedor ? ` con ${p.proveedor}` : ''}.`,
    })),
  ];

  caja.innerHTML = opciones.map((o) => `
    <label class="pago-metodo">
      <input type="radio" name="metodoPago" value="${H.escapar(o.valor)}"${o.valor === elegido ? ' checked' : ''}>
      <span class="pago-metodo-cuerpo">
        <strong>${H.escapar(o.titulo)}</strong>
        <small>${H.escapar(o.detalle)}</small>
      </span>
    </label>`).join('');
}

/** Los campos de dirección solo tienen sentido si el pedido es a domicilio. */
function alternarDomicilio() {
  const entrega = document.getElementById('pagoEntrega');
  const campos = document.getElementById('pagoDomicilio');
  if (!entrega || !campos) return;

  campos.hidden = entrega.value !== 'domicilio';
}

function conectarPago() {
  const overlay = document.getElementById('pagoModal');
  const form = document.getElementById('pagoForm');
  if (!overlay || !form) return;

  document.getElementById('pagoClose').addEventListener('click', cerrarPago);
  document.getElementById('pagoListo').addEventListener('click', cerrarPago);

  document.getElementById('pagoEntrega').addEventListener('change', () => {
    alternarDomicilio();
    pintarMetodosPago();   // el texto del efectivo cambia si se recoge en sede
  });

  overlay.addEventListener('click', (evento) => {
    if (evento.target === overlay) cerrarPago();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && overlay.classList.contains('open')) cerrarPago();
  });

  form.addEventListener('submit', confirmarPedido);

  document.getElementById('pagoVerPedidos').href = H.ruta('cliente/pedidos.html');

  // El sello que el servidor exige a los formularios abiertos se firma al
  // cargar la página y tarda unos segundos en valer: hay que pedirlo aquí y no
  // al enviar. Esto además mete el campo trampa dentro del formulario.
  H.prepararFormularioPublico(form);
}

async function confirmarPedido(evento) {
  evento.preventDefault();

  const form = evento.target;
  const items = carrito();
  if (!items.length) { errorPago('Tu carrito está vacío.'); return; }

  const cuerpo = leerFormulario(form);
  const eleccion = cuerpo.metodoPago || 'efectivo';

  // 'linea:3' es la pasarela 3. Al pedido se le escribe con qué se paga; la
  // transacción se abre después, cuando el pedido ya tiene número.
  const pasarela = eleccion.startsWith('linea:')
    ? pasarelas.find((p) => String(p.id) === eleccion.slice('linea:'.length))
    : null;

  cuerpo.metodoPago = pasarela ? (pasarela.metodo === 'tarjeta' ? 'tarjeta' : 'en_linea') : eleccion;

  if (!cuerpo.nombre) {
    errorPago('Dinos a nombre de quién va el pedido.');
    return;
  }
  if (!cuerpo.telefono) {
    errorPago('Déjanos un teléfono para coordinar la entrega.');
    return;
  }
  if (cuerpo.entrega === 'domicilio' && !cuerpo.direccion) {
    errorPago('Para un envío a domicilio hace falta la dirección.');
    return;
  }
  if (cuerpo.entrega !== 'domicilio') {
    ['direccion', 'barrio', 'ciudad', 'indicaciones'].forEach((campo) => delete cuerpo[campo]);
  }

  // Los artículos van en la petición porque el carrito vive en este navegador.
  // Solo el identificador y la cantidad: el precio lo pone el servidor leyendo
  // el catálogo, que para eso es el que manda.
  cuerpo.items = items.map((i) => ({ articuloId: i.id, cantidad: i.cantidad }));

  H.limpiarError(document.getElementById('pagoError'));
  const boton = form.querySelector('button[type="submit"]');

  await H.conBoton(boton, 'Confirmando…', async () => {
    try {
      const datos = await H.api.post(
        '/tienda/pedidos/directo',
        await H.conAntiBots(cuerpo, form),
        { sinRedirigir: true }
      );
      const pedido = datos.pedido;

      // El pedido ya está hecho: si la pasarela falla, el pedido no se
      // deshace. Se avisa y la clínica lo cobra por otro lado.
      const extra = pasarela ? await abrirTransaccion(pedido, pasarela) : '';

      guardarCarrito([]);
      form.hidden = true;
      mostrarExito(pedido, cuerpo.metodoPago, extra);
    } catch (error) {
      errorPago(error);
    }
  });
}

async function abrirTransaccion(pedido, pasarela) {
  try {
    const pago = await H.api.post('/integraciones/pagos', {
      pasarelaId: pasarela.id,
      pedidoId: pedido.id,
    });

    return pago.listo
      ? `Tu referencia de pago es ${pago.referencia}: termínalo en ${pasarela.nombre}.`
      : `Quedó con la referencia ${pago.referencia}, pero ${pasarela.nombre} todavía no está habilitada. Te escribimos para cerrar el pago.`;
  } catch (error) {
    console.warn('[tienda] no se pudo abrir la transacción:', error);
    return 'No pudimos abrir el pago en línea. Te escribimos para cobrarlo por otro medio.';
  }
}

function mostrarExito(pedido, metodo, extra) {
  const total = H.moneda(pedido.total);
  const recoge = pedido.entrega === 'recoger';

  const COMO = {
    efectivo: recoge
      ? `Ten listos ${total} en efectivo: se pagan al recogerlo en la clínica.`
      : `Ten listos ${total} en efectivo: se pagan al recibirlo.`,
    transferencia: `Te escribimos con los datos de la cuenta para transferir ${total}. El pedido sale cuando confirmemos el pago.`,
    tarjeta: extra,
    en_linea: extra,
  };

  document.getElementById('pagoExitoTitulo').textContent = `Pedido ${pedido.numero} confirmado`;
  document.getElementById('pagoExitoTexto').textContent =
    `${COMO[metodo] || ''} ${recoge ? 'Te avisamos cuando esté listo para recoger.' : 'Te avisamos cuando salga a reparto.'}`.trim();

  // "Mis pedidos" es una pantalla del portal: sin cuenta no lleva a ninguna
  // parte, y quien compró como invitado sigue el pedido por teléfono.
  document.getElementById('pagoVerPedidos').hidden = !H.sesion.usuario();
  document.getElementById('pagoExito').hidden = false;
}

function errorPago(error) {
  H.mostrarError(
    document.getElementById('pagoError'),
    typeof error === 'string' ? new Error(error) : error
  );
}

/** El aviso flotante que ya usa el resto de la página. */
let temporizadorAviso = null;

function avisoFlotante(mensaje) {
  const caja = document.getElementById('toast');
  if (!caja) return;

  caja.textContent = mensaje;
  caja.classList.add('show');

  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => caja.classList.remove('show'), 2600);
}
