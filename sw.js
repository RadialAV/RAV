// Service Worker para Radial AV
// VERSÃO ATUALIZADA - Novembro 2025
const CACHE_NAME = 'radial-av-v4';
const STATIC_CACHE = 'radial-av-static-v5';
const DYNAMIC_CACHE = 'radial-av-dynamic-v5';

// Base do scope (compatível com GitHub Pages em subpasta ex: /RAV/)
const SCOPE_PATHNAME = new URL(self.registration?.scope || self.location).pathname;
const BASE = SCOPE_PATHNAME.endsWith('/') ? SCOPE_PATHNAME : (SCOPE_PATHNAME + '/');

// Recursos para cache na instalação (relativos à base)
const STATIC_ASSETS_REL = [
  'index.html',
  'css/theme.css',
  'css/base.css',
  'css/layout.css',
  'css/components.css',
  'css/modals.css',
  'css/mobile.css',
  'js/app.js',
  'js/data.js',
  'js/navigation.js',
  'js/player.js',
  'js/utils.js',
  'js/ui/render.js',
  'js/sections/home.js',
  'js/sections/favorites.js',
  'js/sections/recent.js',
  'js/sections/playlists.js',
  'js/sections/releases.js',
  'js/sections/artists.js',
  'js/sections/videos.js',
  
];
const STATIC_ASSETS = STATIC_ASSETS_REL.map(p => (BASE + p));

// Instalar Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Cache criado, adicionando recursos estáticos...');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(err => {
        console.error('[SW] Erro ao cachear recursos:', err);
      })
  );
  
  // Forçar ativação imediata
  self.skipWaiting();
});

// Ativar Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Ativando Service Worker...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== STATIC_CACHE && cache !== DYNAMIC_CACHE) {
            console.log('[SW] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  
  // Tomar controle imediatamente
  return self.clients.claim();
});

// Interceptar requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar requests não-HTTP/HTTPS
  if (!request.url.startsWith('http')) {
    return;
  }
  
  // Strategy: Cache First para recursos estáticos
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request)
        .then(response => {
          return response || fetch(request);
        })
    );
    return;
  }
  
  // Strategy: Network Only para áudio/streaming (não cachear seek/Range)
  if (
      url.pathname.startsWith('/api/file/') ||
      request.headers.has('Range') ||
      request.url.includes('r2.dev') ||
      request.url.includes('.mp3') ||
      request.url.includes('.m4a') ||
      request.url.includes('.ogg') ||
      request.url.includes('.flac') ||
      request.url.includes('.wav') ||
      request.url.includes('.aif')
  ) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return new Response('Áudio não disponível offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        })
    );
    return;
  }
  
  // Strategy: Network First com fallback para cache
  event.respondWith(
    fetch(request)
      .then(response => {
        // Evitar cache para respostas de streaming/Range
        const isRange = request.headers && request.headers.has('Range');
        const is206 = response && response.status === 206;
        const isApiFile = url.pathname.startsWith('/api/file/');
        if (!(isRange || is206 || isApiFile)) {
          // Clonar response para cache apenas quando apropriado
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE)
            .then(cache => {
              cache.put(request, responseClone);
            });
        }

        return response;
      })
      .catch(() => {
        // Fallback para cache
        return caches.match(request);
      })
  );
});

// Mensagens do cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE)
        .then(cache => {
          return cache.addAll(event.data.urls);
        })
    );
  }
});
