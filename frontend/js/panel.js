/* ============================================================
   Estructura común de los paneles: barra lateral, sesión,
   modales y trozos de interfaz que se repiten en varias páginas.
   Requiere api.js y sprite.js cargados antes.
   ============================================================ */

(function (global) {
  'use strict';

  const H = global.Huella;
  const { $, escapar } = H;

  // Las rutas son relativas a la raíz de frontend/; H.ruta() les añade el
  // '../' cuando la página vive en una subcarpeta.
  //
  // Cada entrada declara el permiso que hace falta para verla. El menú se filtra
  // con los permisos que trae la sesión, así que quitarle una capacidad a un rol
  // en seguridad.rol_permisos también le quita la opción del menú, sin tocar
  // este archivo. Las entradas sin `permiso` las ve cualquiera con sesión.
  //
  // `detalle` explica en una línea qué hay dentro. `contador` y `aviso` son
  // claves del resumen que devuelve /dashboard: la primera es el número que
  // sale en la insignia y la segunda, si trae algo, la pinta en caléndula
  // porque hay trabajo pendiente ahí dentro. `avisoTexto` es lo que se lee al
  // pasar el ratón por encima de ese aviso.
  /**
   * Las cuatro secciones de Comunidad son pestañas de la misma página, y el
   * submenú lleva directo a cada una.
   *
   * Se declara aparte porque la administración y el veterinario ven las
   * mismas: repetida en los dos menús, el día que se añada una quinta pestaña
   * solo se acordaría de crecer una de las dos listas.
   */
  const SUBMENU_COMUNIDAD = [
    { texto: 'Mascotas en adopción', href: 'admin/comunidad.html#adopciones' },
    { texto: 'Solicitudes',          href: 'admin/comunidad.html#solicitudes' },
    { texto: 'Mascotas perdidas',    href: 'admin/comunidad.html#perdidas' },
    { texto: 'Seguimientos',         href: 'admin/comunidad.html#seguimientos' },
  ];

  const MENUS = {
    cliente: [
      { texto: 'Resumen',      href: 'cliente/dashboard.html', icono: 'icon-panel',    detalle: 'Tu actividad y avisos' },
      { texto: 'Mis mascotas', href: 'cliente/mascotas.html',  icono: 'icon-paw',      detalle: 'Fichas, fotos y vacunas',   contador: 'mascotas', permiso: ['mascotas.ver_propias', 'mascotas.ver_todas'] },
      { texto: 'Agendar cita', href: 'cliente/agendar.html',   icono: 'icon-mas',      detalle: 'Elige servicio, día y hora', permiso: ['citas.crear'] },
      { texto: 'Mis citas',    href: 'cliente/citas.html',     icono: 'icon-calendar', detalle: 'Próximas y anteriores',     contador: 'proximas', aviso: 'pendientes', avisoTexto: 'sin confirmar', permiso: ['citas.ver_propias', 'citas.ver_todas'] },
      { texto: 'Historia clínica', href: 'cliente/historia.html', icono: 'icon-stetho', detalle: 'Consultas, vacunas y exámenes', permiso: ['historia.ver_propia', 'historia.ver_todas'] },
      { texto: 'Mis facturas', href: 'cliente/facturas.html',  icono: 'icon-recibo',   detalle: 'Pagos y saldos',            contador: 'facturasPendientes', aviso: 'facturasPendientes', avisoTexto: 'por pagar', permiso: ['facturas.ver_propias', 'facturas.ver_todas'] },
      { texto: 'Avisos',       href: 'notificaciones.html',    icono: 'icon-alerta',   detalle: 'Novedades de la clínica',   contador: 'avisos', aviso: 'avisos', avisoTexto: 'sin leer', permiso: ['notificaciones.ver'] },
      { texto: 'Videoconsulta', href: 'cliente/telemedicina.html', icono: 'icon-stetho', detalle: 'Atención remota y chat',  permiso: ['telemedicina.ver_propias'] },
      { texto: 'Tienda',       href: 'cliente/tienda.html',    icono: 'icon-caja',     detalle: 'Alimento, accesorios y más', permiso: ['tienda.comprar'] },
      { texto: 'Mis pedidos',  href: 'cliente/pedidos.html',   icono: 'icon-caja',     detalle: 'Estado y domicilios',       permiso: ['pedidos.ver_propios'] },
      { texto: 'Plan y puntos', href: 'cliente/plan.html',     icono: 'icon-heart',    detalle: 'Beneficios y recompensas',  permiso: ['planes.ver', 'puntos.ver'] },
      { texto: 'Adopciones',   href: 'cliente/adopciones.html', icono: 'icon-paw',     detalle: 'Mascotas que buscan hogar', permiso: ['adopciones.ver'] },
      { texto: 'Ayuda y PQRS', href: 'cliente/soporte.html',   icono: 'icon-shield',   detalle: 'Peticiones, quejas y reclamos', permiso: ['tickets.crear'] },
      { texto: 'Mi perfil',    href: 'cliente/perfil.html',    icono: 'icon-user',     detalle: 'Tus datos y contraseña',    permiso: ['perfil.ver'] },
    ],
    veterinario: [
      { texto: 'Resumen',    href: 'veterinario/dashboard.html', icono: 'icon-panel',    detalle: 'Tu día de un vistazo' },
      { texto: 'Urgencias',  href: 'veterinario/urgencias.html', icono: 'icon-heart',    detalle: 'Sala en vivo por gravedad', contador: 'urgencias', aviso: 'urgenciasEspera', avisoTexto: 'en espera', permiso: ['urgencias.ver'] },
      { texto: 'Agenda',     href: 'veterinario/agenda.html',    icono: 'icon-calendar', detalle: 'Citas por día y horarios',  contador: 'hoy',       aviso: 'porConfirmar', avisoTexto: 'sin confirmar', permiso: ['citas.ver_todas'] },
      { texto: 'Hospitalización', href: 'veterinario/hospitalizacion.html', icono: 'icon-house', detalle: 'Internados y controles', contador: 'hospitalizados', aviso: 'controlesVencidos', avisoTexto: 'sin control', permiso: ['hospitalizacion.ver', 'hospitalizacion.gestionar'] },
      { texto: 'Pacientes',  href: 'veterinario/pacientes.html', icono: 'icon-paw',      detalle: 'Historia de cada mascota',  contador: 'pacientes', permiso: ['mascotas.ver_todas'] },
      { texto: 'Laboratorio', href: 'veterinario/laboratorio.html', icono: 'icon-micro', detalle: 'Órdenes, muestras y resultados', aviso: 'examenesPendientes', avisoTexto: 'por validar', permiso: ['laboratorio.ver'] },
      { texto: 'Imágenes',   href: 'veterinario/imagenes.html',  icono: 'icon-micro',    detalle: 'Radiografías e informes',   permiso: ['imagenes.ver'] },
      { texto: 'Videoconsulta', href: 'veterinario/telemedicina.html', icono: 'icon-stetho', detalle: 'Atención remota',       permiso: ['telemedicina.atender'] },
      // La página es la misma de administración y el rol ya trae el permiso:
      // sin este enlace, quien evalúa las solicitudes de adopción no tenía
      // por dónde llegar a ellas.
      {
        texto: 'Comunidad', href: 'admin/comunidad.html', icono: 'icon-paw',
        detalle: 'Adopciones y mascotas perdidas',
        permiso: ['adopciones.gestionar', 'perdidas.gestionar'],
        submenu: SUBMENU_COMUNIDAD,
      },
      { texto: 'Inventario', href: 'admin/inventario.html',      icono: 'icon-caja',     detalle: 'Existencias y vencimientos', permiso: ['inventario.ver'] },
      { texto: 'Alertas',    href: 'admin/alertas.html',         icono: 'icon-alerta',   detalle: 'Lo que no puede esperar',   contador: 'alertas', aviso: 'alertasCriticas', avisoTexto: 'críticas', permiso: ['alertas.ver'] },
      { texto: 'Avisos',     href: 'notificaciones.html',        icono: 'icon-alerta',   detalle: 'Novedades y recordatorios', contador: 'avisos', aviso: 'avisos', avisoTexto: 'sin leer', permiso: ['notificaciones.ver'] },
    ],
    admin: [
      { texto: 'Resumen',      href: 'admin/dashboard.html',    icono: 'icon-panel',    detalle: 'Indicadores de la clínica' },
      { texto: 'Citas',        href: 'admin/citas.html',        icono: 'icon-calendar', detalle: 'Todas las citas y su estado', contador: 'citasHoy',     aviso: 'citasPendientes', avisoTexto: 'sin confirmar', permiso: ['citas.ver_todas'] },
      { texto: 'Usuarios',     href: 'admin/usuarios.html',     icono: 'icon-users',    detalle: 'Cuentas, roles y bloqueos',   contador: 'clientes',     permiso: ['usuarios.ver'] },
      { texto: 'Veterinarios', href: 'admin/veterinarios.html', icono: 'icon-stetho',   detalle: 'Perfiles y especialidades',   contador: 'veterinarios', permiso: ['veterinarios.gestionar'] },
      { texto: 'Servicios',    href: 'admin/servicios.html',    icono: 'icon-shield',   detalle: 'Precios y duración',          contador: 'servicios',    permiso: ['servicios.gestionar'] },
      { texto: 'Urgencias',    href: 'veterinario/urgencias.html', icono: 'icon-heart',  detalle: 'Sala en vivo por gravedad',   contador: 'urgencias', aviso: 'urgenciasEspera', avisoTexto: 'en espera', permiso: ['urgencias.ver'] },
      { texto: 'Hospitalización', href: 'veterinario/hospitalizacion.html', icono: 'icon-house', detalle: 'Internados, jaulas y controles', contador: 'hospitalizados', aviso: 'controlesVencidos', avisoTexto: 'sin control', permiso: ['hospitalizacion.ver'] },
      { texto: 'Laboratorio',  href: 'veterinario/laboratorio.html', icono: 'icon-micro', detalle: 'Órdenes, muestras y resultados', aviso: 'examenesPendientes', avisoTexto: 'por validar', permiso: ['laboratorio.ver'] },
      { texto: 'Imágenes',     href: 'veterinario/imagenes.html', icono: 'icon-micro',   detalle: 'Radiografías e informes',     permiso: ['imagenes.ver'] },
      { texto: 'Farmacia',     href: 'admin/farmacia.html',     icono: 'icon-syringe',  detalle: 'Recetas y dispensación',      permiso: ['farmacia.dispensar', 'recetas.ver_todas'] },
      { texto: 'Inventario',   href: 'admin/inventario.html',   icono: 'icon-caja',     detalle: 'Stock, compras y proveedores', contador: 'productos',   aviso: 'stockBajo', avisoTexto: 'en mínimos', permiso: ['inventario.ver'] },
      { texto: 'Facturación',  href: 'admin/facturacion.html',  icono: 'icon-recibo',   detalle: 'Facturas, pagos y cartera',   contador: 'facturasPendientes', aviso: 'facturasPendientes', avisoTexto: 'sin cobrar', permiso: ['facturas.ver_todas'] },
      { texto: 'Tienda',       href: 'admin/tienda.html',       icono: 'icon-caja',     detalle: 'Catálogo, pedidos y domicilios', contador: 'pedidosAbiertos', aviso: 'pedidosAbiertos', avisoTexto: 'por despachar', permiso: ['tienda.gestionar', 'pedidos.ver_todos'] },
      { texto: 'Caja',         href: 'admin/caja.html',         icono: 'icon-recibo',   detalle: 'Apertura, movimientos y cuadre', permiso: ['caja.operar'] },
      { texto: 'Planes y puntos', href: 'admin/fidelizacion.html', icono: 'icon-heart', detalle: 'Planes de salud y recompensas', permiso: ['planes.gestionar', 'puntos.gestionar'] },
      // Sin el submenú, llegar a las mascotas en adopción eran dos clics y
      // saber de antemano que estaban dentro de Comunidad.
      {
        texto: 'Comunidad', href: 'admin/comunidad.html', icono: 'icon-paw',
        detalle: 'Adopciones y mascotas perdidas',
        permiso: ['adopciones.gestionar', 'perdidas.gestionar'],
        submenu: SUBMENU_COMUNIDAD,
      },
      { texto: 'PQRS',         href: 'admin/soporte.html',      icono: 'icon-shield',   detalle: 'Peticiones, quejas y encuestas', contador: 'pqrsAbiertas', aviso: 'pqrsVencidas', avisoTexto: 'fuera de plazo', permiso: ['tickets.ver_todos', 'tickets.gestionar'] },
      { texto: 'Personal',     href: 'admin/personal.html',     icono: 'icon-users',    detalle: 'Turnos, ausencias y comisiones', permiso: ['personal.ver', 'personal.gestionar'] },
      { texto: 'Equipos',      href: 'admin/equipos.html',      icono: 'icon-shield',   detalle: 'Mantenimiento y calibración', aviso: 'equiposPendientes', avisoTexto: 'por revisar', permiso: ['equipos.ver'] },
      { texto: 'Bioseguridad', href: 'admin/bioseguridad.html', icono: 'icon-shield',   detalle: 'Protocolos, residuos e incidentes', permiso: ['bioseguridad.ver'] },
      { texto: 'Reportes',     href: 'admin/reportes.html',     icono: 'icon-grafica',  detalle: 'Ingresos, citas y rendimiento', permiso: ['reportes.ver'] },
      { texto: 'Alertas',      href: 'admin/alertas.html',      icono: 'icon-alerta',   detalle: 'Lo que no puede esperar',     contador: 'alertas', aviso: 'alertasCriticas', avisoTexto: 'críticas', permiso: ['alertas.ver'] },
      { texto: 'Avisos',       href: 'notificaciones.html',     icono: 'icon-alerta',   detalle: 'Bandeja y recordatorios',     contador: 'avisos', aviso: 'avisos', avisoTexto: 'sin leer', permiso: ['notificaciones.ver'] },
      { texto: 'Integraciones', href: 'admin/integraciones.html', icono: 'icon-shield', detalle: 'DIAN, pagos y WhatsApp',      permiso: ['integraciones.ver'] },
      { texto: 'Seguridad',    href: 'admin/seguridad.html',    icono: 'icon-salir',    detalle: 'Accesos, auditoría y permisos', permiso: ['auditoria.ver', 'roles.ver'] },
    ],
  };

  /**
   * ¿El enlace del menú es la página actual?
   *
   * Vercel sirve el sitio con `cleanUrls`, así que en producción
   * `location.pathname` llega sin el `.html` (p. ej. `/admin/dashboard`)
   * mientras que `item.href` siempre lo lleva (`admin/dashboard.html`). Sin
   * quitarlo de la comparación, ningún enlace se marcaba activo fuera de local.
   */
  function coincideConRutaActual(href) {
    if (location.pathname.endsWith(href)) return true;
    return location.pathname.endsWith(href.replace(/\.html$/, ''));
  }

  const NOMBRE_ROL = {
    cliente: 'Portal del cliente',
    veterinario: 'Panel veterinario',
    admin: 'Administración',
  };

  /** La pestaña a la que apunta un enlace del submenú: lo que va tras el '#'. */
  function pestanaDe(href) {
    const corte = String(href).indexOf('#');
    return corte === -1 ? '' : String(href).slice(corte + 1);
  }

  /**
   * Un elemento del menú y, si lo tiene, su submenú.
   *
   * Las secciones con submenú son páginas de pestañas: cada hijo abre una,
   * con el nombre en el '#' de la dirección. Solo se despliega el de la
   * página en la que se está; desde otra hay que abrirlo con el chevrón,
   * porque con veinticinco entradas el menú de administración con todos los
   * submenús abiertos sería una lista que no cabe en la pantalla.
   */
  function pintarItemDelMenu(item) {
    const enPagina = coincideConRutaActual(item.href);
    const insignia = item.contador
      ? `<span class="barra-insignia" data-contador="${item.contador}"
               data-aviso="${item.aviso || ''}"
               data-aviso-texto="${escapar(item.avisoTexto || 'pendientes')}" hidden></span>`
      : '';

    const enlace = `<a href="${H.ruta(item.href)}" class="${enPagina ? 'activo' : ''}">
                      <svg class="icon"><use href="#${item.icono}"/></svg>
                      <span class="barra-nav-texto">
                        <strong>${escapar(item.texto)}</strong>
                        <small>${escapar(item.detalle || '')}</small>
                      </span>
                      ${insignia}
                    </a>`;

    if (!item.submenu || !item.submenu.length) return enlace;

    // Estando en la página, la pestaña abierta es la del '#'; sin '#', la
    // primera, que es la que la página muestra por defecto.
    const abierta = location.hash.replace(/^#/, '') || pestanaDe(item.submenu[0].href);

    const hijos = item.submenu.map((sub) => {
      const pestana = pestanaDe(sub.href);
      const activo = enPagina && pestana === abierta ? ' activo' : '';
      return `<a href="${H.ruta(sub.href)}" class="barra-sub-enlace${activo}"
                 data-pestana-menu="${escapar(pestana)}">${escapar(sub.texto)}</a>`;
    }).join('');

    return `<div class="barra-grupo">
              <div class="barra-grupo-cabeza">
                ${enlace}
                <button type="button" class="barra-desplegar" aria-expanded="${enPagina}"
                        aria-label="Secciones de ${escapar(item.texto)}">
                  <svg class="icon"><use href="#icon-chevron"/></svg>
                </button>
              </div>
              <div class="barra-sub"${enPagina ? '' : ' hidden'}>${hijos}</div>
            </div>`;
  }

  /**
   * El chevrón abre y cierra el submenú, y el resaltado sigue a la pestaña que
   * se esté viendo: la página avisa con `panel:pestana` cuando se cambia de
   * pestaña dentro de ella, y el navegador con `hashchange` cuando se llega
   * desde otro enlace del propio submenú.
   */
  function conectarSubmenus(barra) {
    H.$$('.barra-desplegar', barra).forEach((boton) => {
      boton.addEventListener('click', () => {
        const caja = boton.closest('.barra-grupo').querySelector('.barra-sub');
        caja.hidden = !caja.hidden;
        boton.setAttribute('aria-expanded', String(!caja.hidden));
      });
    });

    function marcar(nombre) {
      H.$$('.barra-grupo', barra).forEach((grupo) => {
        // Solo en la sección en la que se está: estando en otra página,
        // ninguna de sus pestañas se está viendo.
        const enPagina = Boolean(grupo.querySelector('.barra-grupo-cabeza a.activo'));
        H.$$('[data-pestana-menu]', grupo).forEach((enlace) => {
          enlace.classList.toggle('activo', enPagina && enlace.dataset.pestanaMenu === nombre);
        });
      });
    }

    window.addEventListener('hashchange', () => marcar(location.hash.replace(/^#/, '')));
    document.addEventListener('panel:pestana', (evento) => marcar(evento.detail));
  }

  /**
   * Valida la sesión, pinta la barra lateral y devuelve el usuario.
   * Devuelve null si hubo redirección (la página no debe seguir cargando).
   */
  function montarPanel(rolesPermitidos, permisosNecesarios) {
    const usuario = H.exigirSesion(rolesPermitidos, permisosNecesarios);
    if (!usuario) return null;

    const barra = $('#barraLateral');
    if (barra) {
      const inicial = (usuario.nombre || 'U').trim().charAt(0).toUpperCase();
      const enlaces = (MENUS[usuario.rol] || [])
        .filter((item) => !item.permiso || H.puede(...item.permiso))
        .map(pintarItemDelMenu)
        .join('');

      barra.innerHTML = `
        <a class="barra-marca" href="${H.ruta('index.html')}">
          <img src="${H.ruta('iconos/Huellitas-de-Amor-Pet-Silhouette-Logo.ico')}" alt="">
          <span>Huellitas<br>de Amor</span>
        </a>
        <p class="barra-rol">${escapar(NOMBRE_ROL[usuario.rol] || '')}</p>
        <nav class="barra-nav">${enlaces}</nav>
        <div class="barra-pie">
          <div class="barra-usuario">
            <span class="barra-avatar">${escapar(inicial)}</span>
            <div>
              <strong>${escapar(usuario.nombre)}</strong>
              <small>${escapar(usuario.email)}</small>
            </div>
          </div>
          <button type="button" class="btn-salir" id="btnMiSeguridad">
            <svg class="icon"><use href="#icon-shield"/></svg> Seguridad de mi cuenta
          </button>
          <button type="button" class="btn-salir" id="btnSalir">
            <svg class="icon"><use href="#icon-salir"/></svg> Cerrar sesión
          </button>
        </div>`;

      $('#btnSalir').addEventListener('click', cerrarSesion);
      conectarSubmenus(barra);
      montarSeguridadDeCuenta();
    }

    // Menú lateral en pantallas pequeñas
    const panel = $('#panel');
    const abrir = $('#abrirMenu');
    const velo = $('#veloMenu');
    if (abrir && panel) abrir.addEventListener('click', () => panel.classList.toggle('menu-abierto'));
    if (velo && panel) velo.addEventListener('click', () => panel.classList.remove('menu-abierto'));

    refrescarPermisos(usuario);
    // Sin resumen el menú se queda con sus descripciones y ya: las insignias
    // son un extra y no vale la pena romper la página por ellas. El motivo sí
    // se registra, porque un menú sin números se ve igual que uno con todo en
    // cero y así no habría manera de distinguirlos.
    resumenPanel().then(pintarContadores).catch((error) => {
      // Si lo que falta es el segundo factor, el resumen es lo de menos: el
      // servidor va a rechazar todo lo demás igual. Se abre el asistente en
      // el acto para que la primera pantalla sea la que resuelve el bloqueo,
      // y no un aviso del que no se puede salir.
      if (esErrorMfa(error)) { abrirMiSeguridad(); return; }
      console.warn('[panel] no se pudo cargar el resumen del menú:', error);
    });

    return usuario;
  }

  /* --------------------------------------------------------
     Resumen del panel

     Lo piden la barra lateral y, en las páginas de inicio, el
     contenido. Se guarda la promesa para que sea una sola
     petición aunque la llamen dos veces.
     -------------------------------------------------------- */
  let promesaResumen = null;

  function resumenPanel() {
    if (!promesaResumen) promesaResumen = H.api.get('/dashboard');
    return promesaResumen;
  }

  /** Pinta en el menú los números del resumen; los ceros no se muestran. */
  function pintarContadores(datos) {
    const resumen = (datos && datos.resumen) || {};

    H.$$('.barra-nav [data-contador]').forEach((insignia) => {
      const valor = Number(resumen[insignia.dataset.contador] || 0);
      if (!valor) return;

      insignia.textContent = valor > 99 ? '99+' : String(valor);
      insignia.hidden = false;

      const pendiente = Number(resumen[insignia.dataset.aviso] || 0);
      if (pendiente > 0) {
        insignia.classList.add('barra-insignia-aviso');
        // El texto lo declara cada entrada del menú: lo que está pendiente en
        // la agenda son citas sin confirmar, pero en inventario son productos
        // en mínimos y en la bandeja, avisos sin leer.
        insignia.title = `${pendiente} ${insignia.dataset.avisoTexto}`;
      }
    });
  }

  /**
   * Vuelve a pedir los permisos al servidor en segundo plano.
   *
   * Si la administración le quita una capacidad a un rol, el menú del usuario
   * se ajusta en la siguiente pantalla que abra, sin esperar a que cierre
   * sesión. No bloquea el pintado: la página ya se dibujó con lo que había.
   */
  async function refrescarPermisos(usuario) {
    try {
      const datos = await H.api.get('/seguridad/permisos', null, { sinRedirigir: true });
      const antes = H.sesion.permisos().slice().sort().join('|');
      const ahora = (datos.permisos || []).slice().sort().join('|');

      if (antes !== ahora) {
        H.sesion.guardar(H.sesion.token(), usuario, datos.permisos);
        location.reload();
      }
    } catch (error) {
      // Quedarse sin conexión o con la sesión vencida es esperable aquí: la
      // siguiente petición del panel lo resolverá. Cualquier otra cosa es un
      // fallo de verdad y tiene que verse en la consola en vez de perderse.
      const esperado = error.status === 0 || error.status === 401;
      if (!esperado) console.error('[panel] no se pudieron refrescar los permisos:', error);
    }
  }

  async function cerrarSesion() {
    try {
      await H.api.post('/auth/logout', {}, { sinRedirigir: true });
    } catch (error) {
      // Se sale igual: lo que cierra la sesión de este navegador es borrar el
      // token. Pero si el servidor no pudo cerrarla de su lado conviene saberlo,
      // porque significa que el token seguiría siendo válido en la base.
      console.warn('[panel] el servidor no confirmó el cierre de sesión:', error.message);
    }
    H.sesion.cerrar();
    location.href = H.ruta('login.html');
  }

  /* --------------------------------------------------------
     Piezas de interfaz reutilizables
     -------------------------------------------------------- */

  function insigniaEstado(estado) {
    return `<span class="insignia insignia-${escapar(estado)}">${escapar(H.ETIQUETA_ESTADO[estado] || estado)}</span>`;
  }

  function bloqueVacio(mensaje, icono = 'icon-calendar') {
    return `<div class="vacio">
              <svg class="icon"><use href="#${icono}"/></svg>
              ${escapar(mensaje)}
            </div>`;
  }

  /**
   * Pantalla de "te falta el segundo factor".
   *
   * El servidor contesta 403 a todo hasta que la cuenta lo configura, así que
   * sin esto el panel se queda en un aviso que dice qué hacer pero no deja
   * hacerlo: la única salida visible sería cerrar sesión. El botón abre el
   * mismo asistente de la barra lateral, que es la ruta que el propio
   * servidor sí permite mientras el factor está pendiente.
   */
  function bloqueMfaPendiente(mensaje) {
    return `<div class="vacio vacio-accion">
              <svg class="icon"><use href="#icon-shield"/></svg>
              <p>${escapar(mensaje)}</p>
              <p class="vacio-detalle">Necesitas una aplicación de códigos como Google
                 Authenticator, Aegis o 1Password. Se configura una sola vez.</p>
              <div class="vacio-acciones">
                <button type="button" class="btn btn-primary" data-configurar-mfa>Configurar ahora</button>
              </div>
            </div>`;
  }

  /** true si el error es el del segundo factor pendiente. */
  function esErrorMfa(error) {
    return Boolean(error) && error.codigo === 'mfa_requerido';
  }

  /**
   * Pinta un error dentro de un contenedor. Si es el del segundo factor, el
   * aviso trae el boton que lleva al asistente en vez de dejar la pantalla
   * sin salida.
   */
  function pintarErrorEnCaja(caja, error) {
    if (!caja) return;
    caja.innerHTML = esErrorMfa(error)
      ? bloqueMfaPendiente(error.message)
      : bloqueVacio(error.message, 'icon-alerta');
  }

  function cargando(mensaje = "Cargando…") {
    return `<div class="cargando">${escapar(mensaje)}</div>`;
  }

  /**
   * Tarjeta de cita reutilizada por los tres paneles.
   * `perspectiva` decide qué datos se destacan.
   */
  function tarjetaCita(cita, perspectiva, acciones = '') {
    const detalle = perspectiva === 'cliente'
      ? `${escapar(cita.mascota_nombre)} · ${escapar(cita.veterinario_nombre)}`
      : `${escapar(cita.mascota_nombre)} · ${escapar(cita.cliente_nombre)}`;

    return `<article class="cita" data-cita="${cita.id}">
      <div class="cita-hora">
        <strong>${escapar(H.hora12(cita.inicio))}</strong>
        <small>${escapar(H.fechaLarga(cita.inicio))}</small>
      </div>
      <div class="cita-info">
        <h4>${escapar(cita.servicio_nombre)}</h4>
        <p>${detalle}</p>
      </div>
      <div class="cita-lado">
        ${insigniaEstado(cita.estado)}
        ${acciones}
      </div>
    </article>`;
  }

  /* --------------------------------------------------------
     Seguridad de la cuenta

     El segundo factor se configura desde aquí y no desde una página
     nueva porque lo necesitan los tres roles, y ni la administración
     ni los veterinarios tienen pantalla de perfil. El modal se
     inyecta en el cuerpo al montar el panel, así que aparece en
     todas las páginas sin tocar ninguna.
     -------------------------------------------------------- */

  function montarSeguridadDeCuenta() {
    if (document.getElementById('modalMiSeguridad')) return;

    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.id = 'modalMiSeguridad';
    fondo.setAttribute('aria-hidden', 'true');
    fondo.innerHTML = `
      <div class="modal-caja" role="dialog" aria-modal="true">
        <button type="button" class="modal-cerrar" data-cerrar aria-label="Cerrar">✕</button>
        <h3>Seguridad de mi cuenta</h3>
        <p class="modal-sub">Verificación en dos pasos con una aplicación de códigos.</p>
        <p class="mensaje-error" id="errorMiSeguridad" hidden></p>
        <div id="cuerpoMiSeguridad"></div>
      </div>`;
    document.body.appendChild(fondo);
    prepararModal('modalMiSeguridad');

    $('#btnMiSeguridad').addEventListener('click', abrirMiSeguridad);

    // El aviso de "configúralo" puede salir en el contenido de cualquier
    // módulo, no solo aquí: el botón se delega en el cuerpo para no tener que
    // engancharlo en cada pantalla que lo pinte.
    document.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-configurar-mfa]')) abrirMiSeguridad();
    });
  }

  // Varias peticiones en paralelo fallan a la vez con el mismo motivo; sin
  // esta marca el asistente se reabriría y se repintaría con cada una.
  let asistenteMfaAbierto = false;
  document.addEventListener('sesion:mfa-requerido', () => {
    if (asistenteMfaAbierto) return;
    asistenteMfaAbierto = true;
    abrirMiSeguridad();
  });

  /** Abre el asistente de seguridad de la cuenta. */
  function abrirMiSeguridad() {
    if (!document.getElementById('modalMiSeguridad')) montarSeguridadDeCuenta();
    abrirModal('modalMiSeguridad');
    pintarSeguridad();
  }

  /** Estado actual del segundo factor, con lo que se puede hacer desde ahí. */
  async function pintarSeguridad() {
    const caja = $('#cuerpoMiSeguridad');
    H.limpiarError($('#errorMiSeguridad'));
    caja.innerHTML = H.cargando();

    let estado;
    try {
      estado = await H.api.get('/auth/mfa');
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    if (estado.activo) return pintarActivo(estado);
    pintarInactivo(estado);
  }

  function pintarActivo(estado) {
    const pocos = estado.codigosDisponibles <= 2;

    $('#cuerpoMiSeguridad').innerHTML = `
      <div class="alerta alerta-ok">
        <div class="alerta-cuerpo">
          <h4>Verificación en dos pasos activa</h4>
          <p>Desde el ${escapar(H.fechaLarga(estado.confirmadoEn))}.
             Te quedan <strong>${escapar(estado.codigosDisponibles)}</strong> códigos de recuperación.</p>
        </div>
      </div>
      ${pocos ? `<p class="campo-ayuda">Te quedan pocos códigos. Genera unos nuevos antes de quedarte sin ninguno.</p>` : ''}

      <h4 class="titulo-modulo" style="margin-top:18px">Códigos de recuperación</h4>
      <p class="campo-ayuda">Sirven una sola vez, para entrar cuando no tengas el teléfono.</p>
      <form id="formCodigosMfa" novalidate>
        <label class="campo">
          <span>Tu contraseña</span>
          <input type="password" name="password" autocomplete="current-password" required>
        </label>
        <div class="modal-acciones">
          <button type="submit" class="btn btn-outline">Generar códigos nuevos</button>
        </div>
      </form>

      <h4 class="titulo-modulo" style="margin-top:20px">Quitar la verificación</h4>
      <p class="campo-ayuda">
        ${estado.obligatorio
          ? 'Tu rol la necesita: si la quitas, el sistema te pedirá configurarla otra vez en el próximo ingreso.'
          : 'Tu cuenta quedará protegida solo por la contraseña.'}
      </p>
      <form id="formQuitarMfa" novalidate>
        <label class="campo">
          <span>Tu contraseña</span>
          <input type="password" name="password" autocomplete="current-password" required>
        </label>
        <div class="modal-acciones">
          <button type="submit" class="btn btn-peligro">Quitar verificación</button>
        </div>
      </form>`;

    engancharCodigos();
    engancharQuitar();
  }

  /**
   * Envío propio en vez de conectarFormulario(): hay que enseñar los códigos
   * que devuelve el servidor, y el ayudante genérico descarta la respuesta.
   */
  function engancharCodigos() {
    const form = $('#formCodigosMfa');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError($('#errorMiSeguridad'));

      await H.conBoton(form.querySelector('button[type="submit"]'), 'Generando…', async () => {
        try {
          const datos = await H.api.post('/auth/mfa/codigos', { password: form.password.value });
          mostrarCodigos(datos.codigos, datos.mensaje);
        } catch (error) {
          H.mostrarError($('#errorMiSeguridad'), error);
        }
      });
    });
  }

  function engancharQuitar() {
    const form = $('#formQuitarMfa');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError($('#errorMiSeguridad'));

      if (!(await confirmar('¿Quitar la verificación en dos pasos de tu cuenta?'))) return;

      await H.conBoton(form.querySelector('button[type="submit"]'), 'Quitando…', async () => {
        try {
          // Va por POST y no por DELETE porque lleva cuerpo —la contraseña—, y
          // un DELETE con cuerpo lo descartan algunos proxies por el camino.
          await H.api.post('/auth/mfa/desactivar', { password: form.password.value });
          H.toast('Verificación en dos pasos desactivada.');
          pintarSeguridad();
        } catch (error) {
          H.mostrarError($('#errorMiSeguridad'), error);
        }
      });
    });
  }

  function pintarInactivo(estado) {
    $('#cuerpoMiSeguridad').innerHTML = `
      ${estado.obligatorio ? `
        <div class="alerta alerta-alta">
          <div class="alerta-cuerpo">
            <h4>Tu rol necesita verificación en dos pasos</h4>
            <p>Hasta que la configures, tu sesión no abre ninguna otra pantalla.</p>
          </div>
        </div>` : ''}

      <p>Necesitas una aplicación de códigos: Google Authenticator, Aegis, 1Password o la que ya uses.</p>
      <div class="modal-acciones">
        <button type="button" class="btn btn-primary" id="btnIniciarMfa">Empezar configuración</button>
      </div>`;

    $('#btnIniciarMfa').addEventListener('click', iniciarMfa);
  }

  async function iniciarMfa() {
    const caja = $('#cuerpoMiSeguridad');
    H.limpiarError($('#errorMiSeguridad'));
    caja.innerHTML = H.cargando();

    let datos;
    try {
      datos = await H.api.post('/auth/mfa/iniciar', {});
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    caja.innerHTML = `
      <ol class="lista-pasos">
        <li>Abre tu aplicación de códigos y elige añadir una cuenta con clave manual.</li>
        <li>
          Copia esta clave:
          <p class="clave-mfa"><code>${escapar(datos.secreto)}</code></p>
          <button type="button" class="link-btn" id="copiarSecreto">Copiar clave</button>
        </li>
        <li>Escribe abajo el código de seis cifras que aparezca.</li>
      </ol>

      <p class="campo-ayuda">
        Si tu aplicación acepta una dirección, esta es la misma clave en su formato:
        <code class="direccion-mfa">${escapar(datos.direccion)}</code>
      </p>

      <form id="formActivarMfa" novalidate>
        <label class="campo">
          <span>Código de la aplicación</span>
          <input type="text" name="codigo" inputmode="numeric" autocomplete="one-time-code"
                 required placeholder="000000" maxlength="7">
        </label>
        <div class="modal-acciones">
          <button type="submit" class="btn btn-primary">Activar</button>
        </div>
      </form>`;

    $('#copiarSecreto').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(datos.secreto);
        H.toast('Clave copiada.');
      } catch {
        // Sin permiso de portapapeles se selecciona para copiar a mano: decir
        // "copiado" cuando no se copió es peor que no ofrecerlo.
        H.toast('Copia la clave a mano: tu navegador no dio permiso.', 'error');
      }
    });

    const form = $('#formActivarMfa');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError($('#errorMiSeguridad'));

      await H.conBoton(form.querySelector('button[type="submit"]'), 'Activando…', async () => {
        try {
          const respuesta = await H.api.post('/auth/mfa/activar', { codigo: form.codigo.value.trim() });
          mostrarCodigos(respuesta.codigos, respuesta.mensaje);
        } catch (error) {
          form.codigo.value = '';
          form.codigo.focus();
          H.mostrarError($('#errorMiSeguridad'), error);
        }
      });
    });
  }

  /**
   * Los códigos de recuperación se muestran una sola vez.
   *
   * Por eso ocupan la pantalla entera del modal y no se puede seguir sin
   * confirmar que se guardaron: si se cierran sin copiar, no hay forma de
   * volver a verlos, solo de generar otros.
   */
  function mostrarCodigos(codigos, mensaje) {
    $('#cuerpoMiSeguridad').innerHTML = `
      <div class="alerta alerta-ok">
        <div class="alerta-cuerpo"><h4>${escapar(mensaje || 'Listo')}</h4></div>
      </div>
      <p>Guárdalos donde puedas encontrarlos sin el teléfono. Cada uno sirve una vez.</p>
      <ul class="codigos-mfa">
        ${codigos.map((c) => `<li><code>${escapar(c)}</code></li>`).join('')}
      </ul>
      <div class="modal-acciones">
        <button type="button" class="btn btn-outline" id="copiarCodigos">Copiar todos</button>
        <button type="button" class="btn btn-primary" id="listoCodigos">Ya los guardé</button>
      </div>`;

    $('#copiarCodigos').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codigos.join('\n'));
        H.toast('Códigos copiados.');
      } catch {
        H.toast('Cópialos a mano: tu navegador no dio permiso.', 'error');
      }
    });

    $('#listoCodigos').addEventListener('click', async () => {
      // Se recarga la página: si el segundo factor era obligatorio, la sesión
      // acaba de pasar de bloqueada a completa y el panel tiene que volver a
      // pedir sus datos.
      cerrarModal('modalMiSeguridad');
      location.reload();
    });
  }

  /* --------------------------------------------------------
     Modal genérico
     -------------------------------------------------------- */

  // Un solo modal a la vez está abierto en toda la aplicación: basta con
  // recordar aquí lo que hacía falta para cerrarlo bien, sin llevar una pila.
  let ultimoEnfocado = null;
  let manejadorTab = null;

  const SELECTOR_FOCABLES =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** Controles visibles y con foco posible dentro del modal, en orden de tabulación. */
  function elementosFocables(fondo) {
    return Array.from(fondo.querySelectorAll(SELECTOR_FOCABLES)).filter((el) => el.offsetParent !== null);
  }

  function abrirModal(id) {
    const fondo = document.getElementById(id);
    if (!fondo) return;
    ultimoEnfocado = document.activeElement;
    fondo.classList.add('abierto');
    fondo.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const primero = fondo.querySelector('input, select, textarea, button');
    if (primero) setTimeout(() => primero.focus(), 60);

    // Atrapa el Tab dentro del modal: sin esto, con teclado se puede salir
    // hacia el contenido que el velo solo cubre visualmente y que sigue
    // siendo interactivo detrás.
    manejadorTab = (e) => {
      if (e.key !== 'Tab') return;
      const focables = elementosFocables(fondo);
      if (!focables.length) return;
      const primeroF = focables[0];
      const ultimoF = focables[focables.length - 1];
      if (e.shiftKey && document.activeElement === primeroF) {
        e.preventDefault();
        ultimoF.focus();
      } else if (!e.shiftKey && document.activeElement === ultimoF) {
        e.preventDefault();
        primeroF.focus();
      }
    };
    document.addEventListener('keydown', manejadorTab);
  }

  function cerrarModal(id) {
    const fondo = document.getElementById(id);
    if (!fondo) return;
    fondo.classList.remove('abierto');
    fondo.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    if (manejadorTab) {
      document.removeEventListener('keydown', manejadorTab);
      manejadorTab = null;
    }
    // Devuelve el foco a quien abrió el modal (el botón de la fila, del menú…);
    // sin esto, tras cerrar con teclado el foco se pierde y vuelve al body.
    if (ultimoEnfocado && document.body.contains(ultimoEnfocado)) ultimoEnfocado.focus();
    ultimoEnfocado = null;
  }

  /** Cierra al pulsar el fondo, la X o Escape. */
  function prepararModal(id) {
    const fondo = document.getElementById(id);
    if (!fondo) return;

    fondo.addEventListener('click', (e) => {
      if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrarModal(id);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fondo.classList.contains('abierto')) cerrarModal(id);
    });
  }

  /** Confirmación simple; devuelve una promesa booleana. */
  function confirmar(mensaje) {
    return Promise.resolve(global.confirm(mensaje));
  }

  /**
   * Pide la contraseña antes de una acción crítica.
   *
   * El servidor la exige igual —esto no es la comprobación, solo la forma de
   * recogerla—, pero sin este paso la interfaz mandaría la petición sin ella y
   * el usuario vería un error sin entender qué se le pide.
   *
   * Devuelve la contraseña escrita, o null si se canceló.
   */
  function pedirPassword({ titulo, detalle, boton = 'Confirmar' }) {
    return new Promise((resolver) => {
      let fondo = document.getElementById('modalConfirmar');
      if (!fondo) {
        fondo = document.createElement('div');
        fondo.className = 'modal-fondo';
        fondo.id = 'modalConfirmar';
        fondo.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fondo);
      }

      fondo.innerHTML = `
        <div class="modal-caja modal-estrecho" role="dialog" aria-modal="true">
          <h3>${escapar(titulo)}</h3>
          <p class="modal-sub">${escapar(detalle)}</p>
          <form id="formConfirmar" novalidate>
            <label class="campo">
              <span>Tu contraseña</span>
              <input type="password" name="passwordActual" autocomplete="current-password" required>
            </label>
            <div class="modal-acciones">
              <button type="button" class="btn btn-outline" data-cancelar>Cancelar</button>
              <button type="submit" class="btn btn-primary">${escapar(boton)}</button>
            </div>
          </form>
        </div>`;

      // Se resuelve una sola vez, salga por donde salga.
      let resuelto = false;
      const terminar = (valor) => {
        if (resuelto) return;
        resuelto = true;
        cerrarModal('modalConfirmar');
        resolver(valor);
      };

      fondo.querySelector('#formConfirmar').addEventListener('submit', (e) => {
        e.preventDefault();
        const escrita = e.target.passwordActual.value;
        if (escrita) terminar(escrita);
      });
      fondo.querySelector('[data-cancelar]').addEventListener('click', () => terminar(null));
      fondo.addEventListener('click', (e) => { if (e.target === fondo) terminar(null); });
      document.addEventListener('keydown', function alEscape(e) {
        if (e.key !== 'Escape') return;
        document.removeEventListener('keydown', alEscape);
        terminar(null);
      });

      abrirModal('modalConfirmar');
    });
  }

  /**
   * Pide un texto obligatorio antes de una acción (motivo de un rechazo,
   * acciones tomadas al cerrar un incidente…), con el mismo modal del resto
   * de la aplicación en vez de un `window.prompt()`.
   *
   * A diferencia del diálogo nativo, si se envía vacío muestra el error ahí
   * mismo en vez de no hacer nada; y al cancelar o cerrar devuelve null.
   * Devuelve el texto ya recortado, o null si se canceló.
   */
  function pedirTexto({ titulo, detalle, etiqueta = 'Motivo', boton = 'Confirmar', placeholder = '' }) {
    return new Promise((resolver) => {
      let fondo = document.getElementById('modalPedirTexto');
      if (!fondo) {
        fondo = document.createElement('div');
        fondo.className = 'modal-fondo';
        fondo.id = 'modalPedirTexto';
        fondo.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fondo);
      }

      fondo.innerHTML = `
        <div class="modal-caja modal-estrecho" role="dialog" aria-modal="true">
          <h3>${escapar(titulo)}</h3>
          ${detalle ? `<p class="modal-sub">${escapar(detalle)}</p>` : ''}
          <form id="formPedirTexto" novalidate>
            <label class="campo">
              <span>${escapar(etiqueta)}</span>
              <textarea name="texto" required placeholder="${escapar(placeholder)}"></textarea>
            </label>
            <p class="mensaje-error" id="errorPedirTexto" hidden></p>
            <div class="modal-acciones">
              <button type="button" class="btn btn-outline" data-cancelar>Cancelar</button>
              <button type="submit" class="btn btn-primary">${escapar(boton)}</button>
            </div>
          </form>
        </div>`;

      let resuelto = false;
      const terminar = (valor) => {
        if (resuelto) return;
        resuelto = true;
        cerrarModal('modalPedirTexto');
        resolver(valor);
      };

      fondo.querySelector('#formPedirTexto').addEventListener('submit', (e) => {
        e.preventDefault();
        const escrito = e.target.texto.value.trim();
        if (!escrito) {
          const error = fondo.querySelector('#errorPedirTexto');
          error.textContent = 'Escribe algo antes de continuar: este campo es obligatorio.';
          error.hidden = false;
          return;
        }
        terminar(escrito);
      });
      fondo.querySelector('[data-cancelar]').addEventListener('click', () => terminar(null));
      fondo.addEventListener('click', (e) => { if (e.target === fondo) terminar(null); });
      document.addEventListener('keydown', function alEscape(e) {
        if (e.key !== 'Escape') return;
        document.removeEventListener('keydown', alEscape);
        terminar(null);
      });

      abrirModal('modalPedirTexto');
    });
  }

  // conBoton() vive en api.js: el login y el registro también la necesitan y
  // esas páginas no cargan este archivo.

  Object.assign(H, {
    montarPanel,
    resumenPanel,
    cerrarSesion,
    insigniaEstado,
    bloqueVacio,
    bloqueMfaPendiente,
    esErrorMfa,
    pintarErrorEnCaja,
    abrirMiSeguridad,
    cargando,
    tarjetaCita,
    abrirModal,
    cerrarModal,
    pedirPassword,
    pedirTexto,
    prepararModal,
    confirmar,
  });
})(window);
