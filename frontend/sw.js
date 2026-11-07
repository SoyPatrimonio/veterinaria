/* ============================================================
   Huellitas — service worker de la app instalable

   Lo que hace:
   - Las páginas (HTML) van primero a la red, para estrenar siempre
     la última versión. Sin conexión se sirve la copia guardada o,
     si no la hay, offline.html (guardada como /offline).
   - CSS, JS e imágenes propias se sirven de la caché. Los enlaces
     llevan ?v=<hash> (scripts/deploy.js), así que cada despliegue
     pide archivos nuevos y no hay riesgo de quedarse con uno viejo.

   Lo que NO hace, a propósito:
   - No toca /api/. Ahí viajan historias clínicas, facturas y datos
     personales: no se guardan en el dispositivo, y una respuesta vieja
     se vería como real. Sin red, la página dice que no hay conexión.
   - No intercepta otros dominios (fuentes de Google, imágenes).
   ============================================================ */

'use strict';

// Subir el número al cambiar la lista de PRECARGA o la lógica: el paso de
// activación borra las cachés de versiones anteriores.
const CACHE = 'huellitas-app-v1';
const PRECARGA = [
  // Sin .html: Vercel (cleanUrls) redirige /offline.html a /offline, y Express
  // sirve las dos. Así la copia guardada no es una redirección.
  'offline',
  'css/panel.css',
  'iconos/app.svg',
  'iconos/app-192.png',
];
const MAXIMO_ARCHIVOS = 150;
const ESTATICO = /\.(?:css|js|png|jpe?g|webp|svg|ico|gif|woff2?)$/i;

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' para no precargar desde la caché HTTP del navegador.
      .then((cache) => cache.addAll(PRECARGA.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((n) => n.startsWith('huellitas-app-') && n !== CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/** Solo se guardan respuestas completas, propias y sin redirección. */
function guardable(respuesta) {
  // Una respuesta que llegó por redirección (cleanUrls de Vercel) no se
  // puede volver a usar para una navegación: el navegador la rechaza.
  return respuesta && respuesta.ok && respuesta.type === 'basic' && !respuesta.redirected;
}

/** Recorta la caché a los más recientes: cada despliegue deja archivos viejos. */
async function recortar(cache) {
  const claves = await cache.keys();
  const sobran = claves.length - MAXIMO_ARCHIVOS;
  for (let i = 0; i < sobran; i++) await cache.delete(claves[i]);
}

async function paginaRedPrimero(peticion) {
  const cache = await caches.open(CACHE);
  try {
    const respuesta = await fetch(peticion);
    if (guardable(respuesta)) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch {
    return (await cache.match(peticion, { ignoreSearch: true })) || cache.match('offline');
  }
}

async function archivoCachePrimero(peticion) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;

  const respuesta = await fetch(peticion);
  if (guardable(respuesta)) {
    await cache.put(peticion, respuesta.clone());
    recortar(cache);
  }
  return respuesta;
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return;
  if (url.pathname.startsWith('/uploads/')) return; // fotos de mascotas: datos, no interfaz

  if (peticion.mode === 'navigate') {
    evento.respondWith(paginaRedPrimero(peticion));
  } else if (ESTATICO.test(url.pathname)) {
    evento.respondWith(archivoCachePrimero(peticion));
  }
});
