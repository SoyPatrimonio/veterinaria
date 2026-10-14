'use strict';

/**
 * Carga el esquema y los datos iniciales en Supabase.
 *
 *   npm run db:setup                 -> schema.sql + seed.sql + bucket de Storage
 *   npm run db:setup -- --solo-schema
 *   npm run db:setup -- --sin-bucket
 *
 * El archivo se trocea en sentencias y se envía por lotes. Mandarlo entero en
 * una sola consulta lo ejecuta como UNA transacción implícita, y las 460
 * tablas del esquema con sus índices y claves foráneas agotan los slots de
 * bloqueo del servidor: Postgres responde "out of shared memory" y no carga
 * nada. Por lotes cada uno confirma y libera sus bloqueos.
 *
 * El troceo respeta cadenas, comentarios y cuerpos $...$, que también
 * contienen puntos y coma; partir por ';' a secas rompería los triggers.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { db, supabase } = require('../src/config/env');
const { OPCIONES_CONEXION } = require('../src/config/database');

const RAIZ = path.resolve(__dirname, '../..');
const DIRECTORIO = path.join(RAIZ, 'database', 'supabase');
const SCHEMA = path.join(DIRECTORIO, 'schema.sql');
const SEED = path.join(DIRECTORIO, 'seed.sql');

// Sentencias por transacción. Bastante bajo para no acercarse al límite de
// bloqueos, bastante alto para no pagar una ida y vuelta por cada CREATE.
const POR_LOTE = 40;

function describirDestino(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(cadena no válida)';
  }
}

async function ejecutarArchivo(cliente, archivo) {
  // Se comprueba antes de leer para poder decir qué archivo falta y dónde se
  // esperaba. `readFileSync` a secas soltaría un ENOENT con la ruta completa y
  // una traza de Node, que no explica que el problema es el archivo del
  // proyecto y no la conexión con Supabase.
  if (!fs.existsSync(archivo)) {
    throw new Error(
      `No se encontró ${path.basename(archivo)} en ${path.dirname(archivo)}. ` +
      'Comprueba que la carpeta database/supabase esté completa.'
    );
  }

  const sql = fs.readFileSync(archivo, 'utf8');
  const sentencias = expandirDrops(dividirSentencias(sql));
  console.log(`→ ejecutando ${path.basename(archivo)}… (${sentencias.length} sentencias)`);

  let lote = [];
  let desde = 0;
  let hechas = 0;

  async function volcarLote() {
    if (!lote.length) return;
    const actual = lote;
    lote = [];
    let enCurso = '';
    await cliente.query('BEGIN');
    try {
      for (const sentencia of actual) {
        enCurso = sentencia;
        await cliente.query(sentencia);
      }
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw fallo(archivo, desde, enCurso, error);
    }
  }

  for (const sentencia of sentencias) {
    // Los DROP van sueltos y sin transacción: un CASCADE toma un bloqueo por
    // cada objeto dependiente, y agrupados agotan los slots del servidor
    // ("out of shared memory"). Solos, cada uno confirma y los libera.
    if (/^DROP\b/i.test(primeraPalabra(sentencia))) {
      await volcarLote();
      try {
        await cliente.query(sentencia);
      } catch (error) {
        throw fallo(archivo, hechas, sentencia, error);
      }
    } else {
      if (!lote.length) desde = hechas;
      lote.push(sentencia);
      if (lote.length >= POR_LOTE) await volcarLote();
    }
    hechas += 1;
    if (hechas % 100 === 0) console.log(`   ${hechas}/${sentencias.length}`);
  }
  await volcarLote();
  console.log(`   ${sentencias.length}/${sentencias.length}`);
}

/** Primera línea con contenido real, saltando los comentarios de cabecera. */
function primeraPalabra(sentencia) {
  return sentencia
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('--')) || '';
}

/**
 * Error con el nombre del archivo y la sentencia que falló.
 *
 * Postgres devuelve el motivo suelto y no dice cuál de las casi mil sentencias
 * lo provocó, que es lo único que sirve para arreglarlo.
 */
function fallo(archivo, posicion, sentencia, error) {
  return new Error(
    [
      `${path.basename(archivo)}: falló una sentencia (nº ${posicion + 1} aprox.).`,
      error.message,
      '',
      `Sentencia: ${primeraPalabra(sentencia).slice(0, 200)}`,
    ].join('\n')
  );
}

/**
 * Desglosa los DROP que nombran muchos objetos a la vez.
 *
 * El esquema arranca borrando cincuenta esquemas en un solo DROP ... CASCADE.
 * Esa sentencia bloquea todos los objetos de los cincuenta dentro de la misma
 * transacción y el servidor se queda sin slots de bloqueo antes de crear nada.
 * Uno por uno hace exactamente lo mismo y cabe de sobra.
 */
function expandirDrops(sentencias) {
  const salida = [];
  for (const sentencia of sentencias) {
    const texto = primeraPalabra(sentencia) === '' ? '' : sentencia;
    const limpio = texto.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
    const m = /^DROP (SCHEMA|TABLE) IF EXISTS (.+) CASCADE$/i.exec(limpio);
    if (!m) { salida.push(sentencia); continue; }

    const nombres = m[2].split(',').map((x) => x.trim()).filter(Boolean);
    if (nombres.length <= 1) { salida.push(sentencia); continue; }
    for (const nombre of nombres) {
      salida.push(`DROP ${m[1].toUpperCase()} IF EXISTS ${nombre} CASCADE`);
    }
  }
  return salida;
}

/**
 * Divide un script SQL en sentencias sueltas.
 *
 * No vale partir por ';' a secas: el punto y coma también aparece dentro de
 * cadenas, de comentarios y de los cuerpos $$...$$ de funciones y bloques DO.
 * Se recorre el texto una vez llevando la cuenta de en qué contexto se está.
 */
function dividirSentencias(sql) {
  const sentencias = [];
  let actual = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    const dos = sql.slice(i, i + 2);

    if (dos === '--') {
      const fin = sql.indexOf('\n', i);
      const hasta = fin === -1 ? n : fin;
      actual += sql.slice(i, hasta);
      i = hasta;
      continue;
    }
    if (dos === '/*') {
      const fin = sql.indexOf('*/', i + 2);
      const hasta = fin === -1 ? n : fin + 2;
      actual += sql.slice(i, hasta);
      i = hasta;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j += 1; break; }
        j += 1;
      }
      actual += sql.slice(i, j);
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && sql[j] !== '"') j += 1;
      j += 1;
      actual += sql.slice(i, j);
      i = j;
      continue;
    }
    const etiqueta = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
    if (etiqueta) {
      const marca = etiqueta[0];
      const fin = sql.indexOf(marca, i + marca.length);
      const hasta = fin === -1 ? n : fin + marca.length;
      actual += sql.slice(i, hasta);
      i = hasta;
      continue;
    }
    if (c === ';') {
      const texto = actual.trim();
      if (texto) sentencias.push(texto);
      actual = '';
      i += 1;
      continue;
    }
    actual += c;
    i += 1;
  }

  const resto = actual.trim();
  if (resto) sentencias.push(resto);
  // Los trozos que solo son comentarios no son sentencias.
  return sentencias.filter((t) => t.split('\n').some((l) => l.trim() && !l.trim().startsWith('--')));
}

/** Cierra la conexión sin tapar el motivo por el que se estaba saliendo. */
async function cerrar(cliente) {
  try {
    await cliente.end();
  } catch (error) {
    console.warn(`· la conexión no cerró limpiamente: ${error.message}`);
  }
}

async function crearBucket() {
  const storage = require('../src/services/storage.service');
  if (!storage.hayStorage) {
    console.log('· Storage: sin SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, se omite.');
    console.log('  Las fotos de mascotas se guardarán en la carpeta local uploads/.');
    return;
  }
  const resultado = await storage.asegurarBucket();
  console.log(
    resultado.creado
      ? `· Storage: bucket público "${storage.bucket}" creado.`
      : `· Storage: bucket "${storage.bucket}" ${resultado.motivo}.`
  );
}

async function main() {
  if (!db.url) {
    console.error('Falta DATABASE_URL.');
    console.error('Cópiala del panel de Supabase: Project Settings → Database → Connection string → URI');
    console.error('y pégala en el archivo .env de la raíz del proyecto.');
    process.exit(1);
  }

  const soloSchema = process.argv.includes('--solo-schema');
  const sinBucket = process.argv.includes('--sin-bucket');

  console.log(`Servidor: ${describirDestino(db.url)}`);

  const cliente = new Client({
    connectionString: db.url,
    ssl: db.ssl ? { rejectUnauthorized: false } : false,
    // Mismo search_path que usa la aplicación, para que las comprobaciones
    // del final encuentren las tablas sin escribir el esquema delante.
    options: OPCIONES_CONEXION,
    application_name: 'huellitas-setup',
  });

  try {
    await cliente.connect();
  } catch (error) {
    console.error('\nNo se pudo conectar a la base:', error.message);
    console.error('Comprueba que DATABASE_URL sea correcta y que el proyecto de Supabase esté activo.');
    process.exit(1);
  }

  try {
    await ejecutarArchivo(cliente, SCHEMA);
    if (!soloSchema) await ejecutarArchivo(cliente, SEED);

    const { rows } = await cliente.query(
      `SELECT
         (SELECT COUNT(*) FROM usuarios)     AS usuarios,
         (SELECT COUNT(*) FROM servicios)    AS servicios,
         (SELECT COUNT(*) FROM veterinarios) AS veterinarios,
         (SELECT COUNT(*) FROM mascotas)     AS mascotas`
    );

    console.log('\nListo. La base quedó cargada en Supabase.');
    console.log(
      `  usuarios: ${rows[0].usuarios} · veterinarios: ${rows[0].veterinarios} ` +
      `· servicios: ${rows[0].servicios} · mascotas: ${rows[0].mascotas}`
    );

    if (!soloSchema) {
      console.log('\nCuentas de prueba (piden contraseña nueva al entrar):');
      console.log('  admin@huellitas.com      Admin1234');
      console.log('  valentina@huellitas.com  Vet12345');
      console.log('  daniela@correo.com       Cliente123');
      console.log('\n  Estas contraseñas están en el repositorio, así que no valen como');
      console.log('  contraseña real: las siete cuentas nacen obligadas a cambiarla en');
      console.log('  el primer ingreso y hasta entonces su sesión no abre nada más.');
    }
  } catch (error) {
    console.error('\nFalló la carga:', error.message);
    if (error.position) console.error(`  posición ${error.position} del archivo`);
    if (error.detail) console.error(`  detalle: ${error.detail}`);
    await cerrar(cliente);
    process.exit(1);
  }

  await cerrar(cliente);

  if (!sinBucket) {
    try {
      await crearBucket();
    } catch (error) {
      console.warn(`· Storage: no se pudo preparar el bucket (${error.message}).`);
      console.warn('  Créalo a mano en Supabase → Storage, público y llamado ' + supabase.bucket + '.');
    }
  }
}

// Sin este catch, cualquier fallo fuera de los try de main() —un archivo que no
// está, un módulo que no carga— saldría como "unhandled rejection": una traza
// de Node sin explicación y, según la versión, con código de salida 0, que hace
// pasar por buena una migración que no se ejecutó.
main().catch((error) => {
  console.error('\nNo se pudo preparar la base:', error.message);
  process.exit(1);
});
