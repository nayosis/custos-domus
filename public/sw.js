/*
 * Service worker de Custos Domus : affiche les rappels reçus par notification push
 * et ouvre l'application quand on les touche. Aucune mise en cache : l'application reste en ligne.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { corps: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.titre || "Custos Domus", {
      body: d.corps || "",
      icon: "/icone.svg",
      badge: "/icone.svg",
      lang: "fr",
      tag: "custos-rappels",
      renotify: true,
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      const ouverte = fenetres.find((f) => f.url.startsWith(self.location.origin));
      if (ouverte) {
        ouverte.navigate(url);
        return ouverte.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
