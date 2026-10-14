'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// El .env vive en la raíz del proyecto, un nivel arriba de backend/.
// En Vercel no existe ningún .env: las variables llegan del panel del
// proyecto, y dotenv simplemente no encuentra archivo y sigue de largo.
for (const candidato of [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), '.env'),
]) {
  if (fs.existsSync(candidato)) {
    dotenv.config({ path: candidato });
    break;
  }
}

/* ------------------------------------------------------------------
   Zona horaria

   La agenda trabaja en hora local de la clínica y se guarda en columnas
   TIMESTAMP sin zona. Los servidores de Vercel arrancan en UTC, así que
   sin esto "hoy" y la anticipación mínima se calcularían con cinco horas
   de diferencia. Se fija antes de que nada use `new Date()`.

   Se lee de CLINICA_TZ y no de TZ por dos razones: Vercel no deja crear una
   variable llamada TZ (nombre reservado), y además la plataforma la define
   en UTC por su cuenta, así que leerla daría siempre el valor equivocado.
   ------------------------------------------------------------------ */
const zonaHoraria = process.env.CLINICA_TZ || 'America/Bogota';
process.env.TZ = zonaHoraria;

function requerido(nombre, valorPorDefecto) {
  const valor = process.env[nombre] ?? valorPorDefecto;
  if (valor === undefined || valor === '') {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copia .env.example a .env y complétala.`
    );
  }
  return valor;
}

const entorno = process.env.NODE_ENV || 'development';
const esProduccion = entorno === 'production';

// En desarrollo se permite un secreto por defecto para poder arrancar sin
// configurar nada; en producción es obligatorio y debe ser largo.
const jwtSecret = process.env.JWT_SECRET || (esProduccion ? '' : 'huellitas-dev-secret-no-usar-en-produccion');
if (esProduccion && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.');
}

// Cadena de conexión de Supabase (Project settings → Database → Connection
// string → URI). Se aceptan varios nombres porque Vercel y Supabase usan
// distintos en sus integraciones automáticas.
const urlBaseDatos =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  '';

/* ------------------------------------------------------------------
   Llave con la que se cifra en la base lo delicado que el servidor
   necesita poder volver a leer (hoy, el secreto del segundo factor).

   Va aparte de JWT_SECRET a propósito: son dos llaves con vidas
   distintas. JWT_SECRET se puede rotar cuando se quiera —lo único que
   pasa es que las sesiones abiertas se caen—, mientras que rotar esta
   deja ilegible lo que ya está guardado. Mezclarlas convertiría una
   rotación de rutina en una pérdida de datos.

   Si no está definida se deriva de JWT_SECRET, para que el despliegue
   siga funcionando sin tocar nada; en producción se avisa, porque es
   ahí donde esa mezcla puede costar cara.
   ------------------------------------------------------------------ */
const claveCifrado = process.env.CIFRADO_CLAVE || '';

if (esProduccion && claveCifrado && claveCifrado.length < 32) {
  throw new Error('CIFRADO_CLAVE debe tener al menos 32 caracteres.');
}
if (esProduccion && !claveCifrado) {
  console.warn(
    '[config] Falta CIFRADO_CLAVE: los datos cifrados usan una llave derivada de JWT_SECRET. ' +
    'Cambiar JWT_SECRET dejaría ilegibles los secretos del segundo factor. ' +
    'Define CIFRADO_CLAVE con un valor largo y aleatorio, y no lo cambies después.'
  );
}

/* ------------------------------------------------------------------
   Correo saliente

   Por aquí sale el código de ingreso del segundo factor. Con Gmail la
   contraseña NO es la de la cuenta: es una «contraseña de aplicación» de
   dieciséis letras que se crea en la propia cuenta de Google (Seguridad →
   Verificación en dos pasos → Contraseñas de aplicaciones) y que solo sirve
   para esto, así que revocarla no toca nada más.

   Se le quitan los espacios porque Google la enseña en grupos de cuatro, que
   es como se copia; el servidor SMTP no los espera.
   ------------------------------------------------------------------ */
const correoUsuario = (process.env.CORREO_USUARIO || '').trim();
const correoPassword = (process.env.CORREO_PASSWORD || '').replace(/\s+/g, '');
const correoPuerto = Number(process.env.CORREO_PUERTO || 465);

module.exports = {
  entorno,
  esProduccion,
  zonaHoraria,
  puerto: Number(process.env.PORT || 3000),

  db: {
    url: urlBaseDatos,
    // El pooler de Supabase siempre habla TLS.
    ssl: (process.env.DB_SSL || 'require') !== 'disable',
    // En serverless cada instancia abre su propio pool, así que conviene
    // que sea pequeño: el plan gratuito de Supabase admite pocas conexiones.
    connectionLimit: Number(process.env.DB_POOL || (esProduccion ? 3 : 10)),
    timezone: zonaHoraria,
  },

  // Storage de Supabase para las fotos: las de las mascotas y las de los
  // productos del inventario, cada una en su carpeta del mismo bucket. En
  // Vercel el disco es de solo lectura y efímero, así que los archivos no
  // pueden vivir ahí.
  supabase: {
    url: process.env.SUPABASE_URL || '',
    // Clave de servicio: solo en el servidor, nunca en el frontend.
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'mascotas',
  },

  // Llave de cifrado en reposo. Ver utils/cifrado.js.
  cifrado: {
    clave: claveCifrado || `derivada-de-jwt:${jwtSecret}`,
    propia: Boolean(claveCifrado),
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES || '8h',
    // La sesión de administración vive menos: es la que puede tocar usuarios,
    // roles, facturación y configuración de seguridad.
    expiresInAdmin: process.env.JWT_EXPIRES_ADMIN || '2h',
  },

  /**
   * Segundo factor.
   *
   * `roles` son los que no pueden entrar sin él. Por defecto solo la
   * administración; añadir 'veterinario' es cambiar la variable, pero conviene
   * avisar antes al equipo, porque quien no lo tenga configurado no podrá
   * abrir nada hasta hacerlo.
   */
  mfa: {
    roles: (process.env.MFA_ROLES ?? 'admin')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  },

  /**
   * Cuenta desde la que salen los correos.
   *
   * `configurado` es lo que decide si el segundo factor viaja por correo. Si
   * falta el usuario o la contraseña, el envío queda apagado y el sistema
   * vuelve a exigir la aplicación de códigos: es preferible eso a un ingreso
   * que se queda esperando un correo que no va a salir nunca.
   */
  correo: {
    host: process.env.CORREO_HOST || 'smtp.gmail.com',
    puerto: correoPuerto,
    // El 465 habla TLS desde el primer byte; el 587 empieza en claro y sube.
    seguro: correoPuerto === 465,
    usuario: correoUsuario,
    password: correoPassword,
    // De dónde dice venir el correo. Gmail no deja mentir aquí: si no coincide
    // con la cuenta que autentica, reescribe el remitente por su cuenta.
    remitente: process.env.CORREO_REMITENTE || correoUsuario,
    nombre: process.env.CORREO_NOMBRE || 'Huellitas de Amor',
    configurado: Boolean(correoUsuario && correoPassword),
  },

  /**
   * De dónde cuelga el sitio. Solo se usa para los enlaces que viajan por
   * correo, hoy el de recuperación de contraseña.
   *
   * Se configura en vez de deducirse de la petición a propósito. El encabezado
   * Host lo escribe quien llama, así que armando el enlace con él bastaría una
   * petición con `Host: sitio-ajeno` para que a la víctima le llegara un correo
   * legítimo —nuestro remitente, nuestro texto— con un enlace que entrega su
   * token de recuperación a otro. Sin la variable puesta se cae al origen de la
   * petición, que es lo único que hay en desarrollo.
   */
  appUrl: (process.env.APP_URL || '').trim().replace(/\/+$/, ''),

  // Orígenes permitidos, separados por coma. El frontend servido por el propio
  // Express (o por Vercel, en el mismo dominio) no necesita CORS, pero sí un
  // front en otro puerto (Live Server) o en otro despliegue.
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Horario de atención de la clínica (sección 3: no se puede agendar fuera de él)
  clinica: {
    apertura: process.env.CLINICA_APERTURA || '08:00',
    cierre: process.env.CLINICA_CIERRE || '20:00',
    // Días en los que abre: 0=domingo … 6=sábado
    diasAbiertos: (process.env.CLINICA_DIAS || '1,2,3,4,5,6,0')
      .split(',')
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    // Con cuánta anticipación mínima se puede reservar (minutos)
    anticipacionMinutos: Number(process.env.CITAS_ANTICIPACION_MIN || 60),
    // Hasta cuántos días hacia adelante se abre la agenda
    diasMaximos: Number(process.env.CITAS_DIAS_MAX || 60),
  },

  uploads: {
    // Solo se usa como respaldo en desarrollo, cuando no hay Storage configurado.
    directorio: path.resolve(__dirname, '../../../uploads'),
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES || 3 * 1024 * 1024),
  },

  requerido,
};
