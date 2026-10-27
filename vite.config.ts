import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

/** Modules de src/data/ exécutés par le serveur (même liste que serveur/rpc.ts). */
const MODULES_RPC = ["tableauDeBord", "maisons", "elements", "entretiens", "realisations", "prestataires", "documents"];

/**
 * Dans le navigateur, chaque module de src/data/ est remplacé par des « talons » :
 * `export const creerMaison = (...args) => rpc("creerMaison", args)`. Les composants gardent
 * leurs imports et leurs types ; le code SQL ne quitte jamais le serveur.
 */
function talonsRpc(): Plugin {
  return {
    name: "custos-talons-rpc",
    enforce: "pre",
    load(id) {
      const chemin = id.replace(/\?.*$/, "");
      const m = chemin.replace(/\\/g, "/").match(/\/src\/data\/(\w+)\.ts$/);
      if (!m || !MODULES_RPC.includes(m[1])) return null;
      const source = readFileSync(chemin, "utf8");
      const noms = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((x) => x[1]);
      return [
        `import { rpc } from "/src/lib/rpc.ts";`,
        ...noms.map((n) => `export const ${n} = (...args) => rpc(${JSON.stringify(n)}, args);`),
      ].join("\n");
    },
  };
}

export default defineConfig({
  plugins: [talonsRpc(), react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // En développement, l'API est servie par le serveur Bun (bun run dev:serveur).
    proxy: { "/api": { target: "http://localhost:3210" } },
  },
});
