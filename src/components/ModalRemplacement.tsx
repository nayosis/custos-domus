import { useState } from "react";
import { Alert, Button, Checkbox, Modal, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "@tanstack/react-router";
import { remplacerElement } from "../data/elements";
import type { Element } from "../db/schema";
import { ecrire } from "../lib/query";
import { ChampDate } from "./Champs";

/**
 * Remplacer un équipement (la vieille chaudière par une pompe à chaleur, le lave-linge en panne…) :
 * l'ancien est archivé avec son historique, le nouveau reprend la maison, la catégorie et l'emplacement.
 */
export function ModalRemplacement({ element, entretiensActifs, opened, onClose }: { element: Element; entretiensActifs: string[]; opened: boolean; onClose: () => void }) {
  const naviguer = useNavigate();
  const [v, setV] = useState({ nom: "", marque: "", modele: "", dateAchat: null as string | null, dateMiseEnService: null as string | null });
  const [reprendre, setReprendre] = useState(true);
  const [ouvert, setOuvert] = useState(false);
  if (opened !== ouvert) {
    setOuvert(opened);
    if (opened) {
      setV({ nom: element.nom, marque: "", modele: "", dateAchat: null, dateMiseEnService: null });
      setReprendre(true);
    }
  }
  const maj = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));

  const remplacer = async () => {
    const id = await ecrire(() => remplacerElement(element.id, v, reprendre));
    if (typeof id !== "string") return;
    onClose();
    notifications.show({ color: "green", message: `« ${element.nom} » est archivé avec son historique. Complétez la fiche du nouveau : facture, garantie…` });
    naviguer({ to: "/elements/$id", params: { id } });
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Remplacer « ${element.nom} »`} size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          L'ancien est archivé avec tout son historique ; le nouveau garde la maison, la catégorie et l'emplacement.
        </Text>
        <TextInput label="Nom du nouveau" required value={v.nom} onChange={(e) => maj({ nom: e.currentTarget.value })} data-autofocus />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Marque" value={v.marque} onChange={(e) => maj({ marque: e.currentTarget.value })} />
          <TextInput label="Modèle" value={v.modele} onChange={(e) => maj({ modele: e.currentTarget.value })} />
          <ChampDate label="Date d'achat" value={v.dateAchat} onChange={(d) => maj({ dateAchat: d })} />
          <ChampDate label="Mise en service" value={v.dateMiseEnService} onChange={(d) => maj({ dateMiseEnService: d })} />
        </SimpleGrid>
        {entretiensActifs.length > 0 && (
          <Alert color="brique" variant="light" p="sm">
            <Checkbox
              checked={reprendre}
              onChange={(e) => setReprendre(e.currentTarget.checked)}
              label={`Reprendre ses entretiens (${entretiensActifs.join(", ")})`}
              description="Première échéance comptée depuis la mise en service du nouveau (à défaut son achat, ou aujourd'hui)."
            />
          </Alert>
        )}
        <Button onClick={remplacer} disabled={!v.nom.trim()}>
          Remplacer
        </Button>
      </Stack>
    </Modal>
  );
}
