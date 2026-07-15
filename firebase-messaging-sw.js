// Firebase Messaging Service Worker
// Usa importScripts en lugar de require() — es la forma correcta para el navegador
 
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
 
firebase.initializeApp({
  apiKey: "AIzaSyA3FzHpV32AatAc92H-qntYB2amjZWReUE",
  authDomain: "cuidandot-b4465.firebaseapp.com",
  projectId: "cuidandot-b4465",
  storageBucket: "cuidandot-b4465.firebasestorage.app",
  messagingSenderId: "408840051724",
  appId: "1:408840051724:web:9c4365203e990ab56e2229"
});
 
const messaging = firebase.messaging();
 
// Notificaciones cuando la app está CERRADA o en SEGUNDO PLANO
messaging.onBackgroundMessage((payload) => {
  console.log('Notificación en background recibida:', payload);
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'Cuidado Diario', {
    body: body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    vibrate: [200, 100, 200],
    tag: 'cuidado-alerta',
    renotify: true
  });
});
