import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const env = import.meta.env as Record<string, string | undefined>;
const appId = env["VITE_FIREBASE_APP_ID"];
const vapidKey = env["VITE_FIREBASE_VAPID_KEY"];
const apiKey = env["VITE_FIREBASE_API_KEY"];
const projectId = env["VITE_FIREBASE_PROJECT_ID"];

export type PushResult =
  | { status: "registered"; token: string }
  | { status: "not-configured" | "unsupported" | "open-in-new-tab" | "denied" };

/**
 * Pede permissão e registra este aparelho para receber os avisos.
 * Chamar apenas a partir de um clique: o navegador ignora pedidos sem gesto do usuário.
 */
export async function enablePush(): Promise<PushResult> {
  const messagingSenderId = appId?.split(":")[1] ?? "";
  if (!apiKey || !projectId || !appId || !vapidKey || !messagingSenderId) {
    return { status: "not-configured" };
  }
  const firebaseConfig = { apiKey, projectId, appId, messagingSenderId };
  if (!("Notification" in window) || !(await isSupported())) {
    return { status: "unsupported" };
  }
  // Dentro de um iframe (pré-visualizações) o navegador recusa o pedido de permissão.
  if (window.top !== window.self) {
    return { status: "open-in-new-tab" };
  }

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    return { status: "denied" };
  }

  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(firebaseConfig).map(([k, v]) => [k, v ?? ""])),
  ).toString();
  const serviceWorkerRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
  const messaging = getMessaging(initializeApp(firebaseConfig));
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  return token ? { status: "registered", token } : { status: "denied" };
}
