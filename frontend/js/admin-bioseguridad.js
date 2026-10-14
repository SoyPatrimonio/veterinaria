/* ============================================================
   Bioseguridad — protocolos, residuos, incidentes y EPP

   Es el módulo que hay que poder enseñarle a quien venga a
   inspeccionar: cada limpieza con su firma, cada kilo de residuo
   con su acta y cada incidente con lo que se hizo.
   ============================================================ */

(function () {
  'use strict';

  const H = window.Huella;
  const M = H.modulo;
  const { $, escapar } = H;

  const CATEGORIAS = {
    limpieza: 'Limpieza', desinfeccion: 'Desinfección', esterilizacion: 'Esterilización',
    residuos: 'Residuos', proteccion: 'Protección', emergencia: 'Emergencia',
  };

  const TIPOS_RESIDUO = {
    anatomopatologico: 'Anatomopatológico', cortopunzante: 'Cortopunzante',
    biosanitario: 'Biosanitario', quimico: 'Químico', farmaco: 'Fármacos',
    ordinario: 'Ordinario', reciclable: 'Reciclable',
  };

  const TIPOS_INCIDENTE = {
    accidente_cortopunzante: 'Accidente cortopunzante', mordedura: 'Mordedura',
    'arañazo': 'Arañazo', exposicion_quimica: 'Exposición química', derrame: 'Derrame',
    contaminacion: 'Contaminación', fuga_paciente: 'Fuga de paciente', otro: 'Otro',
  };

  let protocolos = [];
  let sedes = [];
  let mostrar = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const usuario = H.montarPanel(['admin', 'veterinario'],
      ['bioseguridad.ver', 'bioseguridad.registrar', 'bioseguridad.gestionar']);
    if (!usuario) return;

    H.prepararModal('modal');

    try {
      sedes = (await H.api.get('/sedes')).sedes || [];
    } catch { sedes = []; }

    mostrar = M.pestanas({
      contenedorPestanas: '#pestanas',
      contenedor: '#contenido',
      inicial: 'protocolos',
      vistas: {
        protocolos: vistaProtocolos,
        registros: vistaRegistros,
        residuos: vistaResiduos,
        incidentes: vistaIncidentes,
        epp: vistaEpp,
      },
    });
  });

  const puedeRegistrar = () => H.puede('bioseguridad.registrar', 'bioseguridad.gestionar');
  const puedeGestionar = () => H.puede('bioseguridad.gestionar');

  async function vistaProtocolos() {
    protocolos = (await H.api.get('/operaciones/protocolos', { soloActivos: false })).protocolos || [];

    $('#contenido').innerHTML = `
      ${M.tabla(protocolos, [
        { titulo: 'Código', valor: (p) => `<strong>${escapar(p.codigo)}</strong>` },
        { titulo: 'Protocolo', valor: (p) => `${escapar(p.nombre)}<br><span class="campo-ayuda">${escapar(p.descripcion || '')}</span>` },
        { titulo: 'Categoría', valor: (p) => escapar(CATEGORIAS[p.categoria] || p.categoria) },
        { titulo: 'Frecuencia', valor: (p) => escapar(String(p.frecuencia).replace('_', ' ')) },
        { titulo: 'Último registro', valor: (p) => M.cuando(p.ultimo_registro, true) },
        { titulo: 'Estado', valor: (p) => M.estado(p.activo ? 'activo' : 'inactivo') },
      ], { vacio: 'No hay protocolos definidos.', icono: 'icon-shield' })}

      ${puedeGestionar() ? `
        <h4 class="titulo-modulo" style="margin-top:22px">Nuevo protocolo</h4>
        <form id="formProtocolo">
          <div class="campos-fila-3">
            <label class="campo"><span>Código *</span><input type="text" name="codigo" required maxlength="30"></label>
            <label class="campo">
              <span>Categoría</span>
              <select name="categoria">${Object.entries(CATEGORIAS).map(([k, t]) => `<option value="${k}">${escapar(t)}</option>`).join('')}</select>
            </label>
            <label class="campo">
              <span>Frecuencia</span>
              <select name="frecuencia">
                ${['por_uso', 'diaria', 'semanal', 'quincenal', 'mensual', 'trimestral']
                  .map((f) => `<option value="${f}">${escapar(f.replace('_', ' '))}</option>`).join('')}
              </select>
            </label>
          </div>
          <label class="campo"><span>Nombre *</span><input type="text" name="nombre" required maxlength="150"></label>
          <label class="campo"><span>Pasos</span><textarea name="pasos" maxlength="8000"></textarea></label>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Crear protocolo</button></div>
        </form>` : ''}`;

    M.conectarFormulario({
      form: '#formProtocolo', ruta: '/operaciones/protocolos', cajaError: '#error',
      ok: 'Protocolo creado.', alTerminar: () => mostrar('protocolos'),
    });
  }

  async function vistaRegistros() {
    if (!protocolos.length) {
      protocolos = (await H.api.get('/operaciones/protocolos')).protocolos || [];
    }
    const registros = (await H.api.get('/operaciones/bioseguridad')).registros || [];

    $('#contenido').innerHTML = `
      ${puedeRegistrar() ? `
        <form id="formRegistro" style="margin-bottom:20px">
          <div class="campos-fila-3">
            <label class="campo">
              <span>Protocolo *</span>
              <select name="protocoloId" required>${M.opciones(protocolos, { vacio: 'Selecciona', texto: (p) => `${p.codigo} — ${p.nombre}` })}</select>
            </label>
            <label class="campo">
              <span>Sede</span>
              <select name="sedeId">${M.opciones(sedes, { vacio: 'Sin sede' })}</select>
            </label>
            <label class="campo"><span>Área</span><input type="text" name="area" maxlength="80" placeholder="Quirófano, sala de espera…"></label>
          </div>
          <div class="campos-fila">
            <label class="campo"><span>Producto usado</span><input type="text" name="productoUsado" maxlength="120"></label>
            <label class="campo"><span>Observaciones</span><input type="text" name="observaciones" maxlength="255"></label>
          </div>
          <label class="campo-check"><input type="checkbox" name="cumplido" checked> Se cumplió el protocolo</label>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar cumplimiento</button></div>
        </form>` : ''}

      ${M.tabla(registros, [
        { titulo: 'Fecha', valor: (r) => M.cuando(r.fecha, true) },
        { titulo: 'Protocolo', campo: 'protocolo' },
        { titulo: 'Área', valor: (r) => escapar([r.sede_nombre, r.area].filter(Boolean).join(' · ') || '—') },
        { titulo: 'Producto', valor: (r) => escapar(r.producto_usado || '—') },
        { titulo: 'Cumplido', valor: (r) => (r.cumplido ? '<span class="chip chip-exito">sí</span>' : '<span class="chip chip-error">no</span>') },
        { titulo: 'Realizó', valor: (r) => escapar(r.realizado_por_nombre || '—') },
      ], { vacio: 'No hay registros de cumplimiento.', icono: 'icon-check' })}`;

    M.conectarFormulario({
      form: '#formRegistro', ruta: '/operaciones/bioseguridad', cajaError: '#error',
      ok: 'Registro guardado.', alTerminar: () => mostrar('registros'),
    });
  }

  async function vistaResiduos() {
    const datos = await H.api.get('/operaciones/residuos');

    $('#contenido').innerHTML = `
      <div class="rejilla-metricas" style="margin-bottom:18px">
        ${M.metricas((datos.resumen || []).map((r) => ({
          texto: TIPOS_RESIDUO[r.tipo] || r.tipo,
          valor: Number(r.kilos || 0).toFixed(1),
          sufijo: ' kg',
          icono: 'icon-basura',
        })))}
      </div>

      ${puedeRegistrar() ? `
        <form id="formResiduos" style="margin-bottom:20px">
          <div class="campos-fila-3">
            <label class="campo">
              <span>Tipo *</span>
              <select name="tipo" required>${Object.entries(TIPOS_RESIDUO).map(([k, t]) => `<option value="${k}">${escapar(t)}</option>`).join('')}</select>
            </label>
            <label class="campo"><span>Peso (kg) *</span><input type="number" name="pesoKg" required min="0.001" step="0.01"></label>
            <label class="campo"><span>Fecha</span><input type="date" name="fecha"></label>
          </div>
          <div class="campos-fila-3">
            <label class="campo">
              <span>Sede</span>
              <select name="sedeId">${M.opciones(sedes, { vacio: 'Sin sede' })}</select>
            </label>
            <label class="campo"><span>Gestor</span><input type="text" name="gestor" maxlength="150" placeholder="Empresa que recoge"></label>
            <label class="campo"><span>N.º de acta</span><input type="text" name="numeroActa" maxlength="40"></label>
          </div>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar entrega</button></div>
        </form>` : ''}

      ${M.tabla(datos.residuos || [], [
        { titulo: 'Fecha', valor: (r) => M.cuando(r.fecha) },
        { titulo: 'Tipo', valor: (r) => escapar(TIPOS_RESIDUO[r.tipo] || r.tipo) },
        { titulo: 'Peso', valor: (r) => `${escapar(r.peso_kg)} kg` },
        { titulo: 'Gestor', valor: (r) => escapar(r.gestor || '—') },
        { titulo: 'Acta', valor: (r) => escapar(r.numero_acta || '—') },
        { titulo: 'Entregó', valor: (r) => escapar(r.entregado_por_nombre || '—') },
      ], { vacio: 'No hay entregas registradas.', icono: 'icon-basura' })}`;

    M.conectarFormulario({
      form: '#formResiduos', ruta: '/operaciones/residuos', cajaError: '#error',
      ok: 'Entrega registrada.', alTerminar: () => mostrar('residuos'),
    });
  }

  async function vistaIncidentes() {
    const incidentes = (await H.api.get('/operaciones/incidentes')).incidentes || [];

    $('#contenido').innerHTML = `
      ${puedeRegistrar() ? `
        <form id="formIncidente" style="margin-bottom:20px">
          <div class="campos-fila-3">
            <label class="campo">
              <span>Tipo *</span>
              <select name="tipo" required>${Object.entries(TIPOS_INCIDENTE).map(([k, t]) => `<option value="${k}">${escapar(t)}</option>`).join('')}</select>
            </label>
            <label class="campo">
              <span>Gravedad</span>
              <select name="gravedad"><option value="leve">Leve</option><option value="moderada">Moderada</option><option value="grave">Grave</option></select>
            </label>
            <label class="campo"><span>Lugar</span><input type="text" name="lugar" maxlength="120"></label>
          </div>
          <label class="campo">
            <span>Descripción *</span>
            <textarea name="descripcion" required maxlength="8000" placeholder="Qué pasó, a quién y en qué circunstancias."></textarea>
          </label>
          <label class="campo"><span>Involucrados</span><input type="text" name="involucrados" maxlength="255"></label>
          <p class="campo-ayuda">
            Un incidente grave se avisa de inmediato: puede implicar profilaxis
            postexposición, y eso tiene ventana de horas.
          </p>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Reportar incidente</button></div>
        </form>` : ''}

      ${M.tabla(incidentes, [
        { titulo: 'Fecha', valor: (i) => M.cuando(i.fecha, true) },
        { titulo: 'Tipo', valor: (i) => escapar(TIPOS_INCIDENTE[i.tipo] || i.tipo) },
        { titulo: 'Gravedad', valor: (i) => M.estado(i.gravedad) },
        { titulo: 'Descripción', valor: (i) => escapar(String(i.descripcion).slice(0, 120)) },
        { titulo: 'Estado', valor: (i) => M.estado(i.estado) },
        {
          titulo: '',
          valor: (i) => (i.estado !== 'cerrado' && puedeGestionar()
            ? `<button type="button" class="btn btn-outline btn-sm" data-cerrar-inc="${i.id}">Cerrar</button>` : ''),
        },
      ], { vacio: 'No hay incidentes reportados.', icono: 'icon-alerta' })}`;

    M.conectarFormulario({
      form: '#formIncidente', ruta: '/operaciones/incidentes', cajaError: '#error',
      ok: 'Incidente registrado.', alTerminar: () => mostrar('incidentes'),
    });

    H.$$('#contenido [data-cerrar-inc]').forEach((b) => {
      b.addEventListener('click', async () => {
        // Cerrar exige decir qué se hizo; sin eso el registro no sirve de nada
        // cuando alguien pregunte seis meses después.
        const acciones = await H.pedirTexto({
          titulo: 'Cerrar incidente',
          detalle: 'Obligatorio para cerrar: qué se hizo al respecto.',
          etiqueta: 'Acciones tomadas',
          boton: 'Cerrar incidente',
        });
        if (!acciones) return;

        try {
          await H.api.patch(`/operaciones/incidentes/${b.dataset.cerrarInc}`, {
            estado: 'cerrado', acciones,
          });
          H.toast('Incidente cerrado.');
          await mostrar('incidentes');
        } catch (error) {
          H.toast(error.message, 'error');
        }
      });
    });
  }

  async function vistaEpp() {
    const datos = await H.api.get('/operaciones/epp');

    $('#contenido').innerHTML = `
      <h4 class="titulo-modulo">Elementos</h4>
      ${M.tabla(datos.elementos || [], [
        { titulo: 'Elemento', valor: (e) => `<strong>${escapar(e.nombre)}</strong>` },
        { titulo: 'Tipo', campo: 'tipo' },
        { titulo: 'Vida útil', valor: (e) => (e.vida_util_dias ? `${escapar(e.vida_util_dias)} días` : '—') },
        { titulo: 'Existencias', valor: (e) => escapar(e.existencias ?? '—') },
      ], { vacio: 'No hay elementos de protección registrados.', icono: 'icon-shield' })}

      ${puedeRegistrar() && (datos.elementos || []).length ? `
        <h4 class="titulo-modulo" style="margin-top:22px">Registrar entrega</h4>
        <form id="formEntrega">
          <div class="campos-fila-3">
            <label class="campo">
              <span>Elemento *</span>
              <select name="elementoId" required>${M.opciones(datos.elementos, { vacio: 'Selecciona' })}</select>
            </label>
            <label class="campo"><span>Usuario *</span><input type="number" name="usuarioId" required min="1" placeholder="ID del usuario"></label>
            <label class="campo"><span>Cantidad</span><input type="number" name="cantidad" min="1" value="1"></label>
          </div>
          <div class="modal-acciones"><button type="submit" class="btn btn-primary">Registrar entrega</button></div>
        </form>` : ''}

      <h4 class="titulo-modulo" style="margin-top:22px">Entregas</h4>
      ${M.tabla(datos.entregas || [], [
        { titulo: 'Fecha', valor: (e) => M.cuando(e.fecha) },
        { titulo: 'Elemento', campo: 'elemento' },
        { titulo: 'Persona', campo: 'usuario_nombre' },
        { titulo: 'Cantidad', campo: 'cantidad' },
        { titulo: 'Próxima', valor: (e) => M.cuando(e.proxima_entrega) },
      ], { vacio: 'No hay entregas registradas.', icono: 'icon-shield' })}`;

    M.conectarFormulario({
      form: '#formEntrega', ruta: '/operaciones/epp/entregas', cajaError: '#error',
      ok: 'Entrega registrada.', alTerminar: () => mostrar('epp'),
    });
  }
})();
