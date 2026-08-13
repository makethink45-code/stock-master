
const CACHE_NAME = 'waystock-cache-v1';

// 📦 1. UNHINDRANCES STATIC CORE FILES: Yeh saari files mobile local memory me dump (save) ho jayengi
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './admin.html',
  './style.css',
  './common.js',
  './user-script.js',
  './admin-script.js',
  './manifest.json',
  './logo.png',
  './notification-sound.wav'
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

// 🟢 Service Worker Push Receiver Channel
self.addEventListener('push', function(event) {
    let payload = {
        title: 'WayStock System Master 🚀',
        body: 'Naya stock update hua hai!',
        sound: './notification-sound.wav' // 🔑 HARDWARE STREAM INTEGRATION
    };

    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload.body = event.data.text();
        }
    }

// 🟢 FIXED CODE (GitHub Pages layout compatible):
const options = {
    body: payload.body,
    icon: './logo.png',  // 🌟 FIX: Forward slash hatakar repository scope point lock kiya
    badge: './logo.png', // 🌟 FIX: Idhar bhi continuous repository context path diya
    vibrate: [100, 50, 100, 200],
    tag: payload.tag || 'waystock-push',
    renotify: true,
    sound: payload.sound || './notification-sound.wav'
};

    event.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});

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
    return clients.openWindow('./index.html');
}
        })
    );
});
