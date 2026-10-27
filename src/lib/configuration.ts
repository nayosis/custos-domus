import { appelApi } from "./rpc";

/** Ce que le serveur dit de lui-même, lu au démarrage : installation faite, version. */
type Configuration = { installe: boolean; version: string };

let config: Configuration = { installe: true, version: "" };

export async function chargerConfiguration() {
  config = await appelApi<Configuration>("/api/auth/etat", { silencieux: true });
  return config;
}
export const configuration = () => config;
