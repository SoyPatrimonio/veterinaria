/* ============================================================
   Panel del cliente — perfil y cambio de contraseña
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $ } = H;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente', 'veterinario', 'admin']);
    if (!usuario) return;

    $('#formPerfil').addEventListener('submit', guardarPerfil);
    $('#formPassword').addEventListener('submit', cambiarPassword);

    try {
      const datos = await H.api.get('/auth/me');
      const form = $('#formPerfil');
      form.nombre.value = datos.usuario.nombre || '';
      form.email.value = datos.usuario.email || '';
      form.telefono.value = datos.usuario.telefono || '';
      form.documento.value = datos.usuario.documento || '';
      form.ciudad.value = datos.usuario.ciudad || '';
      form.direccion.value = datos.usuario.direccion || '';
    } catch (error) {
      H.toast(error.message, 'error');
    }
  });

  async function guardarPerfil(e) {
    e.preventDefault();
    const form = e.target;
    const error = $('#errorPerfil');
    const ok = $('#okPerfil');

    H.limpiarError(error);
    ok.hidden = true;

    const cuerpo = {
      nombre: form.nombre.value.trim(),
      telefono: form.telefono.value.trim() || null,
      documento: form.documento.value.trim() || null,
      ciudad: form.ciudad.value.trim() || null,
      direccion: form.direccion.value.trim() || null,
    };

    if (cuerpo.nombre.length < 2) {
      return H.mostrarError(error, new Error('Escribe tu nombre completo.'));
    }

    await H.conBoton($('#btnGuardarPerfil'), 'Guardando…', async () => {
      try {
        const datos = await H.api.put('/auth/perfil', cuerpo);

        // La barra lateral muestra el nombre: hay que refrescar la sesión.
        const sesion = H.sesion.usuario();
        H.sesion.guardar(
          H.sesion.token(),
          { ...sesion, nombre: datos.usuario.nombre, telefono: datos.usuario.telefono },
          H.sesion.permisos()
        );

        ok.textContent = 'Datos actualizados.';
        ok.hidden = false;
        H.toast('Perfil actualizado.');
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        H.mostrarError(error, err);
      }
    });
  }

  async function cambiarPassword(e) {
    e.preventDefault();
    const form = e.target;
    const error = $('#errorPassword');
    const ok = $('#okPassword');

    H.limpiarError(error);
    ok.hidden = true;

    const actual = form.actual.value;
    const nueva = form.nueva.value;
    const nueva2 = form.nueva2.value;

    if (nueva !== nueva2) {
      return H.mostrarError(error, new Error('Las contraseñas nuevas no coinciden.'));
    }
    if (nueva.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nueva) || !/\d/.test(nueva)) {
      return H.mostrarError(error, new Error('La contraseña nueva debe tener al menos 8 caracteres, con una letra y un número.'));
    }

    await H.conBoton($('#btnCambiarPassword'), 'Cambiando…', async () => {
      try {
        await H.api.put('/auth/password', { actual, nueva });
        form.reset();

        // Cambiar la contraseña cierra todas las sesiones del usuario, así que
        // el token que tiene el navegador ya no sirve: hay que volver a entrar.
        ok.textContent = 'Contraseña actualizada. Vuelve a iniciar sesión…';
        ok.hidden = false;
        H.toast('Contraseña actualizada. Vuelve a iniciar sesión.');

        setTimeout(() => {
          H.sesion.cerrar();
          location.href = H.ruta('login.html');
        }, 1600);
      } catch (err) {
        H.mostrarError(error, err);
      }
    });
  }
})();
