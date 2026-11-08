'use strict';

/**
 * Pruebas de lo que corrigió la auditoría de seguridad de noviembre de 2026.
 *
 *   1. Volver a escribir la contraseña desde una sesión abierta (acciones
 *      críticas, quitar o renovar el segundo factor) no tenía freno: los
 *      fallos se anotaban, pero nadie los miraba antes de comparar.
 *   2. El enlace de recuperación se podía gastar dos veces con dos peticiones
 *      simultáneas.
 *   3. El nombre de la persona entraba sin escapar en el HTML de los correos.
 *   4. En producción, sin APP_URL, el enlace de recuperación se armaba con el
 *      encabezado Host, que lo escribe quien llama.
 *
 * No hace falta base de datos: se sustituyen las funciones de config/database
 * ANTES de cargar los modelos, que las toman al cargarse.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const bcrypt = require('bcryptjs');

const bd = require('../src/config/database');

/* ------------------------------------------------------------------
   Base de datos simulada

   Cada prueba fija `respuestas` y lee `escrituras`. Las consultas se
   reconocen por un trozo de su SQL.
   ------------------------------------------------------------------ */

let respuestas = {};
let escrituras = [];

function responder(sql) {
  for (const [patron, valor] of Object.entries(respuestas)) {
    if (sql.includes(patron)) return typeof valor === 'function' ? valor(sql) : valor;
  }
  return undefined;
}

bd.consultar = async (sql) => responder(sql) ?? [];
bd.consultarUna = async (sql) => responder(sql) ?? null;
bd.ejecutar = async (sql, params) => {
  escrituras.push({ sql, params });
  return responder(sql) ?? { rows: [], affectedRows: 1 };
};

// La comprobación de filtraciones sale a internet: aquí no.
const passwordFiltrada = require('../src/services/passwordFiltrada.service');
passwordFiltrada.estaFiltrada = async () => false;

const { confirmarPassword } = require('../src/middleware/auth');
const seguridad = require('../src/models/seguridad.model');
const authService = require('../src/services/auth.service');
const correo = require('../src/services/correo.service');

// Cuatro rondas: lo que se prueba es la decisión, no el coste del hash.
const HASH = bcrypt.hashSync('LaBuena123!', 4);
const USUARIO = { id: 9, email: 'recepcion@huellitas.com' };

test.beforeEach(() => {
  respuestas = {};
  escrituras = [];
});

/* ------------------------------------------------------------------
   1. Reautenticación con freno
   ------------------------------------------------------------------ */

test('la reautenticación se corta con 429 cuando la cuenta ya llegó al tope de fallos', async () => {
  respuestas = {
    'AS fallos': { id: 9, fallos: 5 },
    'password_hash FROM usuarios': { password_hash: HASH },
  };

  // Ni siquiera con la contraseña correcta: al llegar al tope ya no se compara,
  // que es justo lo que impide seguir tanteando.
  await assert.rejects(
    () => confirmarPassword(USUARIO, 'LaBuena123!'),
    (error) => error.status === 429
  );
});

test('una contraseña equivocada responde 403 y queda anotada como fallo', async () => {
  respuestas = {
    'AS fallos': { id: 9, fallos: 1 },
    'password_hash FROM usuarios': { password_hash: HASH },
  };

  await assert.rejects(
    () => confirmarPassword(USUARIO, 'otra-cosa'),
    (error) => error.status === 403
  );

  const intento = escrituras.find((e) => /intentos_login/.test(e.sql));
  assert.ok(intento, 'el fallo tiene que quedar en intentos_login');
  assert.ok(intento.params.includes('reautenticacion_fallida'));
});

test('la contraseña correcta por debajo del tope pasa', async () => {
  respuestas = {
    'AS fallos': { id: 9, fallos: 4 },
    'password_hash FROM usuarios': { password_hash: HASH },
  };

  assert.equal(await confirmarPassword(USUARIO, 'LaBuena123!'), true);
});

test('quitar el segundo factor usa el mismo freno', async () => {
  respuestas = {
    'AS fallos': { id: 9, fallos: 5 },
    'password_hash FROM usuarios': { password_hash: HASH },
  };

  await assert.rejects(
    () => authService.desactivarMfa(USUARIO, 'LaBuena123!'),
    (error) => error.status === 429
  );
  // Y no llegó a tocar la tabla del segundo factor.
  assert.ok(!escrituras.some((e) => /\bmfa\b/.test(e.sql)));
});

/* ------------------------------------------------------------------
   2. El enlace de recuperación se gasta una sola vez
   ------------------------------------------------------------------ */

test('marcar el token usado es condicional y dice si ganó', async () => {
  respuestas = { 'UPDATE tokens_recuperacion': { rows: [] } };
  assert.equal(await seguridad.marcarTokenUsado(7), false);

  const sql = escrituras[0].sql;
  assert.match(sql, /usado_en IS NULL/);
  assert.match(sql, /expira_en > LOCALTIMESTAMP/);

  respuestas = { 'UPDATE tokens_recuperacion': { rows: [{ id: 7 }] } };
  assert.equal(await seguridad.marcarTokenUsado(7), true);
});

test('si otra petición ya gastó el token, no se cambia la contraseña', async () => {
  respuestas = {
    'FROM tokens_recuperacion': { id: 7, usuario_id: 3 },
    'FROM usuarios u JOIN roles': { id: 3, nombre: 'Ana Pérez', email: 'ana@example.com' },
    // La otra petición llegó antes: el UPDATE condicional no encuentra fila.
    'UPDATE tokens_recuperacion': { rows: [] },
  };

  await assert.rejects(
    () => authService.restablecerPassword({ token: 'abc', nueva: 'Otra-Clave-2026' }),
    (error) => error.status === 400
  );
  assert.ok(
    !escrituras.some((e) => /UPDATE usuarios SET password_hash/.test(e.sql)),
    'la contraseña no puede cambiar con un token que ya se gastó'
  );
});

/* ------------------------------------------------------------------
   3. Correos sin HTML inyectado
   ------------------------------------------------------------------ */

test('el nombre va escapado en el HTML de los dos correos', () => {
  const nombre = '<a href="https://phish.example">Pulsa aquí</a>';

  const codigo = correo.plantillaCodigo(nombre, '123456', 5);
  assert.ok(!codigo.html.includes('<a href="https://phish.example">'));
  assert.ok(codigo.html.includes('&lt;a href=&quot;https://phish.example&quot;&gt;'));

  const recuperacion = correo.plantillaRecuperacion(nombre, 'https://sitio/login?token=x&y=1', 30);
  assert.ok(!recuperacion.html.includes('<a href="https://phish.example">'));
  assert.ok(recuperacion.html.includes('href="https://sitio/login?token=x&amp;y=1"'));

  // El texto plano no lleva HTML: ahí el nombre va tal cual.
  assert.ok(codigo.texto.includes(nombre));
});

/* ------------------------------------------------------------------
   4. Sin APP_URL, producción no arma enlaces con el Host
   ------------------------------------------------------------------ */

test('en producción sin APP_URL no hay base para el enlace de recuperación', () => {
  // config/env.js decide `esProduccion` al cargarse, así que se mira en un
  // proceso aparte con el entorno de producción.
  const modulo = path.resolve(__dirname, '../src/services/correo.service.js');
  const salida = execFileSync(process.execPath, [
    '-e',
    `const c = require(${JSON.stringify(modulo)});
     process.stdout.write(String(c.baseDelSitio({ protocol: 'https', get: () => 'sitio-ajeno.example' })));`,
  ], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      APP_URL: '',
      JWT_SECRET: 'x'.repeat(48),
      CIFRADO_CLAVE: 'y'.repeat(48),
    },
    // Sin un .env que se cuele por el directorio de trabajo.
    cwd: path.resolve(__dirname),
  }).toString();

  assert.equal(salida, 'null');
});

/* ------------------------------------------------------------------
   5. zod 4 conserva los mensajes en español

   zod 3 → 4 cerró la última alerta alta de `npm audit`, pero zod 4 ignora
   en silencio `required_error`, `invalid_type_error` y `errorMap`: sin la
   migración, todos los formularios contestaban en inglés sin que fallara
   ninguna prueba. Estas fijan los mensajes.
   ------------------------------------------------------------------ */

test('los esquemas siguen respondiendo en español con zod 4', () => {
  const esquemas = require('../src/utils/esquemas');
  const mensajes = (esquema, datos) => Object.fromEntries(
    esquema.safeParse(datos).error.issues.map((i) => [i.path.join('.'), i.message])
  );

  // Falta el dato (antes required_error).
  assert.deepEqual(mensajes(esquemas.login, {}), {
    email: 'El correo es obligatorio.',
    password: 'La contraseña es obligatoria.',
  });

  // Tipo equivocado (antes invalid_type_error).
  assert.equal(mensajes(esquemas.paramsId, { id: 'abc' }).id, 'El identificador debe ser un número.');

  // Opción fuera de la lista (antes errorMap).
  assert.equal(
    mensajes(esquemas.registro, { rol: 'otro', nombre: 'Ana Gómez', email: 'a@b.co', password: 'Abcdef1!x' }).rol,
    'Elige un tipo de cuenta válido.'
  );

  // Lo que no tiene mensaje propio cae al español de zod, no al inglés.
  const porDefecto = mensajes(esquemas.paginacion, { busqueda: 123 }).busqueda;
  assert.ok(!/expected|received|invalid/i.test(porDefecto), `mensaje en inglés: ${porDefecto}`);
});

/* ------------------------------------------------------------------
   6. Límite de peticiones compartido entre instancias

   Los límites sensibles cuentan en seguridad.limites_tasa en vez de en la
   memoria de cada instancia de Vercel. Si la tabla falta o la base falla,
   siguen contando en memoria: nunca tumban la ruta.
   ------------------------------------------------------------------ */

test('el contador compartido usa la base y su conteo', async () => {
  const { AlmacenCompartido } = require('../src/services/limiteCompartido');
  const almacen = new AlmacenCompartido('auth');
  almacen.init({ windowMs: 15 * 60 * 1000 });

  const reinicio = new Date(Date.now() + 60_000);
  respuestas = { 'INSERT INTO limites_tasa': { rows: [{ conteo: 3, reinicia_en: reinicio }] } };

  const info = await almacen.increment('203.0.113.7');
  assert.equal(info.totalHits, 3);
  assert.equal(info.resetTime.getTime(), reinicio.getTime());

  // Atómico: el reinicio de la ventana va dentro del mismo INSERT … ON CONFLICT.
  const { sql, params } = escrituras.find((e) => /INSERT INTO limites_tasa/.test(e.sql));
  assert.match(sql, /ON CONFLICT \(clave\) DO UPDATE/);
  assert.equal(params[0], 'auth:203.0.113.7');
});

test('si la tabla no está, el límite sigue contando en memoria y avisa una vez', async () => {
  const { AlmacenCompartido } = require('../src/services/limiteCompartido');
  const almacen = new AlmacenCompartido('publico');
  almacen.init({ windowMs: 60_000 });

  respuestas = {
    'limites_tasa': () => { throw Object.assign(new Error('no existe'), { code: '42P01' }); },
  };

  const avisos = [];
  const original = console.warn;
  console.warn = (m) => avisos.push(m);
  try {
    assert.equal((await almacen.increment('198.51.100.1')).totalHits, 1);
    assert.equal((await almacen.increment('198.51.100.1')).totalHits, 2);
  } finally {
    console.warn = original;
  }
  assert.equal(avisos.length, 1, 'un solo aviso, no uno por petición');
});
