import { useMemo, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Button, Card, Collapse, Group, Menu, Modal, MultiSelect, NumberInput, Radio, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Title, UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { TimeInput } from "@mantine/dates";
import {
  IconCalendarCheck, IconCalendarEvent, IconCalendarX, IconCheck, IconChevronDown, IconChevronRight, IconClockPause, IconDots, IconPlayerPause, IconPlayerPlay,
  IconPlayerSkipForward, IconPencil, IconPlus, IconListCheck, IconRotateClockwise, IconTool, IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  annulerRdv, creerEntretien, listeModeles, majEntretien, passerEcheance, prendreRdv, realiserEntretien, reporterEcheance, supprimerEntretien, type Rattachement,
} from "../data/entretiens";
import type { Entretien, ModeleEntretien } from "../db/schema";
import { aujourdhui, dateLisible, duree } from "../lib/dates";
import {
  ajouter, DELAI_DEFAUT, DUREES_RDV, echeanceApresPassage, estRecurrent, libelleDelai, libelleDuree, libelleHeure, libelleIntervalle, NATURES, situation, type Nature,
  type Situation, type Unite,
} from "../lib/entretiens";
import { ecrire } from "../lib/query";
import { km, libelleKm } from "../lib/vehicules";
import { ChampDate, ChampPrestataire } from "./Champs";
import { enfantsMission, listeEnfants } from "../data/famille";
import { POINTS_DEFAUT } from "../lib/famille";
import { ModalRealisation } from "./ModalRealisation";

export type LigneEntretien = Entretien & { prestataireNom: string | null };

/** Icône d'une chose à faire selon sa nature. */
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

export const IconeNature = ({ nature, size = 20 }: { nature: string; size?: number }) => {
  const Icone = nature === "rdv" ? IconCalendarEvent : nature === "routine" ? IconRotateClockwise : IconTool;
  return <Icone size={size} color="var(--mantine-color-brique-6)" style={{ flexShrink: 0 }} />;
};

/** Routine : « Fait » en un geste, à la date du jour, sans fenêtre. */
export async function faireRoutine(e: Pick<Entretien, "id" | "titre">) {
  if ((await ecrire<unknown>(() => realiserEntretien(e.id))) !== undefined) notifications.show({ color: "green", message: `${e.titre} : fait` });
}

/** Badge d'état : en retard (rouge), à prévoir (orange), rendez-vous pris (bleu), à venir (gris). */
export function BadgeSituation({ e, s }: { e: Pick<Entretien, "nature" | "echeance"> & { heureRdv?: string | null }; s: Situation }) {
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
          {e.nature === "rdv" ? "À prendre" : "À faire"} · {s.jours === 0 ? "aujourd'hui" : `dans ${duree(s.jours)}`}
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
  nature: Nature;
  periodique: boolean;
  intervalleValeur: number | string;
  intervalleUnite: Unite;
  ancrage: "realisation" | "fixe";
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
  nature: "tache",
  periodique: true,
  intervalleValeur: 1,
  intervalleUnite: "an",
  ancrage: "realisation",
  derniere: null,
  echeance: null,
  delai: DELAI_DEFAUT.tache,
  delaiModifie: false,
  prestataireId: null,
  notes: "",
  intervalleKm: "",
  kmEcheance: "",
  kmDerniere: "",
};

const depuis = (e: Entretien): Saisie => ({
  titre: e.titre,
  nature: e.nature as Nature,
  periodique: estRecurrent(e) || !!e.intervalleKm,
  intervalleValeur: e.intervalleValeur ?? 1,
  intervalleUnite: (e.intervalleUnite as Unite) ?? "an",
  ancrage: e.ancrage === "fixe" ? "fixe" : "realisation",
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
 * Confier aux enfants : un enfant (la sienne) ou plusieurs (partagée : le premier qui la fait gagne les points), et les points.
 * `mission` vaut undefined tant que les enfants d'une mission existante n'est pas chargé (rien n'est alors envoyé).
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
  const points = typeof pts === "number" ? pts : POINTS_DEFAUT;
  const champ =
    enfants.length === 0 ? null : (
      <Card withBorder p="sm">
        <Stack gap="xs">
          <MultiSelect
            label="Confier aux enfants"
            description={valeur.length > 1 ? "Partagée : n'importe lequel peut la faire, celui qui la fait gagne les points" : "Plusieurs : partagée, le premier qui la fait gagne les points"}
            placeholder={valeur.length ? undefined : "Personne : ce n'est pas une mission"}
            data={enfants.filter((e) => e.actif || valeur.includes(e.id)).map((e) => ({ value: e.id, label: e.prenom }))}
            value={valeur}
            onChange={setChoix}
            clearable
          />
          {valeur.length > 0 && (
            <NumberInput label="Points" description="Gagnés une fois la mission validée par un parent" min={0} max={1000} allowDecimal={false} value={pts} onChange={setPts} w={200} />
          )}
        </Stack>
      </Card>
    );
  return { champ, mission: choix === null ? undefined : valeur.length ? { enfants: valeur, points } : null };
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
    // Sur la maison elle-même, on ajoute surtout des routines (poubelles, tonte…).
    if (opened) setV(entretien ? depuis(entretien) : ou.maisonId ? { ...VIDE, nature: "routine", delai: DELAI_DEFAUT.routine, ancrage: "fixe", intervalleUnite: "semaine" } : VIDE);
  }
  const maj = (p: Partial<Saisie>) => setV((s) => ({ ...s, ...p }));
  const { champ: champMission, mission } = useMission(entretien, opened);

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
      nature: m.nature as Nature,
      periodique: estRecurrent(m),
      intervalleValeur: m.intervalleValeur ?? 1,
      intervalleUnite: (m.intervalleUnite as Unite) ?? "an",
      intervalleKm: vehicule ? (m.intervalleKm ?? "") : "",
      delai: m.delaiAlerteJours,
      ...(m.nature === "routine" ? { ancrage: "fixe" as const } : {}),
      delaiModifie: false,
    });
  };

  const valeur = typeof v.intervalleValeur === "number" ? v.intervalleValeur : 0;
  // Échéance qui sera retenue à la création : saisie, sinon dernière fois + intervalle, sinon aujourd'hui.
  const echeancePrevue = v.echeance ?? (v.periodique && v.derniere && valeur ? ajouter(v.derniere, valeur, v.intervalleUnite) : aujourdhui());
  const delai = typeof v.delai === "number" ? v.delai : 0;
  const routine = v.nature === "routine";
  const intervalleKm = vehicule && v.periodique && typeof v.intervalleKm === "number" && v.intervalleKm >= 100 ? v.intervalleKm : null;
  // Au kilométrage, l'intervalle de temps devient facultatif (« tous les 40 000 km »).
  const valide = v.titre.trim() && (!v.periodique || valeur >= 1 || intervalleKm) && typeof v.delai === "number" && (!entretien || v.echeance);

  const enregistrer = async () => {
    const valeurs = {
      titre: v.titre,
      nature: v.nature,
      intervalleValeur: v.periodique && valeur ? valeur : null,
      intervalleUnite: v.periodique && valeur ? v.intervalleUnite : null,
      intervalleKm,
      ancrage: v.ancrage,
      delaiAlerteJours: delai,
      prestataireId: routine ? null : v.prestataireId,
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
            Nature
          </Text>
          <SegmentedControl
            fullWidth
            value={v.nature}
            onChange={(n) =>
              maj({
                nature: n as Nature,
                ...(v.delaiModifie ? {} : { delai: DELAI_DEFAUT[n as Nature] }),
                // Une routine garde ses jours (le ramassage du mercredi), même faite en avance ou en retard.
                ...(n === "routine" && !entretien ? { ancrage: "fixe" as const } : {}),
              })
            }
            data={[
              { value: "tache", label: "Tâche" },
              { value: "rdv", label: "Rendez-vous" },
              { value: "routine", label: "Routine" },
            ]}
          />
        </div>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Fréquence
          </Text>
          <SegmentedControl
            fullWidth
            value={v.periodique ? "oui" : "non"}
            onChange={(x) => maj({ periodique: x === "oui" })}
            data={[
              { value: "oui", label: "Périodique" },
              { value: "non", label: "Une seule fois" },
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
            <Radio.Group label="Échéance suivante" value={v.ancrage} onChange={(a) => maj({ ancrage: a as Saisie["ancrage"] })}>
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
        <NumberInput
          label="Me prévenir"
          description={delai ? `${libelleDelai(delai)} avant l'échéance${v.nature === "rdv" ? " : le temps de trouver un créneau" : ""}` : "Le jour de l'échéance"}
          suffix=" jours avant"
          min={0}
          max={3650}
          allowDecimal={false}
          value={v.delai}
          onChange={(x) => maj({ delai: x, delaiModifie: true })}
        />
        {routine ? (
          <Text size="xs" c="dimmed">
            Routine : « Fait » en un geste, sans coût ni prestataire. À noter le jour où il faut le faire (la veille du ramassage pour les poubelles).
          </Text>
        ) : (
          <ChampPrestataire label="Prestataire habituel" value={v.prestataireId} onChange={(p) => maj({ prestataireId: p })} />
        )}
        {champMission}
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

function Ligne({
  e, onModifier, onRdv, onFait, onEcheance,
}: { e: LigneEntretien; onModifier: () => void; onRdv: () => void; onFait: () => void; onEcheance: (mode: "passer" | "reporter") => void }) {
  const s = situation(e, aujourdhui());
  const aPrendre = e.actif && e.nature === "rdv" && e.etat !== "rdv_pris";
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
        <IconeNature nature={e.nature} />
      </Box>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs">
          <Text fw={600} size="sm">
            {e.titre}
          </Text>
          <BadgeSituation e={e} s={s} />
          <BadgeMission e={e} />
        </Group>
        <Text size="xs" c="dimmed">
          {NATURES[e.nature as Nature]}
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

/** Choses à faire d'un élément ou d'une maison : en cours, et celles qui sont terminées ou suspendues (repliées). */
export function Entretiens({
  ou, categorie, entretiens, archive, vehicule = false,
}: { ou: Rattachement; categorie: string | null; entretiens: LigneEntretien[]; archive: boolean; vehicule?: boolean }) {
  const [edition, setEdition] = useState<{ entretien: Entretien | null } | null>(null);
  const [rdv, setRdv] = useState<LigneEntretien | null>(null);
  const [fait, setFait] = useState<LigneEntretien | null>(null);
  const [echeance, setEcheance] = useState<{ e: LigneEntretien; mode: "passer" | "reporter" } | null>(null);
  const [voirInactifs, setVoirInactifs] = useState(false);
  const actifs = entretiens.filter((e) => e.actif);
  const inactifs = entretiens.filter((e) => !e.actif);
  const ligne = (e: LigneEntretien) => (
    <Ligne
      key={e.id}
      e={e}
      onModifier={() => setEdition({ entretien: e })}
      onRdv={() => setRdv(e)}
      onFait={() => (e.nature === "routine" ? faireRoutine(e) : setFait(e))}
      onEcheance={(mode) => setEcheance({ e, mode })}
    />
  );

  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconListCheck size={18} />
          <Title order={4}>À faire</Title>
        </Group>
        {!archive && (
          <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => setEdition({ entretien: null })}>
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

      <ModalEntretien ou={ou} categorie={categorie} vehicule={vehicule} entretien={edition?.entretien ?? null} opened={!!edition} onClose={() => setEdition(null)} />
      <ModalRdv entretien={rdv} onClose={() => setRdv(null)} />
      <ModalEcheance cible={echeance} onClose={() => setEcheance(null)} />
      <ModalRealisation cible={fait ? { mode: "entretien", entretien: fait } : null} vehicule={vehicule} onClose={() => setFait(null)} />
    </Card>
  );
}
