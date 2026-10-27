import { and, asc, desc, eq, getTableColumns, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { element, entretien, maison, prestataire, realisation } from "../db/schema";
import { aujourdhui } from "../lib/dates";
import { ajouter } from "../lib/entretiens";

/**
 * Tout ce que montre le tableau de bord, pour une maison ou pour toutes (maisons et éléments archivés exclus) :
 * - les entretiens actifs (classés côté interface : en retard, à prévoir, rendez-vous, à venir) ;
 * - les garanties qui expirent dans les 3 mois (ou ont expiré depuis moins d'un mois) ;
 * - les dernières interventions ;
 * - les dépenses de l'année (entretiens et réparations, achats d'éléments), avec l'année précédente.
 */
export async function tableauDeBord(maisonId?: string | null) {
  const jour = aujourdhui();
  const annee = Number(jour.slice(0, 4));
  const suivis = and(eq(maison.archivee, false), eq(element.archive, false), maisonId ? eq(maison.id, maisonId) : undefined);
  const lieu = { elementNom: element.nom, maisonId: maison.id, maisonNom: maison.nom };

  const [entretiens, garanties, dernieres, depenses, achats] = await Promise.all([
    db
      .select({ ...getTableColumns(entretien), ...lieu, prestataireNom: prestataire.nom, prestataireTelephone: prestataire.telephone })
      .from(entretien)
      .innerJoin(element, eq(element.id, entretien.elementId))
      .innerJoin(maison, eq(maison.id, element.maisonId))
      .leftJoin(prestataire, eq(prestataire.id, entretien.prestataireId))
      .where(and(suivis, eq(entretien.actif, true)))
      .orderBy(asc(entretien.echeance)),
    db
      .select({ id: element.id, nom: element.nom, finGarantie: element.finGarantie, maisonId: maison.id, maisonNom: maison.nom })
      .from(element)
      .innerJoin(maison, eq(maison.id, element.maisonId))
      .where(and(suivis, gte(element.finGarantie, ajouter(jour, -1, "mois")), lte(element.finGarantie, ajouter(jour, 3, "mois"))))
      .orderBy(asc(element.finGarantie)),
    db
      .select({ ...getTableColumns(realisation), ...lieu, prestataireNom: prestataire.nom })
      .from(realisation)
      .innerJoin(element, eq(element.id, realisation.elementId))
      .innerJoin(maison, eq(maison.id, element.maisonId))
      .leftJoin(prestataire, eq(prestataire.id, realisation.prestataireId))
      // L'historique d'un élément archivé (remplacé, vendu) compte encore : on ne filtre que les maisons.
      .where(and(eq(maison.archivee, false), maisonId ? eq(maison.id, maisonId) : undefined))
      .orderBy(desc(realisation.date), desc(realisation.creeLe))
      .limit(6),
    db
      .select({ annee: sql<string>`substr(${realisation.date}, 1, 4)`, total: sql<number>`coalesce(sum(${realisation.cout}), 0)`, nombre: sql<number>`count(${realisation.cout})` })
      .from(realisation)
      .innerJoin(element, eq(element.id, realisation.elementId))
      .innerJoin(maison, eq(maison.id, element.maisonId))
      .where(and(eq(maison.archivee, false), maisonId ? eq(maison.id, maisonId) : undefined, gte(realisation.date, `${annee - 1}-01-01`), lte(realisation.date, `${annee}-12-31`)))
      .groupBy(sql`1`),
    db
      .select({ total: sql<number>`coalesce(sum(${element.prix}), 0)` })
      .from(element)
      .innerJoin(maison, eq(maison.id, element.maisonId))
      .where(and(eq(maison.archivee, false), maisonId ? eq(maison.id, maisonId) : undefined, gte(element.dateAchat, `${annee}-01-01`), lte(element.dateAchat, `${annee}-12-31`))),
  ]);

  const deLAnnee = (a: number) => depenses.find((d) => Number(d.annee) === a);
  return {
    aujourdhui: jour,
    entretiens,
    garanties,
    dernieres,
    depenses: {
      annee,
      entretien: deLAnnee(annee)?.total ?? 0,
      nombre: deLAnnee(annee)?.nombre ?? 0,
      anneePrecedente: deLAnnee(annee - 1)?.total ?? 0,
      achats: achats[0]?.total ?? 0,
    },
  };
}
