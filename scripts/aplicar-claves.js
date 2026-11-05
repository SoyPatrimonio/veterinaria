'use strict';

/**
 * Lee PEGAR-CLAVES-AQUI.txt, arma el .env y borra el archivo de claves.
 *
 *     npm run aplicar
 *
 * La cadena de conexión se construye a partir del identificador del proyecto
 * de Supabase, el servidor del pooler y la contraseña. La contraseña se
 * codifica para la URL: si lleva @, :, / o #, pegarla en crudo rompería la
 * cadena de conexión.
 *
 * Ningún dato del proyecto vive en este archivo: el código es el mismo para
 * cualquier instalación. Se buscan, en este orden, en el archivo de claves,
 * en las variables de entorno y en el .env que ya exista (SUPABASE_URL y
 * DATABASE_URL), para que volver a ejecutarlo solo pida la contraseña.
 *
 *     SUPABASE_REF=<identificador>     (o SUPABASE_URL=https://<identificador>.supabase.co)
 *     SUPABASE_POOLER_HOST=aws-0-<REGION>.pooler.supabase.com
 *     DB_PASSWORD=...
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const CLAVES = path.join(RAIZ, 'PEGAR-CLAVES-AQUI.txt');
const ENV = path.join(RAIZ, '.env');
const ENV_DESPLIEGUE = path.join(RAIZ, '.env.deploy');

// El pooler en modo transacción, el que aguanta las funciones serverless.
const PUERTO_POR_DEFECTO = 6543;

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

function leerClave(texto, nombre) {
  // Solo las líneas que empiezan por el nombre; los comentarios van con "--".
  const linea = texto
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith('--'))
    .find((l) => l.trimStart().startsWith(`${nombre}=`));
  if (!linea) return '';
  return linea.slice(linea.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

/** Lee una variable de un texto con formato .env (sin comentarios). */
function leerEnv(texto, nombre) {
  const linea = String(texto || '')
    .split(/\r?\n/)
    .find((l) => !l.trimStart().startsWith('#') && l.trimStart().startsWith(`${nombre}=`));
  if (!linea) return '';
  return linea.slice(linea.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

/** El identificador sale de https://<ref>.supabase.co, o del usuario postgres.<ref>. */
function refDesdeUrl(valor) {
  const enUrl = /^https:\/\/([a-z0-9]{10,40})\.supabase\.co\/?$/i.exec(String(valor || '').trim());
  return enUrl ? enUrl[1] : '';
}

/**
 * Identificador del proyecto, servidor y puerto del pooler.
 *
 * Las fuentes van de más a menos prioritaria: el archivo de claves que se
 * acaba de pegar, el entorno y el .env anterior. Devuelve también qué falta, para
 * poder explicarlo en vez de construir una cadena de conexión a medias.
 */
function datosProyecto({ claves = '', entorno = {}, envAnterior = '' } = {}) {
  const de = (nombre) => leerClave(claves, nombre) || entorno[nombre] || leerEnv(envAnterior, nombre);

  let ref = de('SUPABASE_REF') || refDesdeUrl(de('SUPABASE_URL'));
  let host = de('SUPABASE_POOLER_HOST');
  let puerto = Number(de('SUPABASE_POOLER_PUERTO')) || 0;

  // Una instalación anterior ya trae los tres datos dentro de su DATABASE_URL.
  const anterior = entorno.DATABASE_URL || leerEnv(envAnterior, 'DATABASE_URL');
  const partes = /^postgres(?:ql)?:\/\/postgres\.([a-z0-9]+):[^@]*@([^:/]+):(\d+)\//i.exec(anterior || '');
  if (partes && !/x{6,}/i.test(partes[1])) {
    ref = ref || partes[1];
    host = host || partes[2];
    puerto = puerto || Number(partes[3]);
  }

  const faltan = [];
  if (!/^[a-z0-9]{10,40}$/i.test(ref || '')) faltan.push('SUPABASE_REF (o SUPABASE_URL)');
  if (!/^[a-z0-9.-]+\.supabase\.com$/i.test(host || '')) faltan.push('SUPABASE_POOLER_HOST');

  return { ref, host, puerto: puerto || PUERTO_POR_DEFECTO, faltan };
}

function fijar(contenido, clave, valor) {
  const linea = `${clave}=${valor}`;
  const patron = new RegExp(`^${clave}=.*$`, 'm');
  return patron.test(contenido) ? contenido.replace(patron, linea) : `${contenido.trimEnd()}\n${linea}\n`;
}

/**
 * El token de despliegue se guarda en su propio archivo, no en el .env.
 *
 * El .env lo carga también la aplicación, así que lo que se escriba ahí acaba
 * en el process.env del proceso que atiende peticiones. Este token no lo usa
 * ninguna ruta y da control total de la cuenta de Vercel, así que vive en
 * .env.deploy, que solo lee scripts/deploy.js.
 */
function guardarTokenDespliegue(destino, token) {
  const anterior = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : '';
  const cabecera = anterior
    ? ''
    : '# Credencial de despliegue. NO subir a Git.\n' +
      '# Lo lee SOLO scripts/deploy.js; la aplicación no carga este archivo.\n' +
      '# Se crea en: https://vercel.com/account/tokens\n\n';

  const patron = /^VERCEL_TOKEN=.*$/m;
  const cuerpo = patron.test(anterior)
    ? anterior.replace(patron, `VERCEL_TOKEN=${token}`)
    : `${cabecera}${anterior.trimEnd()}${anterior.trimEnd() ? '\n' : ''}VERCEL_TOKEN=${token}\n`;

  fs.writeFileSync(destino, cuerpo, 'utf8');
}

async function probarConexion(url) {
  const { Client } = require('pg');
  const cliente = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await cliente.connect();
  const { rows } = await cliente.query('SELECT current_database() AS base');
  await cliente.end();
  return rows[0].base;
}

async function probarVercel(token) {
  // Se consulta /v9/projects y no /v2/user: los tokens de equipo (vcp_…) no
  // están asociados a un usuario y darían 404 en el endpoint de usuario.
  const r = await fetch('https://api.vercel.com/v9/projects?limit=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`la API de Vercel respondió ${r.status}`);
  const d = await r.json();
  const cuenta = d.projects?.[0]?.accountId;
  return cuenta ? `cuenta ${cuenta}` : 'cuenta sin proyectos todavía';
}

async function principal() {
  if (!fs.existsSync(CLAVES)) {
    console.error(rojo(`No existe ${path.basename(CLAVES)}.`));
    process.exit(1);
  }

  const texto = fs.readFileSync(CLAVES, 'utf8');
  const password = leerClave(texto, 'DB_PASSWORD');
  const tokenVercel = leerClave(texto, 'VERCEL_TOKEN');
  const claveServicio = leerClave(texto, 'SUPABASE_SERVICE_ROLE_KEY');

  if (!password) {
    console.error(rojo('Falta DB_PASSWORD en el archivo de claves.'));
    process.exit(1);
  }

  if (/^postgres(ql)?:\/\//.test(password)) {
    console.error(rojo('Pegaste la cadena completa en DB_PASSWORD; se necesita solo la contraseña.'));
    console.error(gris('   Es el trozo entre los dos puntos y la arroba.'));
    process.exit(1);
  }

  const envAnterior = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  const proyecto = datosProyecto({ claves: texto, entorno: process.env, envAnterior });
  if (proyecto.faltan.length) {
    console.error(rojo(`Faltan datos del proyecto de Supabase: ${proyecto.faltan.join(', ')}.`));
    console.error(gris('  Agrégalos al archivo de claves. Están en el panel de Supabase:'));
    console.error(gris('  Project Settings → Database → Connection string (modo Transaction).'));
    console.error(gris('  En postgresql://postgres.REF:...@HOST:6543/postgres, REF es SUPABASE_REF'));
    console.error(gris('  y HOST es SUPABASE_POOLER_HOST.'));
    process.exit(1);
  }
  const { ref, host, puerto } = proyecto;

  const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:${puerto}/postgres`;

  process.stdout.write('Probando la conexión con Supabase… ');
  try {
    const base = await probarConexion(url);
    console.log(verde('conectado'), gris(`(${base})`));
  } catch (error) {
    console.log(rojo('falló'));
    console.error(rojo(`  ${error.message}`));
    if (/password authentication/i.test(error.message)) {
      console.error(gris('  La contraseña no coincide. Restablécela en el panel:'));
      console.error(gris('  Project Settings → Database → Reset database password'));
    }
    process.exit(1);
  }

  let env = envAnterior || fs.readFileSync(path.join(RAIZ, '.env.example'), 'utf8');
  env = fijar(env, 'DATABASE_URL', url);
  env = fijar(env, 'SUPABASE_URL', `https://${ref}.supabase.co`);

  if (claveServicio) {
    env = fijar(env, 'SUPABASE_SERVICE_ROLE_KEY', claveServicio);
    console.log(verde('✓'), 'clave de Storage guardada');
  } else {
    console.log(gris('· sin clave de Storage: las fotos irán a la carpeta local uploads/'));
  }

  if (tokenVercel) {
    process.stdout.write('Comprobando el token de Vercel… ');
    try {
      const quien = await probarVercel(tokenVercel);
      console.log(verde('válido'), gris(`(${quien})`));
      guardarTokenDespliegue(ENV_DESPLIEGUE, tokenVercel);
      console.log(gris('  Guardado en .env.deploy, aparte del .env que carga la aplicación.'));
    } catch (error) {
      console.log(rojo('no sirve'));
      console.error(rojo(`  ${error.message}`));
      console.error(gris('  No se guarda. Crea otro en vercel.com/account/tokens'));
    }
  } else {
    console.log(gris('· sin token de Vercel: habrá que usar `npx vercel login`'));
  }

  fs.writeFileSync(ENV, env, 'utf8');

  // Las credenciales ya están en el .env: el archivo de pegado sobra.
  fs.rmSync(CLAVES);

  console.log(verde('\n✓ .env actualizado y archivo de claves borrado.'));
  console.log('\nSiguiente:  npm run deploy');
}

module.exports = { datosProyecto, leerEnv, refDesdeUrl };

if (require.main === module) principal().catch((error) => {
  // Sin esto el fallo saldría como "unhandled rejection", y como el archivo de
  // claves solo se borra al final, no quedaría claro si alcanzó a guardarse
  // algo en el .env o si hay que volver a empezar.
  console.error(rojo(`\nNo se pudieron aplicar las claves: ${error.message}`));
  console.error('El archivo de claves sigue donde estaba; corrige y vuelve a ejecutarlo.');
  process.exit(1);
});
