import { and, asc, desc, eq, getTableColumns, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { element, entretien, maison, prestataire, realisation } from "../db/schema";
import { aujourdhui } from "../lib/dates";
import { ajouter } from "../lib/entretiens";

/**
 * Tout ce que montre l'écran « À faire », pour une maison ou pour toutes (maisons et éléments archivés exclus) :
 * - les choses à faire actives (classées côté interface : en retard, aujourd'hui, cette semaine, plus tard, rendez-vous),
 *   et à part celles qui sont terminées ou suspendues ;
 * - les garanties qui expirent dans les 3 mois (ou ont expiré depuis moins d'un mois) ;
 * - les dernières interventions (les échéances passées volontairement n'en sont pas) ;
 * - les dépenses de l'année (entretiens et réparations, achats d'éléments), avec l'année précédente.
 */
export async function tableauDeBord(maisonId?: string | null) {
  const jour = aujourdhui();
  const annee = Number(jour.slice(0, 4));
  const lieu = { elementNom: element.nom, maisonId: maison.id, maisonNom: maison.nom };
  // Le type et la catégorie de l'élément : le formulaire qui lui convient (véhicule, modèles de sa catégorie).
  const surElement = { elementType: element.type, elementCategorie: element.categorie };
  // Chose à faire sur un élément (non archivé) ou directement sur la maison ; un véhicule n'a pas de maison
  // (il apparaît quand on regarde toutes les maisons).
  const maisonSuivie = maisonId ? eq(maison.id, maisonId) : or(isNull(maison.id), eq(maison.archivee, false));
  const suivie = and(maisonSuivie, or(isNull(entretien.elementId), eq(element.archive, false)));
  const maisonDe = (t: typeof entretien | typeof realisation) => sql`${maison.id} = coalesce(${t.maisonId}, ${element.maisonId})`;

  const [entretiens, garanties, dernieres, depenses, achats] = await Promise.all([
    db
      .select({ ...getTableColumns(entretien), ...lieu, ...surElement, prestataireNom: prestataire.nom, prestataireTelephone: prestataire.telephone })
      .from(entretien)
      .leftJoin(element, eq(element.id, entretien.elementId))
      .leftJoin(maison, maisonDe(entretien))
      .leftJoin(prestataire, eq(prestataire.id, entretien.prestataireId))
      .where(suivie)
      .orderBy(asc(entretien.echeance)),
    db
      .select({ id: element.id, nom: element.nom, finGarantie: element.finGarantie, maisonId: maison.id, maisonNom: maison.nom })
      .from(element)
      .leftJoin(maison, eq(maison.id, element.maisonId))
      .where(and(maisonSuivie, eq(element.archive, false), gte(element.finGarantie, ajouter(jour, -1, "mois")), lte(element.finGarantie, ajouter(jour, 3, "mois"))))
      .orderBy(asc(element.finGarantie)),
    db
      .select({ ...getTableColumns(realisation), ...lieu, prestataireNom: prestataire.nom })
      .from(realisation)
      .leftJoin(element, eq(element.id, realisation.elementId))
      .leftJoin(maison, maisonDe(realisation))
      .leftJoin(prestataire, eq(prestataire.id, realisation.prestataireId))
      // L'historique d'un élément archivé (remplacé, vendu) compte encore : on ne filtre que les maisons.
      .where(and(maisonSuivie, eq(realisation.passee, false)))
      .orderBy(desc(realisation.date), desc(realisation.creeLe))
      .limit(6),
    db
      .select({ annee: sql<string>`substr(${realisation.date}, 1, 4)`, total: sql<number>`coalesce(sum(${realisation.cout}), 0)`, nombre: sql<number>`count(${realisation.cout})` })
      .from(realisation)
      .leftJoin(element, eq(element.id, realisation.elementId))
      .leftJoin(maison, maisonDe(realisation))
      .where(and(maisonSuivie, gte(realisation.date, `${annee - 1}-01-01`), lte(realisation.date, `${annee}-12-31`)))
      .groupBy(sql`1`),
    db
      .select({ total: sql<number>`coalesce(sum(${element.prix}), 0)` })
      .from(element)
      .leftJoin(maison, eq(maison.id, element.maisonId))
      .where(and(maisonSuivie, gte(element.dateAchat, `${annee}-01-01`), lte(element.dateAchat, `${annee}-12-31`))),
  ]);

  const deLAnnee = (a: number) => depenses.find((d) => Number(d.annee) === a);
  return {
    aujourdhui: jour,
    entretiens: entretiens.filter((e) => e.actif),
    inactifs: entretiens.filter((e) => !e.actif),
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
