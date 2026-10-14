/* ============================================================
   Panel del cliente — registro y edición de mascotas
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  let especies = [];
  // Caché de razas ya consultadas, por especie. Se rellena, nunca se reemplaza.
  const razasPorEspecie = {};
  let mascotas = [];

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente']);
    if (!usuario) return;

    H.prepararModal('modalMascota');
    $('#btnNueva').addEventListener('click', () => abrirFormulario(null));
    $('#formMascota').addEventListener('submit', guardar);
    $('#selectEspecie').addEventListener('change', cargarRazas);

    // Mensaje de bienvenida justo después del registro.
    if (new URLSearchParams(location.search).get('bienvenida')) {
      $('#bienvenida').innerHTML = `<div class="mensaje-ok">
        ¡Cuenta creada! Registra a tu primera mascota para poder agendar citas.
      </div>`;
    }

    $('#listado').innerHTML = H.cargando();

    try {
      const catalogos = await H.api.get('/catalogos/especies');
      especies = catalogos.especies;
      $('#selectEspecie').innerHTML = especies
        .map((e) => `<option value="${e.id}">${escapar(e.nombre)}</option>`)
        .join('');
    } catch (error) {
      H.toast(error.message, 'error');
    }

    await recargar();
  });

  async function recargar() {
    try {
      const datos = await H.api.get('/mascotas');
      mascotas = datos.mascotas;
      pintar();
    } catch (error) {
      $('#listado').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar() {
    const caja = $('#listado');

    if (!mascotas.length) {
      caja.innerHTML = `<section class="tarjeta">
        ${H.bloqueVacio('Todavía no has registrado ninguna mascota.', 'icon-paw')}
      </section>`;
      return;
    }

    caja.innerHTML = `<div class="rejilla-mascotas">
      ${mascotas.map(tarjeta).join('')}
    </div>`;

    caja.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mascota = mascotas.find((m) => m.id === Number(btn.dataset.editar));
        abrirFormulario(mascota);
      });
    });

    caja.querySelectorAll('[data-baja]').forEach((btn) => {
      btn.addEventListener('click', () => darDeBaja(Number(btn.dataset.baja)));
    });
  }

  function tarjeta(m) {
    const foto = m.foto
      ? `<img src="${escapar(m.foto)}" alt="${escapar(m.nombre)}">`
      : `<svg class="icon"><use href="#icon-paw"/></svg>`;

    const sexo = { macho: 'Macho', hembra: 'Hembra', desconocido: 'Sexo sin registrar' }[m.sexo];

    return `<article class="mascota">
      <div class="mascota-foto">${foto}</div>
      <div class="mascota-cuerpo">
        <h3>${escapar(m.nombre)}</h3>
        <p class="mascota-meta">${escapar(m.especie)}${m.raza ? ` · ${escapar(m.raza)}` : ''}</p>
        <div class="mascota-datos">
          <span>${escapar(H.edadLegible(m.edad_meses))} · ${escapar(sexo)}</span>
          ${m.peso_kg ? `<span>Peso: ${escapar(m.peso_kg)} kg</span>` : ''}
          ${m.color ? `<span>Color: ${escapar(m.color)}</span>` : ''}
          ${m.microchip ? `<span>Microchip: ${escapar(m.microchip)}</span>` : ''}
        </div>
      </div>
      <div class="mascota-acciones">
        <a class="btn btn-moss btn-sm" href="${H.ruta('cliente/agendar.html')}?mascota=${m.id}">Agendar</a>
        <button type="button" class="btn btn-outline btn-sm" data-editar="${m.id}">Editar</button>
        <button type="button" class="btn btn-peligro btn-sm" data-baja="${m.id}">Dar de baja</button>
      </div>
    </article>`;
  }

  /* --------------------------------------------------------
     Formulario
     -------------------------------------------------------- */

  async function cargarRazas(seleccionada) {
    const especieId = $('#selectEspecie').value;
    const select = $('#selectRaza');

    if (!especieId) {
      select.innerHTML = '<option value="">Sin especificar</option>';
      return;
    }

    if (!razasPorEspecie[especieId]) {
      try {
        const datos = await H.api.get('/catalogos/razas', { especieId });
        razasPorEspecie[especieId] = datos.razas;
      } catch (error) {
        // El fallo no se guarda en la caché: si se guardara la lista vacía,
        // esa especie se quedaría sin razas para toda la sesión y ni siquiera
        // volviendo a elegirla se reintentaría. La raza es opcional, así que se
        // deja seguir con "Sin especificar" en vez de bloquear el formulario.
        console.error('[mascotas] no se pudieron cargar las razas:', error);
        H.toast('No se pudo cargar la lista de razas. Puedes guardar sin ella.', 'error');
        select.innerHTML = '<option value="">Sin especificar</option>';
        return;
      }
    }

    select.innerHTML = '<option value="">Sin especificar</option>' +
      razasPorEspecie[especieId].map((r) => `<option value="${r.id}">${escapar(r.nombre)}</option>`).join('');

    if (typeof seleccionada === 'number') select.value = String(seleccionada);
  }

  async function abrirFormulario(mascota) {
    const form = $('#formMascota');
    H.limpiarError($('#errorMascota'));
    form.reset();

    $('#tituloModal').textContent = mascota ? `Editar a ${mascota.nombre}` : 'Registrar mascota';

    if (mascota) {
      form.id.value = mascota.id;
      form.nombre.value = mascota.nombre;
      form.sexo.value = mascota.sexo || 'desconocido';
      form.especieId.value = mascota.especie_id;
      form.fechaNacimiento.value = mascota.fecha_nacimiento || '';
      form.pesoKg.value = mascota.peso_kg ?? '';
      form.color.value = mascota.color || '';
      form.microchip.value = mascota.microchip || '';
      form.esterilizado.checked = Boolean(mascota.esterilizado);
      form.informacion.value = mascota.informacion || '';
      await cargarRazas(mascota.raza_id);
    } else {
      form.id.value = '';
      await cargarRazas();
    }

    H.abrirModal('modalMascota');
  }

  async function guardar(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorMascota');
    H.limpiarError(caja);

    const id = form.id.value;
    const cuerpo = {
      nombre: form.nombre.value.trim(),
      especieId: Number(form.especieId.value),
      razaId: form.razaId.value ? Number(form.razaId.value) : null,
      sexo: form.sexo.value,
      fechaNacimiento: form.fechaNacimiento.value || null,
      pesoKg: form.pesoKg.value ? Number(form.pesoKg.value) : null,
      color: form.color.value.trim() || null,
      microchip: form.microchip.value.trim() || null,
      esterilizado: form.esterilizado.checked,
      informacion: form.informacion.value.trim() || null,
    };

    if (!cuerpo.nombre) return H.mostrarError(caja, new Error('El nombre es obligatorio.'));
    if (!cuerpo.especieId) return H.mostrarError(caja, new Error('Selecciona la especie.'));

    // Una fecha de nacimiento futura casi siempre es un error de tecleo.
    if (cuerpo.fechaNacimiento && cuerpo.fechaNacimiento > H.fechaHoyISO()) {
      return H.mostrarError(caja, new Error('La fecha de nacimiento no puede estar en el futuro.'));
    }

    await H.conBoton($('#btnGuardarMascota'), 'Guardando…', async () => {
      try {
        if (id) {
          await H.api.put(`/mascotas/${id}`, cuerpo);
          H.toast('Mascota actualizada.');
        } else {
          await H.api.post('/mascotas', cuerpo);
          H.toast('Mascota registrada.');
        }
        H.cerrarModal('modalMascota');
        await recargar();
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  async function darDeBaja(id) {
    const mascota = mascotas.find((m) => m.id === id);
    const confirmado = await H.confirmar(
      `¿Dar de baja a ${mascota ? mascota.nombre : 'esta mascota'}?\n\n` +
      'Su historia clínica se conserva, pero dejará de aparecer en el listado y no podrás agendarle citas.'
    );
    if (!confirmado) return;

    try {
      await H.api.del(`/mascotas/${id}`);
      H.toast('Mascota dada de baja.');
      await recargar();
    } catch (error) {
      H.toast(error.message, 'error');
    }
  }
})();
