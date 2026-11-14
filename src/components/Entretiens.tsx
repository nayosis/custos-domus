import { useMemo, useState, type ReactNode } from "react";
import {
  ActionIcon, Alert, Badge, Box, Button, Card, Checkbox, Collapse, Group, Menu, Modal, MultiSelect, NumberInput, Radio, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Title, UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { TimeInput } from "@mantine/dates";
import {
  IconCalendarCheck, IconCalendarEvent, IconCalendarX, IconCheck, IconChevronDown, IconChevronRight, IconClockPause, IconDots, IconPlayerPause, IconPlayerPlay,
  IconPlayerSkipForward, IconPencil, IconPlus, IconListCheck, IconReceipt, IconRotateClockwise, IconTool, IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  annulerRdv, creerEntretien, listeModeles, majEntretien, passerEcheance, prendreRdv, realiserEntretien, reporterEcheance, supprimerEntretien, type Rattachement,
} from "../data/entretiens";
import type { Entretien, ModeleEntretien } from "../db/schema";
import { aujourdhui, dateLisible, duree } from "../lib/dates";
import {
  ajouter, delaiDefaut, DUREES_RDV, QUI, quiDe, echeanceApresPassage, estFrequente, estRecurrent, faitEnUnGeste, genre, libelleDelai, libelleDuree, libelleHeure, libelleIntervalle, situation,
  type Qui, type Situation, type Unite,
} from "../lib/entretiens";
import { ecrire } from "../lib/query";
import { km, libelleKm } from "../lib/vehicules";
import { ChampDate, ChampPrestataire } from "./Champs";
import { enfantsMission, listeEnfants } from "../data/famille";
import { POINTS_DEFAUT } from "../lib/famille";
import { ModalRealisation } from "./ModalRealisation";

export type LigneEntretien = Entretien & { prestataireNom: string | null };
/** Ligne venue d'une liste qui mélange éléments et maisons : de quoi retrouver le formulaire qui lui convient. */
export type LigneAvecLieu = LigneEntretien & { elementType?: string | null; elementCategorie?: string | null };

/** Mission : le prénom de l'enfant (« Enfants » si elle est partagée, ou de celui qui l'a faite) et les points. */
export function BadgeMission({ e, suffixe }: { e: { points: number | null; enfantId: string | null }; suffixe?: string }) {
  const { data: enfants = [] } = useQuery({ queryKey: ["enfants"], queryFn: () => listeEnfants(), enabled: e.points != null });
  if (e.points == null) return null;
  const prenom = enfants.find((x) => x.id === e.enfantId)?.prenom;
  return (
    <Badge size="sm" variant="outline" color="brique" leftSection={<IconUser size={11} />}>
      {prenom ?? "Enfants"} · {e.points} pts{suffixe ? ` · ${suffixe}` : ""}
    </Badge>
  );
}

/** Icône d'une chose à faire : rendez-vous à prendre, routine (elle revient) ou tâche. */
export const IconeChose = ({ e, size = 20 }: { e: { avecRdv: boolean; intervalleValeur: number | null; intervalleUnite: string | null }; size?: number }) => {
  const Icone = e.avecRdv ? IconCalendarEvent : estRecurrent(e) ? IconRotateClockwise : IconTool;
  return <Icone size={size} color="var(--mantine-color-brique-6)" style={{ flexShrink: 0 }} />;
};

/** « Fait » en un geste, à la date du jour, sans fenêtre (nous ou les enfants, sans rendez-vous : voir faitEnUnGeste). */
export async function faireEnUnGeste(e: Pick<Entretien, "id" | "titre">) {
  if ((await ecrire<unknown>(() => realiserEntretien(e.id))) !== undefined) notifications.show({ color: "green", message: `${e.titre} : fait` });
}

/** Badge d'état : en retard (rouge), à prévoir (orange), rendez-vous pris (bleu), à venir (gris). */
export function BadgeSituation({ e, s }: { e: Pick<Entretien, "avecRdv" | "echeance"> & { heureRdv?: string | null }; s: Situation }) {
  const style = { textTransform: "none", flexShrink: 0 } as const;
  switch (s.etat) {
    case "en_retard":
      return (
        <Badge color="red" variant="light" style={style}>
          En retard de {duree(s.jours)}
        </Badge>
      );
    case "a_prevoir":
      return (
        <Badge color="orange" variant="light" style={style}>
          {e.avecRdv ? "À prendre" : "À faire"} · {s.jours === 0 ? "aujourd'hui" : `dans ${duree(s.jours)}`}
        </Badge>
      );
    case "rdv_pris":
      return (
        <Badge color="blue" variant="light" style={style} leftSection={<IconCalendarCheck size={12} />}>
          {s.dateRdv
            ? `RDV ${s.jours === 0 ? "aujourd'hui" : s.jours === 1 ? "demain" : `le ${dateLisible(s.dateRdv, { day: "numeric", month: "short" })}`}${e.heureRdv ? ` ${libelleHeure(e.heureRdv)}` : ""}`
            : "RDV pris"}
        </Badge>
      );
    case "a_venir":
      return (
        <Badge color="gray" variant="light" style={style}>
          Dans {duree(s.jours)}
        </Badge>
      );
    default:
      return (
        <Badge color="gray" variant="outline" style={style}>
          Terminé
        </Badge>
      );
  }
}

type Saisie = {
  titre: string;
  /** Qui s'en charge : nous, un prestataire (prestataireId) ou les enfants (useMission). */
  qui: Qui;
  /** Il faut d'abord prendre rendez-vous. */
  avecRdv: boolean;
  periodique: boolean;
  intervalleValeur: number | string;
  intervalleUnite: Unite;
  ancrage: "realisation" | "fixe";
  ancrageModifie: boolean;
  derniere: string | null;
  echeance: string | null;
  delai: number | string;
  delaiModifie: boolean;
  prestataireId: string | null;
  notes: string;
  /** Véhicule : « ou tous les N km », kilométrage visé (modification), kilométrage la dernière fois (création). */
  intervalleKm: number | string;
  kmEcheance: number | string;
  kmDerniere: number | string;
};

const VIDE: Saisie = {
  titre: "",
  qui: "nous",
  avecRdv: false,
  periodique: true,
  intervalleValeur: 1,
  intervalleUnite: "an",
  ancrage: "realisation",
  ancrageModifie: false,
  derniere: null,
  echeance: null,
  delai: 7,
  delaiModifie: false,
  prestataireId: null,
  notes: "",
  intervalleKm: "",
  kmEcheance: "",
  kmDerniere: "",
};

/**
 * Défauts qui suivent la saisie tant qu'on ne les a pas changés : le délai d'alerte (rendez-vous, fréquence),
 * et le rythme : à date fixe pour ce qui revient chaque jour ou semaine (la poubelle du mercredi), sinon depuis la dernière fois.
 */
function avecDefauts(s: Saisie): Saisie {
  const rythme = { avecRdv: s.avecRdv, intervalleValeur: s.periodique && typeof s.intervalleValeur === "number" ? s.intervalleValeur : null, intervalleUnite: s.periodique ? s.intervalleUnite : null };
  return {
    ...s,
    ...(s.delaiModifie ? {} : { delai: delaiDefaut(rythme) }),
    ...(s.ancrageModifie ? {} : { ancrage: estFrequente(rythme) ? "fixe" : "realisation" }),
  };
}

const depuis = (e: Entretien): Saisie => ({
  titre: e.titre,
  qui: quiDe(e),
  avecRdv: e.avecRdv,
  periodique: estRecurrent(e) || !!e.intervalleKm,
  intervalleValeur: e.intervalleValeur ?? 1,
  intervalleUnite: (e.intervalleUnite as Unite) ?? "an",
  ancrage: e.ancrage === "fixe" ? "fixe" : "realisation",
  ancrageModifie: true,
  derniere: null,
  echeance: e.echeance,
  delai: e.delaiAlerteJours,
  delaiModifie: true,
  prestataireId: e.prestataireId,
  notes: e.notes ?? "",
  intervalleKm: e.intervalleKm ?? "",
  kmEcheance: e.kmEcheance ?? "",
  kmDerniere: "",
});

/**
 * Les enfants à qui elle est confiée : un (la sienne) ou plusieurs (partagée : le premier qui la fait gagne les points), et les points.
 * `pret` est faux tant que les enfants d'une mission existante ne sont pas chargés (rien n'est alors envoyé).
 */
function useMission(entretien: Entretien | null, opened: boolean) {
  const { data: enfants = [] } = useQuery({ queryKey: ["enfants"], queryFn: () => listeEnfants(), enabled: opened });
  const estMission = !!entretien && entretien.points != null;
  const { data: tour } = useQuery({ queryKey: ["mission", entretien?.id], queryFn: () => enfantsMission(entretien!.id), enabled: opened && estMission });
  const [choix, setChoix] = useState<string[] | null>(null);
  const [pts, setPts] = useState<number | string>(POINTS_DEFAUT);
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? (entretien?.id ?? "nouveau") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    setChoix(estMission ? null : []);
    setPts(entretien?.points ?? POINTS_DEFAUT);
  }
  if (choix === null && tour) setChoix(tour);
  const valeur = choix ?? [];
  return {
    enfants: enfants.filter((e) => e.actif || valeur.includes(e.id)),
    valeur,
    setChoix,
    pts,
    setPts,
    pret: choix !== null,
    estMission,
    mission: { enfants: valeur, points: typeof pts === "number" ? pts : POINTS_DEFAUT },
  };
}

/** Création (entretien absent), éventuellement depuis un modèle de la bibliothèque, ou modification. */
function ModalEntretien({
  ou, categorie, vehicule, entretien, opened, onClose,
}: { ou: Rattachement; categorie: string | null; vehicule: boolean; entretien: Entretien | null; opened: boolean; onClose: () => void }) {
  const { data: modeles = [] } = useQuery({ queryKey: ["modeles"], queryFn: () => listeModeles(), enabled: opened && !entretien });
  const [v, setV] = useState<Saisie>(VIDE);
  const [modele, setModele] = useState<ModeleEntretien | null>(null);
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? (entretien?.id ?? "nouveau") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    setModele(null);
    // Sur la maison elle-même, on ajoute surtout des routines de la semaine (poubelles, tonte…).
    if (opened) setV(entretien ? depuis(entretien) : ou.maisonId ? avecDefauts({ ...VIDE, intervalleUnite: "semaine" }) : avecDefauts(VIDE));
  }
  const maj = (p: Partial<Saisie>) => setV((s) => avecDefauts({ ...s, ...p }));
  const m = useMission(entretien, opened);
  /** Qui s'en charge : le rendez-vous se coche d'office avec un prestataire ; les enfants ne prennent pas de rendez-vous. */
  const choisirQui = (qui: Qui) => maj({ qui, ...(qui === "prestataire" && v.qui !== "prestataire" ? { avecRdv: true } : qui === "enfants" ? { avecRdv: false } : {}) });

  // Modèles de la catégorie de l'élément en premier, puis les autres.
  const choixModeles = useMemo(() => {
    const groupes = new Map<string, { value: string; label: string }[]>();
    const tries = [...modeles].sort((a, b) => Number(b.categorie === categorie) - Number(a.categorie === categorie));
    for (const m of tries) {
      const g = m.categorie ?? "Divers";
      const rythme = [estRecurrent(m) && libelleIntervalle(m), vehicule && m.intervalleKm && libelleKm(m.intervalleKm)].filter(Boolean).join(" ou ") || "une fois";
      groupes.set(g, [...(groupes.get(g) ?? []), { value: m.id, label: `${m.titre} — ${rythme}` }]);
    }
    return [...groupes].map(([group, items]) => ({ group, items }));
  }, [modeles, categorie, vehicule]);
  const appliquer = (id: string | null) => {
    const m = modeles.find((x) => x.id === id) ?? null;
    setModele(m);
    if (!m) return;
    maj({
      titre: m.titre,
      avecRdv: m.avecRdv,
      periodique: estRecurrent(m),
      intervalleValeur: m.intervalleValeur ?? 1,
      intervalleUnite: (m.intervalleUnite as Unite) ?? "an",
      intervalleKm: vehicule ? (m.intervalleKm ?? "") : "",
      delai: m.delaiAlerteJours,
      delaiModifie: true,
    });
  };

  const valeur = typeof v.intervalleValeur === "number" ? v.intervalleValeur : 0;
  // Échéance qui sera retenue à la création : saisie, sinon dernière fois + intervalle, sinon aujourd'hui.
  const echeancePrevue = v.echeance ?? (v.periodique && v.derniere && valeur ? ajouter(v.derniere, valeur, v.intervalleUnite) : aujourdhui());
  const delai = typeof v.delai === "number" ? v.delai : 0;
  const intervalleKm = vehicule && v.periodique && typeof v.intervalleKm === "number" && v.intervalleKm >= 100 ? v.intervalleKm : null;
  // Au kilométrage, l'intervalle de temps devient facultatif (« tous les 40 000 km »).
  // Qui s'en charge : un prestataire choisi, ou au moins un enfant.
  const quiComplet = v.qui === "nous" || (v.qui === "prestataire" ? !!v.prestataireId : m.pret && m.valeur.length > 0);
  const valide = v.titre.trim() && (!v.periodique || valeur >= 1 || intervalleKm) && typeof v.delai === "number" && (!entretien || v.echeance) && quiComplet;
  // Mission : envoyée si confiée aux enfants ; retirée si elle l'était et ne l'est plus ; sinon rien.
  const mission = v.qui === "enfants" ? m.mission : m.estMission ? null : undefined;

  const enregistrer = async () => {
    const valeurs = {
      titre: v.titre,
      avecRdv: v.avecRdv,
      intervalleValeur: v.periodique && valeur ? valeur : null,
      intervalleUnite: v.periodique && valeur ? v.intervalleUnite : null,
      intervalleKm,
      ancrage: v.ancrage,
      delaiAlerteJours: delai,
      prestataireId: v.qui === "prestataire" ? v.prestataireId : null,
      notes: v.notes,
      ...(mission !== undefined ? { mission } : {}),
    };
    const res = await ecrire<unknown>(() =>
      entretien
        ? majEntretien(
            entretien.id,
            { ...valeurs, echeance: v.echeance!, ...(intervalleKm && typeof v.kmEcheance === "number" ? { kmEcheance: v.kmEcheance } : {}) },
            entretien.modifieLe,
          )
        : creerEntretien({
            ...valeurs,
            ...ou,
            echeance: v.echeance ?? undefined,
            derniereRealisation: v.periodique ? v.derniere : null,
            kmDerniere: intervalleKm && typeof v.kmDerniere === "number" ? v.kmDerniere : null,
          }),
    );
    if (res !== undefined) onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={entretien ? `Modifier : ${entretien.titre}` : "Nouvelle chose à faire"} size="lg">
      <Stack>
        {!entretien && (
          <Select
            label="Partir d'un modèle"
            placeholder={ou.maisonId ? "Sortir la poubelle jaune, arroser les plantes…" : "Vidange de fosse septique, entretien de chaudière…"}
            data={choixModeles}
            value={modele?.id ?? null}
            onChange={appliquer}
            searchable
            clearable
            nothingFoundMessage="Aucun modèle"
          />
        )}
        {modele?.description && (
          <Alert color="brique" variant="light" p="xs">
            <Text size="sm">{modele.description}</Text>
          </Alert>
        )}
        <TextInput label="Titre" placeholder={ou.maisonId ? "Sortir la poubelle verte, tondre la pelouse…" : "Entretien annuel, nettoyage du filtre…"} required value={v.titre} onChange={(e) => maj({ titre: e.currentTarget.value })} data-autofocus={!!entretien} />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Fréquence
          </Text>
          <SegmentedControl
            fullWidth
            value={v.periodique ? "oui" : "non"}
            onChange={(x) => maj({ periodique: x === "oui" })}
            data={[
              { value: "oui", label: "Routine : elle revient" },
              { value: "non", label: "Tâche : une seule fois" },
            ]}
          />
        </div>
        {v.periodique && (
          <>
            <Group grow align="flex-end">
              <NumberInput
                label={v.intervalleUnite === "semaine" ? "Toutes les" : "Tous les"}
                min={1}
                max={1000}
                allowDecimal={false}
                value={v.intervalleValeur}
                onChange={(x) => maj({ intervalleValeur: x })}
              />
              <Select
                aria-label="Unité"
                data={[
                  { value: "jour", label: "jours" },
                  { value: "semaine", label: valeur > 1 ? "semaines" : "semaine" },
                  { value: "mois", label: "mois" },
                  { value: "an", label: valeur > 1 ? "ans" : "an" },
                ]}
                value={v.intervalleUnite}
                onChange={(u) => u && maj({ intervalleUnite: u as Unite })}
                allowDeselect={false}
              />
            </Group>
            {vehicule && (
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <NumberInput
                  label="Ou tous les"
                  description="Au premier atteint des deux"
                  suffix=" km"
                  thousandSeparator=" "
                  min={0}
                  step={1000}
                  allowDecimal={false}
                  value={v.intervalleKm}
                  onChange={(x) => maj({ intervalleKm: x })}
                />
                {intervalleKm &&
                  (entretien ? (
                    <NumberInput
                      label="Prochaine fois à"
                      suffix=" km"
                      thousandSeparator=" "
                      min={0}
                      allowDecimal={false}
                      value={v.kmEcheance}
                      onChange={(x) => maj({ kmEcheance: x })}
                    />
                  ) : (
                    <NumberInput
                      label="Kilométrage la dernière fois"
                      description="Sinon : le compteur actuel"
                      suffix=" km"
                      thousandSeparator=" "
                      min={0}
                      allowDecimal={false}
                      value={v.kmDerniere}
                      onChange={(x) => maj({ kmDerniere: x })}
                    />
                  ))}
              </SimpleGrid>
            )}
            <Radio.Group label="Échéance suivante" value={v.ancrage} onChange={(a) => maj({ ancrage: a as Saisie["ancrage"], ancrageModifie: true })}>
              <Stack gap={6} mt={4}>
                <Radio value="realisation" label="Comptée depuis le jour où c'est fait" />
                <Radio value="fixe" label="À date fixe (garder le même calendrier, même en cas de retard)" />
              </Stack>
            </Radio.Group>
          </>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {!entretien && v.periodique && (
            <ChampDate label="Dernière fois" description="Si vous le savez : l'échéance en découle" value={v.derniere} onChange={(d) => maj({ derniere: d })} />
          )}
          <ChampDate
            label={intervalleKm ? "Prochaine échéance (au temps)" : v.periodique ? "Prochaine échéance" : "À faire pour le"}
            description={entretien ? undefined : `Sinon : ${dateLisible(echeancePrevue)}`}
            required={!!entretien}
            value={v.echeance}
            onChange={(d) => maj({ echeance: d })}
          />
        </SimpleGrid>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Qui s'en charge
          </Text>
          <SegmentedControl
            fullWidth
            value={v.qui}
            onChange={(q) => choisirQui(q as Qui)}
            data={[
              { value: "nous", label: QUI.nous },
              { value: "prestataire", label: QUI.prestataire },
              { value: "enfants", label: QUI.enfants, disabled: m.enfants.length === 0 && v.qui !== "enfants" },
            ]}
          />
          {v.qui === "nous" && !v.avecRdv && (
            <Text size="xs" c="dimmed" mt={4}>
              « Fait » en un geste ; coût et facture restent possibles.
            </Text>
          )}
          {v.qui === "enfants" && m.enfants.length === 0 && (
            <Text size="xs" c="dimmed" mt={4}>
              Ajoutez d'abord les enfants dans la page Famille.
            </Text>
          )}
        </div>
        {v.qui === "prestataire" && <ChampPrestataire label="Prestataire" value={v.prestataireId} onChange={(p) => maj({ prestataireId: p })} />}
        {v.qui === "enfants" && m.enfants.length > 0 && (
          <Group grow align="flex-start">
            <MultiSelect
              label="Enfants"
              description={m.valeur.length > 1 ? "Partagée : le premier qui la fait gagne les points" : "Plusieurs : partagée, le premier qui la fait gagne les points"}
              placeholder={m.valeur.length ? undefined : "Au moins un enfant"}
              data={m.enfants.map((e) => ({ value: e.id, label: e.prenom }))}
              value={m.valeur}
              onChange={m.setChoix}
            />
            <NumberInput label="Points" description="Gagnés une fois validée par un parent" min={0} max={1000} allowDecimal={false} value={m.pts} onChange={m.setPts} />
          </Group>
        )}
        {v.qui !== "enfants" && (
          <Checkbox
            label="Il faut d'abord prendre rendez-vous"
            description="Une étape en plus, « rendez-vous pris » : relancé tant qu'il n'est pas pris, puis rappel la veille."
            checked={v.avecRdv}
            onChange={(x) => maj({ avecRdv: x.currentTarget.checked })}
          />
        )}
        <NumberInput
          label="Me prévenir"
          description={delai ? `${libelleDelai(delai)} avant l'échéance${v.avecRdv ? " : le temps de trouver un créneau" : ""}` : "Le jour de l'échéance"}
          suffix=" jours avant"
          min={0}
          max={3650}
          allowDecimal={false}
          value={v.delai}
          onChange={(x) => maj({ delai: x, delaiModifie: true })}
        />
        <Textarea label="Notes" autosize minRows={2} value={v.notes} onChange={(e) => maj({ notes: e.currentTarget.value })} />
        <Button onClick={enregistrer} disabled={!valide}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

/** Rendez-vous pris : date (facultative si pas encore fixée), heure et durée (facultatives), prestataire. */
export function ModalRdv({ entretien, onClose }: { entretien: LigneEntretien | null; onClose: () => void }) {
  const [dateRdv, setDateRdv] = useState<string | null>(null);
  const [heure, setHeure] = useState("");
  const [duree, setDuree] = useState("60");
  const [prestataireId, setPrestataireId] = useState<string | null>(null);
  const [cle, setCle] = useState<string | null>(null);
  if ((entretien?.id ?? null) !== cle) {
    setCle(entretien?.id ?? null);
    setDateRdv(entretien?.dateRdv ?? null);
    setHeure(entretien?.heureRdv ?? "");
    setDuree(String(entretien?.dureeRdvMinutes ?? 60));
    setPrestataireId(entretien?.prestataireId ?? null);
  }
  const avecHeure = !!dateRdv && !!heure;
  return (
    <Modal opened={!!entretien} onClose={onClose} title={entretien ? `Rendez-vous pris : ${entretien.titre}` : ""}>
      <Stack>
        <ChampPrestataire value={prestataireId} onChange={setPrestataireId} />
        <ChampDate label="Date du rendez-vous" description="Vous serez prévenu la veille." value={dateRdv} onChange={setDateRdv} data-autofocus />
        {dateRdv && (
          <Group grow align="flex-start">
            <TimeInput label="Heure" description="Facultative" value={heure} onChange={(e) => setHeure(e.currentTarget.value)} />
            <Select
              label="Durée"
              description={avecHeure ? libelleHeure(heure, Number(duree)) : " "}
              data={DUREES_RDV.map((m) => ({ value: String(m), label: libelleDuree(m) }))}
              value={duree}
              onChange={(d) => d && setDuree(d)}
              allowDeselect={false}
              disabled={!heure}
            />
          </Group>
        )}
        <Text size="xs" c="dimmed">
          {avecHeure ? "Dans l'agenda : un créneau, avec une alarme une heure avant." : "Sans heure : la journée entière dans l'agenda."}
        </Text>
        <Button
          onClick={async () => {
            const v = { dateRdv, heureRdv: avecHeure ? heure : null, dureeRdvMinutes: avecHeure ? Number(duree) : null, prestataireId };
            if ((await ecrire(() => prendreRdv(entretien!.id, v))) !== undefined) onClose();
          }}
        >
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

/**
 * Passer cette fois (l'occurrence est sautée, notée « passée » dans l'historique) ou reporter cette échéance
 * à une autre date (le rythme ne bouge pas).
 */
export function ModalEcheance({ cible, onClose }: { cible: { e: LigneEntretien; mode: "passer" | "reporter" } | null; onClose: () => void }) {
  const [motif, setMotif] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = cible ? `${cible.e.id}-${cible.mode}` : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    setMotif("");
    setDate(null);
  }
  if (!cible) return <Modal opened={false} onClose={onClose} />;
  const { e, mode } = cible;
  const origine = e.echeanceInitiale ?? e.echeance;
  const suivante = echeanceApresPassage(e, aujourdhui());
  const valider = async () => {
    const r = await ecrire<unknown>(() => (mode === "passer" ? passerEcheance(e.id, { motif }) : reporterEcheance(e.id, { date: date! })));
    if (r !== undefined) onClose();
  };
  return (
    <Modal opened onClose={onClose} title={mode === "passer" ? `Passer cette fois : ${e.titre}` : `Reporter : ${e.titre}`}>
      <Stack>
        {mode === "passer" ? (
          <>
            <Text size="sm">
              L'échéance du {dateLisible(origine)} est notée « passée » dans l'historique : ni faite, ni comptée dans les dépenses.{" "}
              {suivante ? `Prochaine échéance : ${dateLisible(suivante)}.` : "C'était une action ponctuelle : elle sera close."}
              {e.etat === "rdv_pris" && " Le rendez-vous en cours est annulé."}
            </Text>
            <Textarea label="Motif" description="Facultatif" placeholder="Haie peu poussée cette année, absents…" autosize minRows={2} value={motif} onChange={(x) => setMotif(x.currentTarget.value)} data-autofocus />
          </>
        ) : (
          <>
            <Text size="sm">
              Seule cette échéance bouge{e.ancrage === "fixe" && estRecurrent(e) ? ` : la suivante reste calculée depuis le ${dateLisible(origine)}` : ""}.
            </Text>
            <ChampDate label="Nouvelle date" required value={date} onChange={setDate} data-autofocus />
          </>
        )}
        <Button onClick={valider} disabled={mode === "reporter" && !date} leftSection={mode === "passer" ? <IconPlayerSkipForward size={16} /> : <IconClockPause size={16} />}>
          {mode === "passer" ? "Passer cette fois" : "Reporter"}
        </Button>
      </Stack>
    </Modal>
  );
}

export type ActionsLigne = { onModifier: () => void; onRdv: () => void; onFait: () => void; onFaitDetails: () => void; onEcheance: (mode: "passer" | "reporter") => void };

/** Une chose à faire, avec ses actions ; `ou` : où elle se trouve (dans une liste qui mélange les éléments). */
export function Ligne({ e, ou, onModifier, onRdv, onFait, onFaitDetails, onEcheance }: { e: LigneEntretien; ou?: ReactNode } & ActionsLigne) {
  const s = situation(e, aujourdhui());
  const aPrendre = e.actif && e.avecRdv && e.etat !== "rdv_pris";
  // Bouton d'action seulement quand c'est d'actualité ; sinon, dans le menu.
  const urgent = s.etat === "en_retard" || s.etat === "a_prevoir" || s.etat === "rdv_pris";
  const supprimer = () =>
    modals.openConfirmModal({
      title: `Supprimer « ${e.titre} » ?`,
      children: <Text size="sm">Ce qui a déjà été fait reste dans l'historique. Pour l'arrêter sans le perdre, suspendez-le plutôt.</Text>,
      labels: { confirm: "Supprimer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: () => ecrire(() => supprimerEntretien(e.id)),
    });
  const details = [
    e.actif && (estRecurrent(e) || e.intervalleKm)
      ? [estRecurrent(e) && libelleIntervalle(e), e.intervalleKm && libelleKm(e.intervalleKm)].filter(Boolean).join(" ou ")
      : null,
    e.actif && e.kmEcheance != null ? `à ${km(e.kmEcheance)}` : null,
    e.actif ? `échéance ${dateLisible(e.echeance)}${e.echeanceInitiale ? ` (reportée, prévue le ${dateLisible(e.echeanceInitiale)})` : ""}` : null,
    e.prestataireNom,
  ].filter(Boolean);

  return (
    <Group gap="sm" wrap="nowrap" py="xs" align="flex-start" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }} opacity={e.actif ? 1 : 0.6}>
      <Box mt={2}>
        <IconeChose e={e} />
      </Box>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs">
          <Text fw={600} size="sm">
            {e.titre}
          </Text>
          <BadgeSituation e={e} s={s} />
          <BadgeMission e={e} />
        </Group>
        {ou}
        <Text size="xs" c="dimmed">
          {genre(e)}
          {e.avecRdv ? " sur rendez-vous" : ""}
          {details.length > 0 && ` · ${details.join(" · ")}`}
        </Text>
        {e.notes && (
          <Text size="xs" c="dimmed" mt={2} style={{ whiteSpace: "pre-line" }}>
            {e.notes}
          </Text>
        )}
      </Box>
      {urgent && (
        <Button size="xs" variant={aPrendre ? "light" : "filled"} leftSection={aPrendre ? <IconCalendarCheck size={14} /> : <IconCheck size={14} />} onClick={aPrendre ? onRdv : onFait}>
          {aPrendre ? "RDV pris" : "Fait"}
        </Button>
      )}
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label="Actions">
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {aPrendre && !urgent && (
            <Menu.Item leftSection={<IconCalendarCheck size={14} />} onClick={onRdv}>
              Rendez-vous pris…
            </Menu.Item>
          )}
          {e.actif && (aPrendre || !urgent) && (
            <Menu.Item leftSection={<IconCheck size={14} />} onClick={onFait}>
              Marquer comme fait
            </Menu.Item>
          )}
          {e.actif && faitEnUnGeste(e) && (
            <Menu.Item leftSection={<IconReceipt size={14} />} onClick={onFaitDetails}>
              Fait, avec coût ou facture…
            </Menu.Item>
          )}
          {e.etat === "rdv_pris" && (
            <>
              <Menu.Item leftSection={<IconCalendarEvent size={14} />} onClick={onRdv}>
                Modifier le rendez-vous
              </Menu.Item>
              <Menu.Item leftSection={<IconCalendarX size={14} />} onClick={() => ecrire(() => annulerRdv(e.id))}>
                Annuler le rendez-vous
              </Menu.Item>
            </>
          )}
          {e.actif && (
            <>
              <Menu.Item leftSection={<IconClockPause size={14} />} onClick={() => onEcheance("reporter")}>
                Reporter à…
              </Menu.Item>
              <Menu.Item leftSection={<IconPlayerSkipForward size={14} />} onClick={() => onEcheance("passer")}>
                Passer cette fois…
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          <Menu.Item leftSection={<IconPencil size={14} />} onClick={onModifier}>
            Modifier
          </Menu.Item>
          <Menu.Item
            leftSection={e.actif ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
            onClick={() => ecrire(() => majEntretien(e.id, { actif: !e.actif }, e.modifieLe))}
          >
            {e.actif ? "Suspendre (plus d'alertes)" : "Réactiver"}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={supprimer}>
            Supprimer
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

/**
 * Actions sur des choses à faire et leurs fenêtres (modifier, rendez-vous, fait, reporter) : `actions(e)` pour une
 * ligne, `ajouter(ou)` pour une nouvelle, et `modales` à placer dans la page. Par défaut, le formulaire d'un élément
 * de la catégorie et du type donnés ; une ligne qui porte son type d'élément (LigneAvecLieu) l'emporte.
 */
export function useActionsEntretiens(defaut: { categorie?: string | null; vehicule?: boolean } = {}) {
  const [edition, setEdition] = useState<{ entretien: Entretien | null; ou: Rattachement; categorie: string | null; vehicule: boolean } | null>(null);
  const [rdv, setRdv] = useState<LigneEntretien | null>(null);
  const [fait, setFait] = useState<LigneAvecLieu | null>(null);
  const [echeance, setEcheance] = useState<{ e: LigneEntretien; mode: "passer" | "reporter" } | null>(null);
  const vehicule = (e: LigneAvecLieu) => (e.elementType !== undefined ? e.elementType === "vehicule" : !!defaut.vehicule);
  const actions = (e: LigneAvecLieu): ActionsLigne => ({
    onModifier: () =>
      setEdition({
        entretien: e,
        ou: e.elementId ? { elementId: e.elementId } : { maisonId: e.maisonId! },
        categorie: e.elementCategorie !== undefined ? e.elementCategorie : (defaut.categorie ?? null),
        vehicule: vehicule(e),
      }),
    onRdv: () => setRdv(e),
    onFait: () => (faitEnUnGeste(e) ? faireEnUnGeste(e) : setFait(e)),
    onFaitDetails: () => setFait(e),
    onEcheance: (mode) => setEcheance({ e, mode }),
  });
  const ajouter = (ou: Rattachement, categorie = defaut.categorie ?? null, estVehicule = !!defaut.vehicule) =>
    setEdition({ entretien: null, ou, categorie, vehicule: estVehicule });
  const modales = (
    <>
      <ModalEntretien
        ou={edition?.ou ?? { maisonId: "" }}
        categorie={edition?.categorie ?? null}
        vehicule={edition?.vehicule ?? false}
        entretien={edition?.entretien ?? null}
        opened={!!edition}
        onClose={() => setEdition(null)}
      />
      <ModalRdv entretien={rdv} onClose={() => setRdv(null)} />
      <ModalEcheance cible={echeance} onClose={() => setEcheance(null)} />
      <ModalRealisation cible={fait ? { mode: "entretien", entretien: fait } : null} vehicule={fait ? vehicule(fait) : false} onClose={() => setFait(null)} />
    </>
  );
  return { actions, ajouter, modales };
}

/** Choses à faire d'un élément ou d'une maison : en cours, et celles qui sont terminées ou suspendues (repliées). */
export function Entretiens({
  ou, categorie, entretiens, archive, vehicule = false,
}: { ou: Rattachement; categorie: string | null; entretiens: LigneEntretien[]; archive: boolean; vehicule?: boolean }) {
  const { actions, ajouter, modales } = useActionsEntretiens({ categorie, vehicule });
  const [voirInactifs, setVoirInactifs] = useState(false);
  const actifs = entretiens.filter((e) => e.actif);
  const inactifs = entretiens.filter((e) => !e.actif);
  const ligne = (e: LigneEntretien) => <Ligne key={e.id} e={e} {...actions(e)} />;

  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconListCheck size={18} />
          <Title order={4}>À faire</Title>
        </Group>
        {!archive && (
          <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => ajouter(ou)}>
            Ajouter
          </Button>
        )}
      </Group>

      {actifs.length === 0 && (
        <Text size="sm" c="dimmed" py="md" ta="center">
          {archive
            ? "Archivé : plus rien de suivi."
            : ou.maisonId
              ? "Sortir les poubelles, tondre, arroser… Ce qui se fait sur la maison elle-même, sans équipement particulier."
              : vehicule
                ? "Contrôle technique, révision au kilométrage, courroie de distribution… Partez d'un modèle ou décrivez le vôtre."
              : "Vidange tous les 4 ans, entretien annuel, nettoyage d'un filtre… Partez d'un modèle ou décrivez le vôtre."}
        </Text>
      )}
      <Stack gap={0}>{actifs.map(ligne)}</Stack>
      {inactifs.length > 0 && (
        <>
          <UnstyledButton onClick={() => setVoirInactifs((o) => !o)} mt="xs">
            <Group gap={4} c="dimmed">
              {voirInactifs ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              <Text size="xs">Terminés ou suspendus ({inactifs.length})</Text>
            </Group>
          </UnstyledButton>
          <Collapse expanded={voirInactifs}>
            <Stack gap={0}>{inactifs.map(ligne)}</Stack>
          </Collapse>
        </>
      )}
      {modales}
    </Card>
  );
}
