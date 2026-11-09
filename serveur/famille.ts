/*
 * Espace des enfants : connexion par code PIN, leurs missions, leurs points, leurs récompenses.
 * Un enfant n'appelle jamais les fonctions RPC : seulement les routes /api/enfant (serveur/routesEnfants.ts).
 */
import { and, asc, desc, eq, inArray, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { db, newId } from "../src/db/client";
import { echange, element, enfant, entretien, maison, missionTour, partMission, realisation, recompense } from "../src/db/schema";
import { aujourdhui } from "../src/lib/dates";
import { ajouter } from "../src/lib/entretiens";
import { ECHECS_PIN_MAX, faisable, pinValide } from "../src/lib/famille";
import { realiserEntretien } from "../src/data/entretiens";
import { envoyerPush } from "./envoi";
import { ErreurMetier } from "./erreurs";
import { compteDe, missionDe, partsDe, validerAutomatiquement, type Part } from "./missions";
import { abonnementsDe, abonnementsEnfant, destinataires } from "./reglages";

export const hacherPin = (pin: unknown) => {
  if (!pinValide(pin)) throw new ErreurMetier("Le code doit faire de 4 à 8 chiffres.");
  return Bun.password.hash(pin, { algorithm: "argon2id" });
};

let leurre: Promise<string> | null = null;

/**
 * Prénom et code : l'enfant (actif), ou null sans dire lequel des deux est faux.
 * Chaque code faux compte ; au dixième de suite, le profil est bloqué.
 */
export async function verifierPin(prenom: string, pin: string) {
  const [e] = await db
    .select()
    .from(enfant)
    .where(and(sql`lower(${enfant.prenom}) = ${prenom.trim().toLowerCase()}`, eq(enfant.actif, true)));
  if (!e) {
    leurre ??= Bun.password.hash("0000", { algorithm: "argon2id" });
    await Bun.password.verify(pin, await leurre);
    return null;
  }
  if (e.echecsPin >= ECHECS_PIN_MAX) throw new ErreurMetier("Code bloqué : demande un nouveau code à un parent.", 423);
  if (!(await Bun.password.verify(pin, e.pinHash))) {
    await db.update(enfant).set({ echecsPin: e.echecsPin + 1 }).where(eq(enfant.id, e.id));
    return null;
  }
  if (e.echecsPin) await db.update(enfant).set({ echecsPin: 0 }).where(eq(enfant.id, e.id));
  return e;
}

export async function enfantActif(id: string) {
  const [e] = await db
    .select({ id: enfant.id, prenom: enfant.prenom, objectifSemaine: enfant.objectifSemaine })
    .from(enfant)
    .where(and(eq(enfant.id, id), eq(enfant.actif, true)));
  return e ?? null;
}

const ou = sql<string | null>`coalesce(${element.nom}, ${maison.nom})`;

/** Ce que l'enfant voit : ses missions des 30 prochains jours, sa semaine, son solde, ses récompenses. */
export async function espaceEnfant(enfantId: string) {
  await validerAutomatiquement();
  const jour = aujourdhui();
  const e = await enfantActif(enfantId);
  if (!e) throw new ErreurMetier("Profil introuvable", 401);
  const [missions, faitesAujourdhui, historique, recompenses, demandes, compte] = await Promise.all([
    db
      .select({ id: entretien.id, titre: entretien.titre, nature: entretien.nature, echeance: entretien.echeance, points: entretien.points, ou, notes: entretien.notes })
      .from(entretien)
      .leftJoin(element, eq(element.id, entretien.elementId))
      .leftJoin(maison, sql`${maison.id} = coalesce(${entretien.maisonId}, ${element.maisonId})`)
      .where(
        and(
          inArray(entretien.id, db.select({ id: missionTour.entretienId }).from(missionTour).where(eq(missionTour.enfantId, enfantId))),
          eq(entretien.actif, true),
          isNotNull(entretien.points),
          lte(entretien.echeance, ajouter(jour, 30, "jour")),
          or(sql`${maison.id} is null`, eq(maison.archivee, false)),
        ),
      )
      .orderBy(asc(entretien.echeance), asc(entretien.titre)),
    // Faites aujourd'hui, par lui ou (mission partagée) par un autre enfant.
    db
      .select({ entretienId: realisation.entretienId })
      .from(realisation)
      .where(and(isNotNull(realisation.enfantId), eq(realisation.date, jour))),
    // Ses dernières missions : sa part des points.
    db
      .select({ id: realisation.id, titre: realisation.titre, date: realisation.date, points: partMission.points, validation: realisation.validation })
      .from(partMission)
      .innerJoin(realisation, eq(realisation.id, partMission.realisationId))
      .where(eq(partMission.enfantId, enfantId))
      .orderBy(desc(realisation.date), desc(realisation.creeLe), desc(sql`${realisation}.rowid`))
      .limit(15),
    db.select({ id: recompense.id, titre: recompense.titre, points: recompense.points }).from(recompense).where(eq(recompense.actif, true)).orderBy(asc(recompense.points)),
    db
      .select({ id: echange.id, titre: echange.titre, points: echange.points, statut: echange.statut, creeLe: echange.creeLe })
      .from(echange)
      .where(eq(echange.enfantId, enfantId))
      .orderBy(desc(echange.creeLe), desc(sql`${echange}.rowid`))
      .limit(10),
    compteDe(enfantId, jour),
  ]);
  const faites = new Set(faitesAujourdhui.map((f) => f.entretienId));
  const parts = await partsDe(historique.map((h) => h.id));
  // Les autres enfants : avec qui il a pu faire une mission.
  const autres = await db
    .select({ id: enfant.id, prenom: enfant.prenom })
    .from(enfant)
    .where(and(eq(enfant.actif, true), ne(enfant.id, enfantId)))
    .orderBy(asc(enfant.prenom));
  // Missions partagées : avec qui.
  const avec = missions.length
    ? await db
        .select({ entretienId: missionTour.entretienId, prenom: enfant.prenom })
        .from(missionTour)
        .innerJoin(enfant, eq(enfant.id, missionTour.enfantId))
        .where(and(inArray(missionTour.entretienId, missions.map((m) => m.id)), ne(missionTour.enfantId, enfantId), eq(enfant.actif, true)))
        .orderBy(asc(missionTour.ordre))
    : [];
  return {
    id: e.id,
    prenom: e.prenom,
    objectifSemaine: e.objectifSemaine,
    ...compte,
    missions: missions.map((m) => ({
      ...m,
      points: m.points ?? 0,
      avec: avec.filter((a) => a.entretienId === m.id).map((a) => a.prenom),
      faisable: faisable(m.echeance, jour, faites.has(m.id)),
      enRetard: m.echeance < jour,
    })),
    historique: historique.map((h) => ({ ...h, avec: parts(h.id).filter((p) => p.enfantId !== enfantId).map((p) => p.prenom) })),
    autres,
    recompenses,
    demandes,
  };
}
export type EspaceEnfant = Awaited<ReturnType<typeof espaceEnfant>>;

/** Prévient les parents abonnés aux notifications (sans bloquer ni faire échouer l'action de l'enfant). */
function prevenirParents(titre: string, corps: string) {
  for (const d of destinataires())
    if (d.push)
      for (const a of abonnementsDe(d.id))
        envoyerPush(a, { titre, corps, url: "/famille" }).catch((err: unknown) => console.error("Notification :", err));
}

/**
 * Les parts saisies : des enfants actifs, chacun une fois, des points entiers, et tous les points de la mission.
 * Rien de saisi : tout à celui qui l'a cochée.
 */
async function partsValides(enfantId: string, total: number, saisies: Part[] | undefined): Promise<Part[]> {
  if (!saisies?.length) return [{ enfantId, points: total }];
  const parts = saisies.some((p) => p.enfantId === enfantId) ? saisies : [{ enfantId, points: 0 }, ...saisies];
  if (new Set(parts.map((p) => p.enfantId)).size !== parts.length) throw new ErreurMetier("Chacun une seule fois.");
  if (parts.some((p) => !Number.isInteger(p.points) || p.points < 0)) throw new ErreurMetier("Les points : des nombres entiers.");
  const somme = parts.reduce((t, p) => t + p.points, 0);
  if (somme !== total) throw new ErreurMetier(`Le partage doit faire ${total} pts (là : ${somme}).`);
  const actifs = await db
    .select({ id: enfant.id })
    .from(enfant)
    .where(and(eq(enfant.actif, true), inArray(enfant.id, parts.map((p) => p.enfantId))));
  if (actifs.length !== parts.length) throw new ErreurMetier("Enfant inconnu.");
  return parts;
}

/**
 * L'enfant a fait sa mission : consignée (points à valider par un parent), échéance suivante.
 * Confiée à plusieurs : le premier qui la fait la fait pour tous.
 * Faite avec d'autres : les points sont partagés (`parts`, celui qui la coche compris ; à parts égales par défaut côté écran).
 * L'état d'avant est gardé : un parent qui refuse le remet en place.
 */
export async function faireMission(enfantId: string, entretienId: string, saisies?: Part[]) {
  const e = await enfantActif(enfantId);
  const [m] = await db.select().from(entretien).where(eq(entretien.id, entretienId));
  if (!e || !m || m.points == null || !m.actif || !(await missionDe(entretienId, enfantId))) throw new ErreurMetier("Cette mission n'est pas (ou plus) la tienne.", 404);
  const jour = aujourdhui();
  // Une fois par jour, quel que soit l'enfant qui l'a faite (mission partagée).
  const [dejaFaite] = await db
    .select({ id: realisation.id })
    .from(realisation)
    .where(and(eq(realisation.entretienId, entretienId), isNotNull(realisation.enfantId), eq(realisation.date, jour)));
  if (!faisable(m.echeance, jour, !!dejaFaite)) throw new ErreurMetier(dejaFaite ? "Déjà faite aujourd'hui." : "Pas encore : c'est pour plus tard.");
  const parts = await partsValides(enfantId, m.points, saisies);
  const avant = JSON.stringify({
    echeance: m.echeance,
    echeanceInitiale: m.echeanceInitiale,
    actif: m.actif,
    enfantId: m.enfantId,
    etat: m.etat,
    dateRdv: m.dateRdv,
    heureRdv: m.heureRdv,
    dureeRdvMinutes: m.dureeRdvMinutes,
  });
  const id = await realiserEntretien(entretienId, { date: jour });
  await db.update(realisation).set({ enfantId, points: m.points, validation: "a_valider", avant }).where(eq(realisation.id, id));
  await db.insert(partMission).values(parts.map((p) => ({ realisationId: id, ...p })));
  const qui = (await partsDe([id]))(id).map((p) => p.prenom);
  prevenirParents("Mission faite", `${qui.length > 1 ? `${qui.slice(0, -1).join(", ")} et ${qui.at(-1)}` : e.prenom} : ${m.titre} (${m.points} pts), à valider`);
  return id;
}

/** Prévient un enfant sur ses téléphones abonnés (sans bloquer ni faire échouer l'action du parent). */
export function prevenirEnfant(enfantId: string, n: { titre: string; corps: string; tag?: string }) {
  for (const a of abonnementsEnfant(enfantId)) envoyerPush(a, { ...n, url: "/enfant" }).catch((err: unknown) => console.error("Notification :", err));
}

/**
 * Tournée de 8 h : à chaque enfant abonné, ses missions du jour (et celles en retard).
 * Renvoie le nombre de notifications envoyées et les erreurs.
 */
export async function rappelerMissions(jour: string) {
  const bilan = { notifications: 0, erreurs: [] as string[] };
  const enfants = await db.select({ id: enfant.id, prenom: enfant.prenom }).from(enfant).where(eq(enfant.actif, true));
  for (const e of enfants) {
    const appareils = abonnementsEnfant(e.id);
    if (!appareils.length) continue;
    const missions = await db
      .select({ titre: entretien.titre, echeance: entretien.echeance, points: entretien.points })
      .from(entretien)
      .innerJoin(missionTour, eq(missionTour.entretienId, entretien.id))
      .leftJoin(element, eq(element.id, entretien.elementId))
      .leftJoin(maison, sql`${maison.id} = coalesce(${entretien.maisonId}, ${element.maisonId})`)
      .where(
        and(
          eq(missionTour.enfantId, e.id),
          eq(entretien.actif, true),
          isNotNull(entretien.points),
          lte(entretien.echeance, jour),
          or(sql`${maison.id} is null`, eq(maison.archivee, false)),
        ),
      )
      .orderBy(asc(entretien.echeance), asc(entretien.titre));
    if (!missions.length) continue;
    const enRetard = missions.filter((m) => m.echeance < jour).length;
    const n = {
      titre: missions.length === 1 ? (enRetard ? "Mission en retard" : "Mission du jour") : `${missions.length} missions aujourd'hui`,
      corps: missions.length === 1 ? `${missions[0].titre} (${missions[0].points} pts)` : missions.map((m) => m.titre).join(" · "),
      url: "/enfant",
      tag: "custos-missions",
    };
    for (const a of appareils) {
      const r = await envoyerPush(a, n);
      if (r === "ok") bilan.notifications++;
      else if (r !== "expire") bilan.erreurs.push(`Notification à ${e.prenom} : ${r}`);
    }
  }
  return bilan;
}

/** L'enfant demande une récompense : ses points sont réservés jusqu'à la réponse d'un parent. */
export async function demanderRecompense(enfantId: string, recompenseId: string) {
  const e = await enfantActif(enfantId);
  const [r] = await db
    .select()
    .from(recompense)
    .where(and(eq(recompense.id, recompenseId), eq(recompense.actif, true)));
  if (!e || !r) throw new ErreurMetier("Récompense introuvable", 404);
  await validerAutomatiquement();
  const { solde } = await compteDe(enfantId);
  if (solde < r.points) throw new ErreurMetier(`Pas assez de points : il en faut ${r.points}, tu en as ${solde}.`);
  const id = newId();
  await db.insert(echange).values({ id, enfantId, recompenseId, titre: r.titre, points: r.points });
  prevenirParents("Récompense demandée", `${e.prenom} : ${r.titre} (${r.points} pts)`);
  return id;
}
