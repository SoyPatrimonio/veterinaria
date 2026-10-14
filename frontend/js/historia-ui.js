/* ============================================================
   Piezas de la historia clínica compartidas por el panel del
   veterinario y el portal del cliente.

   Las dos pantallas muestran lo mismo; lo único que cambia es que
   el veterinario además puede escribir. Por eso el dibujo vive
   aquí y cada página se queda solo con su lógica.
   ============================================================ */

(function (global) {
  'use strict';

  const H = global.Huella;
  const { escapar } = H;

  const ETIQUETA_TIPO_CONSULTA = {
    consulta: 'Consulta',
    control: 'Control',
    urgencia: 'Urgencia',
    cirugia: 'Cirugía',
    vacunacion: 'Vacunación',
  };

  const ETIQUETA_TIPO_DIAGNOSTICO = {
    presuntivo: 'Presuntivo',
    definitivo: 'Definitivo',
    descartado: 'Descartado',
  };

  const ETIQUETA_ESTADO_EXAMEN = {
    solicitado: 'Solicitado',
    en_proceso: 'En proceso',
    listo: 'Listo',
    anulado: 'Anulado',
  };

  /* --------------------------------------------------------
     Consultas
     -------------------------------------------------------- */

  function lineaTiempoConsultas(consultas, { conAcciones = false } = {}) {
    if (!consultas.length) {
      return H.bloqueVacio('Este paciente todavía no tiene consultas registradas.', 'icon-stetho');
    }

    return `<div class="linea-tiempo">
      ${consultas.map((c) => `
        <article class="hito" data-consulta="${c.id}">
          <div class="hito-cabecera">
            <h4>${escapar(c.motivo)}</h4>
            <span class="hito-fecha">${escapar(H.fechaLarga(c.fecha))} · ${escapar(H.hora12(c.fecha))}</span>
          </div>
          <div class="hito-cuerpo">
            <p>${escapar(c.veterinario_nombre)} · ${escapar(H.ETIQUETA_ESPECIALIDAD[c.especialidad] || c.especialidad)}</p>
            ${c.observaciones ? `<p>${escapar(recortar(c.observaciones, 160))}</p>` : ''}
          </div>
          <div class="hito-pie">
            <span class="chip">${escapar(ETIQUETA_TIPO_CONSULTA[c.tipo] || c.tipo)}</span>
            ${c.cita_id ? '<span class="chip chip-info">Desde una cita</span>' : ''}
            ${conAcciones
              ? `<button type="button" class="btn btn-outline btn-sm" data-ver="${c.id}">Ver detalle</button>`
              : `<button type="button" class="btn btn-outline btn-sm" data-ver="${c.id}">Ver</button>`}
          </div>
        </article>`).join('')}
    </div>`;
  }

  /** Contenido del modal de una consulta, con todo lo que cuelga de ella. */
  function detalleConsulta(consulta, { signos, diagnosticos, tratamientos }) {
    const constantes = signos && signos.length ? bloqueConstantes(signos[0]) : '';

    const textos = [
      ['Anamnesis', consulta.anamnesis],
      ['Síntomas', consulta.sintomas],
      ['Examen físico', consulta.examen_fisico],
      ['Observaciones', consulta.observaciones],
      ['Plan de manejo', consulta.plan_manejo],
    ].filter(([, valor]) => valor);

    return `
      <h3>${escapar(consulta.motivo)}</h3>
      <p class="modal-sub">
        ${escapar(H.fechaLarga(consulta.fecha))} · ${escapar(H.hora12(consulta.fecha))} ·
        ${escapar(consulta.veterinario_nombre)}
      </p>

      <div class="hito-pie" style="margin:0 0 16px">
        <span class="chip">${escapar(ETIQUETA_TIPO_CONSULTA[consulta.tipo] || consulta.tipo)}</span>
        <span class="chip chip-info">${escapar(consulta.mascota_nombre)}</span>
        ${consulta.historia_numero ? `<span class="chip">${escapar(consulta.historia_numero)}</span>` : ''}
      </div>

      ${constantes}

      ${textos.map(([titulo, valor]) => `
        <div class="hito-cuerpo" style="margin-top:14px">
          <strong>${escapar(titulo)}</strong>
          <p>${escapar(valor)}</p>
        </div>`).join('')}

      ${diagnosticos.length ? `
        <h4 style="font-family:var(--font-body);font-size:.9rem;margin:20px 0 10px">Diagnósticos</h4>
        <div class="lista-avisos">
          ${diagnosticos.map((d) => `
            <div class="aviso-tarjeta">
              <div class="aviso-cuerpo">
                <h4>${escapar(d.diagnostico_nombre || d.descripcion)}</h4>
                ${d.diagnostico_nombre ? `<p>${escapar(d.descripcion)}</p>` : ''}
              </div>
              <div class="aviso-acciones">
                <span class="chip ${d.principal ? 'chip-exito' : ''}">
                  ${escapar(ETIQUETA_TIPO_DIAGNOSTICO[d.tipo] || d.tipo)}${d.principal ? ' · principal' : ''}
                </span>
              </div>
            </div>`).join('')}
        </div>` : ''}

      ${tratamientos.length ? `
        <h4 style="font-family:var(--font-body);font-size:.9rem;margin:20px 0 10px">Tratamientos</h4>
        ${tratamientos.map((t) => `
          <div class="hito" style="margin-bottom:10px">
            <div class="hito-cabecera">
              <h4>${escapar(t.descripcion)}</h4>
              <span class="hito-fecha">${escapar(t.estado)}</span>
            </div>
            ${t.indicaciones ? `<div class="hito-cuerpo"><p>${escapar(t.indicaciones)}</p></div>` : ''}
            ${t.prescripciones.length ? `
              <div class="tabla-envoltura" style="margin-top:10px">
                <table class="tabla">
                  <thead><tr><th>Medicamento</th><th>Dosis</th><th>Frecuencia</th><th>Duración</th></tr></thead>
                  <tbody>
                    ${t.prescripciones.map((p) => `
                      <tr>
                        <td><strong>${escapar(p.medicamento)}</strong>
                          ${p.concentracion ? `<br><span class="campo-ayuda">${escapar(p.concentracion)}</span>` : ''}
                        </td>
                        <td>${escapar(p.dosis || '—')}</td>
                        <td>${escapar(p.frecuencia || '—')}</td>
                        <td>${escapar(p.duracion || '—')}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>` : ''}
          </div>`).join('')}` : ''}`;
  }

  function bloqueConstantes(signos) {
    const datos = [
      ['Peso', signos.peso_kg ? `${signos.peso_kg} kg` : null],
      ['Temp.', signos.temperatura_c ? `${signos.temperatura_c} °C` : null],
      ['F. cardíaca', signos.frec_cardiaca],
      ['F. respiratoria', signos.frec_respiratoria],
      ['Mucosas', signos.mucosas],
      ['Cond. corporal', signos.condicion_corporal ? `${signos.condicion_corporal}/9` : null],
    ].filter(([, valor]) => valor !== null && valor !== undefined && valor !== '');

    if (!datos.length) return '';

    return `<div class="constantes">
      ${datos.map(([titulo, valor]) => `
        <div class="constante"><span>${escapar(titulo)}</span><strong>${escapar(valor)}</strong></div>`).join('')}
    </div>`;
  }

  /* --------------------------------------------------------
     Vacunas
     -------------------------------------------------------- */

  /**
   * Estado del refuerzo. Es lo único que el dueño mira de verdad en el carné:
   * si le toca vacuna o no.
   */
  function estadoRefuerzo(vacuna) {
    if (!vacuna.proxima_fecha) return { chip: 'chip', texto: 'Sin refuerzo' };

    const dias = Number(vacuna.dias_para_refuerzo);
    if (Number.isNaN(dias)) return { chip: 'chip', texto: 'Sin refuerzo' };
    if (dias < 0) return { chip: 'chip chip-error', texto: `Vencida hace ${Math.abs(dias)} días` };
    if (dias <= 30) return { chip: 'chip chip-aviso', texto: `Refuerzo en ${dias} días` };
    return { chip: 'chip chip-exito', texto: 'Al día' };
  }

  function tablaVacunas(vacunas) {
    if (!vacunas.length) {
      return H.bloqueVacio('Todavía no hay vacunas registradas.', 'icon-syringe');
    }

    return `<div class="tabla-envoltura">
      <table class="tabla">
        <thead>
          <tr><th>Vacuna</th><th>Aplicada</th><th>Refuerzo</th><th>Lote</th><th>Veterinario</th><th>Estado</th></tr>
        </thead>
        <tbody>
          ${vacunas.map((v) => {
            const estado = estadoRefuerzo(v);
            return `<tr>
              <td>
                <strong>${escapar(v.vacuna)}</strong>
                ${v.enfermedades ? `<br><span class="campo-ayuda">${escapar(v.enfermedades)}</span>` : ''}
              </td>
              <td>${escapar(H.fechaLarga(v.fecha_aplicacion))}</td>
              <td>${v.proxima_fecha ? escapar(H.fechaLarga(v.proxima_fecha)) : '—'}</td>
              <td>${escapar(v.lote_codigo || v.lote || '—')}</td>
              <td>${escapar(v.veterinario_nombre)}</td>
              <td><span class="${estado.chip}">${escapar(estado.texto)}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  /* --------------------------------------------------------
     Exámenes
     -------------------------------------------------------- */

  function listaExamenes(examenes, { conAcciones = false } = {}) {
    if (!examenes.length) {
      return H.bloqueVacio('No hay exámenes solicitados para este paciente.', 'icon-micro');
    }

    return examenes.map((e) => `
      <article class="hito" style="margin-bottom:10px">
        <div class="hito-cabecera">
          <h4>${escapar(e.tipo_nombre || e.descripcion || 'Examen')}</h4>
          <span class="hito-fecha">${escapar(H.fechaLarga(e.fecha_solicitud))}</span>
        </div>
        <div class="hito-cuerpo">
          ${e.descripcion && e.tipo_nombre ? `<p>${escapar(e.descripcion)}</p>` : ''}
          ${e.conclusion ? `<p><strong>Conclusión:</strong> ${escapar(e.conclusion)}</p>` : ''}
          ${e.resultados && e.resultados.length ? tablaResultados(e.resultados) : ''}
        </div>
        <div class="hito-pie">
          <span class="chip ${e.estado === 'listo' ? 'chip-exito' : e.estado === 'anulado' ? 'chip-error' : 'chip-aviso'}">
            ${escapar(ETIQUETA_ESTADO_EXAMEN[e.estado] || e.estado)}
          </span>
          ${e.solicitado_por_nombre ? `<span class="chip">${escapar(e.solicitado_por_nombre)}</span>` : ''}
          ${conAcciones && e.estado !== 'anulado'
            ? `<button type="button" class="btn btn-outline btn-sm" data-resultados="${e.id}">
                 ${e.resultados && e.resultados.length ? 'Editar resultados' : 'Cargar resultados'}
               </button>`
            : ''}
        </div>
      </article>`).join('');
  }

  function tablaResultados(resultados) {
    return `<div class="tabla-envoltura" style="margin-top:10px">
      <table class="tabla">
        <thead><tr><th>Parámetro</th><th>Valor</th><th>Referencia</th></tr></thead>
        <tbody>
          ${resultados.map((r) => `
            <tr>
              <td>${escapar(r.parametro)}</td>
              <td>
                <strong>${escapar(r.valor || '—')}</strong> ${escapar(r.unidad || '')}
                ${r.fuera_rango ? '<span class="chip chip-error" style="margin-left:6px">Fuera de rango</span>' : ''}
              </td>
              <td>${escapar(r.referencia || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  /* --------------------------------------------------------
     Antecedentes y peso
     -------------------------------------------------------- */

  function antecedentes({ alergias, condiciones }) {
    if (!alergias.length && !condiciones.length) {
      return H.bloqueVacio('Sin alergias ni condiciones registradas.', 'icon-heart');
    }

    const bloque = (titulo, filas, pintar) => (filas.length
      ? `<h4 style="font-family:var(--font-body);font-size:.9rem;margin:0 0 10px">${titulo}</h4>
         <div class="lista-avisos" style="margin-bottom:18px">${filas.map(pintar).join('')}</div>`
      : '');

    return bloque('Alergias', alergias, (a) => `
      <div class="aviso-tarjeta">
        <svg class="icon"><use href="#icon-alerta"/></svg>
        <div class="aviso-cuerpo">
          <h4>${escapar(a.nombre)}</h4>
          <p>${escapar(a.reaccion || 'Sin reacción registrada')}</p>
        </div>
        <div class="aviso-acciones"><span class="chip chip-aviso">${escapar(a.severidad || 'leve')}</span></div>
      </div>`)
      + bloque('Condiciones médicas', condiciones, (c) => `
      <div class="aviso-tarjeta">
        <svg class="icon"><use href="#icon-heart"/></svg>
        <div class="aviso-cuerpo">
          <h4>${escapar(c.nombre)}</h4>
          <p>${escapar(c.notas || c.descripcion || '')}</p>
        </div>
        <div class="aviso-acciones"><span class="chip">${escapar(c.estado || '')}</span></div>
      </div>`);
  }

  function curvaPeso(peso) {
    if (!peso || peso.length < 1) {
      return H.bloqueVacio('Todavía no hay pesos registrados.', 'icon-grafica');
    }

    const puntos = peso.map((p) => ({
      etiqueta: String(p.fecha).slice(5, 10),
      valores: [Number(p.peso_kg)],
    }));

    return H.graficaLineas(puntos, [{ nombre: 'Peso (kg)' }], {
      titulo: 'Curva de peso',
      desdeCero: false,
    });
  }

  function recortar(texto, largo) {
    const limpio = String(texto || '');
    return limpio.length > largo ? `${limpio.slice(0, largo)}…` : limpio;
  }

  Object.assign(H, {
    ETIQUETA_TIPO_CONSULTA,
    ETIQUETA_ESTADO_EXAMEN,
    lineaTiempoConsultas,
    detalleConsulta,
    bloqueConstantes,
    estadoRefuerzo,
    tablaVacunas,
    listaExamenes,
    antecedentes,
    curvaPeso,
  });
})(window);
