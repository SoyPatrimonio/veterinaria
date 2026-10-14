/* ============================================================
   Administración — módulo de seguridad
   Roles y permisos, sesiones abiertas, accesos, intentos de
   login y rastro de auditoría.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, $$, escapar } = H;

  const ETIQUETA_MODULO = {
    configuracion: 'Configuración',
    seguridad: 'Seguridad',
    usuarios: 'Usuarios',
    mascotas: 'Mascotas',
    agenda: 'Agenda',
    historia: 'Historia clínica',
    inventario: 'Inventario',
    facturacion: 'Facturación',
    comunicacion: 'Comunicación',
    archivos: 'Archivos',
    reportes: 'Reportes',
  };

  const MOTIVO_INTENTO = {
    correo_no_existe: 'El correo no existe',
    password_incorrecta: 'Contraseña incorrecta',
    bloqueo_temporal: 'Bloqueado por intentos',
    cuenta_inactiva: 'Cuenta inactiva',
    cuenta_bloqueado: 'Cuenta bloqueada',
  };

  let roles = [];
  const yaCargado = {};

  document.addEventListener('DOMContentLoaded', async () => {
    // Además del rol se exige el permiso: si mañana se le quita
    // auditoria.ver al admin, esta página deja de ser accesible.
    const yo = H.montarPanel(['admin'], ['auditoria.ver', 'roles.ver']);
    if (!yo) return;

    $$('#pestanas button').forEach((boton) => {
      boton.addEventListener('click', () => cambiarPestana(boton.dataset.panel));
    });

    $('#filtroModulo').addEventListener('change', cargarAuditoria);

    await cargarPermisos();
  });

  function cambiarPestana(nombre) {
    $$('#pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.panel === nombre));
    $$('.panel-seccion').forEach((s) => { s.hidden = true; });

    const seccion = $(`#panel${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}`);
    if (seccion) seccion.hidden = false;

    // Cada pestaña se pide una sola vez, la primera vez que se abre.
    if (yaCargado[nombre]) return;
    yaCargado[nombre] = true;

    if (nombre === 'sesiones') cargarSesiones();
    if (nombre === 'accesos') cargarAccesos();
    if (nombre === 'intentos') cargarIntentos();
    if (nombre === 'auditoria') cargarAuditoria();
    if (nombre === 'codigo') cargarCodigo();
  }

  /* --------------------------------------------------------
     Códigos de acceso del personal

     Uno por rol: el que se escribe en el registro para que la cuenta
     nazca con ese panel en vez del de dueños. El servidor los devuelve
     enteros —quien entra aquí ya podía crear esas cuentas a mano—, pero
     en pantalla empiezan tapados: esto se abre en el computador del
     mostrador y lo ve cualquiera que pase por delante.
     -------------------------------------------------------- */

  const CUENTA_DE_ROL = {
    veterinario: {
      titulo: 'Veterinario',
      abre: 'Da el panel clínico: agenda, pacientes e historia.',
    },
    // La administración ya no tiene código: esas cuentas se crean desde la
    // pantalla de usuarios, con el permiso y la contraseña de quien las crea.
  };

  // Lo último que devolvió el servidor. Se guarda para poder repintar la
  // pestaña tras cambiar uno sin volver a pedir los dos —y sin dejar otra
  // línea de "consultó los códigos" en la auditoría por un cambio propio—.
  let codigos = [];

  async function cargarCodigo() {
    const caja = $('#cajaCodigo');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/seguridad/codigo-acceso');
      codigos = datos.codigos || [];
      pintarCodigos();
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-shield');
    }
  }

  function pintarCodigos() {
    const caja = $('#cajaCodigo');

    caja.innerHTML = codigos.map((codigo, indice) => {
      const cuenta = CUENTA_DE_ROL[codigo.rol] || { titulo: codigo.rol, abre: '' };
      const separador = indice === 0 ? '' : 'border-top:1px solid var(--border);margin-top:20px;padding-top:20px';

      if (!codigo.activo) {
        return `
          <div style="${separador}">
            <h3 style="font-size:1rem;margin-bottom:4px">${escapar(cuenta.titulo)}</h3>
            <p class="campo-ayuda" style="margin-bottom:14px">
              Todavía no hay código, así que nadie puede registrarse con este rol.
              ${escapar(cuenta.abre)}
            </p>
            <button type="button" class="btn btn-primary btn-sm" data-rotar="${escapar(codigo.rol)}">
              Generar el código
            </button>
          </div>`;
      }

      return `
        <div style="${separador}">
          <h3 style="font-size:1rem;margin-bottom:4px">${escapar(cuenta.titulo)}</h3>
          <p class="campo-ayuda">${escapar(cuenta.abre)}</p>
          <p class="codigo-personal"><code data-valor="${escapar(codigo.rol)}">${escapar(codigo.enmascarado)}</code></p>
          <p class="campo-ayuda" style="margin-bottom:14px">
            Última vez que cambió: ${escapar(H.fechaLarga(codigo.actualizadoEn))}
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-outline btn-sm" data-ver="${escapar(codigo.rol)}">Mostrar</button>
            <button type="button" class="btn btn-outline btn-sm" data-copiar="${escapar(codigo.rol)}">Copiar</button>
            <button type="button" class="btn btn-peligro btn-sm" data-rotar="${escapar(codigo.rol)}">Cambiar el código</button>
          </div>
        </div>`;
    }).join('');

    caja.querySelectorAll('[data-ver]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const codigo = codigos.find((c) => c.rol === boton.dataset.ver);
        const valor = caja.querySelector(`[data-valor="${boton.dataset.ver}"]`);
        const tapado = valor.textContent === codigo.enmascarado;

        valor.textContent = tapado ? codigo.codigo : codigo.enmascarado;
        boton.textContent = tapado ? 'Ocultar' : 'Mostrar';
      });
    });

    caja.querySelectorAll('[data-copiar]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const codigo = codigos.find((c) => c.rol === boton.dataset.copiar);
        try {
          await navigator.clipboard.writeText(codigo.codigo);
          H.toast('Código copiado. Entrégaselo solo a quien vaya a entrar con ese rol.');
        } catch {
          // Decir "copiado" cuando no se copió es peor que no ofrecerlo.
          H.toast('Cópialo a mano: tu navegador no dio permiso.', 'error');
        }
      });
    });

    caja.querySelectorAll('[data-rotar]').forEach((boton) => {
      boton.addEventListener('click', () => rotarCodigo(boton.dataset.rotar, boton));
    });
  }

  /**
   * Cambiar un código deja fuera a todo el que tuviera el anterior y aún no se
   * haya registrado, así que el servidor pide la contraseña otra vez y aquí se
   * dice en voz alta antes de tocarlo.
   */
  async function rotarCodigo(rol, boton) {
    const cuenta = CUENTA_DE_ROL[rol] || { titulo: rol };
    const anterior = codigos.find((c) => c.rol === rol);
    const habiaOtro = Boolean(anterior && anterior.activo);

    const passwordActual = await H.pedirPassword({
      titulo: `${habiaOtro ? 'Cambiar' : 'Generar'} el código de ${cuenta.titulo.toLowerCase()}`,
      detalle: habiaOtro
        ? 'El código actual dejará de servir. Quien lo tenga apuntado y no se haya registrado todavía tendrá que pedirte el nuevo.'
        : `Se creará el código con el que alguien podrá registrarse como ${cuenta.titulo.toLowerCase()}.`,
      boton: habiaOtro ? 'Cambiar' : 'Generar',
    });
    if (!passwordActual) return;

    await H.conBoton(boton, habiaOtro ? 'Cambiando…' : 'Generando…', async () => {
      try {
        const datos = await H.api.post('/seguridad/codigo-acceso/rotar', { rol, passwordActual });
        H.toast(datos.mensaje, 'ok');

        codigos = codigos.map((c) => (c.rol === rol ? { ...c, ...datos, activo: true } : c));
        pintarCodigos();
      } catch (error) {
        H.toast(error.message, 'error');
      }
    });
  }

  /* --------------------------------------------------------
     Roles y permisos
     -------------------------------------------------------- */
  async function cargarPermisos() {
    const caja = $('#matrizPermisos');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/seguridad/roles');
      roles = datos.roles;

      const cabecera = roles.map((r) => `<th>${escapar(r.nombre)}</th>`).join('');

      const modulos = Object.entries(datos.porModulo).map(([modulo, permisos]) => {
        const filas = permisos.map((p) => {
          const celdas = roles.map((r) => {
            const tiene = (p.roles || []).includes(r.id);
            return `<td class="celda-permiso">${tiene ? '<span class="si">✓</span>' : '<span class="no">—</span>'}</td>`;
          }).join('');

          return `<tr>
                    <td>
                      <strong>${escapar(p.nombre)}</strong>
                      <br><code class="codigo-permiso">${escapar(p.codigo)}</code>
                    </td>
                    ${celdas}
                  </tr>`;
        }).join('');

        return `<h4 class="titulo-modulo">${escapar(ETIQUETA_MODULO[modulo] || modulo)}</h4>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th>Permiso</th>${cabecera}</tr></thead>
                    <tbody>${filas}</tbody>
                  </table>
                </div>`;
      }).join('');

      const resumen = roles.map((r) => `
        <div class="metrica">
          <strong>${r.permisos}</strong>
          <span>permisos · rol ${escapar(r.nombre)} · ${r.usuarios} usuario(s)</span>
        </div>`).join('');

      caja.innerHTML = `<div class="rejilla-metricas">${resumen}</div>${modulos}`;
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-shield');
    }
  }

  /* --------------------------------------------------------
     Sesiones abiertas
     -------------------------------------------------------- */
  async function cargarSesiones() {
    const caja = $('#listaSesiones');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/seguridad/sesiones', { limite: 100 });
      if (!datos.sesiones.length) {
        caja.innerHTML = H.bloqueVacio('No hay sesiones abiertas.', 'icon-user');
        return;
      }

      const filas = datos.sesiones.map((s) => `
        <tr>
          <td><strong>${escapar(s.nombre)}</strong><br><small>${escapar(s.email)}</small></td>
          <td>${escapar(s.rol)}</td>
          <td>${escapar(s.ip || '—')}</td>
          <td>${escapar(H.fechaLarga(s.creada_en))} ${escapar(H.hora12(s.creada_en))}</td>
          <td>${escapar(H.hora12(s.ultima_vez))}</td>
          <td class="acciones">
            <button type="button" class="btn btn-sm btn-peligro" data-cerrar-usuario="${s.usuario_id}">
              Cerrar sesión
            </button>
          </td>
        </tr>`).join('');

      caja.innerHTML = `<div class="tabla-envoltura">
          <table class="tabla">
            <thead><tr><th>Usuario</th><th>Rol</th><th>IP</th><th>Inició</th><th>Última actividad</th><th></th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`;

      caja.querySelectorAll('[data-cerrar-usuario]').forEach((boton) => {
        boton.addEventListener('click', () => cerrarSesionDe(boton.dataset.cerrarUsuario, boton));
      });
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-user');
    }
  }

  async function cerrarSesionDe(usuarioId, boton) {
    // Echar a alguien fuera es la forma rápida de dejar sin acceso a quien
    // podría estar dándose cuenta de algo: el servidor pide confirmar con la
    // contraseña propia.
    const passwordActual = await H.pedirPassword({
      titulo: 'Cerrar sesiones',
      detalle: 'Se cerrarán todas las sesiones abiertas de este usuario. Tendrá que volver a entrar.',
      boton: 'Cerrar sesiones',
    });
    if (!passwordActual) return;

    await H.conBoton(boton, 'Cerrando…', async () => {
      try {
        const datos = await H.api.post(`/seguridad/sesiones/${usuarioId}/cerrar`, { passwordActual });
        H.toast(datos.mensaje, 'ok');
        await cargarSesiones();
      } catch (error) {
        H.toast(error.message, 'error');
      }
    });
  }

  /* --------------------------------------------------------
     Accesos
     -------------------------------------------------------- */
  async function cargarAccesos() {
    const caja = $('#listaAccesos');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/seguridad/accesos', { limite: 100 });
      if (!datos.accesos.length) {
        caja.innerHTML = H.bloqueVacio('Todavía no hay accesos registrados.', 'icon-user');
        return;
      }

      const filas = datos.accesos.map((a) => `
        <tr>
          <td>${escapar(H.fechaLarga(a.creado_en))} ${escapar(H.hora12(a.creado_en))}</td>
          <td><strong>${escapar(a.nombre)}</strong><br><small>${escapar(a.email)}</small></td>
          <td>${escapar(a.rol)}</td>
          <td><span class="insignia insignia-${a.tipo === 'entrada' ? 'confirmada' : 'cancelada'}">${escapar(a.tipo)}</span></td>
          <td>${escapar(a.ip || '—')}</td>
        </tr>`).join('');

      caja.innerHTML = `<div class="tabla-envoltura">
          <table class="tabla">
            <thead><tr><th>Cuándo</th><th>Usuario</th><th>Rol</th><th>Tipo</th><th>IP</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`;
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-user');
    }
  }

  /* --------------------------------------------------------
     Intentos de login
     -------------------------------------------------------- */
  async function cargarIntentos() {
    const caja = $('#listaIntentos');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/seguridad/intentos', { limite: 100 });
      if (!datos.intentos.length) {
        caja.innerHTML = H.bloqueVacio('Sin intentos registrados.', 'icon-shield');
        return;
      }

      const filas = datos.intentos.map((i) => `
        <tr>
          <td>${escapar(H.fechaLarga(i.creado_en))} ${escapar(H.hora12(i.creado_en))}</td>
          <td>${escapar(i.email)}</td>
          <td>
            <span class="insignia insignia-${i.exito ? 'atendida' : 'cancelada'}">
              ${i.exito ? 'Correcto' : 'Fallido'}
            </span>
          </td>
          <td>${escapar(i.motivo ? (MOTIVO_INTENTO[i.motivo] || i.motivo) : '—')}</td>
          <td>${escapar(i.ip || '—')}</td>
        </tr>`).join('');

      caja.innerHTML = `<div class="tabla-envoltura">
          <table class="tabla">
            <thead><tr><th>Cuándo</th><th>Correo</th><th>Resultado</th><th>Motivo</th><th>IP</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`;
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-shield');
    }
  }

  /* --------------------------------------------------------
     Auditoría
     -------------------------------------------------------- */
  async function cargarAuditoria() {
    const caja = $('#listaAuditoria');
    caja.innerHTML = H.cargando();

    try {
      const datos = await H.api.get('/seguridad/auditoria', {
        modulo: $('#filtroModulo').value || undefined,
        limite: 150,
      });

      $('#contadorAuditoria').textContent = `${datos.registros.length} registro(s)`;

      if (!datos.registros.length) {
        caja.innerHTML = H.bloqueVacio('No hay movimientos registrados con ese filtro.', 'icon-shield');
        return;
      }

      const filas = datos.registros.map((r) => `
        <tr>
          <td>${escapar(H.fechaLarga(r.creado_en))} ${escapar(H.hora12(r.creado_en))}</td>
          <td>${escapar(r.usuario_nombre || 'Sistema')}</td>
          <td>${escapar(ETIQUETA_MODULO[r.modulo] || r.modulo)}</td>
          <td><code class="codigo-permiso">${escapar(r.accion)}</code></td>
          <td>${escapar(r.descripcion || `${r.tabla}#${r.registro_id ?? ''}`)}</td>
          <td>${escapar(r.ip || '—')}</td>
        </tr>`).join('');

      caja.innerHTML = `<div class="tabla-envoltura">
          <table class="tabla">
            <thead><tr><th>Cuándo</th><th>Quién</th><th>Módulo</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`;
    } catch (error) {
      caja.innerHTML = H.bloqueVacio(error.message, 'icon-shield');
    }
  }
})();
