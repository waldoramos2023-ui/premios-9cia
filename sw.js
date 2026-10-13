// Service worker de la app. Se sirve en /sw.js (alcance: todo el sitio).
// Objetivo: que la app abra aunque no haya señal. Estrategia:
//   - Páginas y archivos propios (HTML, CSS, JS, imágenes): primero la red (máx. 4 s);
//     si falla o tarda, la copia guardada.
//   - Librerías de CDN con versión fija (esm.sh): primero la caché.
//   - Todo lo demás NO se toca: en especial Supabase (los datos de los voluntarios y el
//     login nunca se guardan aquí), los POST y cualquier otro dominio.
// Si cambias este archivo o los archivos de PRECACHE, sube CACHE para que los usuarios
// reciban la versión nueva.

const CACHE = 'antiguedad-9a-v1';
const PRECACHE = [
  '/',
  '/admin',
  '/css/styles.css',
  '/js/app.js',
  '/js/admin.js',
  '/js/calc.js',
  '/js/config.js',
  '/js/supabase.js',
  '/js/pwa.js',
  '/escudo-9a.png',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];
// Únicos dominios externos que se guardan: código de librerías, nunca datos.
const CDN = ['esm.sh'];
const ESPERA_RED_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' salta la caché HTTP: se guarda lo que hay en el servidor ahora.
      await Promise.all(PRECACHE.map((ruta) => cache.add(new Request(ruta, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// La página le avisa qué librerías de CDN cargó, para que la primera visita también abra sin red.
self.addEventListener('message', (event) => {
  if (event.data?.tipo !== 'guardar-cdn') return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = (event.data.urls || []).filter((u) => CDN.includes(new URL(u).hostname));
      await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(paginaPrimeroRed(request, url));
    } else {
      event.respondWith(primeroLaRed(request));
    }
    return;
  }
  if (CDN.includes(url.hostname)) {
    event.respondWith(primeroLaCache(request));
  }
  // Supabase y el resto: sin respondWith, el navegador sigue su camino normal.
});

function conLimite(promesa, ms) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error('tiempo agotado')), ms);
    promesa.then(
      (v) => { clearTimeout(t); ok(v); },
      (e) => { clearTimeout(t); mal(e); },
    );
  });
}

async function primeroLaRed(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await conLimite(fetch(request), ESPERA_RED_MS);
    if (res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }
}

// Navegación: Safari rechaza respuestas con redirecciones servidas por el SW, así que
// esas no se guardan. Sin red, se sirve la página guardada de esa ruta (o la de inicio).
async function paginaPrimeroRed(request, url) {
  const cache = await caches.open(CACHE);
  const clave = url.pathname === '/admin' || url.pathname === '/admin.html' ? '/admin' : '/';
  try {
    const res = await conLimite(fetch(request), ESPERA_RED_MS);
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put(clave, res.clone());
    return res;
  } catch {
    return (await cache.match(clave)) || (await cache.match('/')) || Response.error();
  }
}

async function primeroLaCache(request) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}
