'use strict';

/**
 * Pruebas de integración: la API real contra un PostgreSQL real.
 *
 *     npm run test:integracion
 *
 * No toca Supabase ni ninguna base configurada: levanta un PostgreSQL en
 * memoria (PGlite, el motor de PostgreSQL compilado para Node), le carga
 * database/supabase/schema.sql y seed.sql con el mismo setup-db.js de
 * siempre, arranca la aplicación y la recorre como lo haría el navegador. Al
 * terminar no queda nada: la base vive solo mientras corren las pruebas.
 *
 * Van aparte de `npm test` porque tardan (cargar el esquema son unos
 * segundos) y porque las unitarias tienen que poder correr en cualquier sitio
 * sin nada más.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '../..');
const PUERTO_DB = 54000 + Math.floor(Math.random() * 1000);

// La configuración se lee al cargar la aplicación: tiene que estar antes.
Object.assign(process.env, {
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${PUERTO_DB}/postgres`,
  DB_SSL: 'disable',
  DB_POOL: '4',
  NODE_ENV: 'test',
  // Sin internet en CI: la consulta de contraseñas filtradas tiene sus
  // propias pruebas con el servicio simulado.
  VERIFICAR_FILTRADAS: '0',
});

let base;
let servidorDb;
let servidorApi;
let API;

/** Carga el esquema y los datos con el script de siempre. */
function cargarBase() {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(process.execPath, [path.join(RAIZ, 'backend/scripts/setup-db.js'), '--sin-bucket'], {
      env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.on('exit', (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`setup-db terminó con ${codigo}:\n${salida}`))));
  });
}

test.before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  base = await PGlite.create();
  servidorDb = new PGLiteSocketServer({ db: base, port: PUERTO_DB, host: '127.0.0.1', maxConnections: 20 });
  await servidorDb.start();
  await cargarBase();

  const app = require(path.join(RAIZ, 'backend/src/app'));
  await new Promise((r) => { servidorApi = app.listen(0, '127.0.0.1', r); });
  API = `http://127.0.0.1:${servidorApi.address().port}/api`;
});

test.after(async () => {
  if (servidorApi) await new Promise((r) => servidorApi.close(r));
  await require(path.join(RAIZ, 'backend/src/config/database')).pool.end().catch(() => {});
  if (servidorDb) await servidorDb.stop();
  if (base) await base.close();
});

async function api(metodo, ruta, { cuerpo, token, binario } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const res = { status: r.status, tipo: r.headers.get('content-type') || '', cabeceras: r.headers };
  if (binario && r.ok) res.buffer = Buffer.from(await r.arrayBuffer());
  else if (res.tipo.includes('json')) res.json = await r.json();
  return res;
}

/** Texto de error que vería la persona: el mensaje y los detalles de validación. */
const motivo = (r) => [r.json?.error, ...(r.json?.detalles || []).map((d) => d.mensaje)].filter(Boolean).join(' ');

/* Las pruebas comparten base y van en orden: cada una deja la cuenta como la
   necesita la siguiente, igual que una persona usando el sistema. */

const totp = require(path.join(RAIZ, 'backend/src/utils/totp'));
const ADMIN = { email: 'admin@huellitas.com', inicial: 'Admin1234', nueva: 'Lluvia#Gris7-Zq9' };
const CLIENTA = { email: 'daniela@correo.com', inicial: 'Cliente123', nueva: 'Mango.Verde#42' };
let tokenAdmin;
let tokenClienta;
let mascotaPropia;

test('la base de pruebas tiene el esquema y los datos del seed', async () => {
  const r = await api('GET', '/servicios');
  assert.equal(r.status, 200);
  assert.equal(r.json.servicios.length, 10);
});

test('una cuenta del seed entra obligada a cambiar la contraseña, y nada más le responde', async () => {
  const login = await api('POST', '/auth/login', { cuerpo: { email: ADMIN.email, password: ADMIN.inicial } });
  assert.equal(login.status, 200);
  assert.equal(login.json.debeCambiarPassword, true);
  assert.equal((await api('GET', '/usuarios', { token: login.json.token })).status, 403);
  tokenAdmin = login.json.token;
});

test('el cambio de contraseña aplica la política nueva de punta a punta', async () => {
  const cambiar = (nueva) => api('PUT', '/auth/password', { token: tokenAdmin, cuerpo: { actual: ADMIN.inicial, nueva } });

  const sinEspecial = await cambiar('Admin12345');
  assert.equal(sinEspecial.status, 400);
  assert.match(motivo(sinEspecial), /carácter especial/);

  const conCorreo = await cambiar('Huellas.admin9');
  assert.equal(conCorreo.status, 400, 'contiene el usuario del correo');
  assert.match(motivo(conCorreo), /nombre ni tu correo/);

  assert.equal((await cambiar(ADMIN.nueva)).status, 200);
  assert.equal((await api('GET', '/auth/me', { token: tokenAdmin })).status, 401, 'cambiarla cierra la sesión anterior');
});

test('la administración configura y usa el segundo factor (TOTP)', async () => {
  const login = await api('POST', '/auth/login', { cuerpo: { email: ADMIN.email, password: ADMIN.nueva } });
  assert.equal(login.json.debeConfigurarMfa, true);
  const sinMfa = await api('GET', '/usuarios', { token: login.json.token });
  assert.equal(sinMfa.json.codigo, 'mfa_requerido');

  const { secreto } = (await api('POST', '/auth/mfa/iniciar', { token: login.json.token })).json;
  const activar = await api('POST', '/auth/mfa/activar', { token: login.json.token, cuerpo: { codigo: totp.codigoActual(secreto) } });
  assert.equal(activar.status, 200);
  assert.equal(activar.json.codigos.length, 8);

  const paso1 = await api('POST', '/auth/login', { cuerpo: { email: ADMIN.email, password: ADMIN.nueva } });
  assert.ok(paso1.json.desafio && !paso1.json.token, 'pide el segundo paso');
  // El código de la activación ya está gastado; el del siguiente intervalo
  // entra en la ventana de tolerancia y es nuevo.
  const codigo = totp.codigoPara(secreto, totp.contadorDe() + 1);
  const paso2 = await api('POST', '/auth/mfa/verificar', { cuerpo: { desafio: paso1.json.desafio, codigo } });
  assert.equal(paso2.status, 200, motivo(paso2));
  tokenAdmin = paso2.json.token;

  const yo = await api('GET', '/auth/me', { token: tokenAdmin });
  assert.equal(yo.json.inactividadMin, 60, 'expone el límite de inactividad');
});

test('las altas desde el panel también exigen contraseñas fuertes', async () => {
  const alta = (password) => api('POST', '/usuarios', {
    token: tokenAdmin,
    cuerpo: { nombre: 'Marta Gómez', email: 'marta@correo.com', telefono: null, rol: 'cliente', password, passwordActual: ADMIN.nueva },
  });
  assert.equal((await alta('marta123')).status, 400);
  assert.equal((await alta('Rq7!mZp2#Lw9xT4v')).status, 201);
});

test('la agenda se exporta como calendario con la sede de la base', async () => {
  const citas = (await api('GET', '/citas?limite=50', { token: tokenAdmin })).json.citas;
  assert.ok(citas.length > 0);

  const todas = await api('GET', '/citas/calendario.ics', { token: tokenAdmin, binario: true });
  assert.equal(todas.status, 200);
  assert.match(todas.tipo, /^text\/calendar/);
  assert.equal(todas.cabeceras.get('cache-control'), 'no-store');

  const una = await api('GET', `/citas/${citas[0].id}/calendario.ics`, { token: tokenAdmin, binario: true });
  const texto = una.buffer.toString('utf8').replace(/\r\n /g, '');
  assert.match(texto, new RegExp(`UID:cita-${citas[0].id}@`));
  assert.match(texto, /DTSTART:\d{8}T\d{6}Z/);
  assert.match(texto, /LOCATION:Huellitas de Amor — /);
});

test('la clienta baja los PDF de su mascota, de una sola página cada uno', async () => {
  const login1 = await api('POST', '/auth/login', { cuerpo: { email: CLIENTA.email, password: CLIENTA.inicial } });
  await api('PUT', '/auth/password', { token: login1.json.token, cuerpo: { actual: CLIENTA.inicial, nueva: CLIENTA.nueva } });
  tokenClienta = (await api('POST', '/auth/login', { cuerpo: { email: CLIENTA.email, password: CLIENTA.nueva } })).json.token;

  mascotaPropia = (await api('GET', '/mascotas', { token: tokenClienta })).json.mascotas[0];
  for (const tipo of ['historia', 'vacunacion']) {
    const pdf = await api('GET', `/reportes/pdf/${tipo}/${mascotaPropia.id}`, { token: tokenClienta, binario: true });
    assert.equal(pdf.status, 200, tipo);
    assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
    if (tipo === 'vacunacion') {
      const paginas = (pdf.buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
      assert.equal(paginas, 1, 'sin la hoja en blanco del pie');
    }
  }
});

test('la clienta no alcanza lo que no es suyo', async () => {
  const mascotas = (await api('GET', '/mascotas?limite=50', { token: tokenAdmin })).json.mascotas;
  const ajena = mascotas.find((m) => m.cliente_id !== mascotaPropia.cliente_id);
  assert.equal((await api('GET', `/reportes/pdf/historia/${ajena.id}`, { token: tokenClienta })).status, 403);

  const citas = (await api('GET', '/citas?limite=50', { token: tokenAdmin })).json.citas;
  const citaAjena = citas.find((c) => c.cliente_id !== mascotaPropia.cliente_id);
  if (citaAjena) {
    assert.equal((await api('GET', `/citas/${citaAjena.id}/calendario.ics`, { token: tokenClienta })).status, 403);
  }

  const busqueda = (await api('GET', '/mascotas?busqueda=a&limite=6', { token: tokenClienta })).json.mascotas;
  assert.ok(busqueda.every((m) => m.cliente_id === mascotaPropia.cliente_id), 'la búsqueda solo le devuelve las suyas');
});

test('el registro público pide sello y contraseña fuerte', async () => {
  const registrar = async (password, email) => {
    const { sello } = (await api('GET', '/sello')).json;
    await new Promise((r) => setTimeout(r, 3200)); // el sello exige unos segundos
    return api('POST', '/auth/registro', {
      cuerpo: { nombre: 'Pedro Pérez', email, telefono: null, password, rol: 'cliente', sitioWeb: '', selloFormulario: sello },
    });
  };
  assert.equal((await registrar('pedro1234', 'pedro@correo.com')).status, 400);
  const bien = await registrar('Cafe.Montana#8', 'pedro@correo.com');
  assert.equal(bien.status, 201, motivo(bien));
  assert.ok(bien.json.token);
});
