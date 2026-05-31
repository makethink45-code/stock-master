
const CACHE_NAME = 'waystock-cache-v1';

// 📦 1. UNHINDRANCES STATIC CORE FILES: Yeh saari files mobile local memory me dump (save) ho jayengi
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/admin.html',
  '/style.css',
  '/common.js',
  '/user-script.js',
  '/admin-script.js',
  '/manifest.json'
];

// Service Worker Install State Execution
self.addEventListener('install', (e) => {
  console.log('🤖 SW Engine: Installed Successfully!');
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 SW Engine: Caching Application Core Assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate State: Purane cache frames ko automatically clear karne ke liye
self.addEventListener('activate', (e) => {
  console.log('🚀 SW Engine: Activated!');
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🗑️ SW Engine: Clearing Expired Cache Key:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 🔑 2. TRUE OFFLINE CORE FETCH ENGINE: Network First, Fallback to Cache Strategy
// Isse data hamesha fresh live load hoga, par net band hone par local cache se app turant chalu ho jayegi!
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).then((response) => {
      // Agar network response sahi he, toh fresh copy cache me update karo
      if (response && response.status === 200 && response.type === 'basic') {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
      }
      return response;
    }).catch(() => {
      // 🧠 NETWORK FAILED: Internet band hone par database files yahan se local feed hongi
      return caches.match(e.request);
    })
  );
});

// ==========================================================================
// --- 📢 PUSH NOTIFICATION RECEIVER LOGIC SYSTEM ---
// ==========================================================================

// 🔑 FIX: Jab cloud database message trigger karega, tab mobile display board handle hoga
self.addEventListener('push', function(event) {
    let payloadText = 'Fresh update received inside database dashboard.';
    if (event.data) {
        payloadText = event.data.text();
    }

    const options = {
        body: payloadText,
        icon: '/logo.png', // Aapka local icon image asset link
        badge: '/logo.png',
        vibrate: [200, 100, 200],
        tag: 'waystock-broadcast',
        renotify: true,
        data: { url: '/' }
    };

    event.waitUntil(
        self.registration.showNotification('WayStock Hub Update 📢', options)
    );
});

// Action routing configuration inside user workspace window layout
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Agar app pehle se background me khuli he, toh use focus (samne) le aao
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // Agar band he, toh naya window kholo
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
