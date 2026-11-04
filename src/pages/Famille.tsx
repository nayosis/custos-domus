import { useState } from "react";
import {
  ActionIcon, Alert, Badge, Button, Card, Group, Menu, Modal, NumberInput, PasswordInput, Progress, SimpleGrid, Stack, Switch, Text, TextInput, Title, Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconCheck, IconDots, IconGift, IconKey, IconLock, IconPencil, IconPlayerPause, IconPlayerPlay, IconPlus, IconTrash, IconUsers, IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  accorderEchange, changerPin, creerEnfant, creerRecompense, famille, majEnfant, majRecompense, refuserEchange, refuserMission, supprimerEnfant, supprimerRecompense, validerMission,
} from "../data/famille";
import { ecrire } from "../lib/query";
import { dateLisible } from "../lib/dates";
import { LIBELLES_ECHANGE, OBJECTIF_DEFAUT, pinValide, points, type StatutEchange } from "../lib/famille";

type Donnees = Awaited<ReturnType<typeof famille>>;
type Enfant = Donnees["enfants"][number];
type Recompense = Donnees["recompenses"][number];

const jourCourt = (d: string) => dateLisible(d, { weekday: "short", day: "numeric", month: "short" });

/** Points de la semaine : validés (plein), en attente (clair), face à l'objectif. */
export function Semaine({ validees, enAttente, objectif }: { validees: number; enAttente: number; objectif: number }) {
  const total = Math.max(objectif, validees + enAttente, 1);
  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="xs">
        <Text size="sm">
          <Text span fw={700}>
            {validees}
          </Text>{" "}
          / {points(objectif)} cette semaine
        </Text>
        {enAttente > 0 && (
          <Text size="xs" c="dimmed">
            + {enAttente} à valider
          </Text>
        )}
      </Group>
      <Progress.Root size="md" aria-label={`${validees} points sur ${objectif}`}>
        <Progress.Section value={(validees / total) * 100} color={validees >= objectif ? "green" : "brique"} />
        <Progress.Section value={(enAttente / total) * 100} color="brique.2" />
      </Progress.Root>
    </Stack>
  );
}

function ModalEnfant({ enfant, opened, onClose }: { enfant: Enfant | null; opened: boolean; onClose: () => void }) {
  const [prenom, setPrenom] = useState("");
  const [pin, setPin] = useState("");
  const [objectif, setObjectif] = useState<number | string>(OBJECTIF_DEFAUT);
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? (enfant?.id ?? "nouveau") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    setPrenom(enfant?.prenom ?? "");
    setPin("");
    setObjectif(enfant?.objectifSemaine ?? OBJECTIF_DEFAUT);
  }
  const valide = prenom.trim() && typeof objectif === "number" && (enfant || pinValide(pin));
  const enregistrer = async () => {
    const r = await ecrire<unknown>(() =>
      enfant ? majEnfant(enfant.id, { prenom, objectifSemaine: objectif as number }) : creerEnfant({ prenom, pin, objectifSemaine: objectif as number }),
    );
    if (r !== undefined) onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title={enfant ? `Modifier : ${enfant.prenom}` : "Ajouter un enfant"}>
      <Stack>
        <TextInput label="Prénom" description="Il sert à se connecter, avec le code" required value={prenom} onChange={(e) => setPrenom(e.currentTarget.value)} data-autofocus />
        {!enfant && (
          <PasswordInput
            label="Code"
            description="4 à 8 chiffres, à lui donner"
            required
            inputMode="numeric"
            autoComplete="new-password"
            value={pin}
            onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, "").slice(0, 8))}
          />
        )}
        <NumberInput label="Objectif de la semaine" suffix=" points" min={0} max={10000} allowDecimal={false} value={objectif} onChange={setObjectif} />
        <Button onClick={enregistrer} disabled={!valide}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

function ModalCode({ enfant, onClose }: { enfant: Enfant | null; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const enregistrer = async () => {
    if (!enfant) return;
    const r = await ecrire<unknown>(() => changerPin(enfant.id, { pin }));
    if (r !== undefined) {
      setPin("");
      onClose();
    }
  };
  return (
    <Modal opened={!!enfant} onClose={onClose} title={`Nouveau code : ${enfant?.prenom ?? ""}`}>
      <Stack>
        <Text size="sm" c="dimmed">
          Le profil est débloqué ; les appareils connectés avec l'ancien code sont déconnectés.
        </Text>
        <PasswordInput
          label="Code"
          description="4 à 8 chiffres"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, "").slice(0, 8))}
          data-autofocus
        />
        <Button onClick={enregistrer} disabled={!pinValide(pin)}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

function ModalRecompense({ recompense, opened, onClose }: { recompense: Recompense | null; opened: boolean; onClose: () => void }) {
  const [titre, setTitre] = useState("");
  const [pts, setPts] = useState<number | string>(50);
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? (recompense?.id ?? "nouvelle") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    setTitre(recompense?.titre ?? "");
    setPts(recompense?.points ?? 50);
  }
  const enregistrer = async () => {
    const v = { titre, points: pts as number };
    const r = await ecrire<unknown>(() => (recompense ? majRecompense(recompense.id, v) : creerRecompense(v)));
    if (r !== undefined) onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title={recompense ? "Modifier la récompense" : "Nouvelle récompense"}>
      <Stack>
        <TextInput label="Récompense" placeholder="Une soirée cinéma, choisir le repas du samedi…" required value={titre} onChange={(e) => setTitre(e.currentTarget.value)} data-autofocus />
        <NumberInput label="Coût" suffix=" points" min={1} allowDecimal={false} value={pts} onChange={setPts} />
        <Button onClick={enregistrer} disabled={!titre.trim() || typeof pts !== "number" || pts < 1}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

/** Ce qui attend un parent : missions faites, récompenses demandées. */
function EnAttente({ d }: { d: Donnees }) {
  const prenom = (id: string | null) => d.enfants.find((e) => e.id === id)?.prenom ?? "?";
  const demandes = d.demandes.filter((x) => x.statut === "demandee");
  if (!d.aValider.length && !demandes.length) return null;
  const refuser = (id: string, titre: string) =>
    modals.openConfirmModal({
      title: `Refuser : ${titre}`,
      children: <Text size="sm">Aucun point. Si rien n'a été fait depuis, la mission revient comme avant (même échéance, même enfant).</Text>,
      labels: { confirm: "Refuser", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: () => ecrire(() => refuserMission(id)),
    });
  return (
    <Card withBorder>
      <Title order={4}>À valider</Title>
      <Text size="xs" c="dimmed" mb="xs">
        Sans réponse, une mission est validée d'office au bout de 48 h.
      </Text>
      <Stack gap={0}>
        {d.aValider.map((r) => (
          <Group key={r.id} gap="sm" wrap="nowrap" py="xs" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate>
                {r.titre}
              </Text>
              <Text size="xs" c="dimmed">
                {prenom(r.enfantId)} · {jourCourt(r.date)} · {points(r.points ?? 0)}
              </Text>
            </div>
            <Button size="xs" leftSection={<IconCheck size={14} />} onClick={() => ecrire(() => validerMission(r.id))}>
              Valider
            </Button>
            <Tooltip label="Pas fait">
              <ActionIcon variant="subtle" color="red" aria-label="Refuser" onClick={() => refuser(r.id, r.titre)}>
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ))}
        {demandes.map((x) => (
          <Group key={x.id} gap="sm" wrap="nowrap" py="xs" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
            <IconGift size={18} color="var(--mantine-color-brique-6)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate>
                {x.titre}
              </Text>
              <Text size="xs" c="dimmed">
                Demandée par {prenom(x.enfantId)} · {points(x.points)}
              </Text>
            </div>
            <Button size="xs" variant="light" onClick={() => ecrire(() => accorderEchange(x.id))}>
              Accorder
            </Button>
            <Tooltip label="Refuser : les points reviennent">
              <ActionIcon variant="subtle" color="red" aria-label="Refuser" onClick={() => ecrire(() => refuserEchange(x.id))}>
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function CarteEnfant({ e, d, onModifier, onCode }: { e: Enfant; d: Donnees; onModifier: () => void; onCode: () => void }) {
  const missions = d.missions.filter((m) => m.enfants.includes(e.id));
  const prenom = (id: string) => d.enfants.find((x) => x.id === id)?.prenom;
  const supprimer = () =>
    modals.openConfirmModal({
      title: `Supprimer ${e.prenom} ?`,
      children: (
        <Text size="sm">
          Ses points et ses demandes sont effacés ; ses missions partagées restent aux autres enfants, les siennes seules redeviennent de simples choses à faire. Pour l'arrêter sans rien perdre,
          désactivez plutôt le profil.
        </Text>
      ),
      labels: { confirm: "Supprimer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: () => ecrire(() => supprimerEnfant(e.id)),
    });
  return (
    <Card withBorder opacity={e.actif ? 1 : 0.6}>
      <Group justify="space-between" wrap="nowrap" mb="sm">
        <Group gap="xs">
          <Title order={4}>{e.prenom}</Title>
          {!e.actif && (
            <Badge color="gray" variant="light">
              Désactivé
            </Badge>
          )}
          {e.bloque && (
            <Badge color="red" variant="light" leftSection={<IconLock size={11} />}>
              Code bloqué
            </Badge>
          )}
        </Group>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label="Actions">
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={onModifier}>
              Prénom, objectif…
            </Menu.Item>
            <Menu.Item leftSection={<IconKey size={14} />} onClick={onCode}>
              Nouveau code
            </Menu.Item>
            <Menu.Item leftSection={e.actif ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />} onClick={() => ecrire(() => majEnfant(e.id, { actif: !e.actif }))}>
              {e.actif ? "Désactiver" : "Réactiver"}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={supprimer}>
              Supprimer
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Semaine validees={e.semaine.validees} enAttente={e.semaine.enAttente} objectif={e.objectifSemaine} />
      <Text size="sm" mt="xs">
        Solde :{" "}
        <Text span fw={700}>
          {points(e.solde)}
        </Text>
      </Text>
      <Text size="xs" fw={600} c="dimmed" mt="sm" tt="uppercase">
        Ses missions
      </Text>
      {missions.length === 0 && (
        <Text size="xs" c="dimmed">
          Aucune pour le moment.
        </Text>
      )}
      {missions.map((m) => (
        <Group key={m.id} gap={6} wrap="nowrap" mt={4}>
          {m.enfants.length > 1 && (
            <Tooltip label={`Partagée avec ${m.enfants.filter((x) => x !== e.id).map(prenom).filter(Boolean).join(", ")} : le premier qui la fait`}>
              <IconUsers size={14} color="var(--mantine-color-dimmed)" aria-label="Partagée" style={{ flexShrink: 0 }} />
            </Tooltip>
          )}
          <Text size="sm" truncate style={{ flex: 1 }}>
            {m.titre}
          </Text>
          <Text size="xs" c="dimmed">
            {jourCourt(m.echeance)} · {m.points} pts
          </Text>
        </Group>
      ))}
    </Card>
  );
}

/** Les enfants, leurs missions et leurs points ; ce qui attend un parent ; les récompenses. */
export function Famille() {
  const { data: d } = useQuery({ queryKey: ["famille"], queryFn: () => famille() });
  const [edition, setEdition] = useState<{ enfant: Enfant | null } | null>(null);
  const [code, setCode] = useState<Enfant | null>(null);
  const [recompense, setRecompense] = useState<{ r: Recompense | null } | null>(null);
  const prenom = (id: string | null) => d?.enfants.find((e) => e.id === id)?.prenom ?? "?";

  return (
    <Stack p={{ base: "sm", sm: "lg" }} gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Famille</Title>
          <Text size="sm" c="dimmed">
            Missions confiées aux enfants, points de la semaine, récompenses.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEdition({ enfant: null })}>
          Ajouter un enfant
        </Button>
      </Group>

      {d && d.enfants.length === 0 && (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconUsers size={40} color="var(--mantine-color-brique-5)" />
            <Text size="sm" c="dimmed" ta="center" maw={460}>
              Ajoutez vos enfants avec un prénom et un code : ils se connectent sur la page « Espace enfants » (lien sous le formulaire de connexion), depuis leur
              téléphone ou la tablette de la maison, et ne voient que leurs missions.
            </Text>
          </Stack>
        </Card>
      )}

      {d && <EnAttente d={d} />}

      {d && d.enfants.length > 0 && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {d.enfants.map((e) => (
              <CarteEnfant key={e.id} e={e} d={d} onModifier={() => setEdition({ enfant: e })} onCode={() => setCode(e)} />
            ))}
          </SimpleGrid>
          <Alert color="brique" variant="light" p="xs">
            <Text size="sm">
              Pour confier une mission : dans une chose à faire (page « À faire » ou fiche d'un élément), « Confier aux enfants ». Plusieurs enfants : partagée, le premier qui la fait gagne les points.
              Les enfants se connectent sur <b>{location.origin}/enfant</b>.
            </Text>
          </Alert>
        </>
      )}

      {d && (
        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Title order={4}>Récompenses</Title>
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setRecompense({ r: null })}>
              Ajouter
            </Button>
          </Group>
          {d.recompenses.length === 0 && (
            <Text size="sm" c="dimmed">
              Ce que les enfants peuvent obtenir avec leurs points : une sortie, du temps d'écran, choisir le repas…
            </Text>
          )}
          {d.recompenses.map((r) => (
            <Group key={r.id} gap="sm" wrap="nowrap" py={6} style={{ borderTop: "1px solid var(--mantine-color-default-border)" }} opacity={r.actif ? 1 : 0.6}>
              <Text size="sm" style={{ flex: 1 }} truncate>
                {r.titre}
              </Text>
              <Text size="sm" c="dimmed">
                {points(r.points)}
              </Text>
              <Tooltip label={r.actif ? "Proposée aux enfants" : "Pas proposée"}>
                <Switch size="xs" checked={r.actif} onChange={() => ecrire(() => majRecompense(r.id, { actif: !r.actif }))} aria-label="Proposée" />
              </Tooltip>
              <ActionIcon variant="subtle" color="gray" aria-label="Modifier" onClick={() => setRecompense({ r })}>
                <IconPencil size={14} />
              </ActionIcon>
              <ActionIcon variant="subtle" color="red" aria-label="Supprimer" onClick={() => ecrire(() => supprimerRecompense(r.id))}>
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Card>
      )}

      {d && (d.recentes.length > 0 || d.demandes.some((x) => x.statut !== "demandee")) && (
        <Card withBorder>
          <Title order={4} mb="xs">
            Récemment
          </Title>
          {d.recentes.map((r) => (
            <Group key={r.id} gap="sm" wrap="nowrap" py={4}>
              {r.validation === "validee" ? <IconCheck size={14} color="var(--mantine-color-green-6)" /> : <IconX size={14} color="var(--mantine-color-red-6)" />}
              <Text size="sm" style={{ flex: 1 }} truncate>
                {prenom(r.enfantId)} · {r.titre}
              </Text>
              <Text size="xs" c="dimmed">
                {jourCourt(r.date)} · {r.validation === "validee" ? `${r.points} pts${r.validePar === "auto" ? " (d'office)" : ""}` : "refusée"}
              </Text>
            </Group>
          ))}
          {d.demandes
            .filter((x) => x.statut !== "demandee")
            .map((x) => (
              <Group key={x.id} gap="sm" wrap="nowrap" py={4}>
                <IconGift size={14} />
                <Text size="sm" style={{ flex: 1 }} truncate>
                  {prenom(x.enfantId)} · {x.titre}
                </Text>
                <Text size="xs" c="dimmed">
                  {LIBELLES_ECHANGE[x.statut as StatutEchange]} · {x.points} pts
                </Text>
              </Group>
            ))}
        </Card>
      )}

      <ModalEnfant enfant={edition?.enfant ?? null} opened={!!edition} onClose={() => setEdition(null)} />
      <ModalCode enfant={code} onClose={() => setCode(null)} />
      <ModalRecompense recompense={recompense?.r ?? null} opened={!!recompense} onClose={() => setRecompense(null)} />
    </Stack>
  );
}
