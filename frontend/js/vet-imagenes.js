/* ============================================================
   Imagenología — estudios, galería e informes

   El informe en borrador NO se le muestra al propietario: una
   conclusión a medias es peor que ninguna. Solo cuando se firma
   pasa a la historia clínica visible desde el portal.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const { $, escapar } = H;

  const ETIQUETA_MODALIDAD = {
    radiografia: 'Radiografía',
    ecografia: 'Ecografía',
    tomografia: 'Tomografía',
    endoscopia: 'Endoscopia',
    fotografia: 'Fotografía clínica',
  };

  let estudios = [];
  let listaMascotas = [];
  let equipos = [];
  let abierto = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['veterinario', 'admin'], ['imagenes.ver', 'imagenes.gestionar']);
    if (!usuario) return;

    ['modalEstudio', 'modalDetalle'].forEach(H.prepararModal);

    $('#btnNuevo').addEventListener('click', abrirNuevo);
    $('#formEstudio').addEventListener('submit', crearEstudio);
    ['#filtroModalidad', '#filtroEstado'].forEach((s) => $(s).addEventListener('change', recargar));

    if (!H.puede('imagenes.gestionar')) $('#btnNuevo').hidden = true;

    await cargarCatalogos();
    await recargar();
  });

  async function cargarCatalogos() {
    try {
      const mascotas = await H.api.get('/mascotas', { limite: 200 });
      listaMascotas = mascotas.mascotas || [];
    } catch (error) {
      H.toast(`No se pudieron cargar los pacientes: ${error.message}`, 'error');
    }

    // Los equipos son opcionales: si no hay permiso o no hay ninguno
    // registrado, el selector se queda vacío y el estudio se guarda igual.
    try {
      const datos = await H.api.get('/operaciones/equipos', {}, { sinRedirigir: true });
      equipos = datos.equipos || [];
    } catch {
      equipos = [];
    }
  }

  async function recargar() {
    $('#listaEstudios').innerHTML = H.cargando();
    try {
      const datos = await H.api.get('/imagenes', {
        modalidad: $('#filtroModalidad').value || undefined,
        estado: $('#filtroEstado').value || undefined,
      });
      estudios = datos.estudios || [];
      pintar();
    } catch (error) {
      $('#listaEstudios').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
    }
  }

  function pintar() {
    if (!estudios.length) {
      $('#listaEstudios').innerHTML = H.bloqueVacio('No hay estudios con esos filtros.', 'icon-micro');
      return;
    }

    $('#listaEstudios').innerHTML = `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr><th>Estudio</th><th>Paciente</th><th>Modalidad</th><th>Fecha</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          ${estudios.map((e) => `
            <tr>
              <td>
                <strong>${escapar(e.numero)}</strong>
                ${e.region ? `<br><span class="campo-ayuda">${escapar(e.region)}${e.proyeccion ? ` · ${escapar(e.proyeccion)}` : ''}</span>` : ''}
              </td>
              <td>${escapar(e.mascota_nombre || '—')}</td>
              <td>${escapar(ETIQUETA_MODALIDAD[e.modalidad] || e.modalidad)}</td>
              <td>${escapar(H.fechaLarga(e.fecha))}</td>
              <td>
                <span class="insignia insignia-${escapar(e.estado)}">${escapar(e.estado)}</span>
                ${Number(e.archivos) > 0 ? ` <span class="chip chip-info">${escapar(e.archivos)} archivo(s)</span>` : ''}
              </td>
              <td class="acciones">
                <button type="button" class="btn btn-outline btn-sm" data-abrir="${e.id}">Abrir</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    $('#listaEstudios').querySelectorAll('[data-abrir]').forEach((b) => {
      b.addEventListener('click', () => abrirDetalle(Number(b.dataset.abrir)));
    });
  }

  /* --------------------------------------------------------
     Nuevo estudio
     -------------------------------------------------------- */

  function abrirNuevo() {
    const form = $('#formEstudio');
    H.limpiarError($('#errorEstudio'));
    form.reset();

    form.mascotaId.innerHTML = '<option value="">Selecciona el paciente</option>' + listaMascotas
      .map((m) => `<option value="${m.id}">${escapar(m.nombre)} — ${escapar(m.cliente_nombre || '')}</option>`)
      .join('');

    form.equipoId.innerHTML = '<option value="">Sin registrar</option>' + equipos
      .map((e) => `<option value="${e.id}">${escapar(e.nombre)}${e.codigo ? ` (${escapar(e.codigo)})` : ''}</option>`)
      .join('');

    H.abrirModal('modalEstudio');
  }

  async function crearEstudio(e) {
    e.preventDefault();
    const form = e.target;
    const caja = $('#errorEstudio');
    H.limpiarError(caja);

    if (!form.mascotaId.value) return H.mostrarError(caja, new Error('Selecciona el paciente.'));

    const cuerpo = {
      mascotaId: Number(form.mascotaId.value),
      modalidad: form.modalidad.value,
      equipoId: form.equipoId.value ? Number(form.equipoId.value) : null,
      region: form.region.value.trim() || null,
      proyeccion: form.proyeccion.value.trim() || null,
      sedacion: form.sedacion.checked,
      indicacion: form.indicacion.value.trim() || null,
    };

    await H.conBoton($('#btnGuardarEstudio'), 'Registrando…', async () => {
      try {
        const datos = await H.api.post('/imagenes', cuerpo);
        H.cerrarModal('modalEstudio');
        H.toast('Estudio registrado. Ahora adjunta las imágenes.');
        await recargar();
        if (datos.estudio) abrirDetalle(datos.estudio.id);
      } catch (error) {
        H.mostrarError(caja, error);
      }
    });
  }

  /* --------------------------------------------------------
     Detalle: galería, comparación e informe
     -------------------------------------------------------- */

  async function abrirDetalle(id) {
    H.limpiarError($('#errorDetalle'));
    $('#cuerpoDetalle').innerHTML = H.cargando();
    H.abrirModal('modalDetalle');

    try {
      abierto = await H.api.get(`/imagenes/${id}`);
    } catch (error) {
      $('#cuerpoDetalle').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    pintarDetalle();
  }

  function pintarDetalle() {
    const e = abierto.estudio;
    const archivos = abierto.archivos || [];
    const informe = abierto.informe;
    const comparables = abierto.comparables || [];

    $('#tituloDetalle').textContent =
      `${e.numero} — ${ETIQUETA_MODALIDAD[e.modalidad] || e.modalidad}`;
    $('#subDetalle').innerHTML =
      `${escapar(e.mascota_nombre || '')} · ${escapar(H.fechaLarga(e.fecha))}` +
      `${e.region ? ` · ${escapar(e.region)}` : ''}` +
      `${e.proyeccion ? ` · ${escapar(e.proyeccion)}` : ''}` +
      `${e.sedacion ? ' · <span class="chip chip-aviso">con sedación</span>' : ''}` +
      `${e.equipo_nombre ? ` · equipo: ${escapar(e.equipo_nombre)}` : ''}`;

    const galeria = archivos.length
      ? `<div class="rejilla-mascotas">
          ${archivos.map((a) => `
            <figure class="mascota">
              <a href="${escapar(a.archivo)}" target="_blank" rel="noopener">
                <img class="mascota-foto" src="${escapar(a.miniatura || a.archivo)}"
                     alt="${escapar(a.titulo)}" loading="lazy">
              </a>
              <figcaption class="mascota-cuerpo">
                <strong>${escapar(a.titulo)}</strong>
                ${H.puede('imagenes.gestionar')
                  ? `<button type="button" class="btn btn-peligro btn-sm" data-borrar-archivo="${a.id}">Quitar</button>`
                  : ''}
              </figcaption>
            </figure>`).join('')}
        </div>`
      : H.bloqueVacio('Este estudio todavía no tiene imágenes adjuntas.', 'icon-micro');

    const puedeInformar = H.puede('imagenes.informar');
    const firmado = informe && informe.estado === 'firmado';

    const bloqueInforme = firmado
      ? `<div class="mensaje-ok">
          <strong>Informe firmado</strong>
          ${informe.firmado_en ? ` el ${escapar(H.fechaLarga(informe.firmado_en))}` : ''}
          ${informe.radiologo_nombre ? ` por ${escapar(informe.radiologo_nombre)}` : ''}.
        </div>
        <dl class="constantes">
          ${informe.tecnica ? `<div class="constante"><dt>Técnica</dt><dd>${escapar(informe.tecnica)}</dd></div>` : ''}
          <div class="constante"><dt>Hallazgos</dt><dd>${escapar(informe.hallazgos)}</dd></div>
          <div class="constante"><dt>Conclusión</dt><dd>${escapar(informe.conclusion)}</dd></div>
          ${informe.recomendaciones ? `<div class="constante"><dt>Recomendaciones</dt><dd>${escapar(informe.recomendaciones)}</dd></div>` : ''}
        </dl>`
      : puedeInformar
        ? `<form id="formInforme">
            ${comparables.length ? `
              <label class="campo">
                <span>Comparar con un estudio anterior</span>
                <select name="comparadoCon">
                  <option value="">Sin comparación</option>
                  ${comparables.map((c) => `
                    <option value="${c.id}" ${informe && informe.comparado_con === c.id ? 'selected' : ''}>
                      ${escapar(c.numero)} — ${escapar(H.fechaLarga(c.fecha))} (${escapar(ETIQUETA_MODALIDAD[c.modalidad] || c.modalidad)})
                    </option>`).join('')}
                </select>
                <small class="campo-ayuda">
                  Es lo que convierte el informe en un seguimiento: "la lesión creció respecto a la placa de marzo".
                </small>
              </label>` : ''}

            <label class="campo">
              <span>Técnica</span>
              <input type="text" name="tecnica" maxlength="2000"
                     value="${escapar(informe?.tecnica || '')}" placeholder="kV, mAs, transductor…">
            </label>

            <label class="campo">
              <span>Hallazgos *</span>
              <textarea name="hallazgos" required maxlength="8000" rows="5">${escapar(informe?.hallazgos || '')}</textarea>
            </label>

            <label class="campo">
              <span>Conclusión *</span>
              <textarea name="conclusion" required maxlength="4000" rows="3">${escapar(informe?.conclusion || '')}</textarea>
            </label>

            <label class="campo">
              <span>Recomendaciones</span>
              <textarea name="recomendaciones" maxlength="4000">${escapar(informe?.recomendaciones || '')}</textarea>
            </label>

            <div class="modal-acciones">
              <button type="submit" class="btn btn-outline" data-firmar="0">Guardar borrador</button>
              <button type="submit" class="btn btn-primary" data-firmar="1">Firmar y avisar</button>
            </div>
            <p class="campo-ayuda">
              El borrador no lo ve el propietario. Al firmar se le avisa de que el informe está listo.
            </p>
          </form>`
        : H.bloqueVacio('Todavía no hay informe firmado.', 'icon-carpeta');

    $('#cuerpoDetalle').innerHTML = `
      <h4 class="titulo-modulo">Imágenes</h4>
      ${galeria}

      ${H.puede('imagenes.gestionar') ? `
        <form id="formArchivo" class="fila-editable" style="margin-top:14px">
          <label class="campo">
            <span>Título</span>
            <input type="text" name="titulo" required maxlength="150" placeholder="Proyección lateral derecha">
          </label>
          <label class="campo">
            <span>URL del archivo</span>
            <input type="url" name="archivo" required maxlength="255" placeholder="https://…">
          </label>
          <button type="submit" class="btn btn-primary">Adjuntar</button>
        </form>` : ''}

      <h4 class="titulo-modulo" style="margin-top:24px">Informe</h4>
      ${bloqueInforme}`;

    conectarDetalle();
  }

  function conectarDetalle() {
    const id = abierto.estudio.id;

    const formArchivo = $('#formArchivo');
    if (formArchivo) {
      formArchivo.addEventListener('submit', async (e) => {
        e.preventDefault();
        H.limpiarError($('#errorDetalle'));

        const boton = formArchivo.querySelector('button[type="submit"]');
        await H.conBoton(boton, 'Adjuntando…', async () => {
          try {
            await H.api.post(`/imagenes/${id}/archivos`, {
              titulo: formArchivo.titulo.value.trim(),
              archivo: formArchivo.archivo.value.trim(),
            });
            H.toast('Archivo adjuntado.');
            abierto = await H.api.get(`/imagenes/${id}`);
            pintarDetalle();
            await recargar();
          } catch (error) {
            H.mostrarError($('#errorDetalle'), error);
          }
        });
      });
    }

    H.$$('#cuerpoDetalle [data-borrar-archivo]').forEach((b) => {
      b.addEventListener('click', async () => {
        const ok = await H.confirmar('¿Quitar este archivo del estudio?');
        if (!ok) return;

        try {
          await H.api.del(`/imagenes/archivos/${b.dataset.borrarArchivo}`);
          H.toast('Archivo retirado.');
          abierto = await H.api.get(`/imagenes/${id}`);
          pintarDetalle();
        } catch (error) {
          H.mostrarError($('#errorDetalle'), error);
        }
      });
    });

    const formInforme = $('#formInforme');
    if (!formInforme) return;

    // Los dos botones envían el mismo formulario; lo que cambia es si firma.
    let firmar = false;
    formInforme.querySelectorAll('[data-firmar]').forEach((b) => {
      b.addEventListener('click', () => { firmar = b.dataset.firmar === '1'; });
    });

    formInforme.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.limpiarError($('#errorDetalle'));

      if (firmar) {
        const ok = await H.confirmar(
          '¿Firmar el informe?\n\nQuedará visible para el propietario y no se podrá seguir editando.'
        );
        if (!ok) return;
      }

      const cuerpo = {
        tecnica: formInforme.tecnica.value.trim() || null,
        hallazgos: formInforme.hallazgos.value.trim(),
        conclusion: formInforme.conclusion.value.trim(),
        recomendaciones: formInforme.recomendaciones.value.trim() || null,
        comparadoCon: formInforme.comparadoCon && formInforme.comparadoCon.value
          ? Number(formInforme.comparadoCon.value)
          : null,
        firmar,
      };

      await H.conBoton(e.submitter, firmar ? 'Firmando…' : 'Guardando…', async () => {
        try {
          await H.api.put(`/imagenes/${id}/informe`, cuerpo);
          H.toast(firmar ? 'Informe firmado. Se avisó al propietario.' : 'Borrador guardado.');
          abierto = await H.api.get(`/imagenes/${id}`);
          pintarDetalle();
          await recargar();
        } catch (error) {
          H.mostrarError($('#errorDetalle'), error);
        }
      });
    });
  }
})();
