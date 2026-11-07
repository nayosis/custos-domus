import { useEffect, useState } from "react";
import { Alert, Anchor, Badge, Button, Card, Center, Checkbox, Chip, Group, Loader, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBell, IconCheck, IconGift, IconLogout } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Logo } from "../components/Logo";
import { Semaine } from "./Famille";
import { appelApi, ErreurServeur } from "../lib/rpc";
import { aujourdhui, dateLisible } from "../lib/dates";
import { ajouter } from "../lib/entretiens";
import { abonnementCourant, activerPush, iosHorsApplication, pushBloque, pushDisponible, serviceWorker } from "../lib/push";
import { LIBELLES_ECHANGE, LIBELLES_VALIDATION, points, type StatutEchange, type Validation } from "../lib/famille";
import type { EspaceEnfant as Espace } from "../../serveur/famille";

const CLE = ["espace-enfant"];
/** Prénoms déjà connectés sur cet appareil (tablette partagée) : un bouton chacun. */
const PRENOMS = "custos-prenoms";
const prenomsConnus = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(PRENOMS) ?? "[]");
  } catch {
    return [];
  }
};
const retenirPrenom = (p: string) => {
  try {
    localStorage.setItem(PRENOMS, JSON.stringify([p, ...prenomsConnus().filter((x) => x.toLowerCase() !== p.toLowerCase())].slice(0, 6)));
  } catch {
    /* stockage indisponible : tant pis */
  }
};

function libelleJour(d: string) {
  const j = aujourdhui();
  if (d < j) return `en retard (${dateLisible(d, { day: "numeric", month: "short" })})`;
  if (d === j) return "aujourd'hui";
  if (d === ajouter(j, 1, "jour")) return "demain";
  return dateLisible(d, { weekday: "long", day: "numeric", month: "short" });
}

function Connexion({ onConnecte }: { onConnecte: () => void }) {
  const connus = prenomsConnus();
  const [prenom, setPrenom] = useState(connus[0] ?? "");
  const [pin, setPin] = useState("");
  const [souvenir, setSouvenir] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await appelApi<{ prenom: string }>("/api/enfant/connexion", { corps: { prenom, pin, souvenir }, silencieux: true });
      retenirPrenom(r.prenom);
      setPin("");
      onConnecte();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Center mih="100dvh" bg="var(--t-fond-doux)" p="md">
      <Stack align="center" gap="sm" w={380} maw="100%">
        <Paper withBorder shadow="sm" p="xl" w="100%">
          <form onSubmit={valider}>
            <Stack>
              <div>
                <Logo taille={36} />
                <Title order={2} mt="sm">
                  Mes missions
                </Title>
                <Text size="sm" c="dimmed">
                  Ton prénom et ton code.
                </Text>
              </div>
              {erreur && <Alert color="red">{erreur}</Alert>}
              {connus.length > 0 && (
                <Chip.Group value={prenom} onChange={(v) => setPrenom(v as string)}>
                  <Group gap="xs">
                    {connus.map((p) => (
                      <Chip key={p} value={p}>
                        {p}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              )}
              <TextInput label="Prénom" autoComplete="username" value={prenom} onChange={(e) => setPrenom(e.currentTarget.value)} required />
              <PasswordInput
                label="Code"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, "").slice(0, 8))}
                required
                data-autofocus
              />
              <Checkbox
                label="Rester connecté (mon téléphone)"
                description="Sinon, déconnexion après 15 minutes sans rien faire : pour la tablette de la maison"
                checked={souvenir}
                onChange={(e) => setSouvenir(e.currentTarget.checked)}
              />
              <Button type="submit" loading={envoi} disabled={!prenom.trim() || pin.length < 4}>
                Entrer
              </Button>
            </Stack>
          </form>
        </Paper>
        <Anchor href="/connexion" size="sm">
          Parent ? Se connecter →
        </Anchor>
      </Stack>
    </Center>
  );
}

function Missions({ e, agir }: { e: Espace; agir: (chemin: string, message: string) => Promise<void> }) {
  const maintenant = e.missions.filter((m) => m.faisable);
  const plusTard = e.missions.filter((m) => !m.faisable);
  return (
    <Card withBorder>
      <Title order={4} mb="xs">
        À faire
      </Title>
      {maintenant.length === 0 && (
        <Text size="sm" c="dimmed">
          Rien pour le moment.
        </Text>
      )}
      {maintenant.map((m) => (
        <Group key={m.id} gap="sm" wrap="nowrap" py="xs" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600}>{m.titre}</Text>
            <Text size="xs" c={m.enRetard ? "red" : "dimmed"}>
              {libelleJour(m.echeance)}
              {m.ou ? ` · ${m.ou}` : ""} · {points(m.points)}
              {m.avec.length > 0 && ` · avec ${m.avec.join(", ")} : le premier qui la fait`}
            </Text>
            {m.notes && (
              <Text size="xs" c="dimmed" style={{ whiteSpace: "pre-line" }}>
                {m.notes}
              </Text>
            )}
          </div>
          <Button leftSection={<IconCheck size={16} />} onClick={() => agir(`/api/enfant/missions/${m.id}/fait`, "Noté : un parent va valider.")}>
            C'est fait
          </Button>
        </Group>
      ))}
      {plusTard.length > 0 && (
        <>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="md">
            Plus tard
          </Text>
          {plusTard.map((m) => (
            <Group key={m.id} gap="sm" wrap="nowrap" py={4}>
              <Text size="sm" style={{ flex: 1 }} truncate>
                {m.titre}
              </Text>
              <Text size="xs" c="dimmed">
                {libelleJour(m.echeance)} · {m.points} pts
              </Text>
            </Group>
          ))}
        </>
      )}
    </Card>
  );
}

type EtatNotifications = { clePublique: string; appareils: string[] };

/**
 * Notifications sur son téléphone : missions du jour (à 8 h) et réponses des parents.
 * Désactiver ne retire que l'enfant : un parent abonné sur le même appareil garde les siennes.
 */
function Notifications() {
  const [etat, setEtat] = useState<EtatNotifications | null>(null);
  const [ici, setIci] = useState<string | null | undefined>(undefined);
  const [sansServiceWorker, setSansServiceWorker] = useState(false);
  const [occupe, setOccupe] = useState(false);
  useEffect(() => {
    appelApi<EtatNotifications>("/api/enfant/notifications", { silencieux: true }).then(setEtat, () => setEtat(null));
    serviceWorker().then((r) => setSansServiceWorker(!r));
    abonnementCourant()
      .then((a) => setIci(a?.endpoint ?? null))
      .catch(() => setIci(null));
  }, []);
  if (!etat || ici === undefined) return null;
  const abonne = !!ici && etat.appareils.includes(ici);
  const basculer = async () => {
    setOccupe(true);
    try {
      if (abonne) setEtat(await appelApi<EtatNotifications>("/api/enfant/notifications/abonnements/retirer", { corps: { endpoint: ici }, silencieux: true }));
      else {
        setEtat(await activerPush<EtatNotifications>(etat.clePublique, "/api/enfant/notifications/abonnements"));
        setIci((await abonnementCourant().catch(() => null))?.endpoint ?? null);
        notifications.show({ color: "green", message: "Notifications activées sur ce téléphone." });
      }
    } catch (err) {
      notifications.show({ color: "red", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setOccupe(false);
    }
  };
  if (abonne)
    return (
      <Group gap={6} justify="center">
        <IconBell size={14} color="var(--mantine-color-dimmed)" />
        <Text size="xs" c="dimmed">
          Notifications activées sur ce téléphone ·{" "}
          <Anchor component="button" type="button" size="xs" onClick={basculer} disabled={occupe}>
            désactiver
          </Anchor>
        </Text>
      </Group>
    );
  return (
    <Card withBorder>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <IconBell size={20} color="var(--mantine-color-brique-6)" style={{ flexShrink: 0, marginTop: 2 }} />
        <Stack gap={6} style={{ flex: 1 }}>
          <Text size="sm">Être prévenu sur ce téléphone : tes missions du jour, et quand un parent valide ou répond.</Text>
          {iosHorsApplication() ? (
            <Text size="xs" c="dimmed">
              Sur iPhone : ajoute d'abord Custos Domus à l'écran d'accueil (Partager, puis « Sur l'écran d'accueil »), ouvre-la depuis son icône et reviens ici.
            </Text>
          ) : !pushDisponible() || sansServiceWorker ? (
            <Text size="xs" c="dimmed">
              Ce navigateur ne permet pas les notifications.
            </Text>
          ) : pushBloque() ? (
            <Text size="xs" c="dimmed">
              Les notifications sont bloquées pour ce site : autorise-les dans les réglages du navigateur, puis recharge la page.
            </Text>
          ) : (
            <Group>
              <Button size="xs" leftSection={<IconBell size={14} />} loading={occupe} onClick={basculer}>
                Activer
              </Button>
            </Group>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

/** L'espace d'un enfant : ses missions, sa semaine, ses points et ses récompenses. Rien d'autre. */
export function EspaceEnfant() {
  const client = useQueryClient();
  const { data: e, error, isLoading, refetch } = useQuery({
    queryKey: CLE,
    queryFn: () => appelApi<Espace>("/api/enfant/espace", { silencieux: true }),
    retry: false,
    refetchInterval: 60_000,
  });
  const [occupe, setOccupe] = useState(false);

  if (isLoading)
    return (
      <Center h="100dvh">
        <Loader />
      </Center>
    );
  if (!e || (error instanceof ErreurServeur && error.statut === 401)) return <Connexion onConnecte={() => void refetch()} />;

  const agir = async (chemin: string, message: string) => {
    setOccupe(true);
    try {
      client.setQueryData(CLE, await appelApi<Espace>(chemin, { corps: {}, silencieux: true }));
      notifications.show({ color: "green", message });
    } catch (err) {
      notifications.show({ color: "red", message: err instanceof Error ? err.message : String(err) });
      if (err instanceof ErreurServeur && err.statut === 401) void refetch();
    } finally {
      setOccupe(false);
    }
  };
  const deconnexion = async () => {
    // Cet appareil ne reçoit plus ses notifications (tablette partagée : le suivant ne reçoit pas les siennes).
    const endpoint = (await abonnementCourant().catch(() => null))?.endpoint;
    await appelApi("/api/enfant/deconnexion", { corps: endpoint ? { endpoint } : {} }).catch(() => undefined);
    client.removeQueries({ queryKey: CLE });
    void refetch();
  };

  return (
    <Stack p={{ base: "sm", sm: "lg" }} gap="md" maw={720} mx="auto" style={{ opacity: occupe ? 0.7 : 1 }}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Logo taille={28} />
          <Title order={2}>Bonjour {e.prenom}</Title>
        </Group>
        <Button variant="subtle" color="gray" size="xs" leftSection={<IconLogout size={14} />} onClick={deconnexion}>
          Quitter
        </Button>
      </Group>

      <Card withBorder>
        <Semaine validees={e.semaine.validees} enAttente={e.semaine.enAttente} objectif={e.objectifSemaine} />
        <Text size="sm" mt="xs">
          À dépenser :{" "}
          <Text span fw={700}>
            {points(e.solde)}
          </Text>
        </Text>
      </Card>

      <Missions e={e} agir={agir} />

      <Notifications />

      {e.recompenses.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="xs">
            Récompenses
          </Title>
          {e.recompenses.map((r) => (
            <Group key={r.id} gap="sm" wrap="nowrap" py={6} style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
              <IconGift size={18} color="var(--mantine-color-brique-6)" />
              <Text size="sm" style={{ flex: 1 }}>
                {r.titre}
              </Text>
              <Text size="sm" c="dimmed">
                {points(r.points)}
              </Text>
              <Button size="xs" variant="light" disabled={e.solde < r.points} onClick={() => agir(`/api/enfant/recompenses/${r.id}/demander`, "Demande envoyée aux parents.")}>
                Demander
              </Button>
            </Group>
          ))}
          {e.demandes.length > 0 && (
            <>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="md">
                Mes demandes
              </Text>
              {e.demandes.map((x) => (
                <Group key={x.id} gap="sm" wrap="nowrap" py={4}>
                  <Text size="sm" style={{ flex: 1 }} truncate>
                    {x.titre}
                  </Text>
                  <Badge size="sm" variant="light" color={x.statut === "accordee" ? "green" : x.statut === "refusee" ? "gray" : "brique"}>
                    {LIBELLES_ECHANGE[x.statut as StatutEchange]}
                  </Badge>
                </Group>
              ))}
            </>
          )}
        </Card>
      )}

      {e.historique.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="xs">
            Dernières missions
          </Title>
          {e.historique.map((h) => (
            <Group key={h.id} gap="sm" wrap="nowrap" py={4}>
              <Text size="sm" style={{ flex: 1 }} truncate>
                {h.titre}
              </Text>
              <Text size="xs" c="dimmed">
                {dateLisible(h.date, { day: "numeric", month: "short" })}
              </Text>
              <Badge size="sm" variant="light" color={h.validation === "validee" ? "green" : h.validation === "refusee" ? "gray" : "brique"}>
                {h.validation === "validee" ? `+${h.points}` : LIBELLES_VALIDATION[h.validation as Validation]}
              </Badge>
            </Group>
          ))}
        </Card>
      )}
    </Stack>
  );
}
