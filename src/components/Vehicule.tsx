import { useState } from "react";
import { ActionIcon, Button, Card, Group, Modal, NumberInput, SimpleGrid, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { IconGauge, IconTrash } from "@tabler/icons-react";
import { majElement } from "../data/elements";
import { creerVehicule, releverCompteur, supprimerReleve } from "../data/vehicules";
import type { Element, Releve } from "../db/schema";
import { aujourdhui, dateLisible } from "../lib/dates";
import { ecrire } from "../lib/query";
import { dernierReleve, km, libelleRythme, rythmeKm } from "../lib/vehicules";
import { ChampDate } from "./Champs";

type Saisie = { nom: string; marque: string; modele: string; immatriculation: string; dateMiseEnService: string | null; km: number | string; notes: string };

/** Ajout d'un véhicule (vehicule absent) ou modification ; le kilométrage actuel n'est demandé qu'à l'ajout. */
export function ModalVehicule({ vehicule, opened, onClose, onCree }: { vehicule: Element | null; opened: boolean; onClose: () => void; onCree?: (id: string) => void }) {
  const [v, setV] = useState<Saisie>({ nom: "", marque: "", modele: "", immatriculation: "", dateMiseEnService: null, km: "", notes: "" });
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? (vehicule?.id ?? "nouveau") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    if (opened)
      setV({
        nom: vehicule?.nom ?? "",
        marque: vehicule?.marque ?? "",
        modele: vehicule?.modele ?? "",
        immatriculation: vehicule?.immatriculation ?? "",
        dateMiseEnService: vehicule?.dateMiseEnService ?? null,
        km: "",
        notes: vehicule?.notes ?? "",
      });
  }
  const maj = (p: Partial<Saisie>) => setV((s) => ({ ...s, ...p }));
  const enregistrer = async () => {
    const valeurs = { nom: v.nom, marque: v.marque, modele: v.modele, immatriculation: v.immatriculation, dateMiseEnService: v.dateMiseEnService, notes: v.notes };
    const r = await ecrire<unknown>(() =>
      vehicule
        ? majElement(vehicule.id, { ...valeurs, immatriculation: v.immatriculation.trim().toUpperCase() }, vehicule.modifieLe)
        : creerVehicule({ ...valeurs, km: typeof v.km === "number" ? v.km : null }),
    );
    if (r === undefined) return;
    onClose();
    if (!vehicule && typeof r === "string") onCree?.(r);
  };
  return (
    <Modal opened={opened} onClose={onClose} title={vehicule ? `Modifier : ${vehicule.nom}` : "Nouveau véhicule"}>
      <Stack>
        <TextInput label="Nom" placeholder="Clio, la voiture de Léo…" required value={v.nom} onChange={(e) => maj({ nom: e.currentTarget.value })} data-autofocus />
        <SimpleGrid cols={2}>
          <TextInput label="Marque" placeholder="Renault" value={v.marque} onChange={(e) => maj({ marque: e.currentTarget.value })} />
          <TextInput label="Modèle" placeholder="Clio V" value={v.modele} onChange={(e) => maj({ modele: e.currentTarget.value })} />
        </SimpleGrid>
        <SimpleGrid cols={2}>
          <TextInput label="Immatriculation" placeholder="AB-123-CD" value={v.immatriculation} onChange={(e) => maj({ immatriculation: e.currentTarget.value })} />
          <ChampDate label="Mise en circulation" value={v.dateMiseEnService} onChange={(d) => maj({ dateMiseEnService: d })} />
        </SimpleGrid>
        {!vehicule && (
          <NumberInput
            label="Kilométrage actuel"
            description="Le premier relevé du compteur : il sert à prévoir les vidanges et révisions."
            suffix=" km"
            thousandSeparator=" "
            min={0}
            allowDecimal={false}
            value={v.km}
            onChange={(x) => maj({ km: x })}
          />
        )}
        <Textarea label="Notes" placeholder="Pneus, référence de l'huile, carte grise…" autosize minRows={2} value={v.notes} onChange={(e) => maj({ notes: e.currentTarget.value })} />
        <Button onClick={enregistrer} disabled={!v.nom.trim()}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

/** Relevé du compteur : un seul champ (aujourd'hui par défaut). */
export function ModalReleve({ vehicule, dernier, opened, onClose }: { vehicule: Element; dernier: Releve | null; opened: boolean; onClose: () => void }) {
  const [valeur, setValeur] = useState<number | string>("");
  const [date, setDate] = useState<string | null>(aujourdhui());
  const [ouvert, setOuvert] = useState(false);
  if (opened !== ouvert) {
    setOuvert(opened);
    if (opened) {
      setValeur("");
      setDate(aujourdhui());
    }
  }
  const enregistrer = async () => {
    if (typeof valeur !== "number") return;
    if ((await ecrire<unknown>(() => releverCompteur(vehicule.id, { km: valeur, date }))) !== undefined) onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title={`Compteur : ${vehicule.nom}`} size="sm">
      <Stack>
        <NumberInput
          label="Kilométrage"
          description={dernier ? `Dernier relevé : ${km(dernier.km)} le ${dateLisible(dernier.date)}` : undefined}
          suffix=" km"
          thousandSeparator=" "
          min={0}
          allowDecimal={false}
          inputMode="numeric"
          value={valeur}
          onChange={setValeur}
          onKeyDown={(e) => e.key === "Enter" && enregistrer()}
          data-autofocus
        />
        <ChampDate label="Date" value={date} onChange={setDate} />
        <Button onClick={enregistrer} disabled={typeof valeur !== "number" || !date}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

/** Carte « Compteur » de la fiche d'un véhicule : dernier relevé, rythme, derniers relevés. */
export function Compteur({ vehicule, releves, onRelever }: { vehicule: Element; releves: Releve[]; onRelever: () => void }) {
  const dernier = dernierReleve(releves);
  const rythme = rythmeKm(releves);
  const recents = [...releves].sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km).slice(0, 5);
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconGauge size={18} />
          <Title order={4}>Compteur</Title>
        </Group>
        {!vehicule.archive && (
          <Button size="xs" onClick={onRelever}>
            Relever
          </Button>
        )}
      </Group>
      {dernier ? (
        <>
          <Text fw={600} size="lg">
            {km(dernier.km)}
          </Text>
          <Text size="xs" c="dimmed">
            le {dateLisible(dernier.date)}
            {rythme ? ` · ${libelleRythme(rythme)}` : " · le rythme s'estime à partir de deux relevés espacés de deux semaines"}
          </Text>
          {recents.length > 1 && (
            <Stack gap={2} mt="sm">
              {recents.map((r) => (
                <Group key={r.id} justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed">
                    {dateLisible(r.date)}
                  </Text>
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs">{km(r.km)}</Text>
                    <ActionIcon variant="subtle" color="gray" size="xs" aria-label={`Supprimer le relevé du ${dateLisible(r.date)}`} onClick={() => ecrire(() => supprimerReleve(r.id))}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Relevez le compteur de temps en temps (vous serez sollicité le 1er du mois) : la date des vidanges et révisions en est déduite.
        </Text>
      )}
    </Card>
  );
}
