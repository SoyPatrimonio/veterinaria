/* ============================================================
   Adopciones — portal del cliente

   Dos vistas: el catálogo de mascotas que buscan hogar y el estado
   de las solicitudes propias. Lo segundo pesa tanto como lo primero:
   adoptar no es inmediato, y quien mandó una solicitud tiene derecho
   a saber en qué va sin llamar a la clínica a preguntar.

   La solicitud se envía desde la ficha, no desde la tarjeta: antes de
   pedir un animal conviene haber leído su historia y sus cuidados.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  const PORTES = { pequeno: 'Pequeño', mediano: 'Mediano', grande: 'Grande', gigante: 'Gigante' };
  const SEXOS = { macho: 'Macho', hembra: 'Hembra', desconocido: 'Sexo sin registrar' };

  const ESTADO_PUBLICACION = {
    disponible: 'Disponible',
    reservado: 'Reservado',
    adoptado: 'Adoptado',
    retirado: 'Retirado',
  };

  const ESTADO_SOLICITUD = {
    recibida: 'Recibida',
    en_evaluacion: 'En evaluación',
    entrevista: 'Entrevista',
    aprobada: 'Aprobada',
    completada: 'Completada',
    rechazada: 'Rechazada',
  };

  // El recorrido de una solicitud, en orden. 'rechazada' no aparece porque no
  // es un paso más: es el final del camino y se pinta aparte.
  const PASOS = ['recibida', 'en_evaluacion', 'entrevista', 'aprobada', 'completada'];

  const QUE_SIGUE = {
    recibida: 'La recibimos. La revisamos en los próximos días.',
    en_evaluacion: 'Estamos revisando tu solicitud.',
    entrevista: 'Te citamos a entrevista. Revisa tus avisos y tu correo.',
    aprobada: 'Aprobada. Coordinaremos contigo la entrega.',
    completada: 'Adopción completada. Te llamaremos al mes para saber cómo va.',
    rechazada: 'Esta vez no salió adelante.',
  };

  let publicaciones = [];
  let solicitudesPropias = [];
  let especies = [];
  let puedeSolicitar = false;
  let mostrar = null;
  let temporizadorBusqueda = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['cliente'], ['adopciones.ver']);
    if (!usuario) return;

    H.prepararModal('modal');

    // Quien solo puede mirar el catálogo no tiene solicitudes que seguir.
    puedeSolicitar = H.puede('adopciones.solicitar');
    $('#pestanas [data-pestana="mias"]').hidden = !puedeSolicitar;

    await Promise.all([cargarEspecies(), cargarSolicitudesPropias()]);
    conectarFiltros();

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'catalogo',
      vistas: { catalogo: vistaCatalogo, mias: vistaMisSolicitudes },
    });
  });

  /* --------------------------------------------------------
     Datos que se cargan una vez
     -------------------------------------------------------- */

  async function cargarEspecies() {
    try {
      especies = (await H.api.get('/catalogos/especies')).especies || [];
    } catch (error) {
      // El filtro por especie es una comodidad, no un requisito: si el catálogo
      // no carga se deja el desplegable con "Todas" y el resto sigue igual.
      console.error('[adopciones] no se pudo cargar el catálogo de especies:', error);
      return;
    }
    $('#filtroEspecie').innerHTML = `<option value="">Todas</option>${M.opciones(especies)}`;
  }

  /**
   * Solicitudes propias. Se piden también al entrar al catálogo, no solo en su
   * pestaña, porque son las que marcan qué mascotas ya pediste.
   */
  async function cargarSolicitudesPropias({ propagarError = false } = {}) {
    if (!puedeSolicitar) {
      solicitudesPropias = [];
      return;
    }

    try {
      solicitudesPropias = (await H.api.get('/comunidad/mis-solicitudes')).solicitudes || [];
    } catch (error) {
      if (propagarError) throw error;
      solicitudesPropias = [];
      console.error('[adopciones] no se pudieron cargar tus solicitudes:', error);
    }
  }

  function solicitudDe(publicacionId) {
    return solicitudesPropias.find((s) => s.publicacion_id === publicacionId) || null;
  }

  /* --------------------------------------------------------
     Filtros
     -------------------------------------------------------- */

  function filtrosActuales() {
    return {
      estado: 'disponible',
      busqueda: $('#busqueda').value.trim(),
      especieId: $('#filtroEspecie').value,
      porte: $('#filtroPorte').value,
      sexo: $('#filtroSexo').value,
    };
  }

  function hayFiltros() {
    const f = filtrosActuales();
    return Boolean(f.busqueda || f.especieId || f.porte || f.sexo);
  }

  function conectarFiltros() {
    ['#filtroEspecie', '#filtroPorte', '#filtroSexo'].forEach((selector) => {
      $(selector).addEventListener('change', () => mostrar('catalogo'));
    });

    // Se espera a que dejen de escribir: cada tecla no puede ser una consulta.
    $('#busqueda').addEventListener('input', () => {
      clearTimeout(temporizadorBusqueda);
      temporizadorBusqueda = setTimeout(() => mostrar('catalogo'), 350);
    });

    $('#limpiarFiltros').addEventListener('click', () => {
      $('#busqueda').value = '';
      $('#filtroEspecie').value = '';
      $('#filtroPorte').value = '';
      $('#filtroSexo').value = '';
      mostrar('catalogo');
    });
  }

  /* --------------------------------------------------------
     Catálogo
     -------------------------------------------------------- */

  async function vistaCatalogo() {
    $('#filtros').hidden = false;

    const datos = await H.api.get('/comunidad/adopciones', filtrosActuales());
    publicaciones = datos.publicaciones || [];
    pintarCatalogo();
  }

  function pintarCatalogo() {
    const total = publicaciones.length;
    $('#contador').textContent = total === 1 ? '1 mascota' : `${total} mascotas`;
    $('#limpiarFiltros').hidden = !hayFiltros();

    if (!total) {
      $('#contenido').innerHTML = H.bloqueVacio(
        hayFiltros()
          ? 'Ninguna mascota coincide con lo que buscas. Prueba quitando algún filtro.'
          : 'Ahora mismo no hay mascotas en adopción. Vuelve pronto.',
        'icon-paw'
      );
      return;
    }

    $('#contenido').innerHTML = `<div class="rejilla-mascotas">${publicaciones.map(tarjeta).join('')}</div>`;

    H.$$('#contenido [data-ver]').forEach((boton) => {
      boton.addEventListener('click', () => abrirFicha(Number(boton.dataset.ver)));
    });
  }

  function tarjeta(p) {
    const solicitud = solicitudDe(p.id);
    const interesados = Number(p.solicitudes) || 0;

    return `<article class="mascota">
      <div class="mascota-foto">${foto(p)}</div>
      <div class="mascota-cuerpo">
        <h3>${escapar(p.nombre)}</h3>
        <p class="mascota-meta">${escapar([p.especie, p.raza].filter(Boolean).join(' · '))}</p>
        <div class="mascota-datos">
          <span>${escapar(H.edadLegible(p.edad_meses))} · ${escapar(SEXOS[p.sexo] || p.sexo)}</span>
          <span>Porte ${escapar(PORTES[p.porte] || p.porte)}</span>
          ${p.sede_nombre ? `<span>Está en ${escapar(p.sede_nombre)}</span>` : ''}
        </div>
        <div class="mascota-chips">
          ${chipsSalud(p)}
          ${interesados > 1 ? `<span class="chip chip-info">${interesados} familias interesadas</span>` : ''}
        </div>
        ${solicitud
          ? `<p class="campo-ayuda">Ya la solicitaste · ${escapar(ESTADO_SOLICITUD[solicitud.estado] || solicitud.estado)}</p>`
          : ''}
      </div>
      <div class="mascota-acciones">
        <button type="button" class="btn btn-primary btn-sm" data-ver="${p.id}">Ver ficha</button>
      </div>
    </article>`;
  }

  function foto(p) {
    return p.foto
      ? `<img src="${escapar(p.foto)}" alt="${escapar(p.nombre)}" loading="lazy">`
      : '<svg class="icon"><use href="#icon-paw"/></svg>';
  }

  function chipsSalud(p) {
    return [
      p.esterilizado ? '<span class="chip chip-exito">esterilizado</span>' : '',
      p.vacunas_al_dia ? '<span class="chip chip-exito">vacunas al día</span>' : '',
      p.desparasitado ? '<span class="chip chip-exito">desparasitado</span>' : '',
    ].filter(Boolean).join('');
  }

  /* --------------------------------------------------------
     Ficha de la mascota
     -------------------------------------------------------- */

  async function abrirFicha(id) {
    H.limpiarError($('#errorModal'));
    $('#tituloModal').textContent = 'Ficha de adopción';
    $('#subModal').textContent = '';
    $('#cuerpoModal').innerHTML = H.cargando();
    H.abrirModal('modal');

    let publicacion;
    try {
      publicacion = (await H.api.get(`/comunidad/adopciones/${id}`)).publicacion;
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    pintarFicha(publicacion);
  }

  function pintarFicha(p) {
    const solicitud = solicitudDe(p.id);

    $('#tituloModal').textContent = p.nombre;
    $('#subModal').innerHTML = `${escapar([p.especie, p.raza].filter(Boolean).join(' · '))}
      · ${M.estado(p.estado, ESTADO_PUBLICACION)}`;

    $('#cuerpoModal').innerHTML = `
      <div class="ficha-adopcion">
        <div class="ficha-foto">${foto(p)}</div>
        <div>
          <div class="mascota-chips">
            ${chipsSalud(p)}
            ${compatibilidad(p.compatible_ninos, 'bien con niños', 'no convive con niños')}
            ${compatibilidad(p.compatible_mascotas, 'bien con otras mascotas', 'mejor como única mascota')}
          </div>
          <dl class="constantes">
            <div class="constante"><span>Edad</span><strong>${escapar(H.edadLegible(p.edad_meses))}</strong></div>
            <div class="constante"><span>Sexo</span><strong>${escapar(SEXOS[p.sexo] || p.sexo)}</strong></div>
            <div class="constante"><span>Porte</span><strong>${escapar(PORTES[p.porte] || p.porte)}</strong></div>
            ${p.color ? `<div class="constante"><span>Color</span><strong>${escapar(p.color)}</strong></div>` : ''}
            ${p.sede_nombre ? `<div class="constante"><span>Sede</span><strong>${escapar(p.sede_nombre)}</strong></div>` : ''}
          </dl>
        </div>
      </div>

      ${p.descripcion ? `<p class="ficha-texto">${escapar(p.descripcion)}</p>` : ''}
      ${p.historia ? `<h4 class="titulo-modulo">Su historia</h4>
                      <p class="ficha-texto">${escapar(p.historia)}</p>` : ''}

      ${accionFicha(p, solicitud)}`;

    const adoptar = $('#cuerpoModal [data-adoptar]');
    if (adoptar) adoptar.addEventListener('click', () => pintarFormulario(p));

    const verMias = $('#cuerpoModal [data-mias]');
    if (verMias) {
      verMias.addEventListener('click', () => { H.cerrarModal('modal'); mostrar('mias'); });
    }
  }

  /** El botón de adoptar solo aparece si de verdad se puede pedir esta mascota. */
  function accionFicha(p, solicitud) {
    if (solicitud) {
      return `<div class="mensaje-ok">
          Ya enviaste una solicitud por ${escapar(p.nombre)}.
          ${escapar(QUE_SIGUE[solicitud.estado] || '')}
        </div>
        <div class="modal-acciones">
          <button type="button" class="btn btn-outline" data-mias>Ver mis solicitudes</button>
        </div>`;
    }

    if (p.estado !== 'disponible') {
      const texto = {
        adoptado: `${p.nombre} ya encontró hogar. Mira las demás mascotas que siguen esperando.`,
        reservado: `Otra familia ya tiene una adopción en curso con ${p.nombre}.`,
      }[p.estado] || `La publicación de ${p.nombre} ya no está activa.`;

      return H.bloqueVacio(texto, 'icon-heart');
    }

    return `<div class="modal-acciones">
      <button type="button" class="btn btn-primary" data-adoptar>Quiero adoptar a ${escapar(p.nombre)}</button>
    </div>`;
  }

  function compatibilidad(valor, si, no) {
    if (valor === null || valor === undefined) return '';
    return Number(valor)
      ? `<span class="chip chip-exito">${escapar(si)}</span>`
      : `<span class="chip chip-aviso">${escapar(no)}</span>`;
  }

  /* --------------------------------------------------------
     Solicitud
     -------------------------------------------------------- */

  function pintarFormulario(p) {
    const usuario = H.sesion.usuario() || {};
    H.limpiarError($('#errorModal'));

    $('#subModal').textContent = 'Nos pondremos en contacto para la entrevista. Adoptar no es inmediato: queremos que salga bien.';

    $('#cuerpoModal').innerHTML = `
      <form id="formSolicitud">
        <div class="campos-fila">
          <label class="campo">
            <span>Tu nombre *</span>
            <input type="text" name="nombre" required maxlength="120" value="${escapar(usuario.nombre || '')}">
          </label>
          <label class="campo"><span>Documento</span><input type="text" name="documento" maxlength="30"></label>
        </div>
        <div class="campos-fila">
          <label class="campo">
            <span>Correo *</span>
            <input type="email" name="email" required maxlength="160" value="${escapar(usuario.email || '')}">
          </label>
          <label class="campo">
            <span>Teléfono *</span>
            <input type="text" name="telefono" required maxlength="30" value="${escapar(usuario.telefono || '')}">
          </label>
        </div>
        <div class="campos-fila">
          <label class="campo"><span>Dirección</span><input type="text" name="direccion" maxlength="180"></label>
          <label class="campo"><span>Ciudad</span><input type="text" name="ciudad" maxlength="80"></label>
        </div>
        <div class="campos-fila-3">
          <label class="campo">
            <span>Tipo de vivienda</span>
            <select name="tipoVivienda">
              <option value="">Sin especificar</option>
              <option value="casa">Casa</option><option value="apartamento">Apartamento</option>
              <option value="finca">Finca</option><option value="otro">Otro</option>
            </select>
          </label>
          <label class="campo"><span>Personas en el hogar</span><input type="number" name="personasHogar" min="1" max="30"></label>
          <label class="campo-check campo-check-alineado">
            <input type="checkbox" name="tienePatio"> Tiene patio
          </label>
        </div>
        <label class="campo">
          <span>Otras mascotas</span>
          <input type="text" name="otrasMascotas" maxlength="200" placeholder="Un gato de 3 años, ninguna…">
        </label>
        <label class="campo">
          <span>¿Por qué quieres adoptar a ${escapar(p.nombre)}? *</span>
          <textarea name="motivo" maxlength="4000" rows="4" required
            placeholder="Cuéntanos cómo sería su día a día contigo."></textarea>
          <span class="campo-ayuda">Es lo primero que lee quien evalúa la solicitud.</span>
        </label>
        <label class="campo-check">
          <input type="checkbox" name="compromiso">
          Entiendo que hay entrevista, y seguimiento después de la entrega.
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn-outline" data-volver>Volver a la ficha</button>
          <button type="submit" class="btn btn-primary">Enviar solicitud</button>
        </div>
      </form>`;

    $('#cuerpoModal [data-volver]').addEventListener('click', () => {
      H.limpiarError($('#errorModal'));
      pintarFicha(p);
    });

    M.conectarFormulario({
      form: '#formSolicitud',
      ruta: `/comunidad/adopciones/${p.id}/solicitudes`,
      cajaError: '#errorModal',
      ok: 'Solicitud enviada. Te contactamos pronto.',
      antesDeEnviar: (cuerpo) => {
        // `compromiso` es una casilla de esta pantalla, no un campo de la API:
        // se comprueba aquí y se quita del cuerpo antes de enviarlo.
        const aceptado = cuerpo.compromiso;
        delete cuerpo.compromiso;

        if (!aceptado) {
          H.mostrarError($('#errorModal'), new Error('Confirma que aceptas la entrevista y el seguimiento.'));
          return false;
        }
        if (!cuerpo.motivo || cuerpo.motivo.length < 20) {
          H.mostrarError($('#errorModal'), new Error('Cuéntanos en un par de líneas por qué quieres adoptarlo.'));
          return false;
        }
        return cuerpo;
      },
      alTerminar: async () => {
        // Se cierra y se lleva a "Mis solicitudes": lo primero que quiere ver
        // quien acaba de mandarla es que quedó registrada y en qué va.
        H.cerrarModal('modal');
        await mostrar('mias');
      },
    });
  }

  /* --------------------------------------------------------
     Mis solicitudes
     -------------------------------------------------------- */

  async function vistaMisSolicitudes() {
    $('#filtros').hidden = true;
    await cargarSolicitudesPropias({ propagarError: true });

    if (!solicitudesPropias.length) {
      $('#contenido').innerHTML = H.bloqueVacio(
        'Todavía no has solicitado ninguna adopción. Mira quién está buscando hogar.', 'icon-paw'
      );
      return;
    }

    $('#contenido').innerHTML = `<div class="lista-citas">
      ${solicitudesPropias.map(filaSolicitud).join('')}
    </div>`;

    H.$$('#contenido [data-ver]').forEach((boton) => {
      boton.addEventListener('click', () => abrirFicha(Number(boton.dataset.ver)));
    });
  }

  function filaSolicitud(s) {
    const [dia, mes, anio] = String(H.fechaLarga(s.creado_en)).split(' ');
    const indice = PASOS.indexOf(s.estado);

    // Barra de pasos: se ve dónde va la solicitud sin leer nada.
    const pasos = s.estado === 'rechazada'
      ? '<span class="chip chip-error">no salió adelante</span>'
      : PASOS.map((paso, i) => `
          <span class="paso-chip ${i <= indice ? 'activo' : ''}">${escapar(ESTADO_SOLICITUD[paso])}</span>`).join('');

    const notas = [
      QUE_SIGUE[s.estado] || '',
      s.proxima_entrevista ? `Entrevista el ${H.fechaLarga(s.proxima_entrevista)} a las ${H.hora12(s.proxima_entrevista)}.` : '',
      s.estado === 'rechazada' && s.motivo_rechazo ? `Motivo: ${s.motivo_rechazo}` : '',
    ].filter(Boolean).join(' ');

    return `<article class="cita">
      <div class="cita-hora cita-hora-mascota">
        <strong>${escapar([dia, mes].filter(Boolean).join(' '))}</strong>
        <small>${escapar(anio || '')}</small>
      </div>
      <div class="cita-info">
        <h4>${escapar(s.mascota)}</h4>
        <p>${escapar([s.especie, s.raza].filter(Boolean).join(' · '))}</p>
        <div class="pasos">${pasos}</div>
        <p class="campo-ayuda">${escapar(notas)}</p>
      </div>
      <div class="cita-lado">
        ${M.estado(s.estado, ESTADO_SOLICITUD)}
        <button type="button" class="btn btn-outline btn-sm" data-ver="${s.publicacion_id}">Ver ficha</button>
      </div>
    </article>`;
  }
})();
