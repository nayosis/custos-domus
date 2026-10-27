import { useEffect, useState } from "react";
import {
  ActionIcon, Alert, Anchor, Button, Card, CopyButton, Group, NumberInput, PasswordInput, SegmentedControl, SimpleGrid, Stack, Switch, Text, TextInput, Title, Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconBell, IconBrandGoogle, IconCalendar, IconCheck, IconCopy, IconDeviceMobile, IconMail, IconRefresh, IconSend, IconSettings, IconTrash } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appelApi } from "../lib/rpc";
import { abonnementCourant, activerPush, desactiverPush, iosHorsApplication, pushBloque, pushDisponible, serviceWorker } from "../lib/push";
import { estAdmin, utilisateur } from "../lib/session";

type Etat = {
  email: { actif: boolean; possible: boolean };
  push: { actif: boolean; clePublique: string; appareils: { endpoint: string; appareil: string | null }[] };
  ical: { chemin: string };
};

type ConfigEnvoi = {
  fournisseur: "aucun" | "mailjet" | "smtp";
  expediteur: string;
  urlApplication: string;
  mailjet: { cleApi: string; cleSecrete: string; secretDefini?: boolean };
  smtp: { hote: string; port: number; securise: boolean; utilisateur: string; motDePasse: string; secretDefini?: boolean };
};

const erreur = (e: unknown) => notifications.show({ color: "red", title: "Erreur", message: e instanceof Error ? e.message : String(e) });

/** Appel qui renvoie l'état à jour ; on le pose directement dans le cache. */
function useEtat() {
  const client = useQueryClient();
  const requete = useQuery({ queryKey: ["notifications"], queryFn: () => appelApi<Etat>("/api/notifications") });
  const appliquer = async (action: () => Promise<unknown>) => {
    try {
      const e = (await action()) as Etat | undefined;
      if (e?.email) client.setQueryData(["notifications"], e);
      else await client.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) {
      erreur(e);
    }
  };
  return { etat: requete.data, appliquer };
}

function BoutonEssai({ canal, disabled }: { canal: "email" | "push"; disabled?: boolean }) {
  const [envoi, setEnvoi] = useState(false);
  return (
    <Button
      size="xs"
      variant="default"
      leftSection={<IconSend size={14} />}
      loading={envoi}
      disabled={disabled}
      onClick={async () => {
        setEnvoi(true);
        try {
          const r = await appelApi<{ message: string }>("/api/notifications/essai", { corps: { canal } });
          notifications.show({ color: "green", message: r.message });
        } catch (e) {
          erreur(e);
        } finally {
          setEnvoi(false);
        }
      }}
    >
      Envoyer un essai
    </Button>
  );
}

function Email({ etat, appliquer }: { etat: Etat; appliquer: (a: () => Promise<unknown>) => Promise<void> }) {
  return (
    <Card withBorder>
      <Group gap="xs" mb="sm">
        <IconMail size={18} />
        <Title order={4}>Par e-mail</Title>
      </Group>
      <Stack gap="sm">
        {!etat.email.possible && (
          <Alert color="orange" variant="light" p="sm">
            L'envoi des e-mails n'est pas encore réglé{estAdmin() ? " : renseignez-le plus bas." : " : demandez-le à un administrateur."}
          </Alert>
        )}
        <Switch
          label={`Recevoir les rappels à ${utilisateur()?.email}`}
          checked={etat.email.actif}
          onChange={(e) => {
            const email = e.currentTarget.checked;
            appliquer(() => appelApi("/api/notifications", { methode: "PUT", corps: { email } }));
          }}
        />
        <Group>
          <BoutonEssai canal="email" disabled={!etat.email.possible || !etat.email.actif} />
        </Group>
      </Stack>
    </Card>
  );
}

function Telephone({ etat, appliquer }: { etat: Etat; appliquer: (a: () => Promise<unknown>) => Promise<void> }) {
  const [ici, setIci] = useState<string | null | undefined>(undefined);
  const [occupe, setOccupe] = useState(false);
  const [sansServiceWorker, setSansServiceWorker] = useState(false);
  const disponible = pushDisponible();
  useEffect(() => {
    serviceWorker().then((r) => setSansServiceWorker(!r));
    abonnementCourant()
      .then((a) => setIci(a?.endpoint ?? null))
      .catch(() => setIci(null));
  }, [etat]);
  const abonneIci = !!ici && etat.push.appareils.some((a) => a.endpoint === ici);

  const basculer = async () => {
    setOccupe(true);
    await appliquer(() => (abonneIci ? desactiverPush() : activerPush(etat.push.clePublique)));
    setIci((await abonnementCourant().catch(() => null))?.endpoint ?? null);
    setOccupe(false);
  };

  return (
    <Card withBorder>
      <Group gap="xs" mb="sm">
        <IconDeviceMobile size={18} />
        <Title order={4}>Sur le téléphone</Title>
      </Group>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Une notification, comme pour un message. À activer sur chaque appareil (téléphone, ordinateur).
        </Text>
        {iosHorsApplication() ? (
          <Alert color="blue" variant="light" p="sm">
            Sur iPhone, ajoutez d'abord Custos Domus à l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »), ouvrez-la depuis son icône et revenez ici.
          </Alert>
        ) : !disponible || sansServiceWorker ? (
          <Alert color="gray" variant="light" p="sm">
            Ce navigateur ne permet pas les notifications{sansServiceWorker && disponible ? " ici (navigation privée ou navigateur restreint)" : ""}.
          </Alert>
        ) : pushBloque() && !abonneIci ? (
          <Alert color="orange" variant="light" p="sm">
            Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur (icône à gauche de l'adresse), puis rechargez la page.
          </Alert>
        ) : (
          <Group>
            <Button size="xs" variant={abonneIci ? "default" : "filled"} leftSection={<IconBell size={14} />} loading={occupe || ici === undefined} onClick={basculer}>
              {abonneIci ? "Désactiver sur cet appareil" : "Activer sur cet appareil"}
            </Button>
            <BoutonEssai canal="push" disabled={!etat.push.appareils.length || !etat.push.actif} />
          </Group>
        )}
        {etat.push.appareils.length > 0 && (
          <>
            <Switch
              label="Recevoir les rappels sur mes appareils"
              checked={etat.push.actif}
              onChange={(e) => {
                const push = e.currentTarget.checked;
                appliquer(() => appelApi("/api/notifications", { methode: "PUT", corps: { push } }));
              }}
            />
            <Stack gap={4}>
              {etat.push.appareils.map((a) => (
                <Group key={a.endpoint} gap="xs" wrap="nowrap">
                  <IconDeviceMobile size={14} color="var(--mantine-color-dimmed)" />
                  <Text size="sm" style={{ flex: 1 }}>
                    {a.appareil ?? "Appareil"}
                    {a.endpoint === ici && (
                      <Text span size="xs" c="dimmed">
                        {" "}
                        (celui-ci)
                      </Text>
                    )}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Retirer cet appareil"
                    onClick={() => appliquer(() => appelApi("/api/notifications/abonnements/retirer", { corps: { endpoint: a.endpoint } }))}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}

function Agenda({ etat, appliquer }: { etat: Etat; appliquer: (a: () => Promise<unknown>) => Promise<void> }) {
  const url = `${location.origin}${etat.ical.chemin}`;
  const webcal = url.replace(/^https?:/, "webcal:");
  const changer = () =>
    modals.openConfirmModal({
      title: "Changer le lien de l'agenda ?",
      children: <Text size="sm">L'ancien lien cessera de fonctionner : il faudra se réabonner dans votre agenda avec le nouveau.</Text>,
      labels: { confirm: "Changer le lien", cancel: "Annuler" },
      onConfirm: () => appliquer(() => appelApi("/api/notifications/ical", { methode: "POST", corps: {} })),
    });
  return (
    <Card withBorder>
      <Group gap="xs" mb="sm">
        <IconCalendar size={18} />
        <Title order={4}>Dans votre agenda</Title>
      </Group>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Échéances, moment de prendre rendez-vous, rendez-vous pris (avec alarme la veille) et fins de garantie, dans Google Agenda, Calendrier d'Apple, Outlook… Le lien est
          personnel : ne le partagez pas.
        </Text>
        <TextInput
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          rightSection={
            <CopyButton value={url}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copié" : "Copier"}>
                  <ActionIcon variant="subtle" color={copied ? "green" : "gray"} onClick={copy} aria-label="Copier le lien">
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          }
        />
        <Group gap="xs">
          <Button size="xs" component="a" href={webcal} leftSection={<IconCalendar size={14} />}>
            S'abonner (Apple, Outlook)
          </Button>
          <Button
            size="xs"
            variant="default"
            component="a"
            href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<IconBrandGoogle size={14} />}
          >
            Google Agenda
          </Button>
          <Button size="xs" variant="subtle" color="gray" leftSection={<IconRefresh size={14} />} onClick={changer}>
            Changer le lien
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Google Agenda doit pouvoir joindre l'application depuis Internet ; les agendas se mettent à jour d'eux-mêmes (de quelques heures à une journée selon le service).
        </Text>
      </Stack>
    </Card>
  );
}

/** Réglage de l'envoi des e-mails (admins) : API Mailjet ou serveur SMTP. */
function ReglagesEnvoi() {
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: ["reglages-envoi"], queryFn: () => appelApi<ConfigEnvoi>("/api/reglages/envoi") });
  const [c, setC] = useState<ConfigEnvoi | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  if (data && !c) setC(data);
  if (!c) return null;
  const maj = (p: Partial<ConfigEnvoi>) => setC({ ...c, ...p });

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      const r = await appelApi<ConfigEnvoi>("/api/reglages/envoi", { methode: "PUT", corps: c });
      setC(r);
      client.setQueryData(["reglages-envoi"], r);
      await client.invalidateQueries({ queryKey: ["notifications"] });
      notifications.show({ color: "green", message: "Réglages d'envoi enregistrés. Envoyez-vous un essai pour vérifier." });
    } catch (e) {
      erreur(e);
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <Card withBorder>
      <Group gap="xs" mb="sm">
        <IconSettings size={18} />
        <Title order={4}>Envoi des e-mails</Title>
        <Text size="xs" c="dimmed">
          (administrateurs, pour tous les comptes)
        </Text>
      </Group>
      <Stack gap="sm">
        <SegmentedControl
          value={c.fournisseur}
          onChange={(f) => maj({ fournisseur: f as ConfigEnvoi["fournisseur"] })}
          data={[
            { value: "aucun", label: "Désactivé" },
            { value: "mailjet", label: "Mailjet" },
            { value: "smtp", label: "Serveur SMTP" },
          ]}
        />
        {c.fournisseur !== "aucun" && (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Adresse d'expédition"
              description={c.fournisseur === "mailjet" ? "Doit être validée dans votre compte Mailjet" : undefined}
              placeholder="rappels@exemple.fr"
              value={c.expediteur}
              onChange={(e) => maj({ expediteur: e.currentTarget.value })}
            />
            <TextInput
              label="Adresse de l'application"
              description="Pour le bouton « Ouvrir » des e-mails"
              placeholder="https://maison.exemple.fr"
              value={c.urlApplication}
              onChange={(e) => maj({ urlApplication: e.currentTarget.value })}
            />
          </SimpleGrid>
        )}
        {c.fournisseur === "mailjet" && (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="Clé API" value={c.mailjet.cleApi} onChange={(e) => maj({ mailjet: { ...c.mailjet, cleApi: e.currentTarget.value } })} />
            <PasswordInput
              label="Clé secrète"
              placeholder={c.mailjet.secretDefini ? "Enregistrée (laisser vide pour la garder)" : ""}
              value={c.mailjet.cleSecrete}
              onChange={(e) => maj({ mailjet: { ...c.mailjet, cleSecrete: e.currentTarget.value } })}
            />
          </SimpleGrid>
        )}
        {c.fournisseur === "smtp" && (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="Serveur" placeholder="smtp.exemple.fr" value={c.smtp.hote} onChange={(e) => maj({ smtp: { ...c.smtp, hote: e.currentTarget.value } })} />
            <Group grow align="flex-end">
              <NumberInput label="Port" min={1} max={65535} value={c.smtp.port} onChange={(p) => maj({ smtp: { ...c.smtp, port: Number(p) || 587 } })} />
              <Switch label="TLS direct (465)" checked={c.smtp.securise} onChange={(e) => maj({ smtp: { ...c.smtp, securise: e.currentTarget.checked } })} mb={8} />
            </Group>
            <TextInput label="Identifiant" value={c.smtp.utilisateur} onChange={(e) => maj({ smtp: { ...c.smtp, utilisateur: e.currentTarget.value } })} />
            <PasswordInput
              label="Mot de passe"
              placeholder={c.smtp.secretDefini ? "Enregistré (laisser vide pour le garder)" : ""}
              value={c.smtp.motDePasse}
              onChange={(e) => maj({ smtp: { ...c.smtp, motDePasse: e.currentTarget.value } })}
            />
          </SimpleGrid>
        )}
        <Group>
          <Button onClick={enregistrer} loading={enregistrement}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function Notifications() {
  const { etat, appliquer } = useEtat();
  return (
    <Stack p="lg" gap="lg" maw={900}>
      <div>
        <Title order={2}>Notifications</Title>
        <Text c="dimmed" size="sm" mt={4}>
          Chaque matin à 8 h : ce qui entre dans sa période d'alerte, ce qui passe en retard, les rendez-vous du lendemain, les garanties qui expirent dans un mois. Le lundi, un
          récapitulatif de tout ce qui attend.{" "}
          <Anchor size="sm" href="#agenda">
            Ou dans votre agenda.
          </Anchor>
        </Text>
      </div>
      {etat && (
        <>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Email etat={etat} appliquer={appliquer} />
            <Telephone etat={etat} appliquer={appliquer} />
          </SimpleGrid>
          <div id="agenda">
            <Agenda etat={etat} appliquer={appliquer} />
          </div>
        </>
      )}
      {estAdmin() && <ReglagesEnvoi />}
    </Stack>
  );
}
