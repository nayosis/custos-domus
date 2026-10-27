import { Anchor, Group, Select, Text } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconPhone } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { listePrestataires } from "../data/prestataires";
import { lireDate } from "../lib/dates";

/** Champ date français, effaçable ; se saisit aussi au clavier (« 14/03/2025 »). */
export function ChampDate(props: {
  label: string;
  description?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  required?: boolean;
  clearable?: boolean;
  minDate?: string;
  "data-autofocus"?: boolean;
}) {
  const { clearable = !props.required, ...reste } = props;
  return <DateInput {...reste} valueFormat="DD/MM/YYYY" placeholder="jj/mm/aaaa" dateParser={lireDate} clearable={clearable} />;
}

/** Choix d'un prestataire ; son téléphone s'affiche en dessous, prêt à appeler. */
export function ChampPrestataire({ label = "Prestataire", value, onChange }: { label?: string; value: string | null; onChange: (v: string | null) => void }) {
  const { data: prestataires = [] } = useQuery({ queryKey: ["prestataires"], queryFn: () => listePrestataires() });
  const choisi = prestataires.find((p) => p.id === value);
  return (
    <div>
      <Select
        label={label}
        placeholder={prestataires.length ? "Aucun" : "Aucun prestataire enregistré"}
        data={prestataires.map((p) => ({ value: p.id, label: p.metier ? `${p.nom} (${p.metier})` : p.nom }))}
        value={value}
        onChange={onChange}
        searchable
        clearable
        nothingFoundMessage="Aucun prestataire"
      />
      {choisi?.telephone && (
        <Anchor href={`tel:${choisi.telephone.replace(/\s/g, "")}`} size="xs" mt={4} display="inline-block">
          <Group gap={4} wrap="nowrap">
            <IconPhone size={12} />
            <Text span size="xs">
              {choisi.telephone}
            </Text>
          </Group>
        </Anchor>
      )}
    </div>
  );
}
