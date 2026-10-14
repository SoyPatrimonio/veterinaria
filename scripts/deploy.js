'use strict';

/**
 * Despliegue completo en un solo comando:
 *
 *     npm run deploy
 *
 * Hace, en este orden:
 *   1. comprueba que el .env tenga lo necesario;
 *   2. carga el esquema y los datos en Supabase y crea el bucket de Storage;
 *   3. ajusta la configuración del proyecto de Vercel;
 *   4. sube las variables de entorno;
 *   5. despliega a producción;
 *   6. comprueba que el sitio y la API respondan.
 *
 * Los pasos 3 y 4 usan la API de Vercel y no el CLI a propósito: un token de
 * proyecto (los que empiezan por vcp_) no está asociado a un usuario, así que
 * `vercel link` y `vercel env add` fallan con "User not found". La API sí lo
 * acepta, y para el despliegue basta con dejar escrito .vercel/project.json.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const RUTA_ENV = path.join(RAIZ, '.env');
const RUTA_ENV_DESPLIEGUE = path.join(RAIZ, '.env.deploy');

/**
 * Dos archivos, y la separación es a propósito.
 *
 * El `.env` lo carga también la aplicación (backend/src/config/env.js), así
 * que todo lo que esté ahí acaba en el `process.env` del proceso que atiende
 * peticiones. El VERCEL_TOKEN no pinta nada ahí: no lo usa ninguna ruta, y da
 * control total de la cuenta de Vercel —desplegar, leer y cambiar las
 * variables de todos los proyectos, mover dominios—. Vive aparte, en
 * `.env.deploy`, que solo lee este script.
 */
require('dotenv').config({ path: RUTA_ENV });
require('dotenv').config({ path: RUTA_ENV_DESPLIEGUE });

const API = 'https://api.vercel.com';

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

function titulo(texto) {
  console.log(`\n\x1b[1m${texto}\x1b[0m`);
}

function abortar(mensaje, ayuda) {
  console.error(`\n${rojo(mensaje)}`);
  if (ayuda) console.error(ayuda);
  process.exit(1);
}

/* ------------------------------------------------------------------
   Variables que viajan al despliegue
   ------------------------------------------------------------------ */

const token = process.env.VERCEL_TOKEN || '';

const VARIABLES = {
  DATABASE_URL: process.env.DATABASE_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_BUCKET: process.env.SUPABASE_BUCKET || 'mascotas',
  JWT_SECRET: process.env.JWT_SECRET,
  // Cifra en la base el secreto del segundo factor. Si no viaja, en Vercel se
  // derivaría de JWT_SECRET y lo guardado allí dejaría de leerse el día que
  // JWT_SECRET se rote.
  CIFRADO_CLAVE: process.env.CIFRADO_CLAVE,
  JWT_EXPIRES: process.env.JWT_EXPIRES || '8h',
  JWT_EXPIRES_ADMIN: process.env.JWT_EXPIRES_ADMIN || '2h',
  SESION_INACTIVIDAD_MIN: process.env.SESION_INACTIVIDAD_MIN || '60',
  MFA_ROLES: process.env.MFA_ROLES || 'admin',
  // Cuenta de correo por la que sale el código del segundo factor. Si no
  // viaja, en Vercel el envío queda apagado y los roles de MFA_ROLES no
  // podrían entrar sin la aplicación de códigos.
  CORREO_USUARIO: process.env.CORREO_USUARIO,
  CORREO_PASSWORD: process.env.CORREO_PASSWORD,
  CORREO_HOST: process.env.CORREO_HOST || 'smtp.gmail.com',
  CORREO_PUERTO: process.env.CORREO_PUERTO || '465',
  CORREO_NOMBRE: process.env.CORREO_NOMBRE || 'Huellitas de Amor',
  CORREO_REMITENTE: process.env.CORREO_REMITENTE || process.env.CORREO_USUARIO,
  NODE_ENV: 'production',
  // Se llama CLINICA_TZ y no TZ porque Vercel reserva ese nombre.
  // De dónde cuelga el sitio. La usa el enlace del correo de recuperación de
  // contraseña; sin ella ese enlace se arma con el encabezado Host, que lo
  // escribe quien llama a la API.
  APP_URL: process.env.APP_URL,
  CLINICA_TZ: process.env.CLINICA_TZ || 'America/Bogota',
  DB_POOL: process.env.DB_POOL || '3',
  DB_SSL: process.env.DB_SSL || 'require',
  CLINICA_APERTURA: process.env.CLINICA_APERTURA || '08:00',
  CLINICA_CIERRE: process.env.CLINICA_CIERRE || '20:00',
  CLINICA_DIAS: process.env.CLINICA_DIAS || '1,2,3,4,5,6,0',
  CITAS_ANTICIPACION_MIN: process.env.CITAS_ANTICIPACION_MIN || '60',
  CITAS_DIAS_MAX: process.env.CITAS_DIAS_MAX || '60',
  UPLOAD_MAX_BYTES: process.env.UPLOAD_MAX_BYTES || '3145728',
};

/* ------------------------------------------------------------------
   1. Comprobaciones previas
   ------------------------------------------------------------------ */

titulo('1. Revisando la configuración');

if (!fs.existsSync(path.join(RAIZ, '.env'))) {
  abortar('No existe el archivo .env.', 'Ejecuta primero: npm run configurar');
}
if (!VARIABLES.DATABASE_URL) {
  abortar('Falta DATABASE_URL en el .env.', 'Ejecuta: npm run configurar');
}
if (!VARIABLES.JWT_SECRET || VARIABLES.JWT_SECRET.length < 32) {
  abortar('JWT_SECRET falta o es demasiado corto (mínimo 32 caracteres).');
}
if (!VARIABLES.CIFRADO_CLAVE || VARIABLES.CIFRADO_CLAVE.length < 32) {
  abortar(
    'CIFRADO_CLAVE falta o es demasiado corta (mínimo 32 caracteres).',
    'Genérala con el mismo comando del JWT_SECRET y déjala FIJA:\n' +
    `  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"\n` +
    'Cambiarla deja ilegibles los secretos del segundo factor ya guardados.'
  );
}
if (!token) {
  abortar(
    'Falta VERCEL_TOKEN en el .env.deploy.',
    'Va en su propio archivo y no en el .env, porque ese lo carga también la\n' +
    'aplicación y este token da control total de la cuenta de Vercel.\n' +
    'Crea el archivo .env.deploy en la raíz con una sola línea:\n' +
    '  VERCEL_TOKEN=...\n' +
    'El token se saca de https://vercel.com/account/tokens'
  );
}

// Sin APP_URL el correo de recuperación arma su enlace con el encabezado Host
// de la petición, y ese lo escribe quien llama. No se aborta —el resto del
// despliegue es correcto— pero tiene que verse.
if (!VARIABLES.APP_URL) {
  console.warn(
    `\n${rojo('Aviso:')} falta APP_URL en el .env.\n` +
    'El enlace del correo de recuperación de contraseña se armará con el\n' +
    'encabezado Host de cada petición, que lo escribe quien la manda.\n' +
    'Añádela con la dirección pública del sitio, por ejemplo:\n' +
    '  APP_URL=https://huellitasdeamorvet.vercel.app'
  );
}

const enlace = path.join(RAIZ, '.vercel', 'project.json');
if (!fs.existsSync(enlace)) {
  abortar(
    'No existe .vercel/project.json: el proyecto no está enlazado con Vercel.',
    'Créalo con el id del proyecto y el de la cuenta:\n' +
    '  {"projectId": "prj_…", "orgId": "team_…"}\n' +
    'Los dos salen de: https://api.vercel.com/v9/projects'
  );
}

const { projectId: PRJ, orgId: TEAM } = JSON.parse(fs.readFileSync(enlace, 'utf8'));
const cabeceras = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

console.log(`  proyecto  ${PRJ}`);
console.log(`  cuenta    ${TEAM}`);
console.log(`  Storage   ${VARIABLES.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗ (no se podrán subir fotos)'}`);
console.log(
  `  Correo    ${VARIABLES.CORREO_USUARIO && VARIABLES.CORREO_PASSWORD
    ? `✓ ${VARIABLES.CORREO_USUARIO}`
    : '✗ (el código de ingreso no se podrá enviar)'}`
);

/* ------------------------------------------------------------------ */

(async () => {
  /* --- 2. Base de datos ------------------------------------------- */

  // Recargar el esquema BORRA todas las tablas y vuelve a poner los datos de
  // ejemplo. Un despliegue normal no debe tocar la base, o cada publicación se
  // llevaría por delante los clientes y las citas reales. Por eso hay que
  // pedirlo a propósito:  npm run deploy -- --recargar-base
  const recargarBase = process.argv.includes('--recargar-base');

  if (recargarBase) {
    titulo('2. Recargando la base de datos en Supabase');
    console.log(rojo('  ATENCIÓN: esto borra las tablas y vuelve a dejar los datos de ejemplo.'));

    const migracion = spawnSync(process.execPath, [path.join(RAIZ, 'backend/scripts/setup-db.js')], {
      cwd: RAIZ,
      stdio: 'inherit',
    });
    if (migracion.status !== 0) abortar('Falló la carga de la base de datos.');
  } else {
    titulo('2. Base de datos');
    console.log(`  ${gris('se deja como está')}`);
    console.log(gris('  (para recrearla desde cero: npm run deploy -- --recargar-base)'));
  }

  /* --- 3. Ajustes del proyecto ------------------------------------- */

  titulo('3. Ajustando el proyecto de Vercel');

  // - framework null: si queda un preset (por ejemplo "express" heredado de una
  //   plantilla), Vercel busca un servidor dentro de la carpeta estática y falla.
  // - los command/directory a null: manda vercel.json.
  // - ssoProtection null: por defecto Vercel deja el sitio detrás de su pantalla
  //   de inicio de sesión, y entonces ni la API ni la página son públicas.
  const ajustes = await fetch(`${API}/v9/projects/${PRJ}?teamId=${TEAM}`, {
    method: 'PATCH',
    headers: cabeceras,
    body: JSON.stringify({
      framework: null,
      buildCommand: null,
      outputDirectory: null,
      installCommand: null,
      devCommand: null,
      rootDirectory: null,
      ssoProtection: null,
    }),
  });
  if (!ajustes.ok) {
    abortar(`No se pudo ajustar el proyecto (${ajustes.status}).`, (await ajustes.text()).slice(0, 300));
  }
  const proyecto = await ajustes.json();
  console.log(`  ${verde('✓')} preset "Other", sin protección de acceso  ${gris(`(${proyecto.name})`)}`);

  /* --- 4. Variables de entorno ------------------------------------- */

  titulo('4. Subiendo las variables de entorno');

  const existentes = await (await fetch(`${API}/v9/projects/${PRJ}/env?teamId=${TEAM}`, { headers: cabeceras })).json();
  for (const v of existentes.envs || []) {
    // Se borran las que vamos a volver a poner, para que no queden valores viejos.
    if (VARIABLES[v.key] !== undefined) {
      await fetch(`${API}/v9/projects/${PRJ}/env/${v.id}?teamId=${TEAM}`, { method: 'DELETE', headers: cabeceras });
    }
  }

  let fallosEnv = 0;
  for (const [clave, valor] of Object.entries(VARIABLES)) {
    if (!valor) {
      console.log(`  ${gris('·')} ${clave}: vacía, se omite`);
      continue;
    }
    const alta = await fetch(`${API}/v10/projects/${PRJ}/env?teamId=${TEAM}`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({
        key: clave,
        value: String(valor),
        type: 'encrypted',
        target: ['production', 'preview'],
      }),
    });
    if (alta.ok) {
      console.log(`  ${verde('✓')} ${clave}`);
    } else {
      fallosEnv++;
      console.log(`  ${rojo('✗')} ${clave}  ${(await alta.text()).slice(0, 160)}`);
    }
  }
  if (fallosEnv) abortar(`${fallosEnv} variables no se pudieron guardar.`);

  /* --- 5. Sello de versión en el CSS y el JS -------------------------- */

  titulo('5. Sellando la versión de los archivos estáticos');
  const version = sellarEstaticos();
  console.log(`  ${verde('✓')} ?v=${version}  ${gris('(' + version.length + ' hex del contenido de css/ y js/)')}`);

  /* --- 6. Despliegue ------------------------------------------------ */

  titulo('6. Desplegando a producción');

  // El token va por el entorno (VERCEL_TOKEN, que el CLI reconoce) y no como
  // argumento: así no queda escrito en la línea de comandos ni en el historial.
  const despliegue = spawnSync('npx --yes vercel@latest deploy --prod --yes', {
    cwd: RAIZ,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, VERCEL_TOKEN: token },
  });
  const salida = `${despliegue.stdout || ''}${despliegue.stderr || ''}`;

  if (despliegue.status !== 0) {
    console.log(salida.trim().slice(-1500));
    abortar('Falló el despliegue.');
  }
  console.log(`  ${verde('✓')} publicado`);

  // La URL estable del proyecto, no la del despliegue concreto.
  const info = await (await fetch(`${API}/v9/projects/${PRJ}?teamId=${TEAM}`, { headers: cabeceras })).json();
  // De todas las direcciones del proyecto se prefiere la más corta: es la del
  // dominio propio (huellitasdeamorvet.vercel.app) y no la que Vercel genera
  // pegando el nombre del proyecto y el de la cuenta.
  const alias = (info.targets?.production?.alias || [])
    .filter((a) => a.includes(info.name))
    .sort((a, b) => a.length - b.length);
  const url = `https://${alias[0] || (salida.match(/https:\/\/[^\s]+\.vercel\.app/g) || []).pop()?.replace('https://', '')}`;

  /* --- 6. Comprobación ---------------------------------------------- */

  titulo('7. Comprobando el sitio publicado');

  const pruebas = [
    ['/', async (r) => r.ok && (await r.text()).includes('<html')],
    ['/api/salud', async (r) => (await r.json()).ok === true],
    ['/api/servicios', async (r) => ((await r.json()).servicios || []).length > 0],
    ['/api/veterinarios', async (r) => ((await r.json()).veterinarios || []).length > 0],
  ];

  let fallos = 0;
  for (const [ruta, valida] of pruebas) {
    try {
      const respuesta = await fetch(url + ruta);
      const bien = await valida(respuesta.clone());
      console.log(`  ${bien ? verde('✓') : rojo('✗')} ${ruta}  ${gris(`(${respuesta.status})`)}`);
      if (!bien) {
        fallos++;
        console.log(`      ${(await respuesta.text()).slice(0, 200)}`);
      }
    } catch (error) {
      fallos++;
      console.log(`  ${rojo('✗')} ${ruta}  ${error.message}`);
    }
  }

  if (fallos) {
    console.log(`\n${rojo('El sitio está publicado pero algo no responde bien.')}`);
    console.log(`Revisa los registros: https://vercel.com/${TEAM}/${info.name}/logs`);
    process.exit(1);
  }

  console.log(`\n${verde('Listo.')} El sitio está en ${url}`);
  console.log('\nEntra con:  admin@huellitas.com / Admin1234');
  console.log(gris('El sistema te pedirá una contraseña nueva antes de dejarte pasar:'));
  console.log(gris('esa clave está en el repositorio y no sirve como contraseña real.'));
})().catch((error) => {
  // Un fallo que no pase por abortar() —la red que se cae, la API de Vercel que
  // responde otra cosa— saldría si no como "unhandled rejection": una traza de
  // Node en la que no se ve en qué paso del despliegue se quedó.
  abortar(`El despliegue se detuvo: ${error.message}`);
});

/**
 * Pone `?v=<hash>` en cada enlace a un CSS o un JS propio.
 *
 * Sin esto el navegador reutiliza la copia que ya tiene —los estáticos se
 * sirven con caché larga— y un arreglo publicado no se ve hasta que al usuario
 * se le ocurre recargar forzando. Con el hash del contenido en la URL, cambiar
 * un archivo cambia su dirección y el navegador lo pide de nuevo solo; si no
 * cambia nada, la URL es la misma y la caché sigue sirviendo.
 *
 * El sello es uno solo para todos los archivos, no uno por archivo: mantenerlo
 * por archivo obligaría a resolver qué HTML usa cuál, y publicar de más un par
 * de archivos pequeños cuesta menos que equivocarse al calcularlo.
 */
function sellarEstaticos() {
  const crypto = require('crypto');
  const frontend = path.join(RAIZ, 'frontend');

  const hash = crypto.createHash('sha256');
  for (const carpeta of ['css', 'js']) {
    const dir = path.join(frontend, carpeta);
    if (!fs.existsSync(dir)) continue;
    for (const archivo of fs.readdirSync(dir).sort()) {
      hash.update(archivo);
      hash.update(fs.readFileSync(path.join(dir, archivo)));
    }
  }
  const version = hash.digest('hex').slice(0, 10);

  // Solo rutas propias: las hojas de estilo de Google Fonts se quedan como están.
  // Se llama así y no `enlace` porque ese nombre ya es el de la ruta de
  // .vercel/project.json, arriba, y dos cosas distintas con el mismo nombre en
  // el mismo archivo terminan mal.
  const patronEnlace = /(href|src)="((?!https?:)[^"]+\.(?:css|js))(\?v=[^"]*)?"/g;

  let tocados = 0;
  for (const archivo of htmlDe(frontend)) {
    const antes = fs.readFileSync(archivo, 'utf8');
    const despues = antes.replace(patronEnlace, (_, atributo, ruta) => `${atributo}="${ruta}?v=${version}"`);
    if (despues !== antes) {
      fs.writeFileSync(archivo, despues);
      tocados += 1;
    }
  }
  if (tocados) console.log(`  ${gris(tocados + ' archivos HTML actualizados')}`);
  return version;
}

/** Todos los .html de una carpeta, entrando en las subcarpetas. */
function htmlDe(directorio) {
  const salida = [];
  for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
    const completa = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) salida.push(...htmlDe(completa));
    else if (entrada.name.endsWith('.html')) salida.push(completa);
  }
  return salida;
}
