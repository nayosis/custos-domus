import { useState, type DragEvent } from "react";
import { ActionIcon, Anchor, Badge, Box, Button, Card, FileButton, Group, Image, Menu, Modal, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconCamera, IconDots, IconDownload, IconExternalLink, IconFileText, IconPaperclip, IconPencil, IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react";
import { creerDocument, majDocument, supprimerDocument } from "../data/documents";
import type { Document } from "../db/schema";
import { dateLisible } from "../lib/dates";
import { TYPES_DOCUMENT, tailleLisible } from "../lib/documents";
import { useEcran } from "../lib/ecran";
import { envoyerFichier, urlFichier } from "../lib/fichiers";
import { ecrire } from "../lib/query";

const ACCEPTE = "application/pdf,image/jpeg,image/png,image/webp,image/gif,image/heic";
const OPTIONS_TYPE = Object.entries(TYPES_DOCUMENT).map(([value, label]) => ({ value, label }));

/** Les navigateurs (hors Safari) n'affichent pas le HEIC des iPhone : on propose de le télécharger. */
const affichable = (d: Document) => d.mime === "application/pdf" || (d.mime.startsWith("image/") && d.mime !== "image/heic");

function Apercu({ doc, onClose }: { doc: Document | null; onClose: () => void }) {
  // Les navigateurs des téléphones n'affichent pas un PDF dans une page : on l'ouvre dans sa propre visionneuse.
  const { tactile } = useEcran();
  return (
    <Modal opened={!!doc} onClose={onClose} title={doc?.nom} size="xl">
      {doc && (
        <Stack>
          {!affichable(doc) ? (
            <Text c="dimmed">Ce format ne s'affiche pas dans le navigateur : téléchargez-le pour l'ouvrir.</Text>
          ) : doc.mime === "application/pdf" && tactile ? (
            <Text c="dimmed">Ouvrez le PDF pour le lire.</Text>
          ) : doc.mime === "application/pdf" ? (
            <iframe src={urlFichier(doc.fichier)} title={doc.nom} style={{ width: "100%", height: "75dvh", border: 0, borderRadius: 6 }} />
          ) : (
            <Image src={urlFichier(doc.fichier)} alt={doc.nom} fit="contain" mah="75dvh" radius="sm" />
          )}
          <Group justify="flex-end">
            <Button variant="default" component="a" href={urlFichier(doc.fichier)} target="_blank" rel="noopener" leftSection={<IconExternalLink size={16} />}>
              {doc.mime === "application/pdf" && tactile ? "Ouvrir le PDF" : "Ouvrir dans un onglet"}
            </Button>
            <Button component="a" href={urlFichier(doc.fichier)} download={doc.nom} leftSection={<IconDownload size={16} />}>
              Télécharger
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function ModalRenommer({ doc, onClose }: { doc: Document | null; onClose: () => void }) {
  const [nom, setNom] = useState("");
  const [cle, setCle] = useState<string | null>(null);
  if ((doc?.id ?? null) !== cle) {
    setCle(doc?.id ?? null);
    setNom(doc?.nom ?? "");
  }
  return (
    <Modal opened={!!doc} onClose={onClose} title="Renommer le document">
      <Stack>
        <TextInput label="Nom" value={nom} onChange={(e) => setNom(e.currentTarget.value)} data-autofocus />
        <Button
          disabled={!nom.trim()}
          onClick={async () => {
            if ((await ecrire(() => majDocument(doc!.id, { nom }))) !== undefined) onClose();
          }}
        >
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

/** Une ligne : icône, nom (ouvre l'aperçu), type modifiable sur place, taille, actions. */
function LigneDocument({ doc, onOuvrir, onRenommer }: { doc: Document; onOuvrir: () => void; onRenommer: () => void }) {
  const Icone = doc.mime.startsWith("image/") ? IconPhoto : IconFileText;
  const supprimer = () =>
    modals.openConfirmModal({
      title: `Supprimer « ${doc.nom} » ?`,
      children: <Text size="sm">Le fichier sera définitivement supprimé.</Text>,
      labels: { confirm: "Supprimer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: () => ecrire(() => supprimerDocument(doc.id)),
    });
  return (
    <Group gap="sm" wrap="nowrap" py={6} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
      <Icone size={22} color="var(--mantine-color-brique-6)" style={{ flexShrink: 0 }} />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Anchor component="button" type="button" onClick={onOuvrir} fw={500} size="sm" c="inherit" style={{ textAlign: "left", maxWidth: "100%" }} truncate>
          {doc.nom}
        </Anchor>
        <Text size="xs" c="dimmed">
          {[doc.date && dateLisible(doc.date), tailleLisible(doc.taille)].filter(Boolean).join(" · ")}
        </Text>
      </Box>
      <Select
        size="xs"
        w={120}
        data={OPTIONS_TYPE}
        value={doc.type}
        allowDeselect={false}
        aria-label="Type de document"
        onChange={(t) => t && t !== doc.type && ecrire(() => majDocument(doc.id, { type: t }))}
      />
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label="Actions">
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPencil size={14} />} onClick={onRenommer}>
            Renommer
          </Menu.Item>
          <Menu.Item leftSection={<IconDownload size={14} />} component="a" href={urlFichier(doc.fichier)} download={doc.nom}>
            Télécharger
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
 * Documents d'un élément (ou d'une réalisation) : liste, aperçu, envoi par bouton, par glisser-déposer,
 * ou photo prise avec le téléphone.
 */
export function Documents({ documents, elementId, realisationId }: { documents: Document[]; elementId?: string; realisationId?: string }) {
  const { tactile } = useEcran();
  const [envoi, setEnvoi] = useState(0);
  const [survol, setSurvol] = useState(false);
  const [apercu, setApercu] = useState<Document | null>(null);
  const [renommer, setRenommer] = useState<Document | null>(null);

  const envoyer = async (fichiers: File[]) => {
    if (!fichiers.length) return;
    setEnvoi(fichiers.length);
    try {
      for (const f of fichiers) {
        try {
          const e = await envoyerFichier(f);
          await ecrire(() => creerDocument({ elementId, realisationId, fichier: e.fichier, nom: e.nom }));
        } catch (err) {
          notifications.show({ color: "red", title: f.name, message: err instanceof Error ? err.message : String(err) });
        }
        setEnvoi((n) => n - 1);
      }
    } finally {
      setEnvoi(0);
    }
  };
  const deposer = (e: DragEvent) => {
    e.preventDefault();
    setSurvol(false);
    envoyer([...e.dataTransfer.files]);
  };

  return (
    <Card
      withBorder
      onDragOver={(e) => {
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={deposer}
      style={survol ? { borderColor: "var(--mantine-color-brique-5)", background: "var(--t-fond-accent)" } : undefined}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconPaperclip size={18} />
          <Title order={4}>Documents</Title>
          {documents.length > 0 && (
            <Badge variant="light" color="gray">
              {documents.length}
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          {tactile && (
            <FileButton onChange={(f) => f && envoyer([f])} accept="image/*" capture="environment">
              {(props) => (
                <Button {...props} size="xs" variant="default" leftSection={<IconCamera size={16} />} disabled={envoi > 0}>
                  Photo
                </Button>
              )}
            </FileButton>
          )}
          <FileButton onChange={envoyer} accept={ACCEPTE} multiple>
            {(props) => (
              <Button {...props} size="xs" leftSection={<IconUpload size={16} />} loading={envoi > 0}>
                Ajouter
              </Button>
            )}
          </FileButton>
        </Group>
      </Group>

      {documents.length === 0 ? (
        <Text size="sm" c="dimmed" py="md" ta="center">
          Factures, garanties, notices, photos… {tactile ? "Ajoutez un PDF ou prenez une photo." : "Ajoutez un PDF ou une image, ou déposez-les ici."}
        </Text>
      ) : (
        <Stack gap={0}>
          {documents.map((d) => (
            <LigneDocument key={d.id} doc={d} onOuvrir={() => setApercu(d)} onRenommer={() => setRenommer(d)} />
          ))}
        </Stack>
      )}

      <Apercu doc={apercu} onClose={() => setApercu(null)} />
      <ModalRenommer doc={renommer} onClose={() => setRenommer(null)} />
    </Card>
  );
}
