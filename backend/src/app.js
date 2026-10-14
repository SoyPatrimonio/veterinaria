'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const rutas = require('./routes');
const { limiteGeneral } = require('./middleware/rateLimit');
const { noEncontrado, manejadorErrores } = require('./middleware/errorHandler');
const { corsOrigins, esProduccion, uploads, supabase } = require('./config/env');

const app = express();

const RAIZ = path.resolve(__dirname, '../..');
const FRONTEND = path.join(RAIZ, 'frontend');

// En Vercel el frontend lo sirve la capa estática y esta carpeta no viaja con
// la función; en local sí existe y la sirve Express.
const HAY_FRONTEND = fs.existsSync(FRONTEND);

// Origen de Supabase Storage, de donde salen las fotos de las mascotas.
// Sin URL configurada no hay Storage y no hay nada que avisar; con una URL
// escrita mal sí, porque el síntoma sería que las fotos de las mascotas dejan
// de verse y la causa no aparecería por ningún lado.
const ORIGEN_STORAGE = (() => {
  if (!supabase.url) return null;
  try {
    return new URL(supabase.url).origin;
  } catch (error) {
    console.warn(
      `[config] SUPABASE_URL no es una URL válida ("${supabase.url}"): ${error.message}. ` +
      'Las fotos de las mascotas quedarán bloqueadas por la política de contenido.'
    );
    return null;
  }
})();

// Detrás de NGINX hace falta para que el rate limit vea la IP real.
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ----------------------------------------------------------------
   Seguridad
   ---------------------------------------------------------------- */

/**
 * HTTPS obligatorio en producción.
 *
 * Vercel ya redirige por su cuenta, y helmet manda HSTS, que le dice al
 * navegador que no vuelva a intentar por HTTP. Pero las dos cosas dependen de
 * dónde esté desplegado: HSTS solo protege a partir de la segunda visita, y la
 * redirección de Vercel se queda atrás el día que esto corra detrás de otro
 * proxy. Esto lo deja dicho en la aplicación, que es lo único que viaja con el
 * código.
 *
 * Se mira x-forwarded-proto porque el proxy termina el TLS: a Express le llega
 * HTTP siempre. Va antes que nada para que ni el login ni un token de sesión
 * lleguen a leerse en claro.
 */
app.use((req, res, next) => {
  if (!esProduccion) return next();

  const protocolo = req.get('x-forwarded-proto') || req.protocol;
  if (protocolo === 'https') return next();

  // 308 y no 302: conserva el método y el cuerpo. Con un 302, un POST se
  // convertiría en GET y el formulario se perdería por el camino.
  return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // La landing usa Google Fonts y fotos de Unsplash.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        // Las fotos de las mascotas se sirven desde Supabase Storage.
        imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', ORIGEN_STORAGE].filter(Boolean),
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // Sin estas dos, una etiqueta <base> inyectada podría reapuntar todas
        // las rutas relativas, y un formulario podría enviarse a otro dominio.
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: esProduccion ? [] : null,
      },
    },
    // Permite que las imágenes servidas se muestren desde el front local.
    crossOriginResourcePolicy: { policy: 'same-site' },
    // DENY y no el SAMEORIGIN que trae helmet por defecto, para decir lo mismo
    // que `frameAncestors: 'none'` de arriba y que vercel.json en las páginas
    // estáticas. Ninguna pantalla de este sistema se abre dentro de un marco,
    // ni siquiera propio, y dos cabeceras que dicen cosas distintas terminan
    // aplicándose según qué navegador entienda cuál.
    frameguard: { action: 'deny' },
  })
);

/**
 * CORS.
 *
 * La lista de CORS_ORIGIN sirve para orígenes ajenos (un front en Live Server,
 * por ejemplo). El dominio que sirvió la propia página se acepta siempre y se
 * deduce de la petición: en Vercel cada despliegue tiene su URL, además del
 * alias de producción y de cualquier dominio propio, y mantener esa lista a
 * mano significaba que el sitio se rechazaba a sí mismo.
 *
 * Un origen no permitido no lanza excepción: simplemente no se mandan las
 * cabeceras de CORS y es el navegador quien bloquea la respuesta, que es lo que
 * corresponde. Lanzar un Error acababa en un 500 que no explicaba nada.
 *
 * `credentials` va en false, y es a propósito. La sesión de este sistema viaja
 * en la cabecera Authorization, nunca en una cookie: el navegador no la manda
 * sola, así que una página ajena no puede provocar una petición autenticada
 * desde el navegador de un usuario que ya entró —que es exactamente el ataque
 * CSRF—. Poner credentials en true sería declarar lo contrario y abrir esa
 * puerta para nada, porque no hay ninguna cookie que mandar.
 */
app.use(
  cors((req, callback) => {
    const origen = req.header('Origin');

    // Sin cabecera Origin (misma página, curl, apps móviles) se permite.
    if (!origen) return callback(null, { origin: true, credentials: false });

    const propio = `${req.protocol}://${req.get('host')}`;
    const permitido =
      origen === propio ||
      corsOrigins.includes(origen) ||
      // Abrir el HTML con doble clic manda Origin: null. Se acepta solo en
      // desarrollo, para poder probar sin levantar un servidor de frontend.
      (!esProduccion && origen === 'null');

    callback(null, { origin: permitido, credentials: false });
  })
);

/**
 * Cookies seguras por defecto.
 *
 * Hoy este sistema no pone ninguna cookie —la sesión es un JWT en la cabecera
 * Authorization— y la comprobación de sesión solo lee de ahí, así que una
 * cookie que llegue no autentica nada.
 *
 * Esto es para el día en que alguien añada la primera: una cookie de sesión
 * sin `httpOnly` la lee cualquier script de la página, y sin `secure` viaja en
 * claro si algo cae a HTTP. Son dos banderas que se olvidan con facilidad y que
 * no avisan cuando faltan, así que se ponen aquí una sola vez en lugar de
 * confiar en recordarlas en cada llamada.
 *
 * `sameSite: 'strict'` porque no hay ningún flujo que vuelva desde otro sitio
 * (ni pagos redirigidos ni ingreso con Google); el día que lo haya, esa cookie
 * concreta puede pedir 'lax' pasándolo en sus propias opciones.
 */
app.use((req, res, next) => {
  const ponerCookie = res.cookie.bind(res);
  res.cookie = (nombre, valor, opciones = {}) =>
    ponerCookie(nombre, valor, {
      httpOnly: true,
      secure: esProduccion,
      sameSite: 'strict',
      path: '/',
      ...opciones,
    });
  next();
});

/* ----------------------------------------------------------------
   Parseo y registro
   ---------------------------------------------------------------- */

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(morgan(esProduccion ? 'combined' : 'dev'));

/* ----------------------------------------------------------------
   API
   ---------------------------------------------------------------- */

app.use('/api', limiteGeneral, rutas);

/* ----------------------------------------------------------------
   Archivos
   ---------------------------------------------------------------- */

// Solo en desarrollo sin Supabase Storage: las fotos quedan en /uploads y se
// sirven como descarga estática, nunca ejecutables. En producción las imágenes
// viven en Storage y esta ruta no se usa.
if (fs.existsSync(uploads.directorio)) {
  app.use(
    '/uploads',
    express.static(uploads.directorio, {
      index: false,
      dotfiles: 'deny',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    })
  );
}

if (HAY_FRONTEND) {
  app.use(express.static(FRONTEND, { extensions: ['html'] }));
}

/* ----------------------------------------------------------------
   404 y errores
   ---------------------------------------------------------------- */

app.use('/api', noEncontrado);

// Cualquier otra ruta que no sea de la API responde 404 de verdad. Antes
// devolvía la landing con un 200, que escondía los enlaces rotos: en local
// parecía que todo existía y en Vercel —que sí responde 404— la misma
// dirección fallaba.
//
// La respuesta se escribe aquí y no se sirve un archivo: `sendFile` de una
// página que no está en la carpeta falla con ENOENT, y ese fallo terminaba en
// el manejador de errores como un 500. Es decir, el enlace roto se reportaba
// como avería del servidor y mandaba a buscar el problema al lado equivocado.
//
// En Vercel esto no llega a ejecutarse: allí la función solo atiende /api/*, y
// de las páginas no encontradas se encarga la capa estática.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  if (!HAY_FRONTEND) return next();
  res.status(404).type('text/plain; charset=utf-8').send(`No existe la página ${req.path}.`);
});

app.use(manejadorErrores);

module.exports = app;
