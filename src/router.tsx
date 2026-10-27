import { Outlet, createRootRoute, createRoute, createRouter, createBrowserHistory, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Layout } from "./components/Layout";
import { SurOrdinateur } from "./components/SurOrdinateur";
import { Accueil } from "./pages/Accueil";
import { Maisons } from "./pages/Maisons";
import { Sauvegarde } from "./pages/Sauvegarde";
import { Connexion } from "./pages/compte/Connexion";
import { Lien } from "./pages/compte/Lien";
import { Comptes } from "./pages/compte/Comptes";
import { Journal } from "./pages/compte/Journal";
import { estAdmin, utilisateur } from "./lib/session";
import { useEcran } from "./lib/ecran";

/** Pages trop denses pour un téléphone : on y invite à passer sur ordinateur ou tablette. */
const surOrdinateur = (Page: () => ReactNode, titre: string) =>
  function PageSurOrdinateur() {
    return useEcran().telephone ? <SurOrdinateur titre={titre} /> : <Page />;
  };

const racine = createRootRoute({ component: Outlet });

/** Pages publiques : connexion, choix du mot de passe par lien. */
export const connexionRoute = createRoute({
  getParentRoute: () => racine,
  path: "/connexion",
  component: Connexion,
  validateSearch: (s: Record<string, unknown>): { retour?: string; email?: string } => ({
    ...(typeof s.retour === "string" ? { retour: s.retour } : {}),
    ...(typeof s.email === "string" ? { email: s.email } : {}),
  }),
});
export const lienRoute = createRoute({ getParentRoute: () => racine, path: "/lien/$jeton", component: Lien });

/** Tout le reste demande d'être connecté. */
const application = createRoute({
  getParentRoute: () => racine,
  id: "application",
  component: Layout,
  beforeLoad: ({ location }) => {
    if (!utilisateur()) throw redirect({ to: "/connexion", search: { retour: location.href } });
  },
});
const reserveAdmin = () => {
  if (!estAdmin()) throw redirect({ to: "/" });
};

const accueil = createRoute({ getParentRoute: () => application, path: "/", component: Accueil });
const maisons = createRoute({ getParentRoute: () => application, path: "/maisons", component: Maisons });
const sauvegarde = createRoute({ getParentRoute: () => application, path: "/sauvegarde", component: surOrdinateur(Sauvegarde, "Sauvegarde"), beforeLoad: reserveAdmin });
const comptes = createRoute({ getParentRoute: () => application, path: "/comptes", component: surOrdinateur(Comptes, "Comptes"), beforeLoad: reserveAdmin });
const journal = createRoute({ getParentRoute: () => application, path: "/journal", component: surOrdinateur(Journal, "Journal"), beforeLoad: reserveAdmin });

export const router = createRouter({
  routeTree: racine.addChildren([connexionRoute, lienRoute, application.addChildren([accueil, maisons, sauvegarde, comptes, journal])]),
  history: createBrowserHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
