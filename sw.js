// sw.js content
self.addEventListener('install', (e) => {
  console.log('Service Worker: Installed');
});

self.addEventListener('fetch', (e) => {
  // Isse app offline capability ke liye ready rehti hai
  e.respondWith(fetch(e.request));
});
