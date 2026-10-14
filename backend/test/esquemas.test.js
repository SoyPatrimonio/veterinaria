'use strict';

/**
 * Validación de las entradas de la API.
 *
 * Es la frontera entre lo que manda el navegador y lo que llega a la base, así
 * que se prueba tanto lo que tiene que pasar como lo que tiene que rebotar. Los
 * casos de rechazo importan más: un esquema que se ablanda por accidente no
 * rompe nada visible, simplemente deja pasar datos que luego fallan más adentro.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const esquemas = require('../src/utils/esquemas');

/** ¿El esquema aceptó este valor? */
const acepta = (esquema, valor) => esquema.safeParse(valor).success;

/* ------------------------------------------------------------------
   Registro y contraseñas
   ------------------------------------------------------------------ */

test('el registro normaliza el correo y recorta los espacios del nombre', () => {
  const resultado = esquemas.registro.parse({
    nombre: '  Daniela Ríos  ',
    email: '  Daniela@Correo.COM ',
    telefono: '300 123 4567',
    password: 'Cliente123',
  });

  assert.equal(resultado.nombre, 'Daniela Ríos');
  assert.equal(resultado.email, 'daniela@correo.com', 'el correo se guarda en minúsculas');
});

test('el registro rechaza correos mal escritos', () => {
  const base = { nombre: 'Daniela', telefono: null, password: 'Cliente123' };

  assert.equal(acepta(esquemas.registro, { ...base, email: 'daniela@correo.com' }), true);
  assert.equal(acepta(esquemas.registro, { ...base, email: 'daniela' }), false);
  assert.equal(acepta(esquemas.registro, { ...base, email: 'daniela@' }), false);
  assert.equal(acepta(esquemas.registro, { ...base, email: '' }), false);
});

test('la contraseña exige ocho caracteres con letra y número', () => {
  const con = (password) => acepta(esquemas.registro, {
    nombre: 'Daniela', email: 'daniela@correo.com', telefono: null, password,
  });

  assert.equal(con('Cliente123'), true);
  assert.equal(con('Corto1'), false, 'menos de 8 caracteres');
  assert.equal(con('solotexto'), false, 'sin ningún número');
  assert.equal(con('12345678'), false, 'sin ninguna letra');
});

test('el teléfono acepta los signos de un número real y rechaza letras', () => {
  const con = (telefono) => acepta(esquemas.registro, {
    nombre: 'Daniela', email: 'daniela@correo.com', password: 'Cliente123', telefono,
  });

  assert.equal(con('+57 (300) 123-4567'), true);
  assert.equal(con('llámame'), false);
});

test('el cambio de contraseña rechaza repetir la actual', () => {
  assert.equal(
    acepta(esquemas.cambioPassword, { actual: 'Cliente123', nueva: 'Cliente456' }),
    true
  );
  assert.equal(
    acepta(esquemas.cambioPassword, { actual: 'Cliente123', nueva: 'Cliente123' }),
    false
  );
});

/* ------------------------------------------------------------------
   Citas
   ------------------------------------------------------------------ */

test('crearCita convierte los identificadores que llegan como texto', () => {
  // El formulario los manda como strings; el modelo los necesita numéricos.
  const cita = esquemas.crearCita.parse({
    mascotaId: '4', servicioId: '2', veterinarioId: '1',
    fecha: '2026-08-20', hora: '09:30', motivo: '  Control  ',
  });

  assert.equal(cita.mascotaId, 4);
  assert.equal(typeof cita.mascotaId, 'number');
  assert.equal(cita.motivo, 'Control');
});

test('crearCita exige el formato de fecha y hora que entiende la agenda', () => {
  const base = { mascotaId: 1, servicioId: 1, veterinarioId: 1, hora: '09:30' };

  assert.equal(acepta(esquemas.crearCita, { ...base, fecha: '2026-08-20' }), true);
  assert.equal(acepta(esquemas.crearCita, { ...base, fecha: '20/08/2026' }), false);
  assert.equal(acepta(esquemas.crearCita, { ...base, fecha: '2026-8-2' }), false);

  const conHora = (hora) => acepta(esquemas.crearCita, { ...base, fecha: '2026-08-20', hora });
  assert.equal(conHora('23:59'), true);
  assert.equal(conHora('24:00'), false);
  assert.equal(conHora('9:30'), false);
});

test('crearCita rechaza identificadores que no son enteros positivos', () => {
  const con = (mascotaId) => acepta(esquemas.crearCita, {
    mascotaId, servicioId: 1, veterinarioId: 1, fecha: '2026-08-20', hora: '09:30',
  });

  assert.equal(con(1), true);
  assert.equal(con(0), false);
  assert.equal(con(-3), false);
  assert.equal(con(1.5), false);
  assert.equal(con('abc'), false);
});

test('cambiarEstadoCita solo admite los estados del flujo', () => {
  for (const estado of esquemas.estadosCita) {
    assert.equal(acepta(esquemas.cambiarEstadoCita, { estado }), true, estado);
  }
  assert.equal(acepta(esquemas.cambiarEstadoCita, { estado: 'inventado' }), false);
});

/* ------------------------------------------------------------------
   Horarios y paginación
   ------------------------------------------------------------------ */

test('un horario de veterinario no puede terminar antes de empezar', () => {
  const con = (horaInicio, horaFin) => acepta(esquemas.horariosVeterinario, {
    horarios: [{ diaSemana: 1, horaInicio, horaFin }],
  });

  assert.equal(con('08:00', '12:00'), true);
  assert.equal(con('12:00', '08:00'), false);
  assert.equal(con('08:00', '08:00'), false, 'un horario de duración cero no sirve');
});

test('el día de la semana se queda entre 0 y 6', () => {
  const con = (diaSemana) => acepta(esquemas.horariosVeterinario, {
    horarios: [{ diaSemana, horaInicio: '08:00', horaFin: '12:00' }],
  });

  assert.equal(con(0), true);
  assert.equal(con(6), true);
  assert.equal(con(7), false);
  assert.equal(con(-1), false);
});

test('la paginación pone valores por defecto y no deja pedir páginas enormes', () => {
  const vacia = esquemas.paginacion.parse({});
  assert.equal(vacia.limite, 50);
  assert.equal(vacia.desplazamiento, 0);

  assert.equal(esquemas.paginacion.parse({ limite: '25' }).limite, 25);
  assert.equal(acepta(esquemas.paginacion, { limite: 500 }), false, 'el tope es 200');
  assert.equal(acepta(esquemas.paginacion, { desplazamiento: -1 }), false);
});

test('paramsId acepta el id de la URL como texto y lo entrega numérico', () => {
  assert.equal(esquemas.paramsId.parse({ id: '42' }).id, 42);
  assert.equal(acepta(esquemas.paramsId, { id: 'abc' }), false);
  assert.equal(acepta(esquemas.paramsId, { id: '0' }), false);
});

test('paramsIdYPago conserva los dos identificadores de la ruta', () => {
  // El middleware reemplaza req.params con lo que devuelve el esquema: si
  // aquí faltara pagoId, el controlador lo recibiría como undefined.
  const params = esquemas.paramsIdYPago.parse({ id: '3', pagoId: '9' });

  assert.equal(params.id, 3);
  assert.equal(params.pagoId, 9);
});

/* ------------------------------------------------------------------
   Fase 4 — historia clínica
   ------------------------------------------------------------------ */

test('una consulta se puede guardar solo con mascota y motivo', () => {
  const consulta = esquemas.crearConsulta.parse({ mascotaId: 1, motivo: 'Control anual' });

  assert.equal(consulta.tipo, 'consulta', 'el tipo por defecto');
  assert.deepEqual(consulta.diagnosticos, []);
  assert.deepEqual(consulta.tratamientos, []);
  assert.equal(consulta.cerrarCita, true, 'la cita se cierra salvo que se diga lo contrario');
});

test('los signos vitales rechazan valores fuera del rango de un animal vivo', () => {
  const con = (signos) => acepta(esquemas.crearConsulta, { mascotaId: 1, motivo: 'Control', signos });

  assert.equal(con({ temperaturaC: 38.5, pesoKg: 12.4, condicionCorporal: 5 }), true);
  assert.equal(con({ temperaturaC: 60 }), false, 'temperatura imposible');
  assert.equal(con({ pesoKg: 0 }), false, 'un peso de cero es un dato mal tomado');
  assert.equal(con({ condicionCorporal: 12 }), false, 'la escala llega hasta 9');
});

test('un tratamiento no puede terminar antes de empezar', () => {
  const con = (fechaInicio, fechaFin) => acepta(esquemas.crearConsulta, {
    mascotaId: 1,
    motivo: 'Otitis',
    tratamientos: [{ descripcion: 'Antibiótico', fechaInicio, fechaFin }],
  });

  assert.equal(con('2026-08-01', '2026-08-08'), true);
  assert.equal(con('2026-08-08', '2026-08-01'), false);
  assert.equal(con('2026-08-01', null), true, 'un tratamiento abierto es válido');
});

test('el diagnóstico exige descripción aunque venga del catálogo', () => {
  const con = (diagnostico) => acepta(esquemas.crearConsulta, {
    mascotaId: 1, motivo: 'Control', diagnosticos: [diagnostico],
  });

  assert.equal(con({ diagnosticoId: 3, descripcion: 'Otitis externa' }), true);
  assert.equal(con({ diagnosticoId: 3 }), false);
});

test('aplicar una vacuna exige mascota, vacuna y fecha', () => {
  const base = { mascotaId: 1, vacunaId: 2, fechaAplicacion: '2026-08-12' };

  assert.equal(acepta(esquemas.aplicarVacuna, base), true);
  assert.equal(acepta(esquemas.aplicarVacuna, { ...base, fechaAplicacion: '12/08/2026' }), false);
  assert.equal(acepta(esquemas.aplicarVacuna, { mascotaId: 1, vacunaId: 2 }), false);
});

/* ------------------------------------------------------------------
   Fase 5 — inventario
   ------------------------------------------------------------------ */

test('un movimiento solo admite entrada, salida o ajuste', () => {
  const con = (tipo) => acepta(esquemas.movimientoInventario, { productoId: 1, tipo, cantidad: 5 });

  for (const tipo of esquemas.tiposMovimiento) assert.equal(con(tipo), true, tipo);
  assert.equal(con('devolucion'), false);
});

test('la cantidad de un movimiento es un entero no negativo', () => {
  const con = (cantidad) => acepta(esquemas.movimientoInventario, {
    productoId: 1, tipo: 'salida', cantidad,
  });

  assert.equal(con(0), true, 'un ajuste puede dejar la existencia en cero');
  assert.equal(con(-3), false);
  assert.equal(con(2.5), false, 'el stock son unidades enteras');
});

test('una compra necesita al menos una línea con cantidad', () => {
  const con = (lineas) => acepta(esquemas.crearCompra, { proveedorId: 1, lineas });

  assert.equal(con([{ productoId: 1, cantidad: 10, precioUnit: 18000 }]), true);
  assert.equal(con([]), false);
  assert.equal(con([{ productoId: 1, cantidad: 0 }]), false, 'comprar cero unidades no es una compra');
});

test('el correo del proveedor puede llegar vacío y se guarda como nulo', () => {
  const proveedor = esquemas.crearProveedor.parse({ nombre: 'Distribuidora Andina', email: '' });

  assert.equal(proveedor.email, null);
  assert.equal(acepta(esquemas.crearProveedor, { nombre: 'X', email: 'no-es-correo' }), false);
});

/* ------------------------------------------------------------------
   Fase 6 — facturación
   ------------------------------------------------------------------ */

test('una factura necesita cliente y al menos una línea', () => {
  const linea = { descripcion: 'Consulta veterinaria', precioUnit: 60000 };

  assert.equal(acepta(esquemas.crearFactura, { clienteId: 1, lineas: [linea] }), true);
  assert.equal(acepta(esquemas.crearFactura, { clienteId: 1, lineas: [] }), false);
  assert.equal(acepta(esquemas.crearFactura, { lineas: [linea] }), false);
});

test('una línea no puede ser de un servicio y de un producto a la vez', () => {
  const con = (extra) => acepta(esquemas.crearFactura, {
    clienteId: 1,
    lineas: [{ descripcion: 'Algo', precioUnit: 1000, ...extra }],
  });

  assert.equal(con({ servicioId: 1 }), true);
  assert.equal(con({ productoId: 4 }), true);
  assert.equal(con({}), true, 'un concepto libre también vale');
  assert.equal(con({ servicioId: 1, productoId: 4 }), false);
});

test('un pago tiene que ser positivo y de un método conocido', () => {
  const con = (datos) => acepta(esquemas.registrarPago, { metodo: 'efectivo', valor: 50000, ...datos });

  assert.equal(con({}), true);
  assert.equal(con({ valor: 0 }), false);
  assert.equal(con({ valor: -100 }), false);
  assert.equal(con({ metodo: 'trueque' }), false);
  for (const metodo of esquemas.metodosPago) assert.equal(con({ metodo }), true, metodo);
});

/* ------------------------------------------------------------------
   Fases 7–10 — avisos y reportes
   ------------------------------------------------------------------ */

test('un aviso va a una persona o a un rol, nunca a los dos ni a ninguno', () => {
  const con = (destino) => acepta(esquemas.enviarNotificacion, { titulo: 'Cierre por festivo', ...destino });

  assert.equal(con({ usuarioId: 6 }), true);
  assert.equal(con({ rol: 'cliente' }), true);
  assert.equal(con({}), false, 'sin destinatario no hay a quién avisar');
  assert.equal(con({ usuarioId: 6, rol: 'cliente' }), false);
});

test('el recordatorio acepta la fecha del input datetime-local y le quita la T', () => {
  const recordatorio = esquemas.crearRecordatorio.parse({
    tipo: 'cita',
    programadoEn: '2026-08-20T09:00',
  });

  assert.equal(recordatorio.programadoEn, '2026-08-20 09:00', 'así lo entiende TIMESTAMP');
  assert.equal(acepta(esquemas.crearRecordatorio, { tipo: 'cita', programadoEn: '2026-08-20' }), false);
  assert.equal(acepta(esquemas.crearRecordatorio, { tipo: 'inventado', programadoEn: '2026-08-20 09:00' }), false);
});

test('los reportes agrupan por día salvo que se pida por mes', () => {
  assert.equal(esquemas.consultaReportes.parse({}).agrupacion, 'dia');
  assert.equal(esquemas.consultaReportes.parse({ agrupacion: 'mes' }).agrupacion, 'mes');
  assert.equal(acepta(esquemas.consultaReportes, { agrupacion: 'semana' }), false);
});
