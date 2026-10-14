'use strict';

const { z } = require('zod');

/* ----------------------------------------------------------------
   Piezas reutilizables
   ---------------------------------------------------------------- */

const texto = (min, max, campo) =>
  z.string({ required_error: `${campo} es obligatorio.`, invalid_type_error: `${campo} debe ser texto.` })
    .trim()
    .min(min, `${campo} debe tener al menos ${min} caracteres.`)
    .max(max, `${campo} no puede superar ${max} caracteres.`);

const textoOpcional = (max, campo) =>
  z.string({ invalid_type_error: `${campo} debe ser texto.` })
    .trim()
    .max(max, `${campo} no puede superar ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null));

const email = z
  .string({ required_error: 'El correo es obligatorio.' })
  .trim()
  .toLowerCase()
  .email('Escribe un correo electrónico válido.')
  .max(160, 'El correo es demasiado largo.');

// El formulario manda '' cuando el campo se deja vacío, y una cadena vacía no
// pasa la validación de correo: se convierte a null antes de comprobarla.
const emailOpcional = z.preprocess(
  (valor) => (valor === '' || valor === undefined ? null : valor),
  email.nullable()
);

const telefono = z
  .string()
  .trim()
  .max(30, 'El teléfono es demasiado largo.')
  .regex(/^[\d\s()+-]*$/, 'El teléfono solo puede tener números, espacios y los signos + ( ) -')
  .optional()
  .nullable()
  .transform((v) => (v === '' ? null : v ?? null));

/**
 * Contraseñas que no se aceptan por obvias.
 *
 * La lista es corta a propósito: no pretende ser un diccionario, sino cerrar
 * lo que de verdad escribe la gente cuando le piden "ocho caracteres con una
 * letra y un número" en el sitio de una veterinaria que se llama Huellitas.
 * Con las reglas de abajo y nada más, "Huellitas1" cumplía las tres
 * condiciones y era la primera que probaría cualquiera.
 */
const PASSWORDS_PROHIBIDAS = [
  'huellitas', 'password', 'contrasena', '12345678', 'qwerty', 'admin', 'veterinaria',
];

// El nombre de la clínica no vale ni escondido dentro de otra cosa.
const NOMBRE_CLINICA = 'huellitas';

/**
 * Deja la contraseña como se compara: sin mayúsculas, sin tildes y sin lo que
 * lleve pegado al final.
 *
 * Esa cola es lo importante. El "y un número" se cumple casi siempre pegando
 * cifras detrás de una palabra, y "Huellitas2026" no es más difícil de
 * adivinar que "huellitas": quien prueba a mano empieza justo por ahí.
 */
function nucleoPassword(valor) {
  return String(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]+$/, '');
}

// Mínimo 8 caracteres con al menos una letra y un número. Es el equilibrio
// habitual entre seguridad y que la gente no termine anotándola en un papel.
const password = z
  .string({ required_error: 'La contraseña es obligatoria.' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72, 'La contraseña no puede superar 72 caracteres.')
  .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, 'La contraseña debe incluir al menos una letra.')
  .regex(/\d/, 'La contraseña debe incluir al menos un número.')
  .refine(
    (valor) => {
      const nucleo = nucleoPassword(valor);
      return !PASSWORDS_PROHIBIDAS.includes(nucleo) && !nucleo.includes(NOMBRE_CLINICA);
    },
    'Esa contraseña es demasiado fácil de adivinar. No uses el nombre de la clínica ni una palabra común con números detrás.'
  );

const idNumerico = (campo = 'El identificador') =>
  z.coerce
    .number({ invalid_type_error: `${campo} debe ser un número.` })
    .int(`${campo} debe ser un número entero.`)
    .positive(`${campo} debe ser mayor que cero.`);

const fechaISO = (campo = 'La fecha') =>
  z.string({ required_error: `${campo} es obligatoria.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${campo} debe tener el formato AAAA-MM-DD.`);

const horaHHMM = (campo = 'La hora') =>
  z.string({ required_error: `${campo} es obligatoria.` })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${campo} debe tener el formato HH:MM.`);

const fechaHoraISO = (campo = 'La fecha y hora') =>
  z.string({ required_error: `${campo} es obligatoria.` })
    .regex(
      /^\d{4}-\d{2}-\d{2}[ T]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
      `${campo} debe tener el formato AAAA-MM-DD HH:MM.`
    )
    // La base guarda TIMESTAMP sin zona: la 'T' del input datetime-local sobra.
    .transform((v) => v.replace('T', ' '));

const dinero = (campo = 'El valor') =>
  z.coerce
    .number({ invalid_type_error: `${campo} debe ser un número.` })
    .min(0, `${campo} no puede ser negativo.`)
    .max(999999999, `${campo} está fuera de rango.`);

const entero = (campo, min = 0, max = 999999) =>
  z.coerce
    .number({ invalid_type_error: `${campo} debe ser un número.` })
    .int(`${campo} debe ser un número entero.`)
    .min(min, `${campo} no puede ser menor que ${min}.`)
    .max(max, `${campo} está fuera de rango.`);

const paramsId = z.object({ id: idNumerico() });

// zod descarta las claves que no declara, y el middleware reemplaza req.params
// con lo que devuelve: una ruta con dos identificadores necesita los dos aquí
// o el segundo desaparece antes de llegar al controlador.
const paramsIdYPago = z.object({ id: idNumerico(), pagoId: idNumerico('El pago') });

// Las mismas que acepta la columna `veterinarios.especialidad`. Viven aquí
// arriba porque las piden dos formularios muy separados: el alta que hace la
// administración y el registro con código de acceso.
const especialidades = [
  'medicina_general', 'cirugia', 'dermatologia', 'cardiologia',
  'odontologia', 'exoticos', 'imagenes', 'felinos',
];

const paginacion = z.object({
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
  desplazamiento: z.coerce.number().int().min(0).optional().default(0),
  busqueda: z.string().trim().max(80).optional(),
});

/* ----------------------------------------------------------------
   Fase 1 — autenticación
   ---------------------------------------------------------------- */

/**
 * Registro público. El rol se elige en el formulario y decide qué más hace
 * falta: cliente no pide nada, los demás piden el código de su rol, y el
 * veterinario además su licencia y su especialidad, porque su ficha
 * profesional no existe sin ellas.
 *
 * Todo eso son campos opcionales en la forma y obligatorios según el rol; se
 * comprueba con un refine y no con tres esquemas separados para que el
 * formulario del navegador siga siendo uno solo.
 *
 * El código no se valida de forma aquí —ni largo mínimo ni patrón—: quien se
 * equivoca tiene que ver siempre el mismo error, venga de donde venga el
 * fallo. Distinguir "eso no parece un código" de "ese código no es" es
 * decirle a quien prueba a ciegas cuándo va bien encaminado.
 */
const registro = z
  .object({
    nombre: texto(2, 120, 'El nombre'),
    email,
    telefono,
    password,
    rol: z
      .enum(['cliente', 'veterinario', 'admin'], {
        errorMap: () => ({ message: 'Elige un tipo de cuenta válido.' }),
      })
      .optional()
      .default('cliente'),
    codigoAcceso: textoOpcional(60, 'El código de acceso'),
    licencia: textoOpcional(40, 'El número de licencia'),
    especialidad: z.enum(especialidades).optional().nullable(),
  })
  .superRefine((datos, ctx) => {
    if (datos.rol === 'cliente') return;

    // 'admin' sigue en la lista de roles para que el servicio pueda contestar
    // con su propio mensaje —"esa cuenta la crea un administrador desde el
    // panel"— en vez de con un "elige un tipo de cuenta válido" que no explica
    // nada. Aquí no se le pide código porque no hay ninguno que valga: la
    // puerta está cerrada más adelante, no en este campo.
    if (datos.rol === 'admin') return;

    if (!datos.codigoAcceso) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['codigoAcceso'],
        message: 'Escribe el código de acceso que te dio la administración de la clínica.',
      });
    }

    if (datos.rol !== 'veterinario') return;

    if (!datos.licencia || datos.licencia.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['licencia'],
        message: 'Escribe tu número de licencia profesional.',
      });
    }
    if (!datos.especialidad) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['especialidad'],
        message: 'Selecciona tu especialidad.',
      });
    }
  });

/**
 * El rol cuyo código se cambia.
 *
 * Solo queda el de veterinario. 'cliente' nunca tuvo —esa puerta está
 * abierta— y el de administración se retiró: esas cuentas se crean desde el
 * panel de usuarios, no escribiendo un código en el registro.
 */
const rotarCodigoAcceso = z.object({
  rol: z.enum(['veterinario'], {
    errorMap: () => ({ message: 'Ese rol no lleva código de acceso.' }),
  }),
});

const login = z.object({
  email,
  password: z.string({ required_error: 'La contraseña es obligatoria.' }).min(1, 'Escribe tu contraseña.'),
});

const cambioPassword = z
  .object({
    actual: z.string().min(1, 'Escribe tu contraseña actual.'),
    nueva: password,
  })
  .refine((d) => d.actual !== d.nueva, {
    message: 'La contraseña nueva debe ser distinta de la actual.',
    path: ['nueva'],
  });

const actualizarPerfil = z.object({
  nombre: texto(2, 120, 'El nombre'),
  telefono,
  direccion: textoOpcional(180, 'La dirección'),
  ciudad: textoOpcional(80, 'La ciudad'),
  documento: textoOpcional(30, 'El documento'),
});

/* ----------------------------------------------------------------
   Fase 2 — mascotas
   ---------------------------------------------------------------- */

const sexos = ['macho', 'hembra', 'desconocido'];

const mascotaBase = {
  nombre: texto(1, 80, 'El nombre de la mascota'),
  especieId: idNumerico('La especie'),
  razaId: idNumerico('La raza').optional().nullable(),
  sexo: z.enum(sexos, { errorMap: () => ({ message: 'El sexo debe ser macho, hembra o desconocido.' }) })
    .optional()
    .default('desconocido'),
  fechaNacimiento: fechaISO('La fecha de nacimiento').optional().nullable(),
  pesoKg: z.coerce.number().positive('El peso debe ser mayor que cero.').max(500, 'Peso fuera de rango.')
    .optional().nullable(),
  color: textoOpcional(60, 'El color'),
  microchip: textoOpcional(40, 'El microchip'),
  esterilizado: z.coerce.boolean().optional().default(false),
  informacion: textoOpcional(2000, 'La información adicional'),
};

// clienteId solo lo usa el personal de la clínica al registrar una mascota a
// nombre de otra persona; a un cliente se le ignora y se toma el suyo.
const crearMascota = z.object({
  ...mascotaBase,
  clienteId: idNumerico('El cliente').optional(),
});
const actualizarMascota = z.object(mascotaBase);

/* ----------------------------------------------------------------
   Fase 3 — servicios, veterinarios y citas
   ---------------------------------------------------------------- */

const crearServicio = z.object({
  nombre: texto(2, 100, 'El nombre del servicio'),
  descripcion: textoOpcional(2000, 'La descripción'),
  precio: z.coerce.number().min(0, 'El precio no puede ser negativo.'),
  duracionMin: z.coerce.number().int().min(5, 'La duración mínima es 5 minutos.').max(480, 'Duración fuera de rango.'),
  requisitos: textoOpcional(1000, 'Los requisitos'),
  icono: textoOpcional(40, 'El icono'),
  activo: z.coerce.boolean().optional().default(true),
  veterinarios: z.array(idNumerico('El veterinario')).optional().default([]),
});

const crearVeterinario = z.object({
  nombre: texto(2, 120, 'El nombre'),
  email,
  telefono,
  password,
  licencia: texto(3, 40, 'El número de licencia'),
  especialidad: z.enum(especialidades, {
    errorMap: () => ({ message: 'Selecciona una especialidad válida.' }),
  }),
  descripcion: textoOpcional(1000, 'La descripción'),
  duracionSlotMin: z.coerce.number().int().min(10).max(120).optional().default(30),
  horarios: z
    .array(
      z.object({
        diaSemana: z.coerce.number().int().min(0, 'Día inválido.').max(6, 'Día inválido.'),
        horaInicio: horaHHMM('La hora de inicio'),
        horaFin: horaHHMM('La hora de fin'),
      }).refine((h) => h.horaFin > h.horaInicio, {
        message: 'La hora de fin debe ser posterior a la de inicio.',
        path: ['horaFin'],
      })
    )
    .optional()
    .default([]),
});

const actualizarVeterinario = z.object({
  nombre: texto(2, 120, 'El nombre'),
  telefono,
  especialidad: z.enum(especialidades),
  descripcion: textoOpcional(1000, 'La descripción'),
  duracionSlotMin: z.coerce.number().int().min(10).max(120).optional().default(30),
  activo: z.coerce.boolean().optional().default(true),
});

const horariosVeterinario = z.object({
  horarios: z.array(
    z.object({
      diaSemana: z.coerce.number().int().min(0).max(6),
      horaInicio: horaHHMM('La hora de inicio'),
      horaFin: horaHHMM('La hora de fin'),
    }).refine((h) => h.horaFin > h.horaInicio, {
      message: 'La hora de fin debe ser posterior a la de inicio.',
      path: ['horaFin'],
    })
  ),
});

const crearBloqueo = z.object({
  fecha: fechaISO('La fecha'),
  horaInicio: horaHHMM('La hora de inicio'),
  horaFin: horaHHMM('La hora de fin'),
  motivo: textoOpcional(160, 'El motivo'),
}).refine((b) => b.horaFin > b.horaInicio, {
  message: 'La hora de fin debe ser posterior a la de inicio.',
  path: ['horaFin'],
});

// Ventana que se consulta al listar los bloqueos de un veterinario. Ambas son
// opcionales: sin ellas el controlador toma los próximos dos meses.
const rangoBloqueos = z.object({
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
});

const disponibilidad = z.object({
  veterinarioId: idNumerico('El veterinario'),
  servicioId: idNumerico('El servicio'),
  fecha: fechaISO('La fecha'),
});

const crearCita = z.object({
  mascotaId: idNumerico('La mascota'),
  servicioId: idNumerico('El servicio'),
  veterinarioId: idNumerico('El veterinario'),
  fecha: fechaISO('La fecha'),
  hora: horaHHMM('La hora'),
  motivo: textoOpcional(255, 'El motivo'),
});

const estadosCita = ['pendiente', 'confirmada', 'atendida', 'cancelada', 'no_asistio'];

const cambiarEstadoCita = z.object({
  estado: z.enum(estadosCita, {
    errorMap: () => ({ message: `El estado debe ser uno de: ${estadosCita.join(', ')}.` }),
  }),
  notas: textoOpcional(1000, 'Las notas'),
});

const listarCitas = z.object({
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  estado: z.enum(estadosCita).optional(),
  veterinarioId: idNumerico('El veterinario').optional(),
  mascotaId: idNumerico('La mascota').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(100),
});

/* ----------------------------------------------------------------
   Administración de usuarios
   ---------------------------------------------------------------- */

const crearUsuario = z.object({
  nombre: texto(2, 120, 'El nombre'),
  email,
  telefono,
  password,
  rol: z.enum(['cliente', 'veterinario', 'admin'], {
    errorMap: () => ({ message: 'El rol debe ser cliente, veterinario o admin.' }),
  }),
});

const listarUsuarios = paginacion.extend({
  rol: z.enum(['cliente', 'veterinario', 'admin']).optional(),
  estado: z.enum(['activo', 'inactivo', 'bloqueado']).optional(),
});

const cambiarEstadoUsuario = z.object({
  estado: z.enum(['activo', 'inactivo', 'bloqueado'], {
    errorMap: () => ({ message: 'El estado debe ser activo, inactivo o bloqueado.' }),
  }),
});

// Selector de clientes del personal. El texto va a un ILIKE, así que se recorta
// aquí en vez de dejar que llegue uno de cualquier tamaño a la base.
const listarClientes = z.object({
  busqueda: z.string().trim().max(80, 'La búsqueda no puede superar 80 caracteres.').optional(),
});

/* ----------------------------------------------------------------
   Seguridad — recuperación de contraseña y consultas de auditoría
   ---------------------------------------------------------------- */

const solicitarRecuperacion = z.object({ email });

const restablecerPassword = z.object({
  token: texto(20, 200, 'El token'),
  nueva: password,
});

const consultaAuditoria = z.object({
  modulo: textoOpcional(30, 'El módulo'),
  usuarioId: idNumerico('El usuario').optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

/* ----------------------------------------------------------------
   Segundo factor
   ---------------------------------------------------------------- */

// Seis cifras de la aplicación. Se quitan los espacios porque algunas apps
// muestran el código partido en dos grupos de tres.
const codigoTotp = z
  .string({ required_error: 'Escribe el código de tu aplicación.' })
  .trim()
  .transform((v) => v.replace(/\s/g, ''))
  .refine((v) => /^\d{6}$/.test(v), 'El código son seis cifras.');

// En el ingreso se acepta también uno de recuperación (XXXX-XXXX), así que la
// forma es más ancha y quien decide cuál es se hace en el servicio.
const codigoMfa = z
  .string({ required_error: 'Escribe el código.' })
  .trim()
  .min(6, 'El código es demasiado corto.')
  .max(20, 'El código es demasiado largo.');

const verificarMfa = z.object({
  desafio: texto(20, 200, 'El código de ingreso'),
  codigo: codigoMfa,
});

const activarMfa = z.object({ codigo: codigoTotp });

// Reautenticación para las acciones que desarman la seguridad de la cuenta.
const confirmarConPassword = z.object({
  password: z.string({ required_error: 'Escribe tu contraseña.' }).min(1, 'Escribe tu contraseña.'),
});

const cambiarRolUsuario = z.object({
  rol: z.enum(['cliente', 'veterinario', 'admin'], {
    errorMap: () => ({ message: 'El rol debe ser cliente, veterinario o admin.' }),
  }),
});

/* ----------------------------------------------------------------
   Fase 4 — historia clínica
   ---------------------------------------------------------------- */

const tiposConsulta = ['consulta', 'control', 'urgencia', 'cirugia', 'vacunacion'];
const tiposDiagnostico = ['presuntivo', 'definitivo', 'descartado'];

// Todo opcional: en una consulta de control puede que solo se pese al animal.
const signosVitales = z.object({
  pesoKg: z.coerce.number().positive('El peso debe ser mayor que cero.').max(500, 'Peso fuera de rango.')
    .optional().nullable(),
  temperaturaC: z.coerce.number().min(25, 'Temperatura fuera de rango.').max(45, 'Temperatura fuera de rango.')
    .optional().nullable(),
  frecCardiaca: entero('La frecuencia cardíaca', 0, 400).optional().nullable(),
  frecRespiratoria: entero('La frecuencia respiratoria', 0, 300).optional().nullable(),
  mucosas: textoOpcional(30, 'Las mucosas'),
  hidratacion: textoOpcional(30, 'La hidratación'),
  condicionCorporal: entero('La condición corporal', 1, 9).optional().nullable(),
  notas: textoOpcional(255, 'Las notas de los signos vitales'),
});

const prescripcion = z.object({
  medicamentoId: idNumerico('El medicamento'),
  dosis: textoOpcional(80, 'La dosis'),
  frecuencia: textoOpcional(80, 'La frecuencia'),
  duracion: textoOpcional(80, 'La duración'),
  via: textoOpcional(20, 'La vía'),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero.').optional().nullable(),
  indicaciones: textoOpcional(1000, 'Las indicaciones'),
});

const tratamiento = z
  .object({
    descripcion: texto(2, 2000, 'El tratamiento'),
    indicaciones: textoOpcional(2000, 'Las indicaciones'),
    fechaInicio: fechaISO('La fecha de inicio').optional().nullable(),
    fechaFin: fechaISO('La fecha de fin').optional().nullable(),
    prescripciones: z.array(prescripcion).optional().default([]),
  })
  .refine((t) => !t.fechaFin || !t.fechaInicio || t.fechaFin >= t.fechaInicio, {
    message: 'El tratamiento no puede terminar antes de empezar.',
    path: ['fechaFin'],
  });

const diagnostico = z.object({
  diagnosticoId: idNumerico('El diagnóstico del catálogo').optional().nullable(),
  descripcion: texto(2, 500, 'La descripción del diagnóstico'),
  tipo: z.enum(tiposDiagnostico, {
    errorMap: () => ({ message: `El tipo de diagnóstico debe ser uno de: ${tiposDiagnostico.join(', ')}.` }),
  }).optional().default('presuntivo'),
  principal: z.coerce.boolean().optional().default(false),
});

// Una consulta llega entera desde el formulario del veterinario: motivo,
// constantes, diagnósticos y tratamientos. Se guarda toda en una transacción,
// así que se valida toda junta.
const crearConsulta = z.object({
  mascotaId: idNumerico('La mascota'),
  citaId: idNumerico('La cita').optional().nullable(),
  // Solo lo manda el administrador, que no tiene perfil de veterinario propio.
  veterinarioId: idNumerico('El veterinario').optional().nullable(),
  tipo: z.enum(tiposConsulta, {
    errorMap: () => ({ message: `El tipo debe ser uno de: ${tiposConsulta.join(', ')}.` }),
  }).optional().default('consulta'),
  motivo: texto(3, 255, 'El motivo'),
  anamnesis: textoOpcional(4000, 'La anamnesis'),
  sintomas: textoOpcional(4000, 'Los síntomas'),
  examenFisico: textoOpcional(4000, 'El examen físico'),
  observaciones: textoOpcional(4000, 'Las observaciones'),
  planManejo: textoOpcional(4000, 'El plan de manejo'),
  cerrarCita: z.coerce.boolean().optional().default(true),
  signos: signosVitales.optional(),
  diagnosticos: z.array(diagnostico).optional().default([]),
  tratamientos: z.array(tratamiento).optional().default([]),
});

// Al editar solo se corrigen los textos: los diagnósticos y tratamientos ya
// registrados no se reescriben, se añaden.
const editarConsulta = z.object({
  motivo: texto(3, 255, 'El motivo'),
  anamnesis: textoOpcional(4000, 'La anamnesis'),
  sintomas: textoOpcional(4000, 'Los síntomas'),
  examenFisico: textoOpcional(4000, 'El examen físico'),
  observaciones: textoOpcional(4000, 'Las observaciones'),
  planManejo: textoOpcional(4000, 'El plan de manejo'),
});

const aplicarVacuna = z.object({
  mascotaId: idNumerico('La mascota'),
  vacunaId: idNumerico('La vacuna'),
  veterinarioId: idNumerico('El veterinario').optional().nullable(),
  loteId: idNumerico('El lote').optional().nullable(),
  consultaId: idNumerico('La consulta').optional().nullable(),
  fechaAplicacion: fechaISO('La fecha de aplicación'),
  // Si no se manda, el backend la calcula con el refuerzo del catálogo.
  proximaFecha: fechaISO('La fecha del refuerzo').optional().nullable(),
  lote: textoOpcional(60, 'El lote'),
  observaciones: textoOpcional(1000, 'Las observaciones'),
});

const estadosExamen = ['solicitado', 'en_proceso', 'listo', 'anulado'];

const solicitarExamen = z.object({
  mascotaId: idNumerico('La mascota'),
  consultaId: idNumerico('La consulta').optional().nullable(),
  tipoExamenId: idNumerico('El tipo de examen').optional().nullable(),
  descripcion: textoOpcional(150, 'La descripción'),
});

const resultadosExamen = z.object({
  estado: z.enum(estadosExamen, {
    errorMap: () => ({ message: `El estado debe ser uno de: ${estadosExamen.join(', ')}.` }),
  }).optional().default('listo'),
  conclusion: textoOpcional(4000, 'La conclusión'),
  resultados: z
    .array(
      z.object({
        parametro: texto(1, 120, 'El parámetro'),
        valor: textoOpcional(80, 'El valor'),
        unidad: textoOpcional(30, 'La unidad'),
        referencia: textoOpcional(60, 'El rango de referencia'),
        fueraRango: z.coerce.boolean().optional().default(false),
        notas: textoOpcional(255, 'Las notas'),
      })
    )
    .optional()
    .default([]),
});

const listarConsultas = z.object({
  mascotaId: idNumerico('La mascota').optional(),
  veterinarioId: idNumerico('El veterinario').optional(),
  tipo: z.enum(tiposConsulta).optional(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/* ----------------------------------------------------------------
   Fase 5 — inventario
   ---------------------------------------------------------------- */

const tiposMovimiento = ['entrada', 'salida', 'ajuste'];

const productoBase = {
  categoriaId: idNumerico('La categoría'),
  proveedorId: idNumerico('El proveedor').optional().nullable(),
  nombre: texto(2, 140, 'El nombre del producto'),
  sku: textoOpcional(50, 'El SKU'),
  descripcion: textoOpcional(255, 'La descripción'),
  unidad: texto(1, 20, 'La unidad').optional().default('unidad'),
  stockMinimo: entero('El stock mínimo', 0, 999999).optional().default(0),
  precioCompra: dinero('El precio de compra').optional().default(0),
  precioVenta: dinero('El precio de venta').optional().default(0),
  requiereLote: z.coerce.boolean().optional().default(false),
  activo: z.coerce.boolean().optional().default(true),
};

const crearProducto = z.object(productoBase);
const actualizarProducto = z.object(productoBase);

// La cantidad de un ajuste es el total que queda en la bodega, no una
// diferencia; el disparador de la base se encarga de calcularla.
const movimientoInventario = z.object({
  productoId: idNumerico('El producto'),
  tipo: z.enum(tiposMovimiento, {
    errorMap: () => ({ message: `El tipo debe ser uno de: ${tiposMovimiento.join(', ')}.` }),
  }),
  cantidad: entero('La cantidad', 0, 999999),
  ubicacionId: idNumerico('La ubicación').optional().nullable(),
  loteId: idNumerico('El lote').optional().nullable(),
  motivo: textoOpcional(180, 'El motivo'),
  referencia: textoOpcional(60, 'La referencia'),
});

const crearProveedor = z.object({
  nombre: texto(2, 140, 'El nombre del proveedor'),
  nit: textoOpcional(30, 'El NIT'),
  contacto: textoOpcional(120, 'El contacto'),
  telefono,
  email: emailOpcional,
  direccion: textoOpcional(180, 'La dirección'),
  activo: z.coerce.boolean().optional().default(true),
});

const crearCompra = z.object({
  proveedorId: idNumerico('El proveedor'),
  sedeId: idNumerico('La sede').optional().nullable(),
  ubicacionId: idNumerico('La ubicación').optional().nullable(),
  numero: textoOpcional(30, 'El número de factura'),
  fecha: fechaISO('La fecha').optional(),
  impuestos: dinero('Los impuestos').optional().default(0),
  notas: textoOpcional(255, 'Las notas'),
  lineas: z
    .array(
      z.object({
        productoId: idNumerico('El producto'),
        cantidad: entero('La cantidad', 1, 999999),
        precioUnit: dinero('El precio unitario').optional().default(0),
        lote: textoOpcional(60, 'El lote'),
        fechaVencimiento: fechaISO('La fecha de vencimiento').optional().nullable(),
      })
    )
    .min(1, 'La compra necesita al menos un producto.'),
});

const listarProductos = z.object({
  busqueda: z.string().trim().max(80, 'La búsqueda no puede superar 80 caracteres.').optional(),
  categoriaId: idNumerico('La categoría').optional(),
  soloStockBajo: z.coerce.boolean().optional().default(false),
  incluirInactivos: z.coerce.boolean().optional().default(false),
  limite: z.coerce.number().int().min(1).max(200).optional().default(100),
});

const listarMovimientos = z.object({
  productoId: idNumerico('El producto').optional(),
  tipo: z.enum(tiposMovimiento).optional(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  limite: z.coerce.number().int().min(1).max(300).optional().default(100),
});

/* ----------------------------------------------------------------
   Fase 6 — facturación
   ---------------------------------------------------------------- */

const estadosFactura = ['pendiente', 'parcial', 'pagada', 'anulada'];
const metodosPago = ['efectivo', 'tarjeta', 'transferencia', 'en_linea'];

// Una línea es de un servicio, de un producto, de un examen o suelta. Se
// permite cualquiera de las tres referencias, pero no dos a la vez: la
// descripción y el precio son lo que se factura.
const lineaFactura = z
  .object({
    servicioId: idNumerico('El servicio').optional().nullable(),
    productoId: idNumerico('El producto').optional().nullable(),
    examenId: idNumerico('El examen').optional().nullable(),
    descripcion: texto(2, 180, 'La descripción de la línea'),
    cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero.').max(9999, 'Cantidad fuera de rango.')
      .optional().default(1),
    precioUnit: dinero('El precio unitario'),
    descuento: dinero('El descuento').optional().default(0),
    impuesto: dinero('El impuesto').optional().default(0),
  })
  .refine(
    (l) => [l.servicioId, l.productoId, l.examenId].filter(Boolean).length <= 1,
    { message: 'Una línea no puede ser de un servicio, un producto y un examen a la vez.', path: ['descripcion'] }
  );

const crearFactura = z.object({
  clienteId: idNumerico('El cliente'),
  citaId: idNumerico('La cita').optional().nullable(),
  consultaId: idNumerico('La consulta').optional().nullable(),
  sedeId: idNumerico('La sede').optional().nullable(),
  descuento: dinero('El descuento global').optional().default(0),
  observaciones: textoOpcional(255, 'Las observaciones'),
  // Al facturar productos se descuenta el stock; se puede decir de dónde sale.
  ubicacionId: idNumerico('La ubicación de inventario').optional().nullable(),
  lineas: z.array(lineaFactura).min(1, 'La factura necesita al menos una línea.'),
});

const registrarPago = z.object({
  metodo: z.enum(metodosPago, {
    errorMap: () => ({ message: `El método debe ser uno de: ${metodosPago.join(', ')}.` }),
  }),
  valor: z.coerce.number().positive('El valor del pago debe ser mayor que cero.'),
  referencia: textoOpcional(100, 'La referencia'),
});

const anularFactura = z.object({
  motivo: texto(3, 200, 'El motivo de la anulación'),
});

const crearDevolucion = z.object({
  motivo: texto(3, 255, 'El motivo'),
  lineas: z
    .array(
      z.object({
        detalleId: idNumerico('La línea de la factura').optional().nullable(),
        descripcion: texto(2, 180, 'La descripción'),
        cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero.').optional().default(1),
        valor: dinero('El valor'),
        reingresaStock: z.coerce.boolean().optional().default(false),
      })
    )
    .min(1, 'La devolución necesita al menos una línea.'),
});

const listarFacturas = z.object({
  estado: z.enum(estadosFactura).optional(),
  clienteId: idNumerico('El cliente').optional(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  busqueda: z.string().trim().max(80, 'La búsqueda no puede superar 80 caracteres.').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(100),
});

/* ----------------------------------------------------------------
   Fases 7–10 — notificaciones, recordatorios y reportes
   ---------------------------------------------------------------- */

const canalesNotificacion = ['sistema', 'email', 'sms', 'whatsapp'];
const tiposRecordatorio = ['cita', 'vacuna', 'control', 'tratamiento', 'otro'];

// O se manda a una persona (usuarioId) o a todo un rol; sin una de las dos no
// hay a quién avisar.
const enviarNotificacion = z
  .object({
    usuarioId: idNumerico('El usuario').optional().nullable(),
    rol: z.enum(['cliente', 'veterinario', 'admin']).optional().nullable(),
    tipo: texto(2, 50, 'El tipo').optional().default('aviso'),
    titulo: texto(2, 150, 'El título'),
    mensaje: textoOpcional(2000, 'El mensaje'),
    enlace: textoOpcional(255, 'El enlace'),
    canal: z.enum(canalesNotificacion).optional().default('sistema'),
  })
  .refine((n) => Boolean(n.usuarioId) !== Boolean(n.rol), {
    message: 'Indica un usuario o un rol, pero no los dos.',
    path: ['usuarioId'],
  });

const listarNotificaciones = z.object({
  soloNoLeidas: z.coerce.boolean().optional().default(false),
  limite: z.coerce.number().int().min(1).max(100).optional().default(50),
});

const crearRecordatorio = z.object({
  usuarioId: idNumerico('El usuario').optional().nullable(),
  mascotaId: idNumerico('La mascota').optional().nullable(),
  citaId: idNumerico('La cita').optional().nullable(),
  aplicacionId: idNumerico('La aplicación de vacuna').optional().nullable(),
  tipo: z.enum(tiposRecordatorio, {
    errorMap: () => ({ message: `El tipo debe ser uno de: ${tiposRecordatorio.join(', ')}.` }),
  }),
  canal: z.enum(canalesNotificacion).optional().default('sistema'),
  programadoEn: fechaHoraISO('La fecha del aviso'),
  mensaje: textoOpcional(255, 'El mensaje'),
});

const listarRecordatorios = z.object({
  estado: z.enum(['pendiente', 'enviado', 'cancelado', 'fallido']).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(100),
});

const consultaReportes = z.object({
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  agrupacion: z.enum(['dia', 'mes'], {
    errorMap: () => ({ message: 'La agrupación debe ser dia o mes.' }),
  }).optional().default('dia'),
});

/* ================================================================
   Fase 2 — módulos clínicos
   ================================================================ */

/* ---- Urgencias --------------------------------------------------- */

const prioridadesTriage = ['rojo', 'naranja', 'amarillo', 'verde', 'azul'];
const estadosUrgencia = ['en_espera', 'en_triage', 'en_atencion', 'en_observacion', 'cerrado'];
const desenlacesUrgencia = ['alta', 'hospitalizacion', 'remitido', 'fallecido', 'retiro_voluntario'];

const registrarUrgencia = z.object({
  mascotaId: idNumerico('La mascota'),
  sedeId: idNumerico('La sede').optional().nullable(),
  motivo: texto(3, 255, 'El motivo'),
  prioridad: z.enum(prioridadesTriage).optional().nullable(),
  salaId: idNumerico('La sala').optional().nullable(),
  veterinarioId: idNumerico('El veterinario').optional().nullable(),
  observaciones: textoOpcional(2000, 'Las observaciones'),
});

const triageUrgencia = z.object({
  prioridad: z.enum(prioridadesTriage, {
    errorMap: () => ({ message: `La prioridad debe ser una de: ${prioridadesTriage.join(', ')}.` }),
  }),
  salaId: idNumerico('La sala').optional().nullable(),
  veterinarioId: idNumerico('El veterinario').optional().nullable(),
  hallazgos: textoOpcional(2000, 'Los hallazgos'),
});

// Cerrar exige desenlace: es la regla que también protege la base, y comprobarla
// aquí deja un mensaje legible en vez de un error de restricción.
const actualizarUrgencia = z
  .object({
    estado: z.enum(estadosUrgencia).optional(),
    salaId: idNumerico('La sala').optional().nullable(),
    veterinarioId: idNumerico('El veterinario').optional().nullable(),
    desenlace: z.enum(desenlacesUrgencia).optional().nullable(),
    observaciones: textoOpcional(2000, 'Las observaciones'),
  })
  .refine((u) => u.estado !== 'cerrado' || Boolean(u.desenlace), {
    message: 'Para cerrar la urgencia hay que indicar cómo terminó.',
    path: ['desenlace'],
  });

const eventoUrgencia = z.object({
  tipo: z.enum(['triage', 'signos', 'medicacion', 'procedimiento', 'examen', 'evolucion', 'traslado', 'alta', 'nota']),
  descripcion: texto(2, 2000, 'La descripción'),
  detalle: z.record(z.any()).optional().nullable(),
});

const medicacionUrgencia = z.object({
  medicamentoId: idNumerico('El medicamento').optional().nullable(),
  productoId: idNumerico('El producto').optional().nullable(),
  descripcion: texto(2, 180, 'El medicamento'),
  dosis: textoOpcional(80, 'La dosis'),
  via: textoOpcional(20, 'La vía'),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero.').optional().nullable(),
  descontarStock: z.coerce.boolean().optional().default(false),
  ubicacionId: idNumerico('La ubicación').optional().nullable(),
});

const procedimientoUrgencia = z.object({
  nombre: texto(2, 150, 'El procedimiento'),
  descripcion: textoOpcional(2000, 'La descripción'),
  resultado: textoOpcional(2000, 'El resultado'),
  fin: fechaHoraISO('La hora de fin').optional().nullable(),
});

const listarUrgencias = z.object({
  estado: z.enum(estadosUrgencia).optional(),
  sedeId: idNumerico('La sede').optional(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/* ---- Hospitalización --------------------------------------------- */

const crearHabitacion = z.object({
  sedeId: idNumerico('La sede'),
  codigo: texto(1, 20, 'El código'),
  nombre: textoOpcional(60, 'El nombre'),
  tipo: z.enum(['jaula', 'habitacion', 'uci', 'aislamiento']).optional().default('jaula'),
  tamano: z.enum(['pequeno', 'mediano', 'grande']).optional().default('mediano'),
  aislamiento: z.coerce.boolean().optional().default(false),
  notas: textoOpcional(255, 'Las notas'),
  activo: z.coerce.boolean().optional().default(true),
});

const estadoHabitacion = z.object({
  estado: z.enum(['disponible', 'ocupada', 'limpieza', 'mantenimiento']),
  notas: textoOpcional(255, 'Las notas'),
});

const ingresarHospitalizacion = z.object({
  mascotaId: idNumerico('La mascota'),
  veterinarioId: idNumerico('El veterinario'),
  habitacionId: idNumerico('La habitación').optional().nullable(),
  consultaId: idNumerico('La consulta').optional().nullable(),
  sedeId: idNumerico('La sede').optional().nullable(),
  motivo: texto(3, 255, 'El motivo'),
  indicaciones: textoOpcional(4000, 'Las indicaciones'),
  dieta: textoOpcional(180, 'La dieta'),
  pronostico: z.enum(['bueno', 'reservado', 'malo']).optional().nullable(),
});

const egresarHospitalizacion = z.object({
  estado: z.enum(['alta', 'remitida', 'fallecido'], {
    errorMap: () => ({ message: 'El egreso debe ser alta, remitida o fallecido.' }),
  }),
  epicrisis: texto(5, 8000, 'La epicrisis'),
});

const controlHospitalizacion = z.object({
  temperaturaC: z.coerce.number().min(20).max(45).optional().nullable(),
  frecCardiaca: entero('La frecuencia cardíaca', 0, 400).optional().nullable(),
  frecRespiratoria: entero('La frecuencia respiratoria', 0, 200).optional().nullable(),
  come: z.coerce.boolean().optional().nullable(),
  orina: z.coerce.boolean().optional().nullable(),
  defeca: z.coerce.boolean().optional().nullable(),
  medicacion: textoOpcional(2000, 'La medicación'),
  observaciones: textoOpcional(2000, 'Las observaciones'),
});

const alimentacionHospitalizacion = z.object({
  alimento: textoOpcional(140, 'El alimento'),
  cantidadG: z.coerce.number().min(0).max(100000).optional().nullable(),
  consumido: z.enum(['total', 'parcial', 'nada', 'rechazo']).optional().default('total'),
  aguaMl: z.coerce.number().min(0).max(100000).optional().nullable(),
  observaciones: textoOpcional(255, 'Las observaciones'),
});

const medicacionHospitalizacion = z.object({
  medicamentoId: idNumerico('El medicamento').optional().nullable(),
  descripcion: texto(2, 180, 'El medicamento'),
  dosis: textoOpcional(80, 'La dosis'),
  via: textoOpcional(20, 'La vía'),
  cadaHoras: entero('La frecuencia', 1, 168).optional().nullable(),
  fin: fechaHoraISO('La fecha de fin').optional().nullable(),
});

const visitaHospitalizacion = z.object({
  visitante: texto(2, 120, 'El nombre del visitante'),
  parentesco: textoOpcional(60, 'El parentesco'),
  observaciones: textoOpcional(255, 'Las observaciones'),
});

/* ---- Historia clínica avanzada ------------------------------------ */

const crearAntecedente = z.object({
  mascotaId: idNumerico('La mascota'),
  tipo: z.enum(['quirurgico', 'medico', 'reproductivo', 'familiar', 'habitat', 'conductual', 'otro']),
  descripcion: texto(3, 4000, 'La descripción'),
  fecha: fechaISO('La fecha').optional().nullable(),
  relevante: z.coerce.boolean().optional().default(false),
});

const crearEvolucion = z.object({
  mascotaId: idNumerico('La mascota'),
  consultaId: idNumerico('La consulta').optional().nullable(),
  hospitalizacionId: idNumerico('La hospitalización').optional().nullable(),
  ingresoUrgenciaId: idNumerico('La urgencia').optional().nullable(),
  subjetivo: textoOpcional(4000, 'Lo referido'),
  objetivo: textoOpcional(4000, 'Los hallazgos'),
  analisis: textoOpcional(4000, 'El análisis'),
  plan: textoOpcional(4000, 'El plan'),
  estadoPaciente: z.enum(['critico', 'delicado', 'estable', 'en_mejoria', 'recuperado']).optional().nullable(),
});

const crearReaccion = z.object({
  mascotaId: idNumerico('La mascota'),
  medicamentoId: idNumerico('El medicamento').optional().nullable(),
  consultaId: idNumerico('La consulta').optional().nullable(),
  descripcion: texto(3, 2000, 'La descripción'),
  severidad: z.enum(['leve', 'moderada', 'grave', 'mortal']).optional().default('leve'),
  fecha: fechaISO('La fecha').optional(),
  desenlace: textoOpcional(20, 'El desenlace'),
});

const firmarProcedimiento = z.object({
  entidad: texto(2, 40, 'La entidad'),
  entidadId: idNumerico('El registro'),
  mascotaId: idNumerico('La mascota').optional().nullable(),
  firmanteNombre: texto(2, 120, 'El nombre de quien firma'),
  firmanteDocumento: textoOpcional(30, 'El documento'),
  rolFirmante: z.enum(['propietario', 'veterinario', 'testigo', 'autorizado']).optional().default('propietario'),
  documentoTexto: texto(10, 20000, 'El texto del documento'),
  firmaImagen: textoOpcional(255, 'La firma'),
});

const registrarDesparasitacion = z.object({
  mascotaId: idNumerico('La mascota'),
  antiparasitarioId: idNumerico('El producto').optional().nullable(),
  consultaId: idNumerico('La consulta').optional().nullable(),
  tipo: z.enum(['interna', 'externa', 'mixta']).optional().default('interna'),
  producto: texto(2, 120, 'El producto'),
  dosis: textoOpcional(80, 'La dosis'),
  pesoKg: z.coerce.number().positive('El peso debe ser mayor que cero.').max(500).optional().nullable(),
  lote: textoOpcional(60, 'El lote'),
  fecha: fechaISO('La fecha').optional(),
  proximaFecha: fechaISO('La próxima fecha').optional().nullable(),
  observaciones: textoOpcional(255, 'Las observaciones'),
});

const crearEsquemaVacunacion = z.object({
  especieId: idNumerico('La especie'),
  nombre: texto(2, 100, 'El nombre'),
  descripcion: textoOpcional(255, 'La descripción'),
  dosis: z
    .array(
      z.object({
        vacunaId: idNumerico('La vacuna'),
        orden: entero('El orden', 1, 20),
        edadSemanas: entero('La edad', 0, 520).optional().nullable(),
        intervaloSemanas: entero('El intervalo', 1, 520).optional().nullable(),
        obligatoria: z.coerce.boolean().optional().default(true),
        notas: textoOpcional(200, 'Las notas'),
      }).refine((d) => d.edadSemanas !== null || d.intervaloSemanas !== null, {
        message: 'Cada dosis necesita una edad o un intervalo respecto a la anterior.',
      })
    )
    .min(1, 'El esquema necesita al menos una dosis.'),
});

/* ---- Farmacia ----------------------------------------------------- */

const crearReceta = z.object({
  mascotaId: idNumerico('La mascota'),
  consultaId: idNumerico('La consulta').optional().nullable(),
  tratamientoId: idNumerico('El tratamiento').optional().nullable(),
  sedeId: idNumerico('La sede').optional().nullable(),
  vigenteHasta: fechaISO('La vigencia').optional().nullable(),
  indicaciones: textoOpcional(4000, 'Las indicaciones'),
  items: z
    .array(
      z.object({
        medicamentoId: idNumerico('El medicamento'),
        dosis: textoOpcional(80, 'La dosis'),
        frecuencia: textoOpcional(80, 'La frecuencia'),
        duracion: textoOpcional(80, 'La duración'),
        via: textoOpcional(20, 'La vía'),
        cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero.').default(1),
        indicaciones: textoOpcional(2000, 'Las indicaciones'),
      })
    )
    .min(1, 'La receta necesita al menos un medicamento.'),
});

const dispensarReceta = z.object({
  recetaId: idNumerico('La receta').optional().nullable(),
  clienteId: idNumerico('El cliente').optional().nullable(),
  mascotaId: idNumerico('La mascota').optional().nullable(),
  facturaId: idNumerico('La factura').optional().nullable(),
  sedeId: idNumerico('La sede').optional().nullable(),
  ubicacionId: idNumerico('La ubicación de inventario').optional().nullable(),
  recibe: textoOpcional(120, 'Quien recibe'),
  documentoRecibe: textoOpcional(30, 'El documento'),
  observaciones: textoOpcional(255, 'Las observaciones'),
  items: z
    .array(
      z.object({
        recetaItemId: idNumerico('El renglón de la receta').optional().nullable(),
        productoId: idNumerico('El producto'),
        loteId: idNumerico('El lote').optional().nullable(),
        cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero.'),
        precioUnit: dinero('El precio').optional().default(0),
      })
    )
    .min(1, 'Indica al menos un producto a entregar.'),
});

const devolverMedicamento = z.object({
  dispensacionId: idNumerico('La dispensación').optional().nullable(),
  productoId: idNumerico('El producto'),
  loteId: idNumerico('El lote').optional().nullable(),
  clienteId: idNumerico('El cliente').optional().nullable(),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero.'),
  motivo: texto(3, 255, 'El motivo'),
  destino: z.enum(['reingreso', 'destruccion', 'cuarentena']).optional().default('reingreso'),
  ubicacionId: idNumerico('La ubicación de inventario').optional().nullable(),
});

const crearInteraccion = z.object({
  principioA: texto(2, 120, 'El primer principio activo'),
  principioB: texto(2, 120, 'El segundo principio activo'),
  severidad: z.enum(['leve', 'moderada', 'grave', 'contraindicada']).optional().default('moderada'),
  efecto: texto(3, 255, 'El efecto'),
  recomendacion: textoOpcional(2000, 'La recomendación'),
  fuente: textoOpcional(180, 'La fuente'),
});

const listarRecetas = z.object({
  mascotaId: idNumerico('La mascota').optional(),
  clienteId: idNumerico('El cliente').optional(),
  estado: z.enum(['emitida', 'dispensada', 'parcial', 'vencida', 'anulada']).optional(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/* ---- Laboratorio -------------------------------------------------- */

const crearOrdenLaboratorio = z.object({
  mascotaId: idNumerico('La mascota'),
  consultaId: idNumerico('La consulta').optional().nullable(),
  sedeId: idNumerico('La sede').optional().nullable(),
  prioridad: z.enum(['normal', 'urgente']).optional().default('normal'),
  ayuno: z.coerce.boolean().optional().default(false),
  indicaciones: textoOpcional(2000, 'Las indicaciones'),
  tipos: z
    .array(idNumerico('El tipo de examen'))
    .min(1, 'Selecciona al menos un examen.')
    .max(20, 'Demasiados exámenes en una sola orden.'),
});

const registrarMuestra = z.object({
  tipo: z.enum(['sangre', 'orina', 'heces', 'tejido', 'hisopado', 'liquido', 'otro']),
  codigo: textoOpcional(30, 'El código'),
  observaciones: textoOpcional(255, 'Las observaciones'),
});

const estadoMuestra = z
  .object({
    estado: z.enum(['pendiente', 'tomada', 'en_transito', 'recibida', 'procesando', 'rechazada']),
    motivoRechazo: textoOpcional(180, 'El motivo del rechazo'),
  })
  .refine((m) => m.estado !== 'rechazada' || Boolean(m.motivoRechazo), {
    message: 'Rechazar una muestra exige decir por qué, para saber si hay que repetir la toma.',
    path: ['motivoRechazo'],
  });

const cargarResultadosLaboratorio = z.object({
  conclusion: textoOpcional(4000, 'La conclusión'),
  archivoPdf: textoOpcional(255, 'El archivo'),
  resultados: z
    .array(
      z.object({
        parametroId: idNumerico('El parámetro').optional().nullable(),
        parametro: texto(1, 120, 'El parámetro'),
        valor: textoOpcional(80, 'El valor'),
        unidad: textoOpcional(30, 'La unidad'),
        referencia: textoOpcional(60, 'La referencia'),
        notas: textoOpcional(255, 'Las notas'),
      })
    )
    .min(1, 'Carga al menos un resultado.'),
});

const validarResultado = z.object({
  conclusion: textoOpcional(4000, 'La conclusión'),
  avisarPropietario: z.coerce.boolean().optional().default(true),
});

const listarOrdenesLaboratorio = z.object({
  mascotaId: idNumerico('La mascota').optional(),
  estado: z.enum(['solicitada', 'en_proceso', 'completada', 'anulada']).optional(),
  prioridad: z.enum(['normal', 'urgente']).optional(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/* ---- Imagenología ------------------------------------------------- */

const crearEstudioImagen = z.object({
  mascotaId: idNumerico('La mascota'),
  consultaId: idNumerico('La consulta').optional().nullable(),
  examenId: idNumerico('El examen').optional().nullable(),
  equipoId: idNumerico('El equipo').optional().nullable(),
  sedeId: idNumerico('La sede').optional().nullable(),
  modalidad: z.enum(['radiografia', 'ecografia', 'tomografia', 'endoscopia', 'fotografia']),
  region: textoOpcional(80, 'La región'),
  proyeccion: textoOpcional(60, 'La proyección'),
  sedacion: z.coerce.boolean().optional().default(false),
  indicacion: textoOpcional(2000, 'La indicación'),
});

const crearInformeImagen = z.object({
  tecnica: textoOpcional(2000, 'La técnica'),
  hallazgos: texto(5, 8000, 'Los hallazgos'),
  conclusion: texto(3, 4000, 'La conclusión'),
  recomendaciones: textoOpcional(4000, 'Las recomendaciones'),
  comparadoCon: idNumerico('El estudio anterior').optional().nullable(),
  firmar: z.coerce.boolean().optional().default(false),
});

const listarEstudiosImagen = z.object({
  mascotaId: idNumerico('La mascota').optional(),
  modalidad: z.enum(['radiografia', 'ecografia', 'tomografia', 'endoscopia', 'fotografia']).optional(),
  estado: z.enum(['solicitado', 'realizado', 'informado', 'anulado']).optional(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/* ---- Nutrición ---------------------------------------------------- */

const crearEvaluacionNutricional = z.object({
  mascotaId: idNumerico('La mascota'),
  consultaId: idNumerico('La consulta').optional().nullable(),
  fecha: fechaISO('La fecha').optional(),
  pesoKg: z.coerce.number().positive('El peso debe ser mayor que cero.').max(500),
  pesoIdealKg: z.coerce.number().positive().max(500).optional().nullable(),
  condicionCorporal: entero('La condición corporal', 1, 9).optional().nullable(),
  actividad: z.enum(['baja', 'normal', 'alta', 'deportiva']).optional().default('normal'),
  requerimientoKcal: z.coerce.number().min(0).max(100000).optional().nullable(),
  diagnostico: z.enum(['desnutrido', 'bajo_peso', 'ideal', 'sobrepeso', 'obeso']).optional().nullable(),
  observaciones: textoOpcional(4000, 'Las observaciones'),
});

const crearPlanNutricional = z.object({
  mascotaId: idNumerico('La mascota'),
  evaluacionId: idNumerico('La evaluación').optional().nullable(),
  objetivo: z.enum(['mantener', 'bajar_peso', 'subir_peso', 'medico']).optional().default('mantener'),
  kcalDia: z.coerce.number().min(0).max(100000).optional().nullable(),
  gramosDia: z.coerce.number().min(0).max(100000).optional().nullable(),
  comidasDia: entero('Las comidas por día', 1, 8).optional().default(2),
  fechaInicio: fechaISO('La fecha de inicio').optional(),
  fechaFin: fechaISO('La fecha de fin').optional().nullable(),
  pesoObjetivoKg: z.coerce.number().positive().max(500).optional().nullable(),
  indicaciones: textoOpcional(4000, 'Las indicaciones'),
  comidas: z
    .array(
      z.object({
        alimentoId: idNumerico('El alimento').optional().nullable(),
        descripcion: textoOpcional(140, 'La descripción'),
        hora: horaHHMM('La hora').optional().nullable(),
        cantidadG: z.coerce.number().min(0).max(100000).optional().nullable(),
      })
    )
    .optional()
    .default([]),
});

const crearRestriccionAlimentaria = z.object({
  mascotaId: idNumerico('La mascota'),
  alergiaId: idNumerico('La alergia').optional().nullable(),
  tipo: z.enum(['alergia', 'intolerancia', 'restriccion', 'prohibicion']).optional().default('restriccion'),
  descripcion: texto(3, 200, 'La descripción'),
  severidad: z.enum(['leve', 'moderada', 'grave']).optional().default('leve'),
});

const crearTipoAlimento = z.object({
  nombre: texto(2, 120, 'El nombre'),
  marca: textoOpcional(80, 'La marca'),
  categoria: z.enum(['cachorro', 'mantenimiento', 'senior', 'medicado', 'light', 'gestacion'])
    .optional().default('mantenimiento'),
  especieId: idNumerico('La especie').optional().nullable(),
  kcalPor100g: z.coerce.number().min(0).max(10000).optional().nullable(),
  productoId: idNumerico('El producto').optional().nullable(),
  indicaciones: textoOpcional(255, 'Las indicaciones'),
  activo: z.coerce.boolean().optional().default(true),
});

/* ================================================================
   Fase 3 — portal del propietario y comunidad
   ================================================================ */

/* ---- Telemedicina ------------------------------------------------- */

const crearSesionTelemedicina = z.object({
  mascotaId: idNumerico('La mascota'),
  veterinarioId: idNumerico('El veterinario'),
  citaId: idNumerico('La cita').optional().nullable(),
  motivo: textoOpcional(255, 'El motivo'),
});

const estadoSesionTelemedicina = z.object({
  estado: z.enum(['programada', 'en_curso', 'finalizada', 'cancelada']),
  resumen: textoOpcional(8000, 'El resumen'),
  // Al cerrar, la videoconsulta deja una consulta en la historia clínica: si
  // no queda escrita es como si no hubiera existido.
  registrarEnHistoria: z.coerce.boolean().optional().default(false),
});

const mensajeTelemedicina = z.object({
  tipo: z.enum(['texto', 'foto', 'video', 'archivo']).optional().default('texto'),
  texto: textoOpcional(4000, 'El mensaje'),
  archivo: textoOpcional(255, 'El archivo'),
  mime: textoOpcional(100, 'El tipo de archivo'),
}).refine((m) => Boolean(m.texto) || Boolean(m.archivo), {
  message: 'Escribe un mensaje o adjunta un archivo.',
  path: ['texto'],
});

const consentimientoTelemedicina = z.object({
  firmanteNombre: texto(2, 120, 'El nombre de quien acepta'),
  firmanteDocumento: textoOpcional(30, 'El documento'),
  documentoTexto: texto(10, 20000, 'El texto del consentimiento'),
  firmaImagen: textoOpcional(255, 'La firma'),
});

/* ---- Identidad digital -------------------------------------------- */

const configurarIdentidad = z.object({
  mostrarTelefono: z.coerce.boolean().optional().default(true),
  mostrarDireccion: z.coerce.boolean().optional().default(false),
  mostrarAlergias: z.coerce.boolean().optional().default(true),
  mostrarVacunas: z.coerce.boolean().optional().default(true),
  mensaje: textoOpcional(255, 'El mensaje'),
  activo: z.coerce.boolean().optional().default(true),
});

/* ---- Mascotas perdidas -------------------------------------------- */

const coordenada = (campo, limite) =>
  z.coerce.number().min(-limite, `${campo} fuera de rango.`).max(limite, `${campo} fuera de rango.`)
    .optional().nullable();

const reportarPerdida = z.object({
  mascotaId: idNumerico('La mascota'),
  fechaPerdida: fechaHoraISO('La fecha de la pérdida'),
  ultimaDireccion: textoOpcional(180, 'La última dirección'),
  ciudad: textoOpcional(80, 'La ciudad'),
  latitud: coordenada('La latitud', 90),
  longitud: coordenada('La longitud', 180),
  descripcion: textoOpcional(4000, 'La descripción'),
  senas: textoOpcional(255, 'Las señas particulares'),
  telefonoContacto: texto(7, 30, 'El teléfono de contacto'),
  recompensa: dinero('La recompensa').optional().nullable(),
  foto: textoOpcional(255, 'La foto'),
  publicado: z.coerce.boolean().optional().default(true),
});

const actualizarPerdida = z.object({
  estado: z.enum(['perdida', 'encontrada', 'cerrada']).optional(),
  publicado: z.coerce.boolean().optional(),
  descripcion: textoOpcional(4000, 'La descripción'),
  telefonoContacto: z.string().trim().min(7).max(30).optional(),
});

// Un avistamiento lo manda cualquiera, normalmente sin cuenta: se pide lo
// mínimo para poder devolver la llamada.
const crearAvistamiento = z.object({
  nombre: textoOpcional(120, 'Tu nombre'),
  telefono: z.string().trim().min(7, 'Deja un teléfono de contacto.').max(30),
  direccion: textoOpcional(180, 'La dirección'),
  latitud: coordenada('La latitud', 90),
  longitud: coordenada('La longitud', 180),
  descripcion: textoOpcional(2000, 'La descripción'),
  foto: textoOpcional(255, 'La foto'),
});

const estadoAvistamiento = z.object({
  estado: z.enum(['nuevo', 'revisado', 'confirmado', 'descartado']),
});

/* ---- Testimonios --------------------------------------------------- */

// El comentario que se publica en la página. Los límites son los de la tabla,
// y el mínimo del mensaje está puesto para que no entren "ok" ni "gracias"
// sueltos, que no le dicen nada a quien los lee. Que el texto sea publicable
// —sin groserías— lo decide el filtro del controlador, no esto.
const crearTestimonio = z.object({
  nombre: texto(2, 80, 'Tu nombre'),
  mensaje: texto(15, 600, 'El comentario'),
});

/* ---- Adopciones ---------------------------------------------------- */

const crearPublicacionAdopcion = z.object({
  mascotaId: idNumerico('La mascota').optional().nullable(),
  sedeId: idNumerico('La sede').optional().nullable(),
  nombre: texto(2, 80, 'El nombre'),
  especieId: idNumerico('La especie'),
  razaId: idNumerico('La raza').optional().nullable(),
  sexo: z.enum(['macho', 'hembra', 'desconocido']).optional().default('desconocido'),
  edadMeses: entero('La edad en meses', 0, 400).optional().nullable(),
  porte: z.enum(['pequeno', 'mediano', 'grande', 'gigante']).optional().default('mediano'),
  color: textoOpcional(60, 'El color'),
  descripcion: textoOpcional(4000, 'La descripción'),
  historia: textoOpcional(4000, 'La historia'),
  // La foto no viaja aquí: se sube como archivo a /adopciones/:id/foto. Zod
  // descarta la clave si alguien la manda, así que no hay forma de meter una
  // imagen apuntando a un servidor de fuera.
  esterilizado: z.coerce.boolean().optional().default(false),
  vacunasAlDia: z.coerce.boolean().optional().default(false),
  desparasitado: z.coerce.boolean().optional().default(false),
  compatibleNinos: z.coerce.boolean().optional().nullable(),
  compatibleMascotas: z.coerce.boolean().optional().nullable(),
  estado: z.enum(['disponible', 'reservado', 'adoptado', 'retirado']).optional().default('disponible'),
});

const solicitarAdopcion = z.object({
  nombre: texto(2, 120, 'Tu nombre'),
  documento: textoOpcional(30, 'El documento'),
  email,
  telefono: z.string().trim().min(7, 'Deja un teléfono de contacto.').max(30),
  direccion: textoOpcional(180, 'La dirección'),
  ciudad: textoOpcional(80, 'La ciudad'),
  tipoVivienda: z.enum(['casa', 'apartamento', 'finca', 'otro']).optional().nullable(),
  tienePatio: z.coerce.boolean().optional().nullable(),
  otrasMascotas: textoOpcional(200, 'Las otras mascotas'),
  personasHogar: entero('Las personas del hogar', 1, 30).optional().nullable(),
  motivo: textoOpcional(4000, 'El motivo'),
});

const evaluarSolicitudAdopcion = z
  .object({
    estado: z.enum(['recibida', 'en_evaluacion', 'entrevista', 'aprobada', 'rechazada', 'completada']),
    puntaje: entero('El puntaje', 0, 100).optional().nullable(),
    motivoRechazo: textoOpcional(255, 'El motivo del rechazo'),
  })
  .refine((s) => s.estado !== 'rechazada' || Boolean(s.motivoRechazo), {
    message: 'Rechazar una solicitud exige explicar por qué.',
    path: ['motivoRechazo'],
  });

const crearEntrevistaAdopcion = z.object({
  fecha: fechaHoraISO('La fecha de la entrevista'),
  modalidad: z.enum(['presencial', 'virtual', 'telefonica']).optional().default('presencial'),
  resultado: z.enum(['favorable', 'desfavorable', 'pendiente']).optional().nullable(),
  notas: textoOpcional(4000, 'Las notas'),
});

const crearSeguimientoAdopcion = z.object({
  fechaProgramada: fechaISO('La fecha programada'),
  medio: z.enum(['llamada', 'visita', 'virtual', 'mensaje']).optional().default('llamada'),
  notas: textoOpcional(4000, 'Las notas'),
});

const registrarSeguimientoAdopcion = z.object({
  estado: z.enum(['realizado', 'sin_respuesta', 'cancelado']),
  estadoMascota: z.enum(['excelente', 'bueno', 'regular', 'preocupante', 'devuelta']).optional().nullable(),
  notas: textoOpcional(4000, 'Las notas'),
});

/* ---- Tienda y domicilios ------------------------------------------- */

const crearCategoriaTienda = z.object({
  nombre: texto(2, 60, 'El nombre'),
  icono: textoOpcional(40, 'El icono'),
  orden: entero('El orden', 0, 999).optional().default(0),
  activo: z.coerce.boolean().optional().default(true),
});

const crearArticulo = z.object({
  productoId: idNumerico('El producto'),
  categoriaId: idNumerico('La categoría'),
  nombre: texto(2, 140, 'El nombre'),
  descripcion: textoOpcional(4000, 'La descripción'),
  imagen: textoOpcional(255, 'La imagen'),
  precio: dinero('El precio').optional().nullable(),
  precioAntes: dinero('El precio anterior').optional().nullable(),
  requiereReceta: z.coerce.boolean().optional().default(false),
  destacado: z.coerce.boolean().optional().default(false),
  activo: z.coerce.boolean().optional().default(true),
});

const crearCupon = z.object({
  codigo: texto(3, 30, 'El código').transform((v) => v.toUpperCase()),
  descripcion: textoOpcional(180, 'La descripción'),
  tipo: z.enum(['porcentaje', 'valor', 'envio_gratis']).optional().default('porcentaje'),
  valor: dinero('El valor'),
  minimoCompra: dinero('El mínimo de compra').optional().default(0),
  usosMaximos: entero('Los usos máximos', 1, 100000).optional().nullable(),
  desde: fechaISO('La fecha inicial').optional().nullable(),
  hasta: fechaISO('La fecha final').optional().nullable(),
  activo: z.coerce.boolean().optional().default(true),
});

const itemCarrito = z.object({
  articuloId: idNumerico('El artículo'),
  cantidad: entero('La cantidad', 1, 999).optional().default(1),
});

const aplicarCupon = z.object({ codigo: texto(3, 30, 'El código').transform((v) => v.toUpperCase()) });

const crearPedido = z
  .object({
    entrega: z.enum(['domicilio', 'recoger']).optional().default('domicilio'),
    // Con qué va a pagar. 'efectivo' es contra entrega o al recoger, y por eso
    // es el valor por defecto: es lo único que no depende de una pasarela.
    // Marcar el pedido como pagado no pasa por aquí, ni siquiera en efectivo:
    // eso lo hace quien recibe el dinero, desde caja.
    metodoPago: z.enum(metodosPago).optional().default('efectivo'),
    sedeId: idNumerico('La sede').optional().nullable(),
    notas: textoOpcional(255, 'Las notas'),
    recetaUrl: textoOpcional(255, 'La fórmula'),
    // Solo hacen falta si es a domicilio.
    direccion: textoOpcional(180, 'La dirección'),
    barrio: textoOpcional(80, 'El barrio'),
    ciudad: textoOpcional(80, 'La ciudad'),
    latitud: coordenada('La latitud', 90),
    longitud: coordenada('La longitud', 180),
    indicaciones: textoOpcional(255, 'Las indicaciones'),
    telefono: textoOpcional(30, 'El teléfono'),
  })
  .refine((p) => p.entrega !== 'domicilio' || Boolean(p.direccion), {
    message: 'Para un envío a domicilio hace falta la dirección.',
    path: ['direccion'],
  });

/**
 * Pedido desde la tienda de la página pública.
 *
 * Aquí no hay carrito en la base que convertir: el carrito vive en el
 * navegador y quien compra puede no tener cuenta. Por eso llegan los artículos
 * en la petición —solo el identificador y la cantidad: el precio lo pone el
 * servidor— y los datos de contacto de quien compra.
 *
 * `nombre` y `telefono` se exigen aquí para todos, con o sin sesión: es lo que
 * necesita quien sale a entregar, y el teléfono de la cuenta puede estar vacío.
 */
const pedidoDirecto = z
  .object({
    items: z
      .array(z.object({
        articuloId: idNumerico('El artículo'),
        cantidad: entero('La cantidad', 1, 99),
      }))
      .min(1, 'Tu carrito está vacío.')
      .max(40, 'Son demasiados artículos para un solo pedido. Llámanos y lo armamos contigo.'),
    nombre: texto(2, 120, 'El nombre'),
    email: emailOpcional,
    telefono: z.string().trim().min(7, 'El teléfono es obligatorio.').max(30),
    entrega: z.enum(['domicilio', 'recoger']).optional().default('domicilio'),
    metodoPago: z.enum(metodosPago).optional().default('efectivo'),
    sedeId: idNumerico('La sede').optional().nullable(),
    direccion: textoOpcional(180, 'La dirección'),
    barrio: textoOpcional(80, 'El barrio'),
    ciudad: textoOpcional(80, 'La ciudad'),
    indicaciones: textoOpcional(255, 'Las indicaciones'),
    notas: textoOpcional(255, 'Las notas'),
  })
  .refine((p) => p.entrega !== 'domicilio' || Boolean(p.direccion), {
    message: 'Para un envío a domicilio hace falta la dirección.',
    path: ['direccion'],
  })
  // Dos líneas del mismo artículo dejarían el pedido con el producto repetido
  // y el stock comprobado dos veces por separado.
  .refine((p) => new Set(p.items.map((i) => i.articuloId)).size === p.items.length, {
    message: 'Hay un artículo repetido en el carrito.',
    path: ['items'],
  });

const estadoPedido = z.object({
  estado: z.enum(['pendiente', 'confirmado', 'preparando', 'enviado', 'entregado', 'cancelado']),
  nota: textoOpcional(255, 'La nota'),
});

const crearRepartidor = z.object({
  usuarioId: idNumerico('El usuario').optional().nullable(),
  nombre: texto(2, 120, 'El nombre'),
  documento: textoOpcional(30, 'El documento'),
  telefono: z.string().trim().min(7, 'El teléfono es obligatorio.').max(30),
  vehiculo: z.enum(['moto', 'bicicleta', 'carro', 'a_pie']).optional().default('moto'),
  placa: textoOpcional(15, 'La placa'),
  sedeId: idNumerico('La sede').optional().nullable(),
  activo: z.coerce.boolean().optional().default(true),
});

const asignarDomicilio = z.object({
  repartidorId: idNumerico('El repartidor'),
  horaEstimada: fechaHoraISO('La hora estimada').optional().nullable(),
});

const estadoDomicilio = z
  .object({
    estado: z.enum(['asignado', 'recogido', 'en_ruta', 'entregado', 'fallido', 'devuelto']),
    latitud: coordenada('La latitud', 90),
    longitud: coordenada('La longitud', 180),
    nota: textoOpcional(180, 'La nota'),
    recibidoPor: textoOpcional(120, 'Quien recibe'),
    evidencia: textoOpcional(255, 'La evidencia'),
  })
  .refine((d) => d.estado !== 'entregado' || Boolean(d.recibidoPor), {
    message: 'Para dar por entregado el pedido hay que anotar quién lo recibió.',
    path: ['recibidoPor'],
  });

const listarPedidos = z.object({
  estado: z.enum(['pendiente', 'confirmado', 'preparando', 'enviado', 'entregado', 'cancelado']).optional(),
  estadoPago: z.enum(['pendiente', 'pagado', 'fallido', 'reembolsado']).optional(),
  entrega: z.enum(['domicilio', 'recoger']).optional(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/* ---- Planes de salud y fidelización -------------------------------- */

const crearPlanSalud = z.object({
  nombre: texto(2, 80, 'El nombre'),
  descripcion: textoOpcional(4000, 'La descripción'),
  precioMensual: dinero('El precio mensual').optional().default(0),
  precioAnual: dinero('El precio anual').optional().nullable(),
  descuentoGeneralPct: z.coerce.number().min(0).max(100).optional().default(0),
  color: textoOpcional(20, 'El color'),
  orden: entero('El orden', 0, 999).optional().default(0),
  activo: z.coerce.boolean().optional().default(true),
  beneficios: z
    .array(
      z.object({
        tipo: z.enum(['consulta', 'vacuna', 'servicio', 'examen', 'descuento', 'otro']),
        servicioId: idNumerico('El servicio').optional().nullable(),
        vacunaId: idNumerico('La vacuna').optional().nullable(),
        descripcion: texto(2, 180, 'La descripción del beneficio'),
        cantidadIncluida: entero('La cantidad', 0, 999).optional().nullable(),
        descuentoPct: z.coerce.number().min(0).max(100).optional().nullable(),
        periodo: z.enum(['mensual', 'trimestral', 'anual']).optional().default('anual'),
      })
    )
    .optional()
    .default([]),
});

const suscribirPlan = z.object({
  planId: idNumerico('El plan'),
  clienteId: idNumerico('El cliente').optional().nullable(),
  mascotaId: idNumerico('La mascota').optional().nullable(),
  periodicidad: z.enum(['mensual', 'anual']).optional().default('mensual'),
  renovacionAutomatica: z.coerce.boolean().optional().default(true),
});

const consumirBeneficio = z.object({
  beneficioId: idNumerico('El beneficio'),
  citaId: idNumerico('La cita').optional().nullable(),
  facturaId: idNumerico('La factura').optional().nullable(),
  cantidad: entero('La cantidad', 1, 99).optional().default(1),
  valorAhorrado: dinero('El valor ahorrado').optional().default(0),
});

const ajustarPuntos = z.object({
  clienteId: idNumerico('El cliente'),
  puntos: z.coerce.number().int('Los puntos deben ser un número entero.')
    .refine((p) => p !== 0, 'El ajuste no puede ser de cero puntos.'),
  motivo: texto(3, 180, 'El motivo'),
  facturaId: idNumerico('La factura').optional().nullable(),
  venceEn: fechaISO('La fecha de vencimiento').optional().nullable(),
});

const crearRecompensa = z.object({
  nombre: texto(2, 120, 'El nombre'),
  descripcion: textoOpcional(255, 'La descripción'),
  puntos: entero('Los puntos', 1, 1000000),
  tipo: z.enum(['producto', 'servicio', 'descuento', 'otro']).optional().default('producto'),
  servicioId: idNumerico('El servicio').optional().nullable(),
  productoId: idNumerico('El producto').optional().nullable(),
  valor: dinero('El valor').optional().nullable(),
  existencias: entero('Las existencias', 0, 32000).optional().nullable(),
  activo: z.coerce.boolean().optional().default(true),
});

const crearPromocion = z.object({
  nombre: texto(2, 120, 'El nombre'),
  descripcion: textoOpcional(4000, 'La descripción'),
  segmento: z.enum(['todos', 'nuevos', 'inactivos', 'recurrentes', 'nivel', 'plan', 'cumpleanos'])
    .optional().default('todos'),
  cuponId: idNumerico('El cupón').optional().nullable(),
  plantillaId: idNumerico('La plantilla').optional().nullable(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional().nullable(),
  activo: z.coerce.boolean().optional().default(true),
});

/* ---- Atención al cliente (PQRS) ------------------------------------ */

const tiposTicket = ['peticion', 'queja', 'reclamo', 'sugerencia', 'felicitacion', 'soporte'];

const crearTicket = z.object({
  tipo: z.enum(tiposTicket, {
    errorMap: () => ({ message: `El tipo debe ser uno de: ${tiposTicket.join(', ')}.` }),
  }),
  canal: z.enum(['portal', 'telefono', 'presencial', 'email', 'whatsapp']).optional().default('portal'),
  asunto: texto(3, 150, 'El asunto'),
  descripcion: texto(10, 8000, 'La descripción'),
  prioridad: z.enum(['baja', 'normal', 'alta', 'urgente']).optional().default('normal'),
  sedeId: idNumerico('La sede').optional().nullable(),
  citaId: idNumerico('La cita').optional().nullable(),
  facturaId: idNumerico('La factura').optional().nullable(),
  // Para quien radica sin cuenta.
  nombreContacto: textoOpcional(120, 'El nombre'),
  emailContacto: emailOpcional,
  telefonoContacto: textoOpcional(30, 'El teléfono'),
});

const responderTicket = z.object({
  mensaje: texto(2, 8000, 'El mensaje'),
  interno: z.coerce.boolean().optional().default(false),
  archivo: textoOpcional(255, 'El archivo'),
});

const actualizarTicket = z
  .object({
    estado: z.enum(['abierto', 'en_proceso', 'esperando', 'resuelto', 'cerrado']).optional(),
    prioridad: z.enum(['baja', 'normal', 'alta', 'urgente']).optional(),
    asignadoA: idNumerico('El responsable').optional().nullable(),
    comentarioCierre: textoOpcional(4000, 'El comentario de cierre'),
  })
  .refine((t) => !['resuelto', 'cerrado'].includes(t.estado) || Boolean(t.comentarioCierre), {
    message: 'Cerrar un caso exige escribir cómo se resolvió.',
    path: ['comentarioCierre'],
  });

const listarTickets = z.object({
  tipo: z.enum(tiposTicket).optional(),
  estado: z.enum(['abierto', 'en_proceso', 'esperando', 'resuelto', 'cerrado']).optional(),
  prioridad: z.enum(['baja', 'normal', 'alta', 'urgente']).optional(),
  asignadoA: idNumerico('El responsable').optional(),
  desde: fechaISO('La fecha inicial').optional(),
  hasta: fechaISO('La fecha final').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const calificarTicket = z.object({
  calificacion: entero('La calificación', 1, 5),
  comentario: textoOpcional(2000, 'El comentario'),
});

/* ================================================================
   Fase 4 — administración y operación
   ================================================================ */

/* ---- Personal ------------------------------------------------------ */

const crearTurno = z
  .object({
    nombre: texto(2, 60, 'El nombre'),
    sedeId: idNumerico('La sede').optional().nullable(),
    horaInicio: horaHHMM('La hora de inicio'),
    horaFin: horaHHMM('La hora de fin'),
    color: textoOpcional(20, 'El color'),
    nocturno: z.coerce.boolean().optional().default(false),
    activo: z.coerce.boolean().optional().default(true),
  })
  // Un turno de noche cruza la medianoche, así que ahí sí vale que la hora de
  // fin sea menor que la de inicio.
  .refine((t) => t.nocturno || t.horaFin > t.horaInicio, {
    message: 'La hora de fin debe ser posterior a la de inicio, o marca el turno como nocturno.',
    path: ['horaFin'],
  });

const asignarTurno = z.object({
  usuarioId: idNumerico('El usuario'),
  turnoId: idNumerico('El turno'),
  sedeId: idNumerico('La sede').optional().nullable(),
  fecha: fechaISO('La fecha'),
  notas: textoOpcional(180, 'Las notas'),
});

const registrarAsistencia = z.object({
  usuarioId: idNumerico('El usuario'),
  fecha: fechaISO('La fecha'),
  entrada: fechaHoraISO('La hora de entrada').optional().nullable(),
  salida: fechaHoraISO('La hora de salida').optional().nullable(),
  estado: z.enum(['presente', 'tarde', 'ausente', 'justificado', 'descanso']).optional().default('presente'),
  observaciones: textoOpcional(200, 'Las observaciones'),
});

const solicitarAusencia = z
  .object({
    usuarioId: idNumerico('El usuario').optional().nullable(),
    tipo: z.enum(['vacaciones', 'permiso', 'incapacidad', 'licencia', 'compensatorio']),
    desde: fechaISO('La fecha inicial'),
    hasta: fechaISO('La fecha final'),
    motivo: textoOpcional(255, 'El motivo'),
    soporteUrl: textoOpcional(255, 'El soporte'),
  })
  .refine((a) => a.hasta >= a.desde, {
    message: 'La fecha final no puede ser anterior a la inicial.',
    path: ['hasta'],
  });

const resolverAusencia = z
  .object({
    estado: z.enum(['aprobada', 'rechazada', 'cancelada']),
    motivo: textoOpcional(255, 'El motivo'),
    // Al aprobar se bloquea la agenda del veterinario en esas fechas, para que
    // no le queden citas encima de las vacaciones.
    bloquearAgenda: z.coerce.boolean().optional().default(true),
  })
  .refine((a) => a.estado !== 'rechazada' || Boolean(a.motivo), {
    message: 'Rechazar una solicitud exige explicar por qué.',
    path: ['motivo'],
  });

const crearReglaComision = z
  .object({
    nombre: texto(2, 100, 'El nombre'),
    aplicaA: z.enum(['servicio', 'producto', 'examen', 'global']).optional().default('servicio'),
    servicioId: idNumerico('El servicio').optional().nullable(),
    categoriaId: idNumerico('La categoría').optional().nullable(),
    usuarioId: idNumerico('El usuario').optional().nullable(),
    porcentaje: z.coerce.number().min(0).max(100).optional().nullable(),
    valorFijo: dinero('El valor fijo').optional().nullable(),
    activo: z.coerce.boolean().optional().default(true),
  })
  .refine((r) => r.porcentaje !== null || r.valorFijo !== null, {
    message: 'Define un porcentaje o un valor fijo.',
    path: ['porcentaje'],
  });

const liquidarComisiones = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El periodo debe tener el formato AAAA-MM.'),
  usuarioId: idNumerico('El usuario').optional().nullable(),
});

const crearCertificacion = z.object({
  usuarioId: idNumerico('El usuario'),
  nombre: texto(2, 150, 'El nombre'),
  entidad: textoOpcional(150, 'La entidad'),
  tipo: z.enum(['titulo', 'especializacion', 'certificacion', 'curso', 'tarjeta'])
    .optional().default('certificacion'),
  expedidaEn: fechaISO('La fecha de expedición').optional().nullable(),
  venceEn: fechaISO('La fecha de vencimiento').optional().nullable(),
  archivo: textoOpcional(255, 'El archivo'),
});

/* ---- Equipos médicos ----------------------------------------------- */

const crearEquipo = z.object({
  codigo: texto(2, 30, 'El código'),
  nombre: texto(2, 140, 'El nombre'),
  marca: textoOpcional(80, 'La marca'),
  modelo: textoOpcional(80, 'El modelo'),
  numeroSerie: textoOpcional(80, 'El número de serie'),
  categoria: textoOpcional(30, 'La categoría'),
  sedeId: idNumerico('La sede').optional().nullable(),
  ubicacion: textoOpcional(80, 'La ubicación'),
  responsableId: idNumerico('El responsable').optional().nullable(),
  proveedorId: idNumerico('El proveedor').optional().nullable(),
  fechaCompra: fechaISO('La fecha de compra').optional().nullable(),
  valorCompra: dinero('El valor de compra').optional().nullable(),
  garantiaHasta: fechaISO('El fin de la garantía').optional().nullable(),
  estado: z.enum(['operativo', 'mantenimiento', 'reparacion', 'fuera_servicio', 'dado_baja'])
    .optional().default('operativo'),
  requiereCalibracion: z.coerce.boolean().optional().default(false),
  frecuenciaMeses: entero('La frecuencia en meses', 1, 120).optional().nullable(),
  proximoMantenimiento: fechaISO('El próximo mantenimiento').optional().nullable(),
  proximaCalibracion: fechaISO('La próxima calibración').optional().nullable(),
  notas: textoOpcional(4000, 'Las notas'),
  activo: z.coerce.boolean().optional().default(true),
});

const registrarMantenimiento = z.object({
  tipo: z.enum(['preventivo', 'correctivo', 'calibracion', 'verificacion']).optional().default('preventivo'),
  fecha: fechaISO('La fecha').optional(),
  proveedor: textoOpcional(150, 'El proveedor'),
  descripcion: texto(3, 8000, 'La descripción'),
  repuestos: textoOpcional(255, 'Los repuestos'),
  costo: dinero('El costo').optional().default(0),
  resultado: z.enum(['satisfactorio', 'con_reservas', 'fallido']).optional().default('satisfactorio'),
  proximo: fechaISO('El próximo mantenimiento').optional().nullable(),
  certificado: textoOpcional(255, 'El certificado'),
  fueraServicioDias: entero('Los días fuera de servicio', 0, 999).optional().nullable(),
});

/* ---- Bioseguridad --------------------------------------------------- */

const crearProtocolo = z.object({
  codigo: texto(2, 30, 'El código'),
  nombre: texto(3, 150, 'El nombre'),
  categoria: z.enum(['limpieza', 'desinfeccion', 'esterilizacion', 'residuos', 'proteccion', 'emergencia'])
    .optional().default('limpieza'),
  descripcion: textoOpcional(8000, 'La descripción'),
  pasos: textoOpcional(8000, 'Los pasos'),
  frecuencia: z.enum(['por_uso', 'diaria', 'semanal', 'quincenal', 'mensual', 'trimestral'])
    .optional().default('diaria'),
  responsableCargo: textoOpcional(60, 'El cargo responsable'),
  activo: z.coerce.boolean().optional().default(true),
});

const registrarProtocolo = z.object({
  protocoloId: idNumerico('El protocolo'),
  sedeId: idNumerico('La sede').optional().nullable(),
  area: textoOpcional(80, 'El área'),
  cumplido: z.coerce.boolean().optional().default(true),
  productoUsado: textoOpcional(120, 'El producto usado'),
  observaciones: textoOpcional(255, 'Las observaciones'),
});

const registrarResiduos = z.object({
  sedeId: idNumerico('La sede').optional().nullable(),
  tipo: z.enum([
    'anatomopatologico', 'cortopunzante', 'biosanitario', 'quimico', 'farmaco', 'ordinario', 'reciclable',
  ]),
  pesoKg: z.coerce.number().positive('El peso debe ser mayor que cero.').max(10000),
  fecha: fechaISO('La fecha').optional(),
  gestor: textoOpcional(150, 'El gestor'),
  numeroActa: textoOpcional(40, 'El número de acta'),
  observaciones: textoOpcional(255, 'Las observaciones'),
});

const registrarIncidente = z.object({
  sedeId: idNumerico('La sede').optional().nullable(),
  tipo: z.enum([
    'accidente_cortopunzante', 'mordedura', 'arañazo', 'exposicion_quimica',
    'derrame', 'contaminacion', 'fuga_paciente', 'otro',
  ]),
  fecha: fechaHoraISO('La fecha').optional(),
  lugar: textoOpcional(120, 'El lugar'),
  descripcion: texto(10, 8000, 'La descripción'),
  involucrados: textoOpcional(255, 'Los involucrados'),
  gravedad: z.enum(['leve', 'moderada', 'grave']).optional().default('leve'),
  acciones: textoOpcional(8000, 'Las acciones tomadas'),
});

const cerrarIncidente = z
  .object({
    estado: z.enum(['abierto', 'en_seguimiento', 'cerrado']),
    acciones: textoOpcional(8000, 'Las acciones tomadas'),
  })
  .refine((i) => i.estado !== 'cerrado' || Boolean(i.acciones), {
    message: 'Cerrar un incidente exige anotar qué se hizo.',
    path: ['acciones'],
  });

const crearElementoProteccion = z.object({
  nombre: texto(2, 100, 'El nombre'),
  tipo: z.enum(['guantes', 'tapabocas', 'bata', 'gafas', 'careta', 'delantal', 'calzado', 'otro'])
    .optional().default('otro'),
  productoId: idNumerico('El producto').optional().nullable(),
  vidaUtilDias: entero('La vida útil en días', 1, 3650).optional().nullable(),
  activo: z.coerce.boolean().optional().default(true),
});

const entregarEpp = z.object({
  elementoId: idNumerico('El elemento'),
  usuarioId: idNumerico('El usuario'),
  cantidad: entero('La cantidad', 1, 999).optional().default(1),
  observaciones: textoOpcional(200, 'Las observaciones'),
});

/* ---- Caja ----------------------------------------------------------- */

const crearCaja = z.object({
  sedeId: idNumerico('La sede'),
  nombre: texto(2, 60, 'El nombre'),
  activo: z.coerce.boolean().optional().default(true),
});

const abrirCaja = z.object({
  cajaId: idNumerico('La caja'),
  baseInicial: dinero('La base inicial').optional().default(0),
  observaciones: textoOpcional(255, 'Las observaciones'),
});

const movimientoCaja = z.object({
  tipo: z.enum(['ingreso', 'egreso']),
  concepto: texto(3, 180, 'El concepto'),
  valor: z.coerce.number().positive('El valor debe ser mayor que cero.').max(999999999),
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia', 'en_linea']).optional().default('efectivo'),
});

const cerrarCaja = z.object({
  totalContado: dinero('El total contado'),
  observaciones: textoOpcional(255, 'Las observaciones'),
});

/* ---- Integraciones -------------------------------------------------- */

const configurarProveedorDian = z.object({
  nombre: texto(2, 120, 'El nombre'),
  nit: textoOpcional(30, 'El NIT'),
  ambiente: z.enum(['pruebas', 'produccion']).optional().default('pruebas'),
  urlBase: textoOpcional(255, 'La URL'),
  usuario: textoOpcional(120, 'El usuario'),
  // Nunca se guarda el secreto: solo el nombre de la variable de entorno donde
  // vive. Así rotar una clave no obliga a tocar la base ni la deja en un backup.
  secretoEnv: textoOpcional(60, 'La variable de entorno del secreto'),
  prefijo: textoOpcional(10, 'El prefijo'),
  resolucion: textoOpcional(40, 'La resolución'),
  rangoDesde: entero('El rango inicial', 1, 999999999).optional().nullable(),
  rangoHasta: entero('El rango final', 1, 999999999).optional().nullable(),
  vigenciaHasta: fechaISO('La vigencia').optional().nullable(),
  activo: z.coerce.boolean().optional().default(false),
});

const configurarPasarela = z.object({
  nombre: texto(2, 60, 'El nombre'),
  metodo: z.enum(['pse', 'nequi', 'daviplata', 'tarjeta', 'transferencia', 'efecty', 'otro']),
  proveedor: textoOpcional(60, 'El proveedor'),
  ambiente: z.enum(['pruebas', 'produccion']).optional().default('pruebas'),
  clavePublica: textoOpcional(160, 'La clave pública'),
  secretoEnv: textoOpcional(60, 'La variable de entorno del secreto'),
  comisionPct: z.coerce.number().min(0).max(100).optional().default(0),
  orden: entero('El orden', 0, 999).optional().default(0),
  activo: z.coerce.boolean().optional().default(false),
});

const iniciarPago = z
  .object({
    pasarelaId: idNumerico('La pasarela'),
    facturaId: idNumerico('La factura').optional().nullable(),
    pedidoId: idNumerico('El pedido').optional().nullable(),
    sesionTeleId: idNumerico('La videoconsulta').optional().nullable(),
    suscripcionId: idNumerico('La suscripción').optional().nullable(),
  })
  .refine((p) => p.facturaId || p.pedidoId || p.sesionTeleId || p.suscripcionId, {
    message: 'Indica qué se está pagando.',
    path: ['facturaId'],
  });

const confirmarPago = z.object({
  estado: z.enum(['aprobada', 'rechazada', 'expirada', 'reversada']),
  referenciaExterna: textoOpcional(120, 'La referencia externa'),
  respuesta: z.record(z.any()).optional().nullable(),
});

/* ---- Automatización -------------------------------------------------- */

const eventosAutomatizacion = [
  'cita_creada', 'cita_proxima', 'cita_no_asistio', 'vacuna_proxima', 'vacuna_vencida',
  'desparasitacion_proxima', 'resultado_listo', 'factura_pendiente', 'factura_vencida',
  'tratamiento_control', 'medicamento_toma', 'cumpleanos', 'cliente_inactivo',
  'pedido_estado', 'plan_por_vencer',
];

const crearReglaAutomatica = z.object({
  codigo: texto(2, 50, 'El código'),
  nombre: texto(3, 120, 'El nombre'),
  evento: z.enum(eventosAutomatizacion),
  plantillaId: idNumerico('La plantilla').optional().nullable(),
  canal: z.enum(['sistema', 'email', 'sms', 'whatsapp']).optional().default('sistema'),
  // Negativo = antes del suceso; positivo = después.
  desfaseHoras: z.coerce.number().int().min(-8760).max(8760).optional().default(0),
  destinatario: z.enum(['cliente', 'veterinario', 'admin', 'equipo']).optional().default('cliente'),
  condiciones: z.record(z.any()).optional().nullable(),
  activo: z.coerce.boolean().optional().default(true),
});

/* ---- Alertas críticas ------------------------------------------------ */

const categoriasAlerta = [
  'clinica', 'inventario', 'agenda', 'facturacion', 'equipos', 'personal', 'seguridad',
];

const listarAlertas = z.object({
  categoria: z.enum(categoriasAlerta).optional(),
  severidad: z.enum(['baja', 'media', 'alta', 'critica']).optional(),
  estado: z.enum(['abierta', 'vista', 'resuelta', 'descartada']).optional(),
  sedeId: idNumerico('La sede').optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(80),
});

const resolverAlerta = z
  .object({
    estado: z.enum(['vista', 'resuelta', 'descartada']),
    notaCierre: textoOpcional(255, 'La nota'),
  })
  .refine((a) => a.estado !== 'descartada' || Boolean(a.notaCierre), {
    message: 'Descartar una alerta exige decir por qué.',
    path: ['notaCierre'],
  });

const actualizarReglaAlerta = z.object({
  severidad: z.enum(['baja', 'media', 'alta', 'critica']).optional(),
  parametros: z.record(z.any()).optional().nullable(),
  activo: z.coerce.boolean().optional(),
});

/* ---- IA asistente ----------------------------------------------------- */

const tiposSolicitudIa = [
  'resumen_historia', 'resumen_consultas', 'borrador_evolucion', 'datos_faltantes',
  'interacciones', 'busqueda', 'clasificar_documento', 'sugerencia_recordatorio',
];

const solicitarIa = z.object({
  tipo: z.enum(tiposSolicitudIa),
  mascotaId: idNumerico('La mascota').optional().nullable(),
  entidad: textoOpcional(40, 'La entidad'),
  entidadId: idNumerico('El registro').optional().nullable(),
  consulta: textoOpcional(2000, 'La consulta'),
});

const revisarSugerencia = z
  .object({
    estado: z.enum(['aceptada', 'descartada']),
    nota: textoOpcional(255, 'La nota'),
  })
  .refine((s) => s.estado !== 'descartada' || Boolean(s.nota), {
    message: 'Descartar una sugerencia exige decir por qué; es lo que la hace auditable.',
    path: ['nota'],
  });

const responderEncuesta = z.object({
  encuestaId: idNumerico('La encuesta'),
  citaId: idNumerico('La cita').optional().nullable(),
  pedidoId: idNumerico('El pedido').optional().nullable(),
  ticketId: idNumerico('El caso').optional().nullable(),
  veterinarioId: idNumerico('El veterinario').optional().nullable(),
  respuestas: z.record(z.any()),
  calificacion: entero('La calificación', 1, 5).optional().nullable(),
  comentario: textoOpcional(4000, 'El comentario'),
});

module.exports = {
  paramsId,
  paramsIdYPago,
  paginacion,
  registro,
  login,
  cambioPassword,
  actualizarPerfil,
  crearMascota,
  actualizarMascota,
  crearServicio,
  crearVeterinario,
  actualizarVeterinario,
  horariosVeterinario,
  crearBloqueo,
  rangoBloqueos,
  disponibilidad,
  crearCita,
  cambiarEstadoCita,
  listarCitas,
  rotarCodigoAcceso,
  crearUsuario,
  listarUsuarios,
  listarClientes,
  cambiarEstadoUsuario,
  cambiarRolUsuario,
  solicitarRecuperacion,
  restablecerPassword,
  verificarMfa,
  activarMfa,
  confirmarConPassword,
  consultaAuditoria,
  crearConsulta,
  editarConsulta,
  aplicarVacuna,
  solicitarExamen,
  resultadosExamen,
  listarConsultas,
  crearProducto,
  actualizarProducto,
  movimientoInventario,
  crearProveedor,
  crearCompra,
  listarProductos,
  listarMovimientos,
  crearFactura,
  registrarPago,
  anularFactura,
  crearDevolucion,
  listarFacturas,
  enviarNotificacion,
  listarNotificaciones,
  crearRecordatorio,
  listarRecordatorios,
  consultaReportes,
  // Los signos vitales se toman en consulta, en urgencias y en hospitalización,
  // así que el esquema se comparte en vez de repetirse tres veces.
  signosVitales,
  // Urgencias
  registrarUrgencia,
  triageUrgencia,
  actualizarUrgencia,
  eventoUrgencia,
  medicacionUrgencia,
  procedimientoUrgencia,
  listarUrgencias,
  // Hospitalización
  crearHabitacion,
  estadoHabitacion,
  ingresarHospitalizacion,
  egresarHospitalizacion,
  controlHospitalizacion,
  alimentacionHospitalizacion,
  medicacionHospitalizacion,
  visitaHospitalizacion,
  // Historia clínica avanzada
  crearAntecedente,
  crearEvolucion,
  crearReaccion,
  firmarProcedimiento,
  registrarDesparasitacion,
  crearEsquemaVacunacion,
  // Farmacia
  crearReceta,
  dispensarReceta,
  devolverMedicamento,
  crearInteraccion,
  listarRecetas,
  // Laboratorio
  crearOrdenLaboratorio,
  registrarMuestra,
  estadoMuestra,
  cargarResultadosLaboratorio,
  validarResultado,
  listarOrdenesLaboratorio,
  // Imagenología
  crearEstudioImagen,
  crearInformeImagen,
  listarEstudiosImagen,
  // Nutrición
  crearEvaluacionNutricional,
  crearPlanNutricional,
  crearRestriccionAlimentaria,
  crearTipoAlimento,
  // Telemedicina
  crearSesionTelemedicina,
  estadoSesionTelemedicina,
  mensajeTelemedicina,
  consentimientoTelemedicina,
  // Comunidad
  configurarIdentidad,
  reportarPerdida,
  actualizarPerdida,
  crearAvistamiento,
  estadoAvistamiento,
  crearTestimonio,
  crearPublicacionAdopcion,
  solicitarAdopcion,
  evaluarSolicitudAdopcion,
  crearEntrevistaAdopcion,
  crearSeguimientoAdopcion,
  registrarSeguimientoAdopcion,
  // Tienda y domicilios
  crearCategoriaTienda,
  crearArticulo,
  crearCupon,
  itemCarrito,
  aplicarCupon,
  crearPedido,
  pedidoDirecto,
  estadoPedido,
  crearRepartidor,
  asignarDomicilio,
  estadoDomicilio,
  listarPedidos,
  // Planes y fidelización
  crearPlanSalud,
  suscribirPlan,
  consumirBeneficio,
  ajustarPuntos,
  crearRecompensa,
  crearPromocion,
  // Atención al cliente
  crearTicket,
  responderTicket,
  actualizarTicket,
  listarTickets,
  calificarTicket,
  responderEncuesta,
  // Personal
  crearTurno,
  asignarTurno,
  registrarAsistencia,
  solicitarAusencia,
  resolverAusencia,
  crearReglaComision,
  liquidarComisiones,
  crearCertificacion,
  // Equipos médicos
  crearEquipo,
  registrarMantenimiento,
  // Bioseguridad
  crearProtocolo,
  registrarProtocolo,
  registrarResiduos,
  registrarIncidente,
  cerrarIncidente,
  crearElementoProteccion,
  entregarEpp,
  // Caja
  crearCaja,
  abrirCaja,
  movimientoCaja,
  cerrarCaja,
  // Integraciones
  configurarProveedorDian,
  configurarPasarela,
  iniciarPago,
  confirmarPago,
  crearReglaAutomatica,
  // Alertas
  listarAlertas,
  resolverAlerta,
  actualizarReglaAlerta,
  // IA
  solicitarIa,
  revisarSugerencia,
  // Catálogos de valores
  especialidades,
  estadosCita,
  tiposConsulta,
  tiposDiagnostico,
  estadosExamen,
  tiposMovimiento,
  estadosFactura,
  metodosPago,
  canalesNotificacion,
  tiposRecordatorio,
  prioridadesTriage,
  estadosUrgencia,
  desenlacesUrgencia,
  tiposTicket,
  eventosAutomatizacion,
  categoriasAlerta,
  tiposSolicitudIa,
};
