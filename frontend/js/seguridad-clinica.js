/* ============================================================
   Seguridad clínica: avisos mientras se registra una consulta.

   - Signos vitales fuera del rango de referencia de la especie.
   - Cambios bruscos de peso respecto a la última medición.
   - Medicamentos a los que el paciente es alérgico, directamente o por
     pertenecer a la misma familia (amoxicilina en un alérgico a la
     penicilina), o con los que ya tuvo una reacción.
   - Fármacos tóxicos para la especie (permetrina o paracetamol en gatos) y
     lactonas macrocíclicas en razas con la mutación MDR1.
   - Combinaciones peligrosas dentro de la misma receta (AINE + corticoide).

   Son avisos, no bloqueos: la decisión es del veterinario, que puede tener
   motivos para seguir. Lo que no puede pasar es que siga sin haberlo visto.

   No usa el DOM: se prueba en Node (backend/test/seguridad-clinica.test.js).
   ============================================================ */

(function (global) {
  'use strict';

  const H = (global.Huella = global.Huella || {});

  /** Minúsculas y sin tildes, para comparar nombres escritos de cualquier forma. */
  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  /* --------------------------------------------------------
     Signos vitales
     -------------------------------------------------------- */

  /**
   * Rangos de referencia de adultos en reposo (Merck Veterinary Manual). Los
   * críticos marcan lo que no puede esperar al final de la consulta.
   * Solo se incluyen las especies con rangos estables: en aves, reptiles y
   * roedores varían tanto entre especies que un número genérico confundiría.
   */
  const RANGOS = {
    perro: {
      temperaturaC: { min: 37.5, max: 39.2, critMin: 35.5, critMax: 41, unidad: '°C', nombre: 'Temperatura' },
      frecCardiaca: { min: 60, max: 140, critMin: 40, critMax: 220, unidad: 'lpm', nombre: 'Frecuencia cardíaca' },
      frecRespiratoria: { min: 10, max: 30, critMin: 6, critMax: 60, unidad: 'rpm', nombre: 'Frecuencia respiratoria' },
    },
    gato: {
      temperaturaC: { min: 37.8, max: 39.2, critMin: 35.5, critMax: 41, unidad: '°C', nombre: 'Temperatura' },
      frecCardiaca: { min: 140, max: 220, critMin: 100, critMax: 260, unidad: 'lpm', nombre: 'Frecuencia cardíaca' },
      frecRespiratoria: { min: 20, max: 40, critMin: 10, critMax: 70, unidad: 'rpm', nombre: 'Frecuencia respiratoria' },
    },
    conejo: {
      temperaturaC: { min: 38.5, max: 40, critMin: 36.5, critMax: 41, unidad: '°C', nombre: 'Temperatura' },
      frecCardiaca: { min: 180, max: 300, critMin: 130, critMax: 340, unidad: 'lpm', nombre: 'Frecuencia cardíaca' },
      frecRespiratoria: { min: 30, max: 60, critMin: 20, critMax: 100, unidad: 'rpm', nombre: 'Frecuencia respiratoria' },
    },
  };

  /** Los cachorros de perro tienen el corazón más rápido que un adulto. */
  const FC_CACHORRO_PERRO = { min: 70, max: 220 };

  function claveEspecie(especie) {
    const e = normalizar(especie);
    if (e.startsWith('perr') || e === 'canino') return 'perro';
    if (e.startsWith('gat') || e === 'felino') return 'gato';
    if (e.startsWith('conej')) return 'conejo';
    return null;
  }

  /** Acepta número o texto con coma decimal; vacío es null. */
  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(String(valor).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  const CONDICION = [
    null,
    'Caquexia', 'Muy delgado', 'Delgado', 'Ideal', 'Ideal',
    'Sobrepeso', 'Sobrepeso', 'Obeso', 'Obesidad grave',
  ];

  /**
   * Evalúa los signos de una consulta.
   *
   * @param {{especie: string, edadMeses?: number}} paciente
   * @param {object} signos  pesoKg, temperaturaC, frecCardiaca, frecRespiratoria, condicionCorporal
   * @param {{peso_kg: number, fecha: string}} [pesoAnterior]
   * @returns {Object<string, {nivel: 'ok'|'aviso'|'critico', texto: string}>}
   *          Un resultado por campo con dato; los vacíos no aparecen.
   */
  function evaluarSignos(paciente, signos, pesoAnterior) {
    const clave = claveEspecie(paciente?.especie);
    const rangos = clave ? { ...RANGOS[clave] } : null;
    if (clave === 'perro' && numero(paciente.edadMeses) !== null && paciente.edadMeses < 6) {
      rangos.frecCardiaca = { ...rangos.frecCardiaca, ...FC_CACHORRO_PERRO };
    }

    const resultado = {};

    for (const campo of ['temperaturaC', 'frecCardiaca', 'frecRespiratoria']) {
      const valor = numero(signos?.[campo]);
      if (valor === null) continue;
      if (!rangos) {
        resultado[campo] = { nivel: 'ok', texto: 'Sin rango de referencia para esta especie.' };
        continue;
      }
      const r = rangos[campo];
      const rango = `${fmt(r.min)}–${fmt(r.max)} ${r.unidad}`;
      if (valor < r.critMin || valor > r.critMax) {
        resultado[campo] = { nivel: 'critico', texto: `${valor < r.min ? 'Muy por debajo' : 'Muy por encima'} de lo normal (${rango}). Revísalo ya.` };
      } else if (valor < r.min) {
        resultado[campo] = { nivel: 'aviso', texto: `Por debajo de lo normal (${rango}).` };
      } else if (valor > r.max) {
        resultado[campo] = { nivel: 'aviso', texto: `Por encima de lo normal (${rango}).` };
      } else {
        resultado[campo] = { nivel: 'ok', texto: `Normal (${rango}).` };
      }
    }

    const cc = numero(signos?.condicionCorporal);
    if (cc !== null && Number.isInteger(cc) && cc >= 1 && cc <= 9) {
      resultado.condicionCorporal = {
        nivel: cc === 1 || cc === 9 ? 'critico' : cc === 4 || cc === 5 ? 'ok' : 'aviso',
        texto: `${CONDICION[cc]} (${cc}/9).`,
      };
    }

    const peso = numero(signos?.pesoKg);
    const antes = numero(pesoAnterior?.peso_kg);
    if (peso !== null && antes) {
      const cambio = ((peso - antes) / antes) * 100;
      const desde = pesoAnterior.fecha ? ` desde el ${String(pesoAnterior.fecha).slice(0, 10)}` : '';
      const texto = `${cambio >= 0 ? 'Subió' : 'Bajó'} ${fmt(Math.abs(cambio), 1)} %${desde} (${fmt(antes)} kg).`;
      resultado.pesoKg = {
        nivel: Math.abs(cambio) >= 20 ? 'critico' : Math.abs(cambio) >= 10 ? 'aviso' : 'ok',
        texto: Math.abs(cambio) < 0.05 ? `Igual que la última vez (${fmt(antes)} kg).` : texto,
      };
    }

    return resultado;
  }

  function fmt(n, decimales = 2) {
    return Number(n.toFixed(decimales)).toLocaleString('es-CO');
  }

  /* --------------------------------------------------------
     Medicamentos
     -------------------------------------------------------- */

  /**
   * Familias farmacológicas. Una alergia a cualquiera de los miembros (o al
   * nombre de la familia) cubre a toda la familia: así lo trata la práctica
   * clínica, porque la reacción es al núcleo químico común.
   */
  const FAMILIAS = {
    penicilinas: {
      nombre: 'penicilinas',
      miembros: ['penicilina', 'amoxicilina', 'ampicilina', 'cloxacilina', 'dicloxacilina', 'oxacilina',
        'bencilpenicilina', 'piperacilina', 'ticarcilina', 'betalactamico'],
      cruzada: ['cefalosporinas'],
    },
    cefalosporinas: {
      nombre: 'cefalosporinas',
      miembros: ['cefalosporina', 'cefalexina', 'cefazolina', 'cefadroxilo', 'cefovecina', 'ceftiofur',
        'cefpodoxima', 'ceftriaxona', 'cefuroxima', 'cefquinoma', 'cefotaxima'],
      cruzada: ['penicilinas'],
    },
    sulfonamidas: {
      nombre: 'sulfonamidas',
      miembros: ['sulfa', 'sulfonamida', 'sulfametoxazol', 'sulfadiazina', 'sulfadimetoxina', 'sulfasalazina'],
      cruzada: [],
    },
    aines: {
      nombre: 'antiinflamatorios no esteroideos (AINE)',
      miembros: ['aine', 'meloxicam', 'carprofeno', 'ketoprofeno', 'firocoxib', 'robenacoxib', 'deracoxib',
        'mavacoxib', 'flunixin', 'acido tolfenamico', 'tolfenamico', 'aspirina', 'acido acetilsalicilico',
        'ibuprofeno', 'naproxeno', 'diclofenaco'],
      cruzada: [],
    },
    corticoides: {
      nombre: 'corticoides',
      miembros: ['corticoide', 'prednisolona', 'prednisona', 'dexametasona', 'metilprednisolona',
        'triamcinolona', 'hidrocortisona', 'betametasona'],
      cruzada: [],
    },
    fluoroquinolonas: {
      nombre: 'fluoroquinolonas',
      miembros: ['quinolona', 'fluoroquinolona', 'enrofloxacina', 'marbofloxacina', 'ciprofloxacina',
        'pradofloxacina', 'orbifloxacina'],
      cruzada: [],
    },
    macrolidos: {
      nombre: 'macrólidos',
      miembros: ['macrolido', 'eritromicina', 'azitromicina', 'claritromicina', 'tilosina', 'tulatromicina'],
      cruzada: [],
    },
    tetraciclinas: {
      nombre: 'tetraciclinas',
      miembros: ['tetraciclina', 'doxiciclina', 'oxitetraciclina', 'minociclina'],
      cruzada: [],
    },
    aminoglucosidos: {
      nombre: 'aminoglucósidos',
      miembros: ['aminoglucosido', 'gentamicina', 'amikacina', 'neomicina', 'tobramicina', 'estreptomicina'],
      cruzada: [],
    },
    lactonasMacrociclicas: {
      nombre: 'lactonas macrocíclicas',
      miembros: ['ivermectina', 'milbemicina', 'moxidectina', 'selamectina', 'doramectina', 'abamectina'],
      cruzada: [],
    },
  };

  /** Lo que es tóxico para la especie aunque la dosis parezca razonable. */
  const TOXICOS = {
    gato: [
      { claves: ['permetrina'], texto: 'La permetrina es tóxica para los gatos (temblores, convulsiones), incluso en pipetas para perro.' },
      { claves: ['paracetamol', 'acetaminofen'], texto: 'El paracetamol es tóxico para los gatos: metahemoglobinemia y daño hepático con una sola tableta.' },
      { claves: ['ibuprofeno', 'naproxeno', 'diclofenaco'], texto: 'Este AINE de uso humano es tóxico para los gatos (falla renal y úlceras).' },
    ],
    perro: [
      { claves: ['ibuprofeno', 'naproxeno', 'diclofenaco'], texto: 'Este AINE de uso humano tiene un margen muy estrecho en perros (úlceras y falla renal).' },
      { claves: ['paracetamol', 'acetaminofen'], texto: 'El paracetamol en perros daña el hígado a dosis cercanas a las terapéuticas; confirma la dosis.' },
    ],
    conejo: [
      { claves: ['amoxicilina', 'ampicilina', 'penicilina', 'clindamicina', 'lincomicina', 'eritromicina', 'cefalexina'],
        texto: 'Por vía oral este antibiótico puede causar en conejos una enterotoxemia mortal.' },
    ],
  };

  /**
   * Razas con alta frecuencia de la mutación MDR1 (ABCB1): las lactonas
   * macrocíclicas les cruzan al cerebro y a dosis antiparasitarias altas
   * causan signos neurológicos graves.
   */
  const RAZAS_MDR1 = ['collie', 'pastor australiano', 'australian shepherd', 'pastor de shetland', 'sheltie',
    'pastor ingles', 'old english sheepdog', 'border collie', 'pastor aleman de pelo largo', 'whippet de pelo largo',
    'silken windhound', 'mcnab', 'pastor blanco suizo', 'bobtail'];

  /** Familias a las que pertenece un medicamento, por nombre o principio activo. */
  function familiasDe(medicamento) {
    const texto = normalizar(`${medicamento?.nombre || ''} ${medicamento?.principio_activo || ''}`);
    return Object.keys(FAMILIAS).filter((clave) =>
      FAMILIAS[clave].miembros.some((m) => contienePalabra(texto, m)));
  }

  /** Familias que nombra una alergia ("Penicilina", "Sulfas", "AINEs"…). */
  function familiasDeAlergia(nombre) {
    const texto = normalizar(nombre).replace(/s\b/g, '');
    return Object.keys(FAMILIAS).filter((clave) => {
      const f = FAMILIAS[clave];
      return f.miembros.some((m) => contienePalabra(texto, m)) || contienePalabra(texto, normalizar(f.nombre).replace(/s\b/g, ''));
    });
  }

  /**
   * La palabra completa (admite el plural): "sulfa" no salta con "sulfato" ni
   * "aine" con "entrenamiento".
   */
  function contienePalabra(texto, palabra) {
    if (!palabra) return false;
    const escapada = palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escapada}s?(?![a-z0-9])`).test(texto);
  }

  /**
   * Revisa un medicamento contra lo que se sabe del paciente.
   *
   * @param {object} medicamento   {id, nombre, principio_activo, via}
   * @param {object} contexto      {especie, raza, alergias:[{nombre, tipo, severidad}],
   *                                reacciones:[{medicamento_id, medicamento, principio_activo, descripcion, severidad}]}
   * @returns {Array<{nivel: 'peligro'|'aviso', texto: string}>}
   */
  function revisarMedicamento(medicamento, contexto = {}) {
    if (!medicamento) return [];
    const avisos = [];
    const nombre = medicamento.nombre;
    const familias = familiasDe(medicamento);
    const textoMed = normalizar(`${medicamento.nombre || ''} ${medicamento.principio_activo || ''}`);

    for (const alergia of contexto.alergias || []) {
      if (alergia.tipo && !['medicamento', 'otro'].includes(alergia.tipo)) continue;
      const deAlergia = familiasDeAlergia(alergia.nombre);
      const directa = contienePalabra(textoMed, normalizar(alergia.nombre)) ||
        deAlergia.some((f) => familias.includes(f));
      const severidad = alergia.severidad ? ` (${alergia.severidad})` : '';

      if (directa) {
        const familia = deAlergia.find((f) => familias.includes(f));
        avisos.push({
          nivel: 'peligro',
          texto: familia && normalizar(alergia.nombre) !== normalizar(nombre)
            ? `Alérgico a ${alergia.nombre}${severidad}: ${nombre} es de la misma familia (${FAMILIAS[familia].nombre}).`
            : `Alérgico a ${alergia.nombre}${severidad}.`,
        });
        continue;
      }

      const cruzada = deAlergia.flatMap((f) => FAMILIAS[f].cruzada).find((f) => familias.includes(f));
      if (cruzada) {
        avisos.push({
          nivel: 'aviso',
          texto: `Alérgico a ${alergia.nombre}${severidad}: hay reactividad cruzada posible con las ${FAMILIAS[cruzada].nombre}.`,
        });
      }
    }

    for (const reaccion of contexto.reacciones || []) {
      const mismo = reaccion.medicamento_id && reaccion.medicamento_id === medicamento.id;
      const familia = !mismo && familiasDe({ nombre: reaccion.medicamento, principio_activo: reaccion.principio_activo })
        .find((f) => familias.includes(f));
      if (!mismo && !familia) continue;
      avisos.push({
        nivel: ['grave', 'mortal'].includes(reaccion.severidad) ? 'peligro' : 'aviso',
        texto: mismo
          ? `Ya tuvo una reacción a ${nombre}${reaccion.fecha ? ` el ${String(reaccion.fecha).slice(0, 10)}` : ''}: ${reaccion.descripcion}`
          : `Tuvo una reacción a ${reaccion.medicamento}, de la misma familia (${FAMILIAS[familia].nombre}): ${reaccion.descripcion}`,
      });
    }

    const especie = claveEspecie(contexto.especie);
    for (const toxico of TOXICOS[especie] || []) {
      if (!toxico.claves.some((c) => contienePalabra(textoMed, c))) continue;
      // En el conejo el problema es la vía oral: inyectada es otra historia.
      if (especie === 'conejo' && medicamento.via && normalizar(medicamento.via) !== 'oral') continue;
      avisos.push({ nivel: 'peligro', texto: toxico.texto });
    }

    if (especie === 'perro' && familias.includes('lactonasMacrociclicas')) {
      const raza = normalizar(contexto.raza);
      if (raza && RAZAS_MDR1.some((r) => raza.includes(r))) {
        avisos.push({
          nivel: 'peligro',
          texto: `${contexto.raza} es una raza con la mutación MDR1: ${nombre} puede causar signos neurológicos graves. Usa la dosis de prevención o haz la prueba genética.`,
        });
      }
    }

    return avisos;
  }

  /** Pares de familias que no se deben combinar en la misma receta. */
  const INTERACCIONES = [
    { a: 'aines', b: 'corticoides', texto: 'AINE junto con corticoide: riesgo alto de úlcera y perforación gastrointestinal. Deja un periodo de lavado entre los dos.' },
    { a: 'aines', b: 'aines', texto: 'Dos AINE a la vez: se suman los efectos adversos sin ganar analgesia.' },
    { a: 'fluoroquinolonas', b: 'tetraciclinas', texto: 'Fluoroquinolona con tetraciclina: el efecto bactericida puede disminuir; revisa la combinación.' },
  ];

  /**
   * Interacciones entre los medicamentos de una misma consulta.
   * @param {Array<object>} medicamentos
   * @returns {Array<{nivel: 'aviso', texto: string}>}
   */
  function interacciones(medicamentos) {
    const lista = (medicamentos || []).filter(Boolean);
    const avisos = [];
    const vistos = new Set();

    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        if (lista[i].id !== undefined && lista[i].id === lista[j].id) {
          const clave = `dup:${lista[i].id}`;
          if (!vistos.has(clave)) {
            vistos.add(clave);
            avisos.push({ nivel: 'aviso', texto: `${lista[i].nombre} aparece dos veces en la receta.` });
          }
          continue;
        }
        const fi = familiasDe(lista[i]);
        const fj = familiasDe(lista[j]);
        for (const regla of INTERACCIONES) {
          const choca = (fi.includes(regla.a) && fj.includes(regla.b)) || (fi.includes(regla.b) && fj.includes(regla.a));
          if (!choca) continue;
          const clave = `${regla.a}+${regla.b}`;
          if (vistos.has(clave)) continue;
          vistos.add(clave);
          avisos.push({ nivel: 'aviso', texto: `${lista[i].nombre} + ${lista[j].nombre}: ${regla.texto}` });
        }
      }
    }
    return avisos;
  }

  H.clinica = {
    RANGOS,
    FAMILIAS,
    normalizar,
    evaluarSignos,
    familiasDe,
    revisarMedicamento,
    interacciones,
  };
})(window);
