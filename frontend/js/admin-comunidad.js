/* ============================================================
   Comunidad — adopciones y mascotas perdidas

   Aprobar una solicitud reserva la publicación y completarla la
   marca como adoptada: así dos familias no pueden llevarse el mismo
   animal. Al completar se programa el primer seguimiento, porque la
   adopción no termina cuando se entrega la mascota.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  let especies = [];
  let mostrar = null;

  // Lo mismo que acepta el servidor. Comprobarlo aquí evita subir tres megas
  // para que los devuelvan con un error.
  const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_FOTO = 3 * 1024 * 1024;

  // La foto elegida en el formulario. Va aparte porque viaja como archivo en
  // su propia petición, y porque la publicación no tiene id hasta que se crea.
  let fotoElegida = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin', 'veterinario'], ['adopciones.gestionar', 'perdidas.gestionar']);
    if (!usuario) return;

    H.prepararModal('modal');
    $('#btnPrincipal').addEventListener('click', abrirPublicacion);

    try {
      especies = (await H.api.get('/catalogos/especies')).especies || [];
    } catch { especies = []; }

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'adopciones',
      vistas: {
        adopciones: vistaAdopciones,
        solicitudes: vistaSolicitudes,
        perdidas: vistaPerdidas,
        seguimientos: vistaSeguimientos,
      },
    });
  });

  async function vistaAdopciones() {
    // 'todos': aquí hay que ver también las reservadas y las adoptadas. El
    // listado público se queda con las disponibles, que es su valor por defecto.
    const datos = await H.api.get('/comunidad/adopciones', { estado: 'todos' });
    const publicaciones = datos.publicaciones || [];

    $('#contenido').innerHTML = M.tabla(publicaciones, [
      {
        titulo: 'Mascota',
        valor: (p) => `<div class="con-foto">
          ${cuadroFoto(p.foto)}
          <div>
            <strong>${escapar(p.nombre)}</strong><br>
            <span class="campo-ayuda">${escapar([p.especie, p.raza, p.sexo].filter(Boolean).join(' · '))}</span>
          </div>
        </div>`,
      },
      { titulo: 'Edad', valor: (p) => escapar(H.edadLegible(p.edad_meses)) },
      { titulo: 'Porte', campo: 'porte' },
      {
        titulo: 'Salud',
        valor: (p) => [
          p.esterilizado ? '<span class="chip chip-exito">esterilizado</span>' : '',
          p.vacunas_al_dia ? '<span class="chip chip-exito">vacunas</span>' : '',
          p.desparasitado ? '<span class="chip chip-exito">desparasitado</span>' : '',
        ].filter(Boolean).join(' ') || '—',
      },
      { titulo: 'Solicitudes', campo: 'solicitudes' },
      { titulo: 'Estado', valor: (p) => M.estado(p.estado) },
      { titulo: '', valor: (p) => `<button type="button" class="btn btn-outline btn-sm" data-pub="${p.id}">Solicitudes</button>` },
    ], { vacio: 'No hay mascotas publicadas en adopción.', icono: 'icon-paw' });

    H.$$('#contenido [data-pub]').forEach((b) => {
      b.addEventListener('click', () => verSolicitudes(Number(b.dataset.pub)));
    });
  }

  async function verSolicitudes(publicacionId) {
    H.limpiarError($('#errorModal'));
    $('#cuerpoModal').innerHTML = H.cargando();
    H.abrirModal('modal');

    let datos;
    try {
      datos = await H.api.get(`/comunidad/adopciones/${publicacionId}`);
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    const p = datos.publicacion;
    $('#tituloModal').textContent = `${p.nombre} — solicitudes`;
    $('#subModal').innerHTML = `${escapar(p.especie)} · ${M.estado(p.estado)}`;

    $('#cuerpoModal').innerHTML = M.tabla(datos.solicitudes || [], [
      { titulo: 'Solicitante', valor: (s) => `<strong>${escapar(s.nombre)}</strong><br><span class="campo-ayuda">${escapar(s.telefono)} · ${escapar(s.email)}</span>` },
      { titulo: 'Vivienda', valor: (s) => escapar([s.tipo_vivienda, s.tiene_patio ? 'con patio' : null].filter(Boolean).join(' · ') || '—') },
      { titulo: 'Hogar', valor: (s) => escapar(s.personas_hogar ? `${s.personas_hogar} personas` : '—') },
      { titulo: 'Entrevistas', campo: 'entrevistas' },
      { titulo: 'Estado', valor: (s) => M.estado(s.estado) },
      { titulo: '', valor: (s) => `<button type="button" class="btn btn-outline btn-sm" data-sol="${s.id}">Gestionar</button>` },
    ], { vacio: 'Nadie ha solicitado esta mascota todavía.', icono: 'icon-users' });

    H.$$('#cuerpoModal [data-sol]').forEach((b) => {
      b.addEventListener('click', () => gestionarSolicitud(Number(b.dataset.sol)));
    });
  }

  async function gestionarSolicitud(id) {
    $('#cuerpoModal').innerHTML = H.cargando();

    let datos;
    try {
      datos = await H.api.get(`/comunidad/solicitudes/${id}`);
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    const s = datos.solicitud;
    $('#tituloModal').textContent = `${s.nombre} — adopción de ${s.mascota}`;
    $('#subModal').innerHTML = M.estado(s.estado);

    $('#cuerpoModal').innerHTML = `
      <dl class="constantes">
        <div class="constante"><span>Contacto</span><strong>${escapar(s.telefono)}</strong></div>
        <div class="constante"><span>Correo</span><strong>${escapar(s.email)}</strong></div>
        <div class="constante"><span>Vivienda</span><strong>${escapar([s.tipo_vivienda, s.tiene_patio ? 'con patio' : null].filter(Boolean).join(' · ') || '—')}</strong></div>
        <div class="constante"><span>Hogar</span><strong>${escapar(s.personas_hogar ? `${s.personas_hogar} personas` : '—')}</strong></div>
        <div class="constante"><span>Dirección</span><strong>${escapar([s.direccion, s.ciudad].filter(Boolean).join(', ') || '—')}</strong></div>
        <div class="constante"><span>Otras mascotas</span><strong>${escapar(s.otras_mascotas || 'ninguna')}</strong></div>
      </dl>

      <h4 class="titulo-modulo" style="margin-top:18px">Por qué quiere adoptarlo</h4>
      <p class="ficha-texto">${escapar(s.motivo || 'No lo explicó.')}</p>

      <h4 class="titulo-modulo" style="margin-top:18px">Entrevistas</h4>
      ${M.tabla(datos.entrevistas || [], [
        { titulo: 'Fecha', valor: (e) => M.cuando(e.fecha, true) },
        { titulo: 'Modalidad', campo: 'modalidad' },
        { titulo: 'Resultado', valor: (e) => M.estado(e.resultado) },
        { titulo: 'Entrevistó', valor: (e) => escapar(e.entrevistador_nombre || '—') },
      ], { vacio: 'Sin entrevistas.', icono: 'icon-users' })}

      <form id="formEntrevista" style="margin-top:14px">
        <div class="campos-fila-3">
          <label class="campo"><span>Fecha *</span><input type="datetime-local" name="fecha" required></label>
          <label class="campo">
            <span>Modalidad</span>
            <select name="modalidad"><option value="presencial">Presencial</option><option value="virtual">Virtual</option><option value="telefonica">Telefónica</option></select>
          </label>
          <label class="campo">
            <span>Resultado</span>
            <select name="resultado"><option value="pendiente">Pendiente</option><option value="favorable">Favorable</option><option value="desfavorable">Desfavorable</option></select>
          </label>
        </div>
        <label class="campo"><span>Notas</span><textarea name="notas" maxlength="4000"></textarea></label>
        <div class="modal-acciones"><button type="submit" class="btn btn-outline">Registrar entrevista</button></div>
      </form>

      <h4 class="titulo-modulo" style="margin-top:20px">Decisión</h4>
      <form id="formDecision">
        <label class="campo">
          <span>Estado *</span>
          <select name="estado" required>
            <option value="en_evaluacion">En evaluación</option>
            <option value="entrevista">Citada a entrevista</option>
            <option value="aprobada">Aprobada (reserva la mascota)</option>
            <option value="completada">Completada (entrega hecha)</option>
            <option value="rechazada">Rechazada</option>
          </select>
        </label>
        <label class="campo">
          <span>Motivo del rechazo</span>
          <input type="text" name="motivoRechazo" maxlength="255" placeholder="Obligatorio si rechazas">
        </label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Guardar decisión</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formEntrevista', ruta: `/comunidad/solicitudes/${id}/entrevistas`, cajaError: '#errorModal',
      ok: 'Entrevista registrada.', alTerminar: () => gestionarSolicitud(id),
    });

    M.conectarFormulario({
      form: '#formDecision', ruta: `/comunidad/solicitudes/${id}`, metodo: 'patch', cajaError: '#errorModal',
      ok: 'Decisión guardada.',
      antesDeEnviar: (cuerpo) => {
        if (cuerpo.estado === 'rechazada' && !cuerpo.motivoRechazo) {
          H.mostrarError($('#errorModal'), new Error('Rechazar una solicitud exige explicar por qué.'));
          return false;
        }
        return cuerpo;
      },
      alTerminar: async () => { await gestionarSolicitud(id); await mostrar('adopciones'); },
    });
  }

  async function vistaSolicitudes() {
    // El backend lista solicitudes por publicación; aquí se juntan todas las
    // publicaciones con solicitudes abiertas para no tener que ir una por una.
    // Con 'todos' porque una mascota ya reservada sigue teniendo solicitudes
    // abiertas que alguien tiene que resolver.
    const datos = await H.api.get('/comunidad/adopciones', { estado: 'todos' });
    const conSolicitudes = (datos.publicaciones || []).filter((p) => Number(p.solicitudes) > 0);

    $('#contenido').innerHTML = M.tabla(conSolicitudes, [
      { titulo: 'Mascota', valor: (p) => `<strong>${escapar(p.nombre)}</strong>` },
      { titulo: 'Especie', campo: 'especie' },
      { titulo: 'Solicitudes abiertas', campo: 'solicitudes' },
      { titulo: 'Estado', valor: (p) => M.estado(p.estado) },
      { titulo: '', valor: (p) => `<button type="button" class="btn btn-primary btn-sm" data-pub="${p.id}">Revisar</button>` },
    ], { vacio: 'No hay solicitudes pendientes.', icono: 'icon-users' });

    H.$$('#contenido [data-pub]').forEach((b) => {
      b.addEventListener('click', () => verSolicitudes(Number(b.dataset.pub)));
    });
  }

  async function vistaPerdidas() {
    const datos = await H.api.get('/comunidad/perdidas', { estado: 'perdida' });

    $('#contenido').innerHTML = M.tabla(datos.reportes || [], [
      { titulo: 'Mascota', valor: (r) => `<strong>${escapar(r.mascota)}</strong><br><span class="campo-ayuda">${escapar([r.especie, r.raza, r.color].filter(Boolean).join(' · '))}</span>` },
      { titulo: 'Se perdió', valor: (r) => M.cuando(r.fecha_perdida, true) },
      { titulo: 'Última ubicación', valor: (r) => escapar([r.ultima_direccion, r.ciudad].filter(Boolean).join(', ') || '—') },
      { titulo: 'Contacto', campo: 'telefono_contacto' },
      { titulo: 'Avistamientos', valor: (r) => (Number(r.avistamientos) > 0 ? `<span class="chip chip-info">${escapar(r.avistamientos)}</span>` : '0') },
      { titulo: '', valor: (r) => `<button type="button" class="btn btn-outline btn-sm" data-rep="${r.id}">Avistamientos</button>` },
    ], { vacio: 'No hay mascotas reportadas como perdidas.', icono: 'icon-paw' });

    H.$$('#contenido [data-rep]').forEach((b) => {
      b.addEventListener('click', () => verAvistamientos(Number(b.dataset.rep)));
    });
  }

  async function verAvistamientos(reporteId) {
    H.limpiarError($('#errorModal'));
    $('#cuerpoModal').innerHTML = H.cargando();
    H.abrirModal('modal');

    let datos;
    try {
      datos = await H.api.get(`/comunidad/perdidas/${reporteId}/avistamientos`);
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    $('#tituloModal').textContent = 'Avistamientos reportados';
    $('#subModal').textContent = 'Los manda gente sin cuenta, así que solo traen nombre y teléfono.';

    $('#cuerpoModal').innerHTML = M.tabla(datos.avistamientos || [], [
      { titulo: 'Fecha', valor: (a) => M.cuando(a.fecha, true) },
      { titulo: 'Quién avisa', valor: (a) => `${escapar(a.nombre || 'anónimo')}<br><span class="campo-ayuda">${escapar(a.telefono || '')}</span>` },
      { titulo: 'Dónde', valor: (a) => escapar(a.direccion || '—') },
      { titulo: 'Descripción', valor: (a) => escapar(a.descripcion || '—') },
      { titulo: 'Estado', valor: (a) => M.estado(a.estado) },
      {
        titulo: '',
        valor: (a) => (a.estado === 'nuevo'
          ? `<button type="button" class="btn btn-outline btn-sm" data-conf="${a.id}">Confirmar</button>
             <button type="button" class="btn btn-peligro btn-sm" data-desc="${a.id}">Descartar</button>` : ''),
      },
    ], { vacio: 'Nadie ha reportado avistamientos.', icono: 'icon-pin' });

    const cambiar = async (id, estado) => {
      try {
        await H.api.patch(`/comunidad/avistamientos/${id}`, { estado });
        H.toast('Avistamiento actualizado.');
        await verAvistamientos(reporteId);
      } catch (error) { H.toast(error.message, 'error'); }
    };

    H.$$('#cuerpoModal [data-conf]').forEach((b) => b.addEventListener('click', () => cambiar(b.dataset.conf, 'confirmado')));
    H.$$('#cuerpoModal [data-desc]').forEach((b) => b.addEventListener('click', () => cambiar(b.dataset.desc, 'descartado')));
  }

  async function vistaSeguimientos() {
    const datos = await H.api.get('/comunidad/seguimientos/pendientes');

    $('#contenido').innerHTML = `
      <p class="campo-ayuda" style="margin-bottom:14px">
        Seguimientos que ya tocaban y siguen sin hacer.
      </p>
      ${M.tabla(datos.seguimientos || [], [
        { titulo: 'Programado', valor: (s) => M.cuando(s.fecha_programada) },
        { titulo: 'Mascota', campo: 'mascota' },
        { titulo: 'Adoptante', valor: (s) => `${escapar(s.adoptante)}<br><span class="campo-ayuda">${escapar(s.telefono)}</span>` },
        { titulo: 'Medio', campo: 'medio' },
        { titulo: '', valor: (s) => `<button type="button" class="btn btn-primary btn-sm" data-seg="${s.id}">Registrar</button>` },
      ], { vacio: 'No hay seguimientos vencidos.', icono: 'icon-check' })}`;

    H.$$('#contenido [data-seg]').forEach((b) => {
      b.addEventListener('click', () => registrarSeguimiento(Number(b.dataset.seg)));
    });
  }

  function registrarSeguimiento(id) {
    H.limpiarError($('#errorModal'));
    $('#tituloModal').textContent = 'Registrar seguimiento';
    $('#subModal').textContent = 'Cómo está la mascota en su nuevo hogar.';

    $('#cuerpoModal').innerHTML = `
      <form id="formSeguimiento">
        <div class="campos-fila">
          <label class="campo">
            <span>Resultado *</span>
            <select name="estado" required>
              <option value="realizado">Realizado</option>
              <option value="sin_respuesta">Sin respuesta</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </label>
          <label class="campo">
            <span>Estado de la mascota</span>
            <select name="estadoMascota">
              <option value="">Sin evaluar</option>
              <option value="excelente">Excelente</option><option value="bueno">Bueno</option>
              <option value="regular">Regular</option><option value="preocupante">Preocupante</option>
              <option value="devuelta">Devuelta</option>
            </select>
          </label>
        </div>
        <label class="campo"><span>Notas</span><textarea name="notas" maxlength="4000"></textarea></label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formSeguimiento', ruta: `/comunidad/seguimientos/${id}`, metodo: 'patch',
      cajaError: '#errorModal', ok: 'Seguimiento registrado.',
      alTerminar: async () => { H.cerrarModal('modal'); await mostrar('seguimientos'); },
    });

    H.abrirModal('modal');
  }

  function abrirPublicacion() {
    H.limpiarError($('#errorModal'));
    $('#tituloModal').textContent = 'Publicar en adopción';
    $('#subModal').textContent = 'Los animales que llegan a la clínica sin dueño se publican sin ficha de mascota.';

    $('#cuerpoModal').innerHTML = `
      <form id="formPublicacion">
        <div class="campos-fila">
          <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="80"></label>
          <label class="campo">
            <span>Especie *</span>
            <select name="especieId" required>${M.opciones(especies, { vacio: 'Selecciona' })}</select>
          </label>
        </div>
        <div class="campos-fila-3">
          <label class="campo">
            <span>Sexo</span>
            <select name="sexo"><option value="desconocido">Desconocido</option><option value="macho">Macho</option><option value="hembra">Hembra</option></select>
          </label>
          <label class="campo"><span>Edad (meses)</span><input type="number" name="edadMeses" min="0" max="400"></label>
          <label class="campo">
            <span>Porte</span>
            <select name="porte"><option value="pequeno">Pequeño</option><option value="mediano" selected>Mediano</option><option value="grande">Grande</option><option value="gigante">Gigante</option></select>
          </label>
        </div>
        <label class="campo"><span>Descripción</span><textarea name="descripcion" maxlength="4000"></textarea></label>
        <div class="campo">
          <span>Foto</span>
          <div class="con-foto">
            <div class="foto-cuadro" id="previaFoto"><svg class="icon"><use href="#icon-paw"/></svg></div>
            <div>
              <div class="con-foto-acciones">
                <label class="btn btn-outline btn-sm" for="archivoFoto">Elegir foto…</label>
                <button type="button" class="btn btn-outline btn-sm" id="btnQuitarFoto" hidden>Quitar</button>
              </div>
              <!-- Sin atributo "name" a propósito: leerFormulario() recorre
                   los campos que lo tienen, y de un input de archivo leería la
                   ruta falsa que da el navegador en vez del archivo. Este se
                   sube aparte, cuando la publicación ya existe. -->
              <input type="file" id="archivoFoto" accept="image/jpeg,image/png,image/webp" hidden>
              <div class="campo-ayuda">JPG, PNG o WebP, hasta 3 MB. Se sube al publicar.</div>
            </div>
          </div>
        </div>
        <div class="campos-fila-3">
          <label class="campo-check"><input type="checkbox" name="esterilizado"> Esterilizado</label>
          <label class="campo-check"><input type="checkbox" name="vacunasAlDia"> Vacunas al día</label>
          <label class="campo-check"><input type="checkbox" name="desparasitado"> Desparasitado</label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Publicar</button></div>
      </form>`;

    fotoElegida = null;
    $('#archivoFoto').addEventListener('change', elegirFoto);
    $('#btnQuitarFoto').addEventListener('click', quitarFoto);

    M.conectarFormulario({
      form: '#formPublicacion', ruta: '/comunidad/adopciones', cajaError: '#errorModal',
      ok: 'Publicación creada.',
      alTerminar: async (respuesta) => {
        // La foto necesita el id, y la publicación no lo tiene hasta que el
        // servidor la crea; por eso se publica primero y se sube después.
        const fallo = await subirLaFoto(respuesta.publicacion.id);
        if (fallo) H.toast(fallo, 'error');

        H.cerrarModal('modal');
        await mostrar('adopciones');
      },
    });

    H.abrirModal('modal');
  }

  /* --------------------------------------------------------
     Foto de la publicación

     Antes se escribía la dirección de una imagen alojada en cualquier sitio,
     y esa foto desaparecía el día que el otro servidor la quitaba. Ahora se
     sube el archivo: queda en el bucket, junto a las demás fotos del sistema.
     -------------------------------------------------------- */

  /** El cuadro de la foto en pequeño, para la tabla. */
  function cuadroFoto(url) {
    // rutaImagen() porque conviven dos orígenes: las publicaciones antiguas
    // guardan una ruta relativa del propio sitio y las nuevas, la URL
    // completa del bucket. La primera se rompe dentro de /admin sin esto.
    return url
      ? `<div class="foto-cuadro mini"><img src="${escapar(H.rutaImagen(url))}" alt=""></div>`
      : '<div class="foto-cuadro mini"><svg class="icon"><use href="#icon-paw"/></svg></div>';
  }

  function pintarPrevia(url) {
    const caja = $('#previaFoto');

    // La vista previa de un archivo recién elegido es una data: URL de varios
    // megas. Se asigna por propiedad y no dentro de una plantilla para no
    // recorrerla entera escapándola carácter a carácter.
    if (url) {
      caja.innerHTML = '';
      const img = document.createElement('img');
      img.alt = '';
      img.src = url;
      caja.appendChild(img);
    } else {
      caja.innerHTML = '<svg class="icon"><use href="#icon-paw"/></svg>';
    }

    $('#btnQuitarFoto').hidden = !url;
  }

  function elegirFoto(evento) {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    const error = !TIPOS_FOTO.includes(archivo.type)
      ? 'La foto tiene que ser JPG, PNG o WebP.'
      : archivo.size > MAX_FOTO ? 'La foto no puede pasar de 3 MB.' : null;

    if (error) {
      evento.target.value = '';
      return H.mostrarError($('#errorModal'), new Error(error));
    }

    H.limpiarError($('#errorModal'));
    fotoElegida = archivo;

    // Se lee como data: URL y no con URL.createObjectURL() porque la política
    // de contenido de estas páginas no admite blob: en las imágenes.
    const lector = new FileReader();
    lector.onload = () => pintarPrevia(lector.result);
    lector.onerror = () => H.mostrarError($('#errorModal'), new Error('No se pudo leer esa imagen.'));
    lector.readAsDataURL(archivo);
  }

  function quitarFoto() {
    fotoElegida = null;
    $('#archivoFoto').value = '';
    pintarPrevia(null);
  }

  /**
   * Sube la foto de la publicación recién creada.
   *
   * Devuelve null si fue bien y el aviso que hay que dar si falló. No lanza a
   * propósito: la mascota ya quedó publicada, y presentar el fallo como un
   * error del formulario haría pensar que se perdió todo lo escrito.
   */
  async function subirLaFoto(id) {
    if (!fotoElegida) return null;

    try {
      const cuerpo = new FormData();
      cuerpo.append('foto', fotoElegida);
      await H.api.post(`/comunidad/adopciones/${id}/foto`, cuerpo);
      return null;
    } catch (error) {
      return `La publicación se creó, pero la foto no se subió: ${error.message}`;
    }
  }
})();
