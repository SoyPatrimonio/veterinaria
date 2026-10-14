/* ============================================================
   Huellitas — cliente de la API y utilidades compartidas
   Se carga como script clásico (sin módulos) para que las páginas
   funcionen igual servidas por Express o abiertas con Live Server.
   ============================================================ */

(function (global) {
  'use strict';

  /* --------------------------------------------------------
     Dónde vive la API
     -------------------------------------------------------- */
  function detectarBase() {
    // 1. Override manual, por si algún día la API vive en otro dominio.
    //    Basta con definir window.HUELLITAS_API antes de cargar este archivo.
    if (typeof global.HUELLITAS_API === 'string' && global.HUELLITAS_API) {
      return global.HUELLITAS_API.replace(/\/+$/, '');
    }

    // 2. Abriendo el HTML con doble clic o con Live Server, la API sigue en el
    //    backend local: hay que apuntar al puerto 3000.
    const puertosDeFront = ['5500', '5501', '3001'];
    if (location.protocol === 'file:' || puertosDeFront.includes(location.port)) {
      return 'http://localhost:3000/api';
    }

    // 3. Servido por Express en local o por Vercel en producción: el frontend y
    //    la API comparten dominio, así que la ruta relativa es suficiente.
    return '/api';
  }

  const BASE = detectarBase();

  /* --------------------------------------------------------
     Rutas entre páginas

     Se usan rutas relativas, no absolutas, para que el sitio se
     vea igual servido por Express (localhost:3000), abierto con
     Live Server (que sirve desde la raíz del proyecto) o incluso
     con doble clic sobre el archivo.
     -------------------------------------------------------- */
  const EN_SUBCARPETA = /\/(cliente|veterinario|admin)\/[^/]*$/.test(location.pathname);
  const PREFIJO = EN_SUBCARPETA ? '../' : '';

  /** ruta('login.html') -> 'login.html' o '../login.html' según dónde estemos. */
  function ruta(destino) {
    return PREFIJO + String(destino).replace(/^\/+/, '');
  }

  /**
   * La dirección de una imagen guardada en la base.
   *
   * Las fotos del catálogo se guardan relativas a la raíz del frontend
   * ('COMIDA Y ACCESO/…/AC1.jpg'), que es lo que publica Vercel. Puestas tal
   * cual en un <img> se rompen dentro de /cliente o /admin, así que pasan por
   * ruta(); las que ya son absolutas o vienen de Supabase se dejan quietas.
   *
   * El encodeURI es por los espacios del nombre de la carpeta.
   */
  function rutaImagen(imagen) {
    const valor = String(imagen || '').trim();
    if (!valor) return '';
    if (/^(https?:)?\/\//.test(valor) || valor.startsWith('data:') || valor.startsWith('/')) return valor;
    return encodeURI(ruta(valor));
  }

  /**
   * ¿Estamos ya en la página de login?
   *
   * Se aceptan las dos formas porque Vercel publica las páginas sin extensión
   * (/login) mientras que en local se abren como /login.html. Sin esto, un 401
   * en la propia página de login intentaría redirigir a sí misma.
   */
  function enPaginaDeLogin() {
    return /\/login(\.html)?$/.test(location.pathname);
  }

  /* --------------------------------------------------------
     Sesión (token JWT + perfil en localStorage)
     -------------------------------------------------------- */
  const CLAVE_TOKEN = 'huellitas_token';
  const CLAVE_USUARIO = 'huellitas_usuario';
  const CLAVE_PERMISOS = 'huellitas_permisos';

  const sesion = {
    guardar(token, usuario, permisos) {
      localStorage.setItem(CLAVE_TOKEN, token);
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
      // Los permisos vienen del rol que tenga el usuario en la base. Aquí solo
      // se guardan para decidir qué se pinta: quien manda es el servidor, que
      // los vuelve a comprobar en cada petición.
      const lista = permisos || (usuario && usuario.permisos) || [];
      localStorage.setItem(CLAVE_PERMISOS, JSON.stringify(lista));
    },
    token() {
      return localStorage.getItem(CLAVE_TOKEN);
    },
    usuario() {
      try {
        const crudo = localStorage.getItem(CLAVE_USUARIO);
        return crudo ? JSON.parse(crudo) : null;
      } catch {
        return null;
      }
    },
    permisos() {
      try {
        const crudo = localStorage.getItem(CLAVE_PERMISOS);
        const lista = crudo ? JSON.parse(crudo) : [];
        return Array.isArray(lista) ? lista : [];
      } catch {
        return [];
      }
    },
    activa() {
      return Boolean(this.token() && this.usuario());
    },
    cerrar() {
      localStorage.removeItem(CLAVE_TOKEN);
      localStorage.removeItem(CLAVE_USUARIO);
      localStorage.removeItem(CLAVE_PERMISOS);
    },
  };

  /**
   * ¿La sesión tiene alguno de estos permisos?
   * Sirve para ocultar menús y botones que el servidor rechazaría igualmente.
   */
  function puede(...codigos) {
    const mios = sesion.permisos();
    return codigos.some((codigo) => mios.includes(codigo));
  }

  /** Ruta del panel que corresponde a cada rol. */
  function panelDe(rol) {
    if (rol === 'admin') return ruta('admin/dashboard.html');
    if (rol === 'veterinario') return ruta('veterinario/agenda.html');
    return ruta('cliente/dashboard.html');
  }

  /**
   * Protege una página: si no hay sesión válida manda al login, y si el rol o
   * los permisos no alcanzan, manda al panel que sí le corresponde.
   *
   * `permisosNecesarios` es opcional y basta con tener uno de ellos.
   */
  function exigirSesion(rolesPermitidos, permisosNecesarios) {
    const usuario = sesion.usuario();
    if (!sesion.activa()) {
      location.href = `${ruta('login.html')}?destino=${encodeURIComponent(location.pathname)}`;
      return null;
    }
    if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
      location.href = panelDe(usuario.rol);
      return null;
    }
    if (permisosNecesarios && permisosNecesarios.length && !puede(...permisosNecesarios)) {
      location.href = panelDe(usuario.rol);
      return null;
    }
    return usuario;
  }

  /* --------------------------------------------------------
     Peticiones
     -------------------------------------------------------- */

  class ErrorApi extends Error {
    constructor(mensaje, status, detalles, causa, codigo) {
      // `cause` conserva el error original del navegador (DNS, CORS, certificado…).
      // El mensaje que se muestra está escrito para el usuario, así que sin esto
      // el detalle técnico se perdería y todos los fallos de red se verían igual.
      super(mensaje, causa ? { cause: causa } : undefined);
      this.name = 'ErrorApi';
      this.status = status;
      this.detalles = detalles || null;
      // Identificador estable del caso, cuando el servidor lo manda. Permite
      // reaccionar a un error concreto sin depender del texto del mensaje.
      this.codigo = (codigo) || null;
    }
  }

  // El parámetro se llama `camino` y no `ruta` a propósito: si se llamara igual
  // que la función ruta() de arriba la taparía, y al querer redirigir al login
  // se estaría llamando a un texto en vez de a la función.
  async function peticion(metodo, camino, cuerpo, opciones = {}) {
    const cabeceras = {};
    const token = sesion.token();
    if (token) cabeceras.Authorization = `Bearer ${token}`;

    let payload;
    if (cuerpo instanceof FormData) {
      payload = cuerpo; // el navegador pone el Content-Type con su boundary
    } else if (cuerpo !== undefined) {
      cabeceras['Content-Type'] = 'application/json';
      payload = JSON.stringify(cuerpo);
    }

    let respuesta;
    try {
      respuesta = await fetch(BASE + camino, { method: metodo, headers: cabeceras, body: payload });
    } catch (error) {
      throw new ErrorApi(
        'No se pudo conectar con el servidor. ¿Está encendido el backend?',
        0,
        null,
        error
      );
    }

    let datos = null;
    const tipo = respuesta.headers.get('content-type') || '';
    if (tipo.includes('application/json')) {
      try {
        datos = await respuesta.json();
      } catch (error) {
        // El servidor dijo que mandaba JSON y mandó otra cosa (una página de
        // error de un proxy, una respuesta cortada). Se sigue sin cuerpo, pero
        // queda anotado: si no, el síntoma sería un "Error 500" pelado sin
        // ninguna pista de que la respuesta llegó rota.
        console.warn(`[api] respuesta no interpretable de ${metodo} ${camino}:`, error);
      }
    }

    if (!respuesta.ok) {
      // Sesión vencida: se limpia y se vuelve al login.
      if (respuesta.status === 401 && !opciones.sinRedirigir) {
        sesion.cerrar();
        if (!enPaginaDeLogin()) {
          location.href = ruta('login.html');
        }
      }
      // Segundo factor pendiente: el servidor rechaza así TODAS las rutas del
      // panel, no una en concreto. Cada módulo pinta el mensaje donde puede,
      // pero ninguno sabe cómo resolverlo; se avisa una vez por el documento y
      // el panel abre el asistente. Es aquí y no en cada módulo porque son
      // sesenta y tantos puntos que muestran errores y todos pasan por aqui.
      if (respuesta.status === 403 && datos && datos.codigo === 'mfa_requerido') {
        document.dispatchEvent(new CustomEvent('sesion:mfa-requerido'));
      }
      const mensaje = (datos && datos.error) || `Error ${respuesta.status}`;
      throw new ErrorApi(mensaje, respuesta.status, datos && datos.detalles, null, datos && datos.codigo);
    }

    return datos;
  }

  function query(parametros) {
    const partes = Object.entries(parametros || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return partes.length ? `?${partes.join('&')}` : '';
  }

  const api = {
    base: BASE,
    get: (camino, params, opciones) => peticion('GET', camino + query(params), undefined, opciones),
    post: (camino, cuerpo, opciones) => peticion('POST', camino, cuerpo, opciones),
    put: (camino, cuerpo, opciones) => peticion('PUT', camino, cuerpo, opciones),
    patch: (camino, cuerpo, opciones) => peticion('PATCH', camino, cuerpo, opciones),
    del: (camino, opciones) => peticion('DELETE', camino, undefined, opciones),
  };

  /* --------------------------------------------------------
     Utilidades de presentación
     -------------------------------------------------------- */

  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const $$ = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

  function escapar(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  /** '2026-08-11 09:00:00' o '2026-08-11' -> '11 ago 2026' */
  function fechaLarga(valor) {
    if (!valor) return '—';
    const iso = String(valor).slice(0, 10);
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return String(valor);
    return `${d} ${MESES[m - 1]} ${y}`;
  }

  function diaSemanaDe(valor) {
    const iso = String(valor).slice(0, 10);
    return DIAS[new Date(`${iso}T00:00:00`).getDay()];
  }

  /** '2026-08-11 09:00:00' -> '9:00 a.m.' */
  function hora12(valor) {
    if (!valor) return '';
    const texto = String(valor);
    const hhmm = texto.length > 10 ? texto.slice(11, 16) : texto.slice(0, 5);
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h)) return hhmm;
    const sufijo = h < 12 ? 'a.m.' : 'p.m.';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
  }

  function moneda(valor) {
    const numero = Number(valor || 0);
    return numero.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  }

  function fechaHoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function sumarDiasISO(iso, dias) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Edad legible a partir de los meses que devuelve la API. */
  function edadLegible(meses) {
    if (meses === null || meses === undefined) return 'Edad sin registrar';
    const m = Number(meses);
    if (Number.isNaN(m) || m < 0) return 'Edad sin registrar';
    if (m < 1) return 'Menos de 1 mes';
    if (m < 12) return `${m} ${m === 1 ? 'mes' : 'meses'}`;
    const anios = Math.floor(m / 12);
    const resto = m % 12;
    const base = `${anios} ${anios === 1 ? 'año' : 'años'}`;
    return resto ? `${base} y ${resto} ${resto === 1 ? 'mes' : 'meses'}` : base;
  }

  const ETIQUETA_ESTADO = {
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    atendida: 'Atendida',
    cancelada: 'Cancelada',
    no_asistio: 'No asistió',
  };

  const ETIQUETA_ESPECIALIDAD = {
    medicina_general: 'Medicina general',
    cirugia: 'Cirugía',
    dermatologia: 'Dermatología',
    cardiologia: 'Cardiología',
    odontologia: 'Odontología',
    exoticos: 'Animales exóticos',
    imagenes: 'Diagnóstico por imágenes',
    felinos: 'Medicina felina',
  };

  /* --------------------------------------------------------
     Avisos
     -------------------------------------------------------- */
  // Cuánto se queda el aviso en pantalla: suficiente para leer una frase sin
  // que estorbe a quien ya siguió trabajando.
  const MS_TOAST = 3200;

  let temporizadorToast = null;

  function toast(mensaje, tipo = 'ok') {
    let caja = $('#toastGlobal');
    if (!caja) {
      caja = document.createElement('div');
      caja.id = 'toastGlobal';
      caja.className = 'toast-global';
      document.body.appendChild(caja);
    }
    caja.textContent = mensaje;
    caja.dataset.tipo = tipo;
    caja.classList.add('visible');

    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => caja.classList.remove('visible'), MS_TOAST);
  }

  /** Pinta el mensaje de error de un formulario, con los detalles de zod. */
  function mostrarError(caja, error) {
    if (!caja) return toast(error.message, 'error');
    let texto = error.message || 'Ocurrió un error.';
    if (error.detalles && error.detalles.length) {
      texto = error.detalles.map((d) => d.mensaje).join(' ');
    }
    caja.textContent = texto;
    caja.hidden = false;
  }

  function limpiarError(caja) {
    if (!caja) return;
    caja.hidden = true;
    caja.textContent = '';
  }

  /**
   * Deshabilita un botón mientras corre una promesa.
   *
   * Vive aquí y no en panel.js porque también la usan el login y el registro,
   * que son páginas sueltas y no cargan el armazón de los paneles.
   */
  async function conBoton(boton, textoOcupado, tarea) {
    if (!boton) return tarea();
    const original = boton.innerHTML;
    boton.disabled = true;
    boton.textContent = textoOcupado;
    try {
      return await tarea();
    } finally {
      boton.disabled = false;
      boton.innerHTML = original;
    }
  }

  /* --------------------------------------------------------
     Formularios abiertos al público

     Registro, recuperación de contraseña, avistamientos de mascotas
     perdidas y solicitudes de adopción son las cuatro puertas que se
     usan sin cuenta. El servidor les exige dos cosas además de los
     datos (backend/src/middleware/bots.js):

       - un campo trampa vacío: existe en el HTML, no se ve, y solo lo
         rellena quien completa el formulario a ciegas;
       - un sello firmado por el servidor, que se pide al pintar la
         página. Quien llama a la ruta directamente no lo tiene.

     El sello se pide una sola vez por página y se guarda: el servidor
     exige que pasen unos segundos entre pedirlo y enviar, así que
     tiene que salir cuando se abre el formulario, no al enviarlo.
     -------------------------------------------------------- */

  const CAMPO_TRAMPA = 'sitioWeb';
  let promesaSello = null;

  /** Pide el sello al servidor. Se llama al montar cada formulario público. */
  function pedirSello() {
    if (!promesaSello) {
      promesaSello = api.get('/sello')
        .then((datos) => datos.sello)
        .catch(() => {
          // El fallo NO se guarda: se borra la promesa para que el siguiente
          // intento vuelva a pedirlo. Si se guardara, un corte de red de un
          // segundo al cargar la página dejaría el formulario inservible hasta
          // recargar, y el usuario no tendría forma de saberlo.
          promesaSello = null;
          return null;
        });
    }
    return promesaSello;
  }

  /**
   * El campo trampa, para meter en el HTML del formulario.
   *
   * No es `type="hidden"`: a esos los robots los saltan, y el que rellena
   * todo lo que encuentra sí cae en un campo de texto normal escondido con
   * CSS. Las tres marcas de accesibilidad son para que quien navega con
   * lector de pantalla o con el tabulador no se lo tropiece.
   */
  function campoTrampa() {
    return `<input type="text" name="${CAMPO_TRAMPA}" class="campo-trampa"
                   tabindex="-1" autocomplete="off" aria-hidden="true">`;
  }

  /**
   * Añade al cuerpo lo que el servidor va a pedir.
   *
   * `formulario` es opcional: si se pasa, de ahí sale el valor del campo
   * trampa. Si no hay campo en el HTML se manda vacío, que es justo lo que
   * el servidor espera de una persona.
   */
  async function conAntiBots(cuerpo, formulario = null) {
    const trampa = formulario && formulario.elements[CAMPO_TRAMPA]
      ? formulario.elements[CAMPO_TRAMPA].value
      : '';

    return {
      ...cuerpo,
      [CAMPO_TRAMPA]: trampa,
      selloFormulario: await pedirSello(),
    };
  }

  /**
   * Prepara un formulario público: le mete el campo trampa si no lo trae del
   * HTML y pide el sello desde ya.
   */
  function prepararFormularioPublico(formulario) {
    if (!formulario) return;
    if (!formulario.elements[CAMPO_TRAMPA]) {
      formulario.insertAdjacentHTML('afterbegin', campoTrampa());
    }
    pedirSello();
  }

  global.Huella = {
    api,
    sesion,
    ErrorApi,
    exigirSesion,
    puede,
    panelDe,
    ruta,
    rutaImagen,
    $, $$,
    escapar,
    fechaLarga,
    diaSemanaDe,
    hora12,
    moneda,
    fechaHoyISO,
    sumarDiasISO,
    edadLegible,
    ETIQUETA_ESTADO,
    ETIQUETA_ESPECIALIDAD,
    toast,
    mostrarError,
    limpiarError,
    conBoton,
    conAntiBots,
    prepararFormularioPublico,
    campoTrampa,
  };
})(window);
