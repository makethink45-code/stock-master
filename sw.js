// sw.js content
self.addEventListener('install', (e) => {
  console.log('Service Worker: Installed');
});

self.addEventListener('fetch', (e) => {
  // Isse app offline capability ke liye ready rehti hai
  e.respondWith(fetch(e.request));
});
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    // Notification par click karne se app khulegi
    event.waitUntil(
        clients.openWindow('/')
    );
});
