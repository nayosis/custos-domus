import { useMemo, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Button, Card, Collapse, Group, Menu, Modal, NumberInput, Radio, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Title, UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconCalendarCheck, IconCalendarEvent, IconCalendarX, IconCheck, IconChevronDown, IconChevronRight, IconDots, IconPlayerPause, IconPlayerPlay, IconPencil, IconPlus, IconRepeat, IconTool, IconTrash,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { annulerRdv, creerEntretien, listeModeles, majEntretien, prendreRdv, supprimerEntretien } from "../data/entretiens";
import type { Entretien, ModeleEntretien } from "../db/schema";
import { aujourdhui, dateLisible, duree } from "../lib/dates";
import {
  ajouter, DELAI_DEFAUT, estRecurrent, libelleDelai, libelleIntervalle, NATURES, situation, type Nature, type Situation, type Unite,
} from "../lib/entretiens";
import { ecrire } from "../lib/query";
import { ChampDate, ChampPrestataire } from "./Champs";
import { ModalRealisation } from "./ModalRealisation";

export type LigneEntretien = Entretien & { prestataireNom: string | null };

/** Badge d'état : en retard (rouge), à prévoir (orange), rendez-vous pris (bleu), à venir (gris). */
export function BadgeSituation({ e, s }: { e: Pick<Entretien, "nature" | "echeance">; s: Situation }) {
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
          {s.dateRdv ? `RDV ${s.jours === 0 ? "aujourd'hui" : s.jours === 1 ? "demain" : `le ${dateLisible(s.dateRdv, { day: "numeric", month: "short" })}`}` : "RDV pris"}
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
};

const depuis = (e: Entretien): Saisie => ({
  titre: e.titre,
  nature: e.nature as Nature,
  periodique: estRecurrent(e),
  intervalleValeur: e.intervalleValeur ?? 1,
  intervalleUnite: (e.intervalleUnite as Unite) ?? "an",
  ancrage: e.ancrage === "fixe" ? "fixe" : "realisation",
  derniere: null,
  echeance: e.echeance,
  delai: e.delaiAlerteJours,
  delaiModifie: true,
  prestataireId: e.prestataireId,
  notes: e.notes ?? "",
});

/** Création (entretien absent), éventuellement depuis un modèle de la bibliothèque, ou modification. */
function ModalEntretien({ elementId, categorie, entretien, opened, onClose }: { elementId: string; categorie: string | null; entretien: Entretien | null; opened: boolean; onClose: () => void }) {
  const { data: modeles = [] } = useQuery({ queryKey: ["modeles"], queryFn: () => listeModeles(), enabled: opened && !entretien });
  const [v, setV] = useState<Saisie>(VIDE);
  const [modele, setModele] = useState<ModeleEntretien | null>(null);
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? (entretien?.id ?? "nouveau") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    setModele(null);
    if (opened) setV(entretien ? depuis(entretien) : VIDE);
  }
  const maj = (p: Partial<Saisie>) => setV((s) => ({ ...s, ...p }));

  // Modèles de la catégorie de l'élément en premier, puis les autres.
  const choixModeles = useMemo(() => {
    const groupes = new Map<string, { value: string; label: string }[]>();
    const tries = [...modeles].sort((a, b) => Number(b.categorie === categorie) - Number(a.categorie === categorie));
    for (const m of tries) {
      const g = m.categorie ?? "Divers";
      groupes.set(g, [...(groupes.get(g) ?? []), { value: m.id, label: `${m.titre} — ${libelleIntervalle(m)}` }]);
    }
    return [...groupes].map(([group, items]) => ({ group, items }));
  }, [modeles, categorie]);
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
      delai: m.delaiAlerteJours,
      delaiModifie: false,
    });
  };

  const valeur = typeof v.intervalleValeur === "number" ? v.intervalleValeur : 0;
  // Échéance qui sera retenue à la création : saisie, sinon dernière fois + intervalle, sinon aujourd'hui.
  const echeancePrevue = v.echeance ?? (v.periodique && v.derniere && valeur ? ajouter(v.derniere, valeur, v.intervalleUnite) : aujourdhui());
  const delai = typeof v.delai === "number" ? v.delai : 0;
  const valide = v.titre.trim() && (!v.periodique || valeur >= 1) && typeof v.delai === "number" && (!entretien || v.echeance);

  const enregistrer = async () => {
    const valeurs = {
      titre: v.titre,
      nature: v.nature,
      intervalleValeur: v.periodique ? valeur : null,
      intervalleUnite: v.periodique ? v.intervalleUnite : null,
      ancrage: v.ancrage,
      delaiAlerteJours: delai,
      prestataireId: v.prestataireId,
      notes: v.notes,
    };
    const res = await ecrire<unknown>(() =>
      entretien
        ? majEntretien(entretien.id, { ...valeurs, echeance: v.echeance! }, entretien.modifieLe)
        : creerEntretien({ ...valeurs, elementId, echeance: v.echeance ?? undefined, derniereRealisation: v.periodique ? v.derniere : null }),
    );
    if (res !== undefined) onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={entretien ? "Modifier l'entretien" : "Nouvel entretien"} size="lg">
      <Stack>
        {!entretien && (
          <Select
            label="Partir d'un modèle"
            placeholder="Vidange de fosse septique, entretien de chaudière…"
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
        <TextInput label="Titre" placeholder="Entretien annuel, nettoyage du filtre…" required value={v.titre} onChange={(e) => maj({ titre: e.currentTarget.value })} data-autofocus={!!entretien} />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Nature
          </Text>
          <SegmentedControl
            fullWidth
            value={v.nature}
            onChange={(n) => maj({ nature: n as Nature, ...(v.delaiModifie ? {} : { delai: DELAI_DEFAUT[n as Nature] }) })}
            data={[
              { value: "tache", label: "Tâche à faire soi-même" },
              { value: "rdv", label: "Rendez-vous à prendre" },
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
              <NumberInput label="Tous les" min={1} max={1000} allowDecimal={false} value={v.intervalleValeur} onChange={(x) => maj({ intervalleValeur: x })} />
              <Select
                aria-label="Unité"
                data={[
                  { value: "jour", label: "jours" },
                  { value: "mois", label: "mois" },
                  { value: "an", label: valeur > 1 ? "ans" : "an" },
                ]}
                value={v.intervalleUnite}
                onChange={(u) => u && maj({ intervalleUnite: u as Unite })}
                allowDeselect={false}
              />
            </Group>
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
            label={v.periodique ? "Prochaine échéance" : "À faire pour le"}
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
        <ChampPrestataire label="Prestataire habituel" value={v.prestataireId} onChange={(p) => maj({ prestataireId: p })} />
        <Textarea label="Notes" autosize minRows={2} value={v.notes} onChange={(e) => maj({ notes: e.currentTarget.value })} />
        <Button onClick={enregistrer} disabled={!valide}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

/** Rendez-vous pris : date (facultative si pas encore fixée) et prestataire. */
export function ModalRdv({ entretien, onClose }: { entretien: LigneEntretien | null; onClose: () => void }) {
  const [dateRdv, setDateRdv] = useState<string | null>(null);
  const [prestataireId, setPrestataireId] = useState<string | null>(null);
  const [cle, setCle] = useState<string | null>(null);
  if ((entretien?.id ?? null) !== cle) {
    setCle(entretien?.id ?? null);
    setDateRdv(entretien?.dateRdv ?? null);
    setPrestataireId(entretien?.prestataireId ?? null);
  }
  return (
    <Modal opened={!!entretien} onClose={onClose} title={entretien ? `Rendez-vous pris : ${entretien.titre}` : ""}>
      <Stack>
        <ChampPrestataire value={prestataireId} onChange={setPrestataireId} />
        <ChampDate label="Date du rendez-vous" description="Vous serez prévenu la veille." value={dateRdv} onChange={setDateRdv} data-autofocus />
        <Button
          onClick={async () => {
            if ((await ecrire(() => prendreRdv(entretien!.id, { dateRdv, prestataireId }))) !== undefined) onClose();
          }}
        >
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

function Ligne({ e, onModifier, onRdv, onFait }: { e: LigneEntretien; onModifier: () => void; onRdv: () => void; onFait: () => void }) {
  const s = situation(e, aujourdhui());
  const Icone = e.nature === "rdv" ? IconCalendarEvent : IconTool;
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
    e.actif && estRecurrent(e) ? libelleIntervalle(e) : null,
    e.actif ? `échéance ${dateLisible(e.echeance)}` : null,
    e.prestataireNom,
  ].filter(Boolean);

  return (
    <Group gap="sm" wrap="nowrap" py="xs" align="flex-start" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }} opacity={e.actif ? 1 : 0.6}>
      <Icone size={20} color="var(--mantine-color-brique-6)" style={{ flexShrink: 0, marginTop: 2 }} />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs">
          <Text fw={600} size="sm">
            {e.titre}
          </Text>
          <BadgeSituation e={e} s={s} />
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

/** Entretiens d'un élément : à faire, rendez-vous, et ceux qui sont terminés ou suspendus (repliés). */
export function Entretiens({ elementId, categorie, entretiens, archive }: { elementId: string; categorie: string | null; entretiens: LigneEntretien[]; archive: boolean }) {
  const [edition, setEdition] = useState<{ entretien: Entretien | null } | null>(null);
  const [rdv, setRdv] = useState<LigneEntretien | null>(null);
  const [fait, setFait] = useState<LigneEntretien | null>(null);
  const [voirInactifs, setVoirInactifs] = useState(false);
  const actifs = entretiens.filter((e) => e.actif);
  const inactifs = entretiens.filter((e) => !e.actif);
  const ligne = (e: LigneEntretien) => (
    <Ligne key={e.id} e={e} onModifier={() => setEdition({ entretien: e })} onRdv={() => setRdv(e)} onFait={() => setFait(e)} />
  );

  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconRepeat size={18} />
          <Title order={4}>Entretiens</Title>
        </Group>
        {!archive && (
          <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => setEdition({ entretien: null })}>
            Ajouter
          </Button>
        )}
      </Group>

      {actifs.length === 0 && (
        <Text size="sm" c="dimmed" py="md" ta="center">
          {archive ? "Élément archivé : plus d'entretien suivi." : "Vidange tous les 4 ans, entretien annuel, nettoyage d'un filtre… Partez d'un modèle ou décrivez le vôtre."}
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

      <ModalEntretien elementId={elementId} categorie={categorie} entretien={edition?.entretien ?? null} opened={!!edition} onClose={() => setEdition(null)} />
      <ModalRdv entretien={rdv} onClose={() => setRdv(null)} />
      <ModalRealisation elementId={elementId} cible={fait ? { mode: "entretien", entretien: fait } : null} onClose={() => setFait(null)} />
    </Card>
  );
}
