import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const appId = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID"] as string | undefined;
const vapidKey = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY"] as string | undefined;
const apiKey = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY"] as string | undefined;
const projectId = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID"] as string | undefined;

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
  // A pré-visualização do Lovable roda em iframe, onde o navegador recusa o pedido de permissão.
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
