/* ============================================================
   Personal — turnos, asistencia, ausencias y comisiones

   Lo que ata este módulo con el resto: aprobar unas vacaciones crea
   el bloqueo de agenda del veterinario, así que nadie puede
   agendarle una cita encima.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  const TIPOS_AUSENCIA = {
    vacaciones: 'Vacaciones', permiso: 'Permiso', incapacidad: 'Incapacidad',
    licencia: 'Licencia', compensatorio: 'Compensatorio',
  };

  let turnos = [];
  let sedes = [];
  let mostrar = null;
  let pestanaActual = 'turnos';

  const periodoActual = () => H.fechaHoyISO().slice(0, 7);

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin', 'veterinario'],
      ['personal.ver', 'personal.gestionar', 'ausencias.solicitar']);
    if (!usuario) return;

    H.prepararModal('modal');
    $('#btnPrincipal').addEventListener('click', abrirCreacion);

    try {
      sedes = (await H.api.get('/sedes')).sedes || [];
    } catch { sedes = []; }

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'turnos',
      vistas: {
        turnos: () => { pestanaActual = 'turnos'; return vistaTurnos(); },
        asistencia: () => { pestanaActual = 'asistencia'; return vistaAsistencia(); },
        ausencias: () => { pestanaActual = 'ausencias'; return vistaAusencias(); },
        comisiones: () => { pestanaActual = 'comisiones'; return vistaComisiones(); },
        certificaciones: () => { pestanaActual = 'certificaciones'; return vistaCertificaciones(); },
        productividad: () => { pestanaActual = 'productividad'; return vistaProductividad(); },
      },
    });
  });

  const gestiona = () => H.puede('personal.gestionar');

  async function vistaTurnos() {
    const [datosTurnos, datosAsig] = await Promise.all([
      H.api.get('/personal/turnos', { soloActivos: false }),
      H.api.get('/personal/asignaciones'),
    ]);
    turnos = datosTurnos.turnos || [];

    $('#contenido').innerHTML = `
      <h4 class="titulo-modulo">Turnos definidos</h4>
      ${M.tabla(turnos, [
        { titulo: 'Turno', valor: (t) => `<strong>${escapar(t.nombre)}</strong>` },
        { titulo: 'Horario', valor: (t) => `${escapar(H.hora12(t.hora_inicio))} — ${escapar(H.hora12(t.hora_fin))}${t.nocturno ? ' <span class="chip chip-info">nocturno</span>' : ''}` },
        { titulo: 'Sede', valor: (t) => escapar(t.sede_nombre || 'todas') },
        { titulo: 'Estado', valor: (t) => M.estado(t.activo ? 'activo' : 'inactivo') },
      ], { vacio: 'No hay turnos definidos.', icono: 'icon-clock' })}

      <h4 class="titulo-modulo" style="margin-top:22px">Cuadro del mes</h4>
      ${M.tabla(datosAsig.asignaciones || [], [
        { titulo: 'Fecha', valor: (a) => M.cuando(a.fecha) },
        { titulo: 'Persona', valor: (a) => `${escapar(a.usuario_nombre)}<br><span class="campo-ayuda">${escapar(a.rol)}</span>` },
        { titulo: 'Turno', valor: (a) => `${escapar(a.turno)} · ${escapar(H.hora12(a.hora_inicio))}–${escapar(H.hora12(a.hora_fin))}` },
        { titulo: 'Sede', valor: (a) => escapar(a.sede_nombre || '—') },
        { titulo: 'Estado', valor: (a) => M.estado(a.estado) },
        {
          titulo: '',
          valor: (a) => (gestiona()
            ? `<button type="button" class="btn btn-peligro btn-sm" data-quitar="${a.id}">Quitar</button>` : ''),
        },
      ], { vacio: 'No hay turnos asignados en el rango.', icono: 'icon-calendar' })}`;

    H.$$('#contenido [data-quitar]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!(await H.confirmar('¿Quitar esta asignación de turno?'))) return;
        try {
          await H.api.del(`/personal/asignaciones/${b.dataset.quitar}`);
          H.toast('Asignación retirada.');
          await mostrar('turnos');
        } catch (error) { H.toast(error.message, 'error'); }
      });
    });
  }

  async function vistaAsistencia() {
    const datos = await H.api.get('/personal/asistencia');

    $('#contenido').innerHTML = M.tabla(datos.asistencia || [], [
      { titulo: 'Fecha', valor: (a) => M.cuando(a.fecha) },
      { titulo: 'Persona', campo: 'usuario_nombre' },
      { titulo: 'Entrada', valor: (a) => (a.entrada ? escapar(H.hora12(a.entrada)) : '—') },
      { titulo: 'Salida', valor: (a) => (a.salida ? escapar(H.hora12(a.salida)) : '—') },
      { titulo: 'Horas', valor: (a) => escapar(a.horas ?? '—') },
      { titulo: 'Estado', valor: (a) => M.estado(a.estado) },
    ], { vacio: 'No hay registros de asistencia en el rango.', icono: 'icon-clock' });
  }

  async function vistaAusencias() {
    const datos = await H.api.get('/personal/ausencias');
    const puedeAprobar = H.puede('ausencias.aprobar');

    $('#contenido').innerHTML = M.tabla(datos.ausencias || [], [
      { titulo: 'Persona', campo: 'usuario_nombre' },
      { titulo: 'Tipo', valor: (a) => escapar(TIPOS_AUSENCIA[a.tipo] || a.tipo) },
      { titulo: 'Desde', valor: (a) => M.cuando(a.desde) },
      { titulo: 'Hasta', valor: (a) => M.cuando(a.hasta) },
      { titulo: 'Días', valor: (a) => escapar(a.dias ?? a.dias_calendario ?? '—') },
      { titulo: 'Estado', valor: (a) => M.estado(a.estado) },
      {
        titulo: '',
        valor: (a) => (a.estado === 'solicitada' && puedeAprobar
          ? `<button type="button" class="btn btn-primary btn-sm" data-aprobar="${a.id}">Aprobar</button>
             <button type="button" class="btn btn-peligro btn-sm" data-rechazar="${a.id}">Rechazar</button>` : ''),
      },
    ], { vacio: 'No hay solicitudes de ausencia.', icono: 'icon-calendar' });

    H.$$('#contenido [data-aprobar]').forEach((b) => {
      b.addEventListener('click', () => resolver(b.dataset.aprobar, { estado: 'aprobada', bloquearAgenda: true }));
    });
    H.$$('#contenido [data-rechazar]').forEach((b) => {
      b.addEventListener('click', async () => {
        const motivo = await H.pedirTexto({
          titulo: 'Rechazar solicitud',
          etiqueta: 'Motivo del rechazo',
          boton: 'Rechazar solicitud',
        });
        if (motivo) resolver(b.dataset.rechazar, { estado: 'rechazada', motivo });
      });
    });
  }

  async function resolver(id, cuerpo) {
    try {
      const datos = await H.api.patch(`/personal/ausencias/${id}`, cuerpo);
      H.toast(datos.mensaje || 'Solicitud resuelta.');
      await mostrar('ausencias');
    } catch (error) { H.toast(error.message, 'error'); }
  }

  async function vistaComisiones() {
    const periodo = periodoActual();
    const [datos, reglas] = await Promise.all([
      H.api.get('/personal/comisiones', { periodo }),
      H.puede('comisiones.gestionar') ? H.api.get('/personal/comisiones/reglas') : Promise.resolve({ reglas: [] }),
    ]);

    $('#contenido').innerHTML = `
      ${H.puede('comisiones.gestionar') ? `
        <form id="formCalcular" class="fila-editable" style="margin-bottom:18px">
          <label class="campo">
            <span>Periodo</span>
            <input type="month" name="periodo" value="${escapar(periodo)}" required>
          </label>
          <button type="submit" class="btn btn-outline">Recalcular</button>
          <button type="button" class="btn btn-primary" id="btnLiquidar">Liquidar</button>
        </form>
        <p class="campo-ayuda" style="margin-bottom:14px">
          Recalcular rehace las pendientes del periodo; las ya liquidadas no se tocan.
        </p>` : ''}

      ${M.tabla(datos.comisiones || [], [
        { titulo: 'Persona', campo: 'usuario_nombre' },
        { titulo: 'Periodo', campo: 'periodo' },
        { titulo: 'Líneas', campo: 'lineas' },
        { titulo: 'Base', valor: (c) => escapar(H.moneda(c.base)) },
        { titulo: 'Comisión', valor: (c) => `<strong>${escapar(H.moneda(c.total))}</strong>` },
        { titulo: 'Estado', valor: (c) => M.estado(c.estado) },
      ], { vacio: 'No hay comisiones en este periodo.', icono: 'icon-recibo' })}

      ${(reglas.reglas || []).length ? `
        <h4 class="titulo-modulo" style="margin-top:22px">Reglas</h4>
        ${M.tabla(reglas.reglas, [
          { titulo: 'Regla', campo: 'nombre' },
          { titulo: 'Aplica a', campo: 'aplica_a' },
          { titulo: 'Alcance', valor: (r) => escapar(r.servicio_nombre || r.categoria_nombre || r.usuario_nombre || 'todo') },
          { titulo: 'Valor', valor: (r) => (r.porcentaje ? `${escapar(r.porcentaje)} %` : escapar(H.moneda(r.valor_fijo))) },
          { titulo: 'Estado', valor: (r) => M.estado(r.activo ? 'activo' : 'inactivo') },
        ], { vacio: 'Sin reglas.', icono: 'icon-ajustes' })}` : ''}`;

    M.conectarFormulario({
      form: '#formCalcular', ruta: '/personal/comisiones/calcular', cajaError: '#error',
      ok: 'Comisiones recalculadas.', alTerminar: () => mostrar('comisiones'),
    });

    const btn = $('#btnLiquidar');
    if (btn) {
      btn.addEventListener('click', async () => {
        const campo = $('#formCalcular [name="periodo"]');
        if (!(await H.confirmar(`¿Liquidar las comisiones pendientes de ${campo.value}?`))) return;

        try {
          const r = await H.api.post('/personal/comisiones/liquidar', { periodo: campo.value });
          H.toast(`${r.liquidadas} comisión(es) liquidada(s).`);
          await mostrar('comisiones');
        } catch (error) { H.toast(error.message, 'error'); }
      });
    }
  }

  async function vistaCertificaciones() {
    const datos = await H.api.get('/personal/certificaciones');

    $('#contenido').innerHTML = M.tabla(datos.certificaciones || [], [
      { titulo: 'Persona', campo: 'usuario_nombre' },
      { titulo: 'Certificación', valor: (c) => `<strong>${escapar(c.nombre)}</strong><br><span class="campo-ayuda">${escapar(c.entidad || '')}</span>` },
      { titulo: 'Tipo', campo: 'tipo' },
      { titulo: 'Expedida', valor: (c) => M.cuando(c.expedida_en) },
      {
        titulo: 'Vence',
        valor: (c) => {
          if (!c.vence_en) return '<span class="campo-ayuda">sin vencimiento</span>';
          const dias = Number(c.dias_restantes);
          return `<span class="${dias <= 30 ? 'texto-alerta' : ''}">${escapar(H.fechaLarga(c.vence_en))}</span>`;
        },
      },
    ], { vacio: 'No hay certificaciones registradas.', icono: 'icon-shield' });
  }

  async function vistaProductividad() {
    const datos = await H.api.get('/personal/productividad');

    $('#contenido').innerHTML = `
      <p class="campo-ayuda" style="margin-bottom:14px">
        Del ${escapar(H.fechaLarga(datos.desde))} al ${escapar(H.fechaLarga(datos.hasta))}.
      </p>
      ${M.tabla(datos.productividad || [], [
        { titulo: 'Veterinario', campo: 'nombre' },
        { titulo: 'Consultas', campo: 'consultas' },
        { titulo: 'Pacientes', campo: 'pacientes' },
        { titulo: 'Citas atendidas', campo: 'citas_atendidas' },
        { titulo: 'Inasistencias', valor: (p) => `<span class="${Number(p.inasistencias) > 0 ? 'texto-alerta' : ''}">${escapar(p.inasistencias)}</span>` },
        { titulo: 'Facturado', valor: (p) => escapar(H.moneda(p.facturado)) },
      ], { vacio: 'No hay actividad en el rango.', icono: 'icon-grafica' })}`;
  }

  /* --------------------------------------------------------
     Creación: el botón cambia según la pestaña abierta
     -------------------------------------------------------- */

  function abrirCreacion() {
    const formularios = {
      turnos: formTurno,
      asistencia: formAsistencia,
      ausencias: formAusencia,
      certificaciones: formCertificacion,
    };

    const constructor = formularios[pestanaActual];
    if (!constructor) {
      return H.toast('En esta pestaña no hay nada que crear.', 'error');
    }

    H.limpiarError($('#errorModal'));
    constructor();
    H.abrirModal('modal');
  }

  function formTurno() {
    $('#tituloModal').textContent = 'Nuevo turno';
    $('#subModal').textContent = 'Si cruza la medianoche, márcalo como nocturno.';
    $('#cuerpoModal').innerHTML = `
      <form id="formNuevo">
        <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="60"></label>
        <div class="campos-fila-3">
          <label class="campo"><span>Inicio *</span><input type="time" name="horaInicio" required></label>
          <label class="campo"><span>Fin *</span><input type="time" name="horaFin" required></label>
          <label class="campo">
            <span>Sede</span>
            <select name="sedeId">${M.opciones(sedes, { vacio: 'Todas' })}</select>
          </label>
        </div>
        <label class="campo-check"><input type="checkbox" name="nocturno"> Turno nocturno</label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Crear turno</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formNuevo', ruta: '/personal/turnos', cajaError: '#errorModal',
      ok: 'Turno creado.',
      alTerminar: async () => { H.cerrarModal('modal'); await mostrar('turnos'); },
    });
  }

  function formAsistencia() {
    $('#tituloModal').textContent = 'Registrar asistencia';
    $('#subModal').textContent = 'Las horas se calculan solas a partir de entrada y salida.';
    $('#cuerpoModal').innerHTML = `
      <form id="formNuevo">
        <div class="campos-fila">
          <label class="campo"><span>Usuario (id) *</span><input type="number" name="usuarioId" required min="1"></label>
          <label class="campo"><span>Fecha *</span><input type="date" name="fecha" required value="${escapar(H.fechaHoyISO())}"></label>
        </div>
        <div class="campos-fila-3">
          <label class="campo"><span>Entrada</span><input type="datetime-local" name="entrada"></label>
          <label class="campo"><span>Salida</span><input type="datetime-local" name="salida"></label>
          <label class="campo">
            <span>Estado</span>
            <select name="estado">
              <option value="presente">Presente</option><option value="tarde">Tarde</option>
              <option value="ausente">Ausente</option><option value="justificado">Justificado</option>
              <option value="descanso">Descanso</option>
            </select>
          </label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formNuevo', ruta: '/personal/asistencia', cajaError: '#errorModal',
      ok: 'Asistencia registrada.',
      alTerminar: async () => { H.cerrarModal('modal'); await mostrar('asistencia'); },
    });
  }

  function formAusencia() {
    $('#tituloModal').textContent = 'Solicitar ausencia';
    $('#subModal').textContent = 'Al aprobarse, si eres veterinario se bloquea tu agenda en esas fechas.';
    $('#cuerpoModal').innerHTML = `
      <form id="formNuevo">
        <label class="campo">
          <span>Tipo *</span>
          <select name="tipo" required>${Object.entries(TIPOS_AUSENCIA).map(([k, t]) => `<option value="${k}">${escapar(t)}</option>`).join('')}</select>
        </label>
        <div class="campos-fila">
          <label class="campo"><span>Desde *</span><input type="date" name="desde" required></label>
          <label class="campo"><span>Hasta *</span><input type="date" name="hasta" required></label>
        </div>
        <label class="campo"><span>Motivo</span><textarea name="motivo" maxlength="255"></textarea></label>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Solicitar</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formNuevo', ruta: '/personal/ausencias', cajaError: '#errorModal',
      ok: 'Solicitud enviada.',
      alTerminar: async () => { H.cerrarModal('modal'); await mostrar('ausencias'); },
    });
  }

  function formCertificacion() {
    $('#tituloModal').textContent = 'Nueva certificación';
    $('#subModal').textContent = 'Las que vencen en menos de 60 días generan alerta.';
    $('#cuerpoModal').innerHTML = `
      <form id="formNuevo">
        <div class="campos-fila">
          <label class="campo"><span>Usuario (id) *</span><input type="number" name="usuarioId" required min="1"></label>
          <label class="campo">
            <span>Tipo</span>
            <select name="tipo">
              <option value="certificacion">Certificación</option><option value="titulo">Título</option>
              <option value="especializacion">Especialización</option><option value="curso">Curso</option>
              <option value="tarjeta">Tarjeta profesional</option>
            </select>
          </label>
        </div>
        <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="150"></label>
        <label class="campo"><span>Entidad</span><input type="text" name="entidad" maxlength="150"></label>
        <div class="campos-fila">
          <label class="campo"><span>Expedida</span><input type="date" name="expedidaEn"></label>
          <label class="campo"><span>Vence</span><input type="date" name="venceEn"></label>
        </div>
        <div class="modal-acciones"><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`;

    M.conectarFormulario({
      form: '#formNuevo', ruta: '/personal/certificaciones', cajaError: '#errorModal',
      ok: 'Certificación registrada.',
      alTerminar: async () => { H.cerrarModal('modal'); await mostrar('certificaciones'); },
    });
  }
})();
