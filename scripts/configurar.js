'use strict';

/**
 * Asistente de configuración:
 *
 *     npm run configurar
 *
 * Pide los datos de Supabase y Vercel, comprueba que sirvan de verdad y los
 * escribe en el .env. Así las credenciales no tienen que pasar por ningún lado
 * más que tu propia terminal.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const RAIZ = path.resolve(__dirname, '..');
const ARCHIVO = path.join(RAIZ, '.env');
const ARCHIVO_DESPLIEGUE = path.join(RAIZ, '.env.deploy');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (texto) => new Promise((r) => rl.question(texto, (v) => r(v.trim())));

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;
const negrita = (t) => `\x1b[1m${t}\x1b[0m`;

/* ------------------------------------------------------------------
   Lectura y escritura del .env conservando comentarios
   ------------------------------------------------------------------ */

function leerEnv() {
  if (!fs.existsSync(ARCHIVO)) return '';
  return fs.readFileSync(ARCHIVO, 'utf8');
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

/* ------------------------------------------------------------------
   Comprobaciones
   ------------------------------------------------------------------ */

async function probarBaseDatos(url) {
  const { Client } = require('pg');
  const cliente = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await cliente.connect();
  const { rows } = await cliente.query('SELECT current_database() AS base, version() AS version');
  await cliente.end();
  return rows[0];
}

async function probarStorage(url, clave) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, clave, { auth: { persistSession: false } });
  const { error } = await supabase.storage.listBuckets();
  if (error) throw new Error(error.message);
}

async function probarVercel(token) {
  // Se consulta /v9/projects y no /v2/user: los tokens de equipo (vcp_…) no
  // están asociados a un usuario y darían 404 en el endpoint de usuario.
  const respuesta = await fetch('https://api.vercel.com/v9/projects?limit=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) throw new Error(`la API de Vercel respondió ${respuesta.status}`);
  const datos = await respuesta.json();
  const cuenta = datos.projects?.[0]?.accountId;
  return cuenta ? `cuenta ${cuenta}` : 'cuenta sin proyectos todavía';
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log(negrita('\nConfiguración de Huellitas de Amor\n'));
  console.log('Se te van a pedir tres cosas. Puedes dejar en blanco las opcionales.\n');

  let env = leerEnv();

  /* --- 1. Base de datos ------------------------------------------- */

  console.log(negrita('1. Cadena de conexión de Supabase'));
  console.log(gris('   Panel de Supabase → tu proyecto → botón "Connect" (arriba)'));
  console.log(gris('   → pestaña "Connection string" → tipo "Transaction pooler"'));
  console.log(gris('   Empieza por postgresql:// y termina en :6543/postgres'));
  console.log(gris('   OJO: cambia [YOUR-PASSWORD] por la contraseña real de la base.\n'));

  for (;;) {
    const url = await preguntar('   DATABASE_URL: ');
    if (!url) {
      console.log(rojo('   Sin esto no se puede continuar.\n'));
      continue;
    }
    if (url.includes('[YOUR-PASSWORD]') || url.includes('[TU-CONTRASENA]')) {
      console.log(rojo('   Todavía tiene el marcador de la contraseña. Reemplázalo por la real.\n'));
      continue;
    }
    if (!/^postgres(ql)?:\/\//.test(url)) {
      console.log(rojo('   Eso no parece una cadena de PostgreSQL (debe empezar por postgresql://).\n'));
      continue;
    }

    process.stdout.write('   probando la conexión… ');
    try {
      const info = await probarBaseDatos(url);
      console.log(verde('conectado'), gris(`(${info.base}, ${info.version.split(',')[0]})`));
      env = fijar(env, 'DATABASE_URL', url);
      break;
    } catch (error) {
      console.log(rojo('falló'));
      console.log(rojo(`   ${error.message}`));
      if (/password authentication/i.test(error.message)) {
        console.log(gris('   La contraseña no es la correcta. Puedes restablecerla en'));
        console.log(gris('   Project Settings → Database → Reset database password.\n'));
      } else if (/ENOTFOUND|EAI_AGAIN/i.test(error.message)) {
        console.log(gris('   No se resolvió el servidor: revisa que copiaste la cadena completa.\n'));
      } else {
        console.log('');
      }
    }
  }

  /* --- 2. Storage -------------------------------------------------- */

  console.log(negrita('\n2. Supabase Storage (para las fotos de las mascotas)'));
  console.log(gris('   Panel de Supabase → Project Settings → API'));
  console.log(gris('   Déjalo en blanco si por ahora no quieres subir fotos.\n'));

  const urlProyecto = await preguntar('   SUPABASE_URL (https://xxxx.supabase.co): ');
  if (urlProyecto) {
    const clave = await preguntar('   SUPABASE_SERVICE_ROLE_KEY (la clave service_role): ');
    if (clave) {
      process.stdout.write('   probando el acceso a Storage… ');
      try {
        await probarStorage(urlProyecto, clave);
        console.log(verde('correcto'));
        env = fijar(env, 'SUPABASE_URL', urlProyecto);
        env = fijar(env, 'SUPABASE_SERVICE_ROLE_KEY', clave);
      } catch (error) {
        console.log(rojo('falló'));
        console.log(rojo(`   ${error.message}`));
        console.log(gris('   Se guarda igual; podrás corregirlo después en el .env.'));
        env = fijar(env, 'SUPABASE_URL', urlProyecto);
        env = fijar(env, 'SUPABASE_SERVICE_ROLE_KEY', clave);
      }
    }
  } else {
    console.log(gris('   Omitido: las fotos se guardarán en la carpeta local uploads/.'));
  }

  /* --- 3. Vercel --------------------------------------------------- */

  console.log(negrita('\n3. Token de Vercel (para publicar el sitio)'));
  console.log(gris('   Se crea en: https://vercel.com/account/tokens'));
  console.log(gris('   Scope: tu cuenta. Expiración: la que quieras.'));
  console.log(gris('   Déjalo en blanco si prefieres usar `npx vercel login`.\n'));

  const token = await preguntar('   VERCEL_TOKEN: ');
  if (token) {
    process.stdout.write('   comprobando el token… ');
    try {
      const quien = await probarVercel(token);
      console.log(verde('válido'), gris(`(${quien})`));
      guardarTokenDespliegue(ARCHIVO_DESPLIEGUE, token);
      console.log(gris('   Guardado en .env.deploy (aparte del .env, que carga la aplicación).'));
    } catch (error) {
      console.log(rojo('no sirve'));
      console.log(rojo(`   ${error.message}`));
      console.log(gris('   No se guarda. Puedes usar `npx vercel login` en su lugar.'));
    }
  } else {
    console.log(gris('   Omitido: se usará la sesión de `npx vercel login`.'));
  }

  /* --- Guardar ----------------------------------------------------- */

  env = fijar(env, 'NODE_ENV', 'development');
  fs.writeFileSync(ARCHIVO, env, 'utf8');

  console.log(negrita('\n✓ Guardado en .env\n'));
  console.log('Siguiente paso:');
  console.log(negrita('   npm run deploy'));
  console.log(gris('   (carga la base en Supabase, sube las variables y publica en Vercel)\n'));

  rl.close();
}

main().catch((error) => {
  console.error(rojo(`\nError: ${error.message}`));
  rl.close();
  process.exit(1);
});
