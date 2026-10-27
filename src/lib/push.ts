import { appelApi } from "./rpc";

/** Notifications push possibles dans ce navigateur (service worker + API Push). */
export const pushDisponible = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iPhone / iPad hors application installée : Safari n'y autorise pas les notifications. */
export const iosHorsApplication = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone);

let enregistrement: Promise<ServiceWorkerRegistration | null> = Promise.resolve(null);

/** Enregistré au démarrage : reçoit les notifications, et rend l'application installable. */
export function enregistrerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  enregistrement = navigator.serviceWorker.register("/sw.js").catch((e) => {
    console.warn("Service worker non enregistré", e);
    return null;
  });
}

/** Le service worker de l'application, ou null s'il n'a pas pu démarrer (navigation privée, navigateur restreint). */
export const serviceWorker = () => enregistrement;

/** Notifications bloquées pour ce site (refusées une fois : seul le navigateur peut les rétablir). */
export const pushBloque = () => "Notification" in window && Notification.permission === "denied";

const versOctets = (base64url: string) => {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/** « Chrome sur Android », « Safari sur iPhone »… pour reconnaître ses appareils dans la liste. */
export function nomAppareil() {
  const ua = navigator.userAgent;
  const systeme = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "appareil";
  const navigateur = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  return `${navigateur} sur ${systeme}`;
}

/** Abonnement de cet appareil (s'il existe). */
export async function abonnementCourant() {
  if (!pushDisponible()) return null;
  const reg = await enregistrement;
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Demande l'autorisation, abonne cet appareil et l'enregistre sur le serveur. */
export async function activerPush(clePublique: string) {
  const reg = await enregistrement;
  if (!reg) throw new Error("Ce navigateur n'a pas permis à l'application de recevoir des notifications (navigation privée ?). Rechargez la page ou essayez un autre navigateur.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications refusées : autorisez-les pour ce site dans les réglages du navigateur.");
  let abonnement = await reg.pushManager.getSubscription();
  // Abonnement fait avec d'autres clés (serveur réinstallé) : on le refait.
  const cle = abonnement?.options.applicationServerKey;
  if (abonnement && cle && btoa(String.fromCharCode(...new Uint8Array(cle))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== clePublique) {
    await abonnement.unsubscribe();
    abonnement = null;
  }
  abonnement ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(clePublique) });
  const json = abonnement.toJSON();
  return appelApi("/api/notifications/abonnements", { corps: { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, appareil: nomAppareil() } });
}

/** Désabonne cet appareil (ici et sur le serveur). */
export async function desactiverPush() {
  const abonnement = await abonnementCourant();
  if (!abonnement) return;
  await appelApi("/api/notifications/abonnements/retirer", { corps: { endpoint: abonnement.endpoint } });
  await abonnement.unsubscribe();
}
