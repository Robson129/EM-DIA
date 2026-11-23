// Service worker dos avisos (Firebase Cloud Messaging).
// A configuração chega pela query string no momento do registro —
// este arquivo não consegue ler import.meta.env.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp(Object.fromEntries(new URL(self.location).searchParams));
firebase.messaging();
