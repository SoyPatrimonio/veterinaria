/* ============================================================
   Equipos médicos — hoja de vida, mantenimiento y calibración

   La próxima fecha se calcula sola con la frecuencia del equipo, y
   un mantenimiento con resultado "fallido" lo deja fuera de
   servicio: no se puede seguir usando un ecógrafo que no pasó la
   revisión.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  const ESTADOS = {
    operativo: 'Operativo',
    mantenimiento: 'En mantenimiento',
    reparacion: 'En reparación',
    fuera_servicio: 'Fuera de servicio',
    dado_baja: 'Dado de baja',
  };

  let equipos = [];
  let sedes = [];
  let recargarVista = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin', 'veterinario'], ['equipos.ver', 'equipos.gestionar']);
    if (!usuario) return;

    H.prepararModal('modal');

    if (H.puede('equipos.gestionar')) {
      $('#btnPrincipal').addEventListener('click', () => abrirFormulario(null));
    } else {
      $('#btnPrincipal').hidden = true;
    }

    try {
      const datos = await H.api.get('/sedes', null, { sinRedirigir: true });
      sedes = datos.sedes || [];
    } catch {
      sedes = [];
    }

    recargarVista = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'equipos',
      vistas: {
        equipos: () => cargar({}),
        pendientes: () => cargar({ mantenimientoVencido: 1 }),
      },
    });
  });

  async function cargar(filtros) {
    const datos = await H.api.get('/operaciones/equipos', filtros);
    equipos = datos.equipos || [];

    const vencidos = equipos.filter((e) => Number(e.dias_mantenimiento) <= 0 || Number(e.dias_calibracion) <= 0);
    const fuera = equipos.filter((e) => e.estado === 'fuera_servicio' || e.estado === 'reparacion');

    $('#metricas').innerHTML = M.metricas([
      { texto: 'Equipos activos', valor: equipos.length, icono: 'icon-shield' },
      { texto: 'Revisión vencida', valor: vencidos.length, icono: 'icon-alerta' },
      { texto: 'Fuera de servicio', valor: fuera.length, icono: 'icon-cross' },
    ]);

    $('#contenido').innerHTML = M.tabla(equipos, [
      {
        titulo: 'Equipo',
        valor: (e) => `<strong>${escapar(e.nombre)}</strong>
          <br><span class="campo-ayuda">${escapar([e.codigo, e.marca, e.modelo].filter(Boolean).join(' · '))}</span>`,
      },
      { titulo: 'Serie', valor: (e) => escapar(e.numero_serie || '—') },
      { titulo: 'Ubicación', valor: (e) => escapar([e.sede_nombre, e.ubicacion].filter(Boolean).join(' · ') || '—') },
      { titulo: 'Estado', valor: (e) => M.estado(e.estado, ESTADOS) },
      {
        titulo: 'Mantenimiento',
        valor: (e) => {
          if (!e.proximo_mantenimiento) return '<span class="campo-ayuda">sin programar</span>';
          const dias = Number(e.dias_mantenimiento);
          const clase = dias <= 0 ? 'texto-alerta' : '';
          return `<span class="${clase}">${escapar(H.fechaLarga(e.proximo_mantenimiento))}</span>`;
        },
      },
      {
        titulo: 'Calibración',
        valor: (e) => {
          if (!e.requiere_calibracion) return '<span class="campo-ayuda">no aplica</span>';
          if (!e.proxima_calibracion) return '<span class="campo-ayuda">sin programar</span>';
          const dias = Number(e.dias_calibracion);
          return `<span class="${dias <= 0 ? 'texto-alerta' : ''}">${escapar(H.fechaLarga(e.proxima_calibracion))}</span>`;
        },
      },
      {
        titulo: '',
        valor: (e) => `<button type="button" class="btn btn-outline btn-sm" data-abrir="${e.id}">Abrir</button>`,
      },
    ], { vacio: 'No hay equipos con ese filtro.', icono: 'icon-shield' });

    H.$$('#contenido [data-abrir]').forEach((b) => {
      b.addEventListener('click', () => abrirDetalle(Number(b.dataset.abrir)));
    });
  }

  function abrirFormulario(equipo) {
    $('#tituloModal').textContent = equipo ? `Editar ${equipo.nombre}` : 'Nuevo equipo';
    $('#subModal').textContent = 'La frecuencia en meses es lo que calcula sola la próxima revisión.';
    H.limpiarError($('#errorModal'));

    const v = (campo) => escapar(equipo?.[campo] ?? '');

    $('#cuerpoModal').innerHTML = `
      <form id="formEquipo">
        <div class="campos-fila">
          <label class="campo"><span>Código *</span><input type="text" name="codigo" required maxlength="30" value="${v('codigo')}"></label>
          <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="140" value="${v('nombre')}"></label>
        </div>
        <div class="campos-fila-3">
          <label class="campo"><span>Marca</span><input type="text" name="marca" maxlength="80" value="${v('marca')}"></label>
          <label class="campo"><span>Modelo</span><input type="text" name="modelo" maxlength="80" value="${v('modelo')}"></label>
          <label class="campo"><span>N.º de serie</span><input type="text" name="numeroSerie" maxlength="80" value="${v('numero_serie')}"></label>
        </div>
        <div class="campos-fila">
          <label class="campo">
            <span>Sede</span>
            <select name="sedeId">${M.opciones(sedes, { vacio: 'Sin sede', seleccionado: equipo?.sede_id })}</select>
          </label>
          <label class="campo"><span>Ubicación</span><input type="text" name="ubicacion" maxlength="80" value="${v('ubicacion')}"></label>
        </div>
        <div class="campos-fila-3">
          <label class="campo">
            <span>Estado</span>
            <select name="estado">
              ${Object.entries(ESTADOS).map(([k, t]) => `<option value="${k}" ${equipo?.estado === k ? 'selected' : ''}>${escapar(t)}</option>`).join('')}
            </select>
          </label>
          <label class="campo"><span>Frecuencia (meses)</span><input type="number" name="frecuenciaMeses" min="1" max="120" value="${v('frecuencia_meses')}"></label>
          <label class="campo"><span>Próximo mantenimiento</span><input type="date" name="proximoMantenimiento" value="${v('proximo_mantenimiento')}"></label>
        </div>
        <div class="campos-fila">
          <label class="campo-check">
            <input type="checkbox" name="requiereCalibracion" ${equipo?.requiere_calibracion ? 'checked' : ''}> Requiere calibración
          </label>
          <label class="campo"><span>Próxima calibración</span><input type="date" name="proximaCalibracion" value="${v('proxima_calibracion')}"></label>
        </div>
        <label class="campo"><span>Notas</span><textarea name="notas" maxlength="4000">${v('notas')}</textarea></label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formEquipo',
      ruta: equipo ? `/operaciones/equipos/${equipo.id}` : '/operaciones/equipos',
      metodo: equipo ? 'put' : 'post',
      cajaError: '#errorModal',
      ok: equipo ? 'Equipo actualizado.' : 'Equipo registrado.',
      alTerminar: async () => {
        H.cerrarModal('modal');
        await recargarVista('equipos');
      },
    });

    H.abrirModal('modal');
  }

  async function abrirDetalle(id) {
    H.limpiarError($('#errorModal'));
    $('#cuerpoModal').innerHTML = H.cargando();
    H.abrirModal('modal');

    let datos;
    try {
      datos = await H.api.get(`/operaciones/equipos/${id}`);
    } catch (error) {
      $('#cuerpoModal').innerHTML = H.bloqueVacio(error.message, 'icon-alerta');
      return;
    }

    const e = datos.equipo;
    const historial = datos.mantenimientos || [];

    $('#tituloModal').textContent = e.nombre;
    $('#subModal').innerHTML =
      `${escapar([e.codigo, e.marca, e.modelo, e.numero_serie].filter(Boolean).join(' · '))}
       · ${M.estado(e.estado, ESTADOS)}`;

    $('#cuerpoModal').innerHTML = `
      ${H.puede('equipos.gestionar') ? `
        <div class="modal-acciones" style="justify-content:flex-start;margin-top:0">
          <button type="button" class="btn btn-outline btn-sm" id="btnEditar">Editar ficha</button>
        </div>` : ''}

      <h4 class="titulo-modulo">Historial</h4>
      ${M.tabla(historial, [
        { titulo: 'Fecha', valor: (m) => M.cuando(m.fecha) },
        { titulo: 'Tipo', valor: (m) => M.estado(m.tipo) },
        { titulo: 'Descripción', campo: 'descripcion' },
        { titulo: 'Resultado', valor: (m) => M.estado(m.resultado) },
        { titulo: 'Costo', valor: (m) => escapar(H.moneda(m.costo || 0)) },
        { titulo: 'Realizó', valor: (m) => escapar(m.realizado_por_nombre || m.proveedor || '—') },
      ], { vacio: 'Sin mantenimientos registrados.', icono: 'icon-ajustes' })}

      ${H.puede('equipos.gestionar') ? `
        <h4 class="titulo-modulo" style="margin-top:22px">Registrar mantenimiento</h4>
        <form id="formMantenimiento">
          <div class="campos-fila-3">
            <label class="campo">
              <span>Tipo</span>
              <select name="tipo">
                <option value="preventivo">Preventivo</option>
                <option value="correctivo">Correctivo</option>
                <option value="calibracion">Calibración</option>
                <option value="verificacion">Verificación</option>
              </select>
            </label>
            <label class="campo"><span>Fecha</span><input type="date" name="fecha"></label>
            <label class="campo">
              <span>Resultado</span>
              <select name="resultado">
                <option value="satisfactorio">Satisfactorio</option>
                <option value="con_reservas">Con reservas</option>
                <option value="fallido">Fallido</option>
              </select>
            </label>
          </div>
          <label class="campo">
            <span>Descripción *</span>
            <textarea name="descripcion" required maxlength="8000" placeholder="Qué se revisó y qué se encontró."></textarea>
          </label>
          <div class="campos-fila-3">
            <label class="campo"><span>Proveedor</span><input type="text" name="proveedor" maxlength="150"></label>
            <label class="campo"><span>Costo</span><input type="number" name="costo" min="0" step="1000" value="0"></label>
            <label class="campo"><span>Próximo</span><input type="date" name="proximo"></label>
          </div>
          <p class="campo-ayuda">
            Si dejas "Próximo" vacío se calcula con la frecuencia del equipo.
            Un resultado <strong>fallido</strong> lo deja fuera de servicio.
          </p>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar</button></div>
        </form>` : ''}`;

    const btnEditar = $('#btnEditar');
    if (btnEditar) btnEditar.addEventListener('click', () => abrirFormulario(e));

    M.conectarFormulario({
      form: '#formMantenimiento',
      ruta: `/operaciones/equipos/${e.id}/mantenimientos`,
      cajaError: '#errorModal',
      ok: 'Mantenimiento registrado.',
      alTerminar: async () => {
        await abrirDetalle(e.id);
        await recargarVista('equipos');
      },
    });
  }
})();
