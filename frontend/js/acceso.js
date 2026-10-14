/* ============================================================
   Login y registro. El mismo archivo sirve a las dos páginas:
   cada una solo tiene uno de los dos formularios.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $ } = H;

  document.addEventListener('DOMContentLoaded', () => {
    // Si ya hay sesión abierta, no tiene sentido volver a pedirla. Salvo que
    // esté pendiente el cambio de contraseña: mandarla al panel solo la haría
    // rebotar contra un 403 sin explicación.
    const abierta = H.sesion.activa() ? H.sesion.usuario() : null;
    if (abierta && !abierta.debeCambiarPassword) {
      location.replace(H.panelDe(abierta.rol));
      return;
    }

    prepararLogin();
    prepararRegistro();
    prepararRecuperacion();
    prepararCambioObligatorio();
    prepararMfa();
  });

  /* --------------------------------------------------------
     Segundo factor en el ingreso

     El login devuelve un desafío en vez de un token cuando la
     cuenta tiene segundo factor. El desafío se queda en memoria,
     no en localStorage: dura cinco minutos y no debería sobrevivir
     a que se cierre la pestaña.
     -------------------------------------------------------- */
  let desafioMfa = null;

  /** Cambia el login por el formulario del código. */
  function pedirCodigo(datos) {
    desafioMfa = datos.desafio;

    $('#formLogin').hidden = true;
    ocultarEnlaceRecuperar(true);

    // El servidor dice dónde buscar el código —y a qué correo lo mandó, con
    // la dirección medio tapada—, así que su mensaje manda sobre el texto
    // que trae la página.
    const texto = $('#textoMfa');
    if (texto && datos.mensaje) texto.textContent = datos.mensaje;

    // Los códigos de recuperación son de quien configuró la aplicación. A
    // quien le llegó el código al correo no le sirve de nada leer eso.
    const ayuda = $('#ayudaMfa');
    if (ayuda) ayuda.hidden = Boolean(datos.porCorreo);

    const bloque = $('#bloqueMfa');
    bloque.hidden = false;
    bloque.querySelector('[name="codigo"]').focus();
  }

  /** Vuelve al formulario de contraseña. */
  function volverAlLogin() {
    desafioMfa = null;
    $('#bloqueMfa').hidden = true;
    $('#formMfa').reset();
    $('#formLogin').hidden = false;
    ocultarEnlaceRecuperar(false);
    $('#formLogin').password.value = '';
    $('#formLogin').password.focus();
  }

  function ocultarEnlaceRecuperar(oculto) {
    const abrir = $('#abrirRecuperar');
    if (abrir) abrir.closest('p').hidden = oculto;
    const bloque = $('#bloqueRecuperar');
    if (bloque && oculto) bloque.hidden = true;
  }

  function prepararMfa() {
    const form = $('#formMfa');
    if (!form) return;

    const caja = $('#errorMfa');
    $('#cancelarMfa').addEventListener('click', volverAlLogin);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError(caja);

      const codigo = form.codigo.value.trim();
      if (!codigo) return H.mostrarError(caja, new Error('Escribe el código.'));

      await H.conBoton($('#btnMfa'), 'Verificando…', async () => {
        try {
          const datos = await H.api.post(
            '/auth/mfa/verificar',
            { desafio: desafioMfa, codigo },
            { sinRedirigir: true }
          );

          if (datos.debeCambiarPassword) return exigirCambio(datos);

          H.sesion.guardar(datos.token, datos.usuario, datos.permisos);

          // Entrar con un código de recuperación gasta uno: conviene decirlo
          // en el momento, no cuando se acaben.
          if (typeof datos.codigosRestantes === 'number') {
            H.toast(`Usaste un código de recuperación. Te quedan ${datos.codigosRestantes}.`, 'ok');
          }

          irAlPanel(datos.usuario);
        } catch (error) {
          form.codigo.value = '';
          form.codigo.focus();
          H.mostrarError(caja, error);
        }
      });
    });
  }

  /* --------------------------------------------------------
     Cambio de contraseña obligatorio

     El servidor puede marcar una cuenta con debe_cambiar_password —las
     que nacen con una contraseña asignada por la administración, o las
     que arrastran la del ejemplo—. Mientras la marca esté puesta, su
     sesión solo sirve para cambiarla: el resto de la API responde 403.
     -------------------------------------------------------- */

  /** Deja el login a un lado y muestra el formulario de cambio. */
  function exigirCambio(datos) {
    H.sesion.guardar(datos.token, datos.usuario, datos.permisos);

    $('#formLogin').hidden = true;
    const recuperar = $('#bloqueRecuperar');
    if (recuperar) recuperar.hidden = true;
    const abrir = $('#abrirRecuperar');
    if (abrir) abrir.closest('p').hidden = true;

    const bloque = $('#bloqueCambio');
    bloque.hidden = false;
    bloque.querySelector('[name="actual"]').focus();
  }

  function prepararCambioObligatorio() {
    const form = $('#formCambio');
    if (!form) return;

    const caja = $('#errorCambio');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError(caja);

      const actual = form.actual.value;
      const nueva = form.nueva.value;

      if (nueva.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nueva) || !/\d/.test(nueva)) {
        return H.mostrarError(caja, new Error('La contraseña debe tener al menos 8 caracteres, con una letra y un número.'));
      }
      if (nueva !== form.nueva2.value) {
        return H.mostrarError(caja, new Error('Las contraseñas no coinciden.'));
      }
      if (nueva === actual) {
        return H.mostrarError(caja, new Error('La contraseña nueva tiene que ser distinta de la actual.'));
      }

      await H.conBoton($('#btnCambio'), 'Guardando…', async () => {
        try {
          await H.api.put('/auth/password', { actual, nueva }, { sinRedirigir: true });

          // El servidor cierra todas las sesiones al cambiarla, incluida esta,
          // así que se vuelve al login limpio en vez de arrastrar un token que
          // ya no vale.
          H.sesion.cerrar();
          form.reset();
          $('#bloqueCambio').hidden = true;
          $('#formLogin').hidden = false;
          $('#abrirRecuperar').closest('p').hidden = false;
          $('#formLogin').password.value = '';
          $('#formLogin').password.focus();
          H.toast('Contraseña actualizada. Entra con la nueva.', 'ok');
        } catch (error) {
          H.mostrarError(caja, error);
        }
      });
    });
  }

  /**
   * El destino solo vale si es una ruta de este mismo sitio.
   *
   * Mirar el principio del texto no alcanza: el navegador convierte la barra
   * invertida en barra al resolver la dirección, así que `/\ejemplo.com` pasa
   * por ruta interna —empieza por '/' y no por '//'— y termina cargando
   * https://ejemplo.com. Con `?destino=` en el enlace del login, eso es mandar
   * a alguien a una copia del sitio justo después de escribir su contraseña.
   *
   * Por eso se resuelve la dirección igual que la resolvería el navegador y se
   * compara el origen ya calculado. De paso quedan fuera `//otro.sitio`,
   * `https://otro.sitio` y `javascript:` sin necesidad de listarlos.
   */
  function destinoSeguro(destino) {
    if (!destino) return null;
    try {
      const url = new URL(destino, location.origin);
      if (url.origin !== location.origin) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch (_error) {
      return null;
    }
  }

  /** Vuelve al destino que pidió la página protegida, o al panel del rol. */
  function irAlPanel(usuario) {
    const destino = destinoSeguro(new URLSearchParams(location.search).get('destino'));
    location.href = destino || H.panelDe(usuario.rol);
  }

  /* --------------------------------------------------------
     Login
     -------------------------------------------------------- */
  function prepararLogin() {
    const form = $('#formLogin');
    if (!form) return;

    const caja = $('#errorLogin');
    const boton = $('#btnEntrar');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError(caja);

      const email = form.email.value.trim();
      const password = form.password.value;

      if (!email || !password) {
        H.mostrarError(caja, new Error('Escribe tu correo y tu contraseña.'));
        return;
      }

      await H.conBoton(boton, 'Entrando…', async () => {
        try {
          const datos = await H.api.post('/auth/login', { email, password }, { sinRedirigir: true });

          // Todavía no hay sesión: falta el código del segundo factor.
          if (datos.mfa) return pedirCodigo(datos);

          // Con la marca puesta no se va al panel: el servidor no dejaría
          // cargarlo, y el usuario vería una pantalla de errores sin entender
          // qué se espera de él.
          if (datos.debeCambiarPassword) return exigirCambio(datos);

          H.sesion.guardar(datos.token, datos.usuario, datos.permisos);
          irAlPanel(datos.usuario);
        } catch (error) {
          H.mostrarError(caja, error);
        }
      });
    });
  }

  /* --------------------------------------------------------
     Registro
     -------------------------------------------------------- */
  /**
   * Qué pide cada tipo de cuenta.
   *
   * El dueño de mascota no pide nada; los otros dos, el código de SU rol, que
   * es distinto para cada uno. La licencia y la especialidad son solo del
   * veterinario: al administrador no se le pide ficha profesional, igual que
   * cuando lo da de alta otro admin desde el panel.
   */
  const CUENTAS = {
    cliente: {
      consiente: 'Acepto que la clínica guarde los datos de mis mascotas para su atención médica.',
    },
    veterinario: {
      titulo: 'Acceso de veterinario',
      texto: 'Con el código de veterinario, la cuenta se crea con el panel clínico: agenda, pacientes e historia.',
      ejemplo: 'VET-XXXX-XXXX-XXXX',
      consiente: 'Acepto que la clínica trate mis datos profesionales para darme acceso al sistema.',
      pideLicencia: true,
    },
    // No hay entrada para 'admin': esas cuentas no se crean desde el registro,
    // las da de alta un administrador desde el panel de usuarios.
  };

  /**
   * El selector de tipo de cuenta.
   *
   * Enseña u oculta lo que hace falta según el rol; quien decide de verdad es
   * el servidor, al comprobar el código contra el del rol pedido. Volver a
   * "dueño de mascota" vacía lo escrito, porque un código a medias de alguien
   * que miró el bloque por curiosidad se convertiría en un error que no
   * entiende de dónde le viene.
   *
   * Devuelve la función que dice qué rol está elegido, para no repartir el
   * estado del selector por medio archivo.
   */
  function prepararSelectorRol(form) {
    const selector = $('#rolCuenta');
    const bloque = $('#bloquePersonal');
    if (!selector || !bloque) return () => 'cliente';

    const titulo = $('#tituloPersonal');
    const texto = $('#textoPersonal');
    const acepta = $('#textoAcepta');
    const camposVet = $('#camposVeterinario');

    function sincronizar(porUnCambio) {
      const cuenta = CUENTAS[selector.value] || CUENTAS.cliente;
      const conCodigo = selector.value !== 'cliente';

      bloque.hidden = !conCodigo;
      camposVet.hidden = !cuenta.pideLicencia;

      // El consentimiento de un veterinario no es por sus mascotas.
      if (acepta) acepta.textContent = cuenta.consiente;

      if (conCodigo) {
        titulo.textContent = cuenta.titulo;
        texto.textContent = cuenta.texto;
        form.codigoAcceso.placeholder = cuenta.ejemplo;
        if (porUnCambio) form.codigoAcceso.focus();
      } else {
        form.codigoAcceso.value = '';
        form.licencia.value = '';
      }
    }

    selector.addEventListener('change', () => sincronizar(true));

    // Y una vez al cargar: Firefox conserva lo elegido en los desplegables al
    // recargar la página, y sin esto quedaría "veterinario" seleccionado con
    // el bloque escondido —el formulario pediría un código que no se ve—.
    sincronizar(false);

    return () => selector.value;
  }

  function prepararRegistro() {
    const form = $('#formRegistro');
    if (!form) return;

    const caja = $('#errorRegistro');
    const boton = $('#btnCrear');
    const rolElegido = prepararSelectorRol(form);

    // Formulario abierto sin cuenta: le pone el campo trampa y pide el sello
    // al servidor desde ya. Ver H.prepararFormularioPublico en api.js.
    H.prepararFormularioPublico(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError(caja);

      const nombre = form.nombre.value.trim();
      const email = form.email.value.trim();
      const telefono = form.telefono.value.trim();
      const password = form.password.value;
      const password2 = form.password2.value;
      const rol = rolElegido();
      const conCodigo = rol !== 'cliente';

      // Comprobaciones rápidas en el navegador; el servidor las repite todas.
      if (nombre.length < 2) {
        return H.mostrarError(caja, new Error('Escribe tu nombre completo.'));
      }
      if (password.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) || !/\d/.test(password)) {
        return H.mostrarError(caja, new Error('La contraseña debe tener al menos 8 caracteres, con una letra y un número.'));
      }
      if (password !== password2) {
        return H.mostrarError(caja, new Error('Las contraseñas no coinciden.'));
      }
      if (conCodigo && !form.codigoAcceso.value.trim()) {
        return H.mostrarError(caja, new Error('Escribe el código de acceso que te dio la clínica, o elige "Dueño de mascota".'));
      }
      if (rol === 'veterinario' && form.licencia.value.trim().length < 3) {
        return H.mostrarError(caja, new Error('Escribe tu número de licencia profesional.'));
      }
      if (!form.acepta.checked) {
        return H.mostrarError(caja, new Error('Debes aceptar el tratamiento de datos para continuar.'));
      }

      const cuerpo = { nombre, email, telefono: telefono || null, password, rol };

      // El código solo viaja con un rol que lo lleve, y la ficha profesional
      // solo con la de veterinario: mandar una licencia en el alta de un
      // administrador sería guardar un dato que su cuenta no tiene dónde
      // poner.
      if (conCodigo) cuerpo.codigoAcceso = form.codigoAcceso.value.trim();
      if (rol === 'veterinario') {
        cuerpo.licencia = form.licencia.value.trim();
        cuerpo.especialidad = form.especialidad.value;
      }

      await H.conBoton(boton, 'Creando cuenta…', async () => {
        try {
          const datos = await H.api.post(
            '/auth/registro',
            await H.conAntiBots(cuerpo, form),
            { sinRedirigir: true }
          );
          H.sesion.guardar(datos.token, datos.usuario, datos.permisos);

          // Al dueño se le lleva a registrar su primera mascota, que es a lo
          // que viene. Al personal, al panel de su rol.
          location.href = datos.usuario.rol === 'cliente'
            ? `${H.ruta('cliente/mascotas.html')}?bienvenida=1`
            : H.panelDe(datos.usuario.rol);
        } catch (error) {
          H.mostrarError(caja, error);
        }
      });
    });
  }

  /* --------------------------------------------------------
     Recuperación de contraseña

     Dos pasos que no tienen por qué pasar en la misma visita: se pide
     el correo, y el enlace que llega al buzón vuelve a esta página con
     el token en la dirección. Ese enlace es el camino normal.

     El token también puede llegar en la respuesta, pero solo en
     desarrollo y solo cuando no hay servicio de correo montado; en
     producción el servidor nunca lo devuelve.
     -------------------------------------------------------- */
  function prepararRecuperacion() {
    const abrir = $('#abrirRecuperar');
    const bloque = $('#bloqueRecuperar');
    if (!abrir || !bloque) return;

    const formPedir = $('#formRecuperar');
    const formCambiar = $('#formRestablecer');
    const caja = $('#errorRecuperar');
    const aviso = $('#avisoRecuperar');

    /** Deja la pantalla lista para escribir la contraseña nueva. */
    function pedirNueva(token) {
      bloque.hidden = false;
      formCambiar.token.value = token;
      formCambiar.hidden = false;
      formCambiar.nueva.focus();
    }

    // El enlace del correo llega como /login?token=…
    //
    // El token se saca de la dirección y se borra de ella en el acto: si se
    // queda, entra en el historial del navegador, se ve en la barra sobre el
    // hombro de quien esté al lado y viaja en la cabecera Referer de cualquier
    // recurso externo que pida la página. Ya está guardado en el formulario,
    // que es donde hace falta.
    const enlace = new URL(location.href);
    const tokenDelEnlace = enlace.searchParams.get('token');

    if (tokenDelEnlace) {
      enlace.searchParams.delete('token');
      history.replaceState(null, '', `${enlace.pathname}${enlace.search}${enlace.hash}`);

      pedirNueva(tokenDelEnlace);
      aviso.textContent = 'Elige tu contraseña nueva. El enlace solo sirve una vez.';
      aviso.hidden = false;
    }

    // Se prepara al cargar la página y no al abrir el bloque: el servidor exige
    // que pasen unos segundos entre pedir el sello y enviar el formulario, así
    // que pedirlo en el momento del envío lo haría fallar siempre.
    H.prepararFormularioPublico(formPedir);

    abrir.addEventListener('click', (e) => {
      e.preventDefault();
      bloque.hidden = !bloque.hidden;
      if (!bloque.hidden) formPedir.email.focus();
    });

    const cerrar = $('#cerrarRecuperar');
    if (cerrar) cerrar.addEventListener('click', () => { bloque.hidden = true; });

    formPedir.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError(caja);

      await H.conBoton($('#btnRecuperar'), 'Enviando…', async () => {
        try {
          const datos = await H.api.post(
            '/auth/recuperar',
            await H.conAntiBots({ email: formPedir.email.value.trim() }, formPedir),
            { sinRedirigir: true }
          );

          aviso.textContent = datos.mensaje;
          aviso.hidden = false;

          if (datos.token) {
            // Modo desarrollo sin correo montado: el token viene en la
            // respuesta. En producción no llega nunca y se espera al enlace.
            pedirNueva(datos.token);
          }
        } catch (error) {
          H.mostrarError(caja, error);
        }
      });
    });

    formCambiar.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError(caja);

      const nueva = formCambiar.nueva.value;
      if (nueva.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nueva) || !/\d/.test(nueva)) {
        return H.mostrarError(caja, new Error('La contraseña debe tener al menos 8 caracteres, con una letra y un número.'));
      }
      if (nueva !== formCambiar.nueva2.value) {
        return H.mostrarError(caja, new Error('Las contraseñas no coinciden.'));
      }

      await H.conBoton($('#btnRestablecer'), 'Guardando…', async () => {
        try {
          await H.api.post(
            '/auth/restablecer',
            { token: formCambiar.token.value, nueva },
            { sinRedirigir: true }
          );
          H.toast('Contraseña restablecida. Ya puedes entrar.', 'ok');
          bloque.hidden = true;
          formCambiar.hidden = true;
          formCambiar.reset();
          $('#formLogin').email.value = formPedir.email.value.trim();
          $('#formLogin').password.focus();
        } catch (error) {
          H.mostrarError(caja, error);
        }
      });
    });
  }
})();
