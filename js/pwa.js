// === Comportamiento de app instalable (compartido por index.html y admin.html) ===
// 1. Registra el service worker (la app abre aunque no haya señal).
// 2. Muestra un aviso de "sin conexión".
// 3. Ofrece instalar la app: botón en Android/Chrome/Edge, instrucciones en iPhone/iPad.

const CLAVE_CERRADO = 'pwa:aviso-cerrado';
const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

function guardar(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch { /* modo privado: se ignora */ }
}
function leer(clave) {
  try { return localStorage.getItem(clave); } catch { return null; }
}

// ---------- 1. Service worker ----------
async function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    const reg = await navigator.serviceWorker.ready;
    // Le avisa al SW qué librerías de CDN se cargaron, para guardarlas también en la primera visita.
    const urls = performance.getEntriesByType('resource')
      .map((r) => r.name)
      .filter((u) => new URL(u).hostname === 'esm.sh');
    if (urls.length) reg.active?.postMessage({ tipo: 'guardar-cdn', urls });
  } catch (err) {
    console.warn('No se pudo registrar el service worker:', err);
  }
}

// ---------- 2. Aviso de sin conexión ----------
// navigator.onLine solo sabe si hay interfaz de red: con señal débil dice "online" aunque
// nada pase. Por eso además se prueba al servidor con un HEAD (el SW solo maneja GET).
function avisoSinConexion() {
  const aviso = document.createElement('div');
  aviso.className = 'aviso-red';
  aviso.setAttribute('role', 'status');
  aviso.hidden = true;
  aviso.textContent = 'Sin conexión — los datos se actualizan cuando vuelva la señal';
  document.body.prepend(aviso);

  let reintento;
  async function probar() {
    clearTimeout(reintento);
    const corte = new AbortController();
    const limite = setTimeout(() => corte.abort(), 6000);
    let responde = false;
    try {
      await fetch(`/manifest.webmanifest?ping=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: corte.signal });
      responde = true; // cualquier respuesta HTTP significa que hay conexión
    } catch { /* sin respuesta */ }
    clearTimeout(limite);
    aviso.hidden = responde && navigator.onLine;
    if (!responde) reintento = setTimeout(probar, 15000);
  }
  window.addEventListener('online', probar);
  window.addEventListener('offline', () => { aviso.hidden = false; probar(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') probar();
  });
  probar();
}

// ---------- 3. Aviso de instalación ----------
function yaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function esSafariIOS() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function avisoInstalacion() {
  if (yaInstalada()) return;
  if (Date.now() - Number(leer(CLAVE_CERRADO) || 0) < SIETE_DIAS) return;

  let aviso = null;
  function mostrar(texto, botonInstalar) {
    if (aviso) return;
    aviso = document.createElement('div');
    aviso.className = 'aviso-instalar';
    aviso.setAttribute('role', 'dialog');
    aviso.setAttribute('aria-label', 'Instalar la app');

    const p = document.createElement('p');
    if (typeof texto === 'string') p.textContent = texto;
    else p.append(...texto);
    aviso.append(p);

    if (botonInstalar) aviso.append(botonInstalar);

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'aviso-cerrar';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.textContent = '✕';
    cerrar.addEventListener('click', () => {
      guardar(CLAVE_CERRADO, String(Date.now()));
      aviso.remove();
    });
    aviso.append(cerrar);
    document.body.append(aviso);
  }

  // iPhone / iPad (Safari no tiene beforeinstallprompt: se explican los pasos).
  if (esSafariIOS()) {
    const b = (t) => { const e = document.createElement('b'); e.textContent = t; return e; };
    mostrar([
      'Instala la app: toca ', b('⋯'), ' → ', b('Compartir'), ' → ', b('Ver más'), ' → ', b('Agregar a Inicio'), '.',
    ]);
    return;
  }

  // Android, Chrome y Edge: botón propio que abre el diálogo del navegador.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-gold';
    boton.textContent = 'Instalar';
    boton.addEventListener('click', async () => {
      aviso?.remove();
      aviso = null;
      await e.prompt();
      await e.userChoice;
    });
    mostrar('Instala la app en tu teléfono para abrirla más rápido.', boton);
  });
  window.addEventListener('appinstalled', () => { aviso?.remove(); aviso = null; });
}

registrarSW();
avisoSinConexion();
avisoInstalacion();
