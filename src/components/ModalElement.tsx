import { useState } from "react";
import { Autocomplete, Button, Chip, Divider, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useQuery } from "@tanstack/react-query";
import { creerElement, majElement } from "../data/elements";
import { listeMaisons } from "../data/maisons";
import type { Element } from "../db/schema";
import { lireDate } from "../lib/dates";
import { CATEGORIES, DUREES_GARANTIE, plusAnnees } from "../lib/elements";
import { ecrire } from "../lib/query";

type Saisie = {
  maisonId: string | null;
  nom: string;
  categorie: string;
  emplacement: string;
  marque: string;
  modele: string;
  numeroSerie: string;
  dateAchat: string | null;
  dateMiseEnService: string | null;
  prix: number | string;
  vendeur: string;
  finGarantie: string | null;
  notes: string;
};

const depuis = (e: Element | null, maisonId: string | null): Saisie => ({
  maisonId: e?.maisonId ?? maisonId,
  nom: e?.nom ?? "",
  categorie: e?.categorie ?? "",
  emplacement: e?.emplacement ?? "",
  marque: e?.marque ?? "",
  modele: e?.modele ?? "",
  numeroSerie: e?.numeroSerie ?? "",
  dateAchat: e?.dateAchat ?? null,
  dateMiseEnService: e?.dateMiseEnService ?? null,
  prix: e?.prix ?? "",
  vendeur: e?.vendeur ?? "",
  finGarantie: e?.finGarantie ?? null,
  notes: e?.notes ?? "",
});

/** Champ date français, effaçable ; se saisit aussi au clavier (« 14/03/2025 »). */
function ChampDate(props: { label: string; description?: string; value: string | null; onChange: (v: string | null) => void }) {
  return <DateInput {...props} valueFormat="DD/MM/YYYY" placeholder="jj/mm/aaaa" dateParser={lireDate} clearable />;
}

/**
 * Création (élément absent) ou modification d'un élément.
 * `maisonId` : maison proposée à la création (celle qu'on regardait).
 */
export function ModalElement({
  element,
  maisonId = null,
  opened,
  onClose,
  onCree,
}: {
  element: Element | null;
  maisonId?: string | null;
  opened: boolean;
  onClose: () => void;
  onCree?: (id: string) => void;
}) {
  const { data: maisons = [] } = useQuery({ queryKey: ["maisons"], queryFn: () => listeMaisons() });
  const [v, setV] = useState<Saisie>(depuis(null, null));
  const [cle, setCle] = useState<string | null>(null);
  // Nouvelle ouverture : on repart de l'élément (ou d'un formulaire vide).
  const ouverture = opened ? (element?.id ?? "nouveau") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    if (opened) setV(depuis(element, maisonId ?? (maisons.filter((m) => !m.archivee).length === 1 ? maisons.find((m) => !m.archivee)!.id : null)));
  }
  const maj = <K extends keyof Saisie>(k: K, x: Saisie[K]) => setV((s) => ({ ...s, [k]: x }));

  // La garantie court en général à partir de la mise en service, à défaut de l'achat.
  const debutGarantie = v.dateMiseEnService ?? v.dateAchat;

  const enregistrer = async () => {
    const valeurs = { ...v, maisonId: v.maisonId!, prix: typeof v.prix === "number" ? v.prix : null };
    const res = await ecrire<unknown>(() => (element ? majElement(element.id, valeurs, element.modifieLe) : creerElement(valeurs)));
    if (res === undefined) return;
    onClose();
    if (!element && typeof res === "string") onCree?.(res);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={element ? "Modifier l'élément" : "Nouvel élément"} size="lg">
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Nom" placeholder="Pompe à chaleur, lave-linge…" required value={v.nom} onChange={(e) => maj("nom", e.currentTarget.value)} data-autofocus />
          <Select
            label="Maison"
            required
            data={maisons.filter((m) => !m.archivee || m.id === v.maisonId).map((m) => ({ value: m.id, label: m.nom }))}
            value={v.maisonId}
            onChange={(x) => maj("maisonId", x)}
            allowDeselect={false}
          />
          <Autocomplete label="Catégorie" data={CATEGORIES} value={v.categorie} onChange={(x) => maj("categorie", x)} />
          <TextInput label="Emplacement" placeholder="Garage, jardin côté nord…" value={v.emplacement} onChange={(e) => maj("emplacement", e.currentTarget.value)} />
          <TextInput label="Marque" value={v.marque} onChange={(e) => maj("marque", e.currentTarget.value)} />
          <TextInput label="Modèle" value={v.modele} onChange={(e) => maj("modele", e.currentTarget.value)} />
          <TextInput label="N° de série" value={v.numeroSerie} onChange={(e) => maj("numeroSerie", e.currentTarget.value)} />
        </SimpleGrid>

        <Divider label="Achat et garantie" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <ChampDate label="Date d'achat" value={v.dateAchat} onChange={(x) => maj("dateAchat", x)} />
          <ChampDate label="Mise en service" value={v.dateMiseEnService} onChange={(x) => maj("dateMiseEnService", x)} />
          <NumberInput label="Prix" suffix=" €" decimalSeparator="," thousandSeparator=" " min={0} decimalScale={2} value={v.prix} onChange={(x) => maj("prix", x)} />
          <TextInput label="Vendeur ou installateur" value={v.vendeur} onChange={(e) => maj("vendeur", e.currentTarget.value)} />
        </SimpleGrid>
        <Stack gap={6}>
          <ChampDate label="Fin de garantie" description="Elle court souvent depuis la mise en service. Vous serez prévenu un mois avant." value={v.finGarantie} onChange={(x) => maj("finGarantie", x)} />
          {debutGarantie && (
            <Group gap={6}>
              <Text size="xs" c="dimmed">
                Garantie de
              </Text>
              {DUREES_GARANTIE.map((n) => {
                const fin = plusAnnees(debutGarantie, n);
                return (
                  <Chip key={n} size="xs" checked={v.finGarantie === fin} onChange={() => maj("finGarantie", fin)}>
                    {n} an{n > 1 ? "s" : ""}
                  </Chip>
                );
              })}
            </Group>
          )}
        </Stack>

        <Textarea label="Notes" autosize minRows={2} value={v.notes} onChange={(e) => maj("notes", e.currentTarget.value)} />
        <Button onClick={enregistrer} disabled={!v.nom.trim() || !v.maisonId}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}
