import { useState } from "react";
import { ActionIcon, Button, FileButton, Group, Modal, NumberInput, SimpleGrid, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCamera, IconPaperclip, IconX } from "@tabler/icons-react";
import { creerDocument, supprimerDocument } from "../data/documents";
import { realiserEntretien } from "../data/entretiens";
import { creerRealisation, majRealisation } from "../data/realisations";
import type { Document, Entretien, Realisation } from "../db/schema";
import { aujourdhui } from "../lib/dates";
import { tailleLisible } from "../lib/documents";
import { useEcran } from "../lib/ecran";
import { envoyerFichier } from "../lib/fichiers";
import { ecrire, invalider } from "../lib/query";
import { ChampDate, ChampPrestataire } from "./Champs";

/**
 * - `entretien` : l'entretien est fait (date, compte rendu, coût) ; l'échéance suivante en découle ;
 * - `intervention` : réparation ou dépannage consigné après coup, sans entretien prévu ;
 * - `edition` : corriger une ligne de l'historique.
 */
export type Cible =
  | { mode: "entretien"; entretien: Entretien }
  | { mode: "intervention" }
  | { mode: "edition"; realisation: Realisation & { documents: Document[] } };

type Saisie = { date: string | null; titre: string; note: string; cout: number | string; prestataireId: string | null };

const ACCEPTE = "application/pdf,image/jpeg,image/png,image/webp,image/gif,image/heic";

export function ModalRealisation({ elementId, cible, onClose }: { elementId: string; cible: Cible | null; onClose: () => void }) {
  const { tactile } = useEcran();
  const [v, setV] = useState<Saisie>({ date: null, titre: "", note: "", cout: "", prestataireId: null });
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = !cible ? null : cible.mode === "entretien" ? cible.entretien.id : cible.mode === "edition" ? cible.realisation.id : "intervention";
  if (ouverture !== cle) {
    setCle(ouverture);
    setFichiers([]);
    if (cible?.mode === "entretien") {
      const e = cible.entretien;
      // Un rendez-vous passé est probablement le jour où ça a été fait.
      const date = e.etat === "rdv_pris" && e.dateRdv && e.dateRdv <= aujourdhui() ? e.dateRdv : aujourdhui();
      setV({ date, titre: e.titre, note: "", cout: "", prestataireId: e.prestataireId });
    } else if (cible?.mode === "edition") {
      const r = cible.realisation;
      setV({ date: r.date, titre: r.titre, note: r.note ?? "", cout: r.cout ?? "", prestataireId: r.prestataireId });
    } else if (cible) setV({ date: aujourdhui(), titre: "", note: "", cout: "", prestataireId: null });
  }
  const maj = (p: Partial<Saisie>) => setV((s) => ({ ...s, ...p }));

  const enregistrer = async () => {
    if (!cible || !v.date) return;
    setEnvoi(true);
    try {
      const commun = { date: v.date, note: v.note, cout: typeof v.cout === "number" ? v.cout : null, prestataireId: v.prestataireId };
      const id = await ecrire<unknown>(() =>
        cible.mode === "entretien"
          ? realiserEntretien(cible.entretien.id, commun)
          : cible.mode === "intervention"
            ? creerRealisation({ ...commun, elementId, titre: v.titre })
            : majRealisation(cible.realisation.id, { ...commun, titre: v.titre }, cible.realisation.modifieLe).then(() => cible.realisation.id),
      );
      if (typeof id !== "string") return;
      // Pièces jointes : envoyées une fois la réalisation créée (factures, rapport d'intervention, photos).
      for (const f of fichiers) {
        try {
          const e = await envoyerFichier(f);
          await creerDocument({ realisationId: id, fichier: e.fichier, nom: e.nom });
        } catch (err) {
          notifications.show({ color: "red", title: f.name, message: err instanceof Error ? err.message : String(err) });
        }
      }
      if (fichiers.length) await invalider();
      onClose();
    } finally {
      setEnvoi(false);
    }
  };

  const titreModal = !cible ? "" : cible.mode === "entretien" ? `C'est fait : ${cible.entretien.titre}` : cible.mode === "intervention" ? "Consigner une intervention" : "Modifier l'intervention";
  const existants = cible?.mode === "edition" ? cible.realisation.documents : [];

  return (
    <Modal opened={!!cible} onClose={onClose} title={titreModal} size="lg">
      <Stack>
        {cible?.mode !== "entretien" && (
          <TextInput label="Quoi" placeholder="Remplacement de la pompe de vidange, dépannage…" required value={v.titre} onChange={(e) => maj({ titre: e.currentTarget.value })} data-autofocus />
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <ChampDate label="Date" required value={v.date} onChange={(d) => maj({ date: d })} />
          <NumberInput label="Coût" suffix=" €" decimalSeparator="," thousandSeparator=" " min={0} decimalScale={2} value={v.cout} onChange={(x) => maj({ cout: x })} />
        </SimpleGrid>
        <ChampPrestataire label="Fait par" value={v.prestataireId} onChange={(p) => maj({ prestataireId: p })} />
        <Textarea
          label={cible?.mode === "entretien" ? "Compte rendu" : "Notes"}
          placeholder={cible?.mode === "entretien" ? "Relevés, pièces changées, remarques du technicien…" : "Panne constatée, pièce changée, garantie de la réparation…"}
          autosize
          minRows={3}
          value={v.note}
          onChange={(e) => maj({ note: e.currentTarget.value })}
        />

        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Documents
            </Text>
            <Group gap="xs">
              {tactile && (
                <FileButton onChange={(f) => f && setFichiers((l) => [...l, f])} accept="image/*" capture="environment">
                  {(p) => (
                    <Button {...p} size="xs" variant="default" leftSection={<IconCamera size={14} />}>
                      Photo
                    </Button>
                  )}
                </FileButton>
              )}
              <FileButton onChange={(f) => setFichiers((l) => [...l, ...f])} accept={ACCEPTE} multiple>
                {(p) => (
                  <Button {...p} size="xs" variant="default" leftSection={<IconPaperclip size={14} />}>
                    Joindre
                  </Button>
                )}
              </FileButton>
            </Group>
          </Group>
          {existants.length + fichiers.length === 0 && (
            <Text size="xs" c="dimmed">
              Facture, rapport d'intervention, attestation d'entretien, photos…
            </Text>
          )}
          {existants.map((d) => (
            <Group key={d.id} gap="xs" wrap="nowrap">
              <Text size="sm" truncate style={{ flex: 1 }}>
                {d.nom}
              </Text>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Retirer ${d.nom}`} onClick={() => ecrire(() => supprimerDocument(d.id))}>
                <IconX size={14} />
              </ActionIcon>
            </Group>
          ))}
          {fichiers.map((f, i) => (
            <Group key={`${f.name}-${i}`} gap="xs" wrap="nowrap">
              <Text size="sm" truncate style={{ flex: 1 }}>
                {f.name}{" "}
                <Text span size="xs" c="dimmed">
                  ({tailleLisible(f.size)}, envoyé à l'enregistrement)
                </Text>
              </Text>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Retirer ${f.name}`} onClick={() => setFichiers((l) => l.filter((_, j) => j !== i))}>
                <IconX size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>

        <Button onClick={enregistrer} loading={envoi} disabled={!v.date || (cible?.mode !== "entretien" && !v.titre.trim())}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}
