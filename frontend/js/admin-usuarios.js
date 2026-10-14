/* ============================================================
   Administración — gestión de usuarios
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const ETIQUETA_ROL = { cliente: 'Cliente', veterinario: 'Veterinario', admin: 'Administrador' };

  let usuarios = [];
  let yo = null;
  let temporizador = null;

  document.addEventListener('DOMContentLoaded', async () => {
    yo = H.montarPanel(['admin']);
    if (!yo) return;

    H.prepararModal('modalUsuario');

    $('#btnNuevo').addEventListener('click', () => {
      H.limpiarError($('#errorUsuario'));
      $('#formUsuario').reset();
      H.abrirModal('modalUsuario');
    });

    $('#formUsuario').addEventListener('submit', crear);
    $('#filtroRol').addEventListener('change', recargar);
    $('#filtroEstado').addEventListener('change', recargar);
    $('#inputBusqueda').addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(recargar, 300);
    });

    await recargar();
  });

  async function recargar() {
    $('#listaUsuarios').innerHTML = H.cargando();
    try {
      const datos = await H.api.get('/usuarios', {
        rol: $('#filtroRol').value || undefined,
        estado: $('#filtroEstado').value || undefined,
        busqueda: $('#inputBusqueda').value.trim() || undefined,
        limite: 200,
      });
      usuarios = datos.usuarios;
      $('#contador').textContent = `${datos.total} usuario(s)`;
      pintar();
    } catch (error) {
      $('#listaUsuarios').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar() {
    const caja = $('#listaUsuarios');

    if (!usuarios.length) {
      caja.innerHTML = H.bloqueVacio('No hay usuarios con esos filtros.', 'icon-users');
      return;
    }

    caja.innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Rol</th><th>Estado</th><th>Registro</th><th></th></tr>
        </thead>
        <tbody>
          ${usuarios.map((u) => {
            const esYo = u.id === yo.id;
            return `<tr>
              <td><strong>${escapar(u.nombre)}</strong>${esYo ? ' <span class="campo-ayuda">(tú)</span>' : ''}</td>
              <td>${escapar(u.email)}</td>
              <td>${escapar(u.telefono || '—')}</td>
              <td>${escapar(ETIQUETA_ROL[u.rol] || u.rol)}</td>
              <td><span class="insignia insignia-${escapar(u.estado)}">${u.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
              <td class="campo-ayuda">${escapar(H.fechaLarga(u.creado_en))}</td>
              <td class="acciones">
                ${esYo ? '' : `<button type="button" class="btn ${u.estado === 'activo' ? 'btn-peligro' : 'btn-moss'} btn-sm"
                    data-estado="${u.estado === 'activo' ? 'inactivo' : 'activo'}" data-id="${u.id}">
                    ${u.estado === 'activo' ? 'Desactivar' : 'Activar'}
                  </button>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

    caja.querySelectorAll('[data-estado]').forEach((btn) => {
      btn.addEventListener('click', () => cambiarEstado(Number(btn.dataset.id), btn.dataset.estado, btn));
    });
  }

  async function cambiarEstado(id, estado, boton) {
    const usuario = usuarios.find((u) => u.id === id);

    // Mover una cuenta es de las acciones que el servidor no acepta solo con
    // la sesión abierta: pide la contraseña otra vez.
    const passwordActual = await H.pedirPassword({
      titulo: estado === 'activo' ? 'Activar cuenta' : 'Desactivar cuenta',
      detalle: estado === 'activo'
        ? `${usuario.nombre} volverá a poder iniciar sesión.`
        : `${usuario.nombre} no podrá iniciar sesión. Sus datos y su historial se conservan.`,
      boton: estado === 'activo' ? 'Activar' : 'Desactivar',
    });
    if (!passwordActual) return;

    await H.conBoton(boton, '…', async () => {
      try {
        await H.api.patch(`/usuarios/${id}/estado`, { estado, passwordActual });
        H.toast(`Usuario ${estado === 'activo' ? 'activado' : 'desactivado'}.`);
        await recargar();
      } catch (error) {
        H.toast(error.message, 'error');
      }
    });
  }

  async function crear(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorUsuario');
    H.limpiarError(caja);

    const cuerpo = {
      nombre: form.nombre.value.trim(),
      email: form.email.value.trim(),
      telefono: form.telefono.value.trim() || null,
      rol: form.rol.value,
      password: form.password.value,
    };

    if (cuerpo.password.length < 8 || !/[A-Za-z]/.test(cuerpo.password) || !/\d/.test(cuerpo.password)) {
      return H.mostrarError(caja, new Error('La contraseña debe tener al menos 8 caracteres, con una letra y un número.'));
    }

    // Crear una cuenta es crear una llave del sistema: el servidor pide
    // confirmar con la contraseña de quien la está creando.
    const passwordActual = await H.pedirPassword({
      titulo: 'Crear usuario',
      detalle: `Vas a crear la cuenta de ${cuerpo.nombre} con rol ${cuerpo.rol}. Tendrá que cambiar la contraseña al entrar.`,
      boton: 'Crear cuenta',
    });
    if (!passwordActual) return;

    await H.conBoton($('#btnGuardarUsuario'), 'Creando…', async () => {
      try {
        await H.api.post('/usuarios', { ...cuerpo, passwordActual });
        H.cerrarModal('modalUsuario');
        H.toast('Usuario creado.');
        form.reset();
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }
})();
