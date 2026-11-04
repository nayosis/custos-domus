import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { copyFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrer } from "../serveur/base";
import { DOSSIER_MIGRATIONS } from "../serveur/config";

describe("migrations", () => {
  test("0003 reconstruit entretien et realisation sans rien perdre (documents, liens)", () => {
    // Base arrêtée à la 0002, avec un entretien réalisé et un document joint à la réalisation.
    const avant = mkdtempSync(join(tmpdir(), "custos-migrations-"));
    for (const f of readdirSync(DOSSIER_MIGRATIONS).filter((f) => f.endsWith(".sql") && f < "0003")) copyFileSync(join(DOSSIER_MIGRATIONS, f), join(avant, f));
    const base = new Database(":memory:");
    base.exec("PRAGMA foreign_keys = ON");
    migrer(base, avant);
    base.exec(`
      INSERT INTO maison (id, nom) VALUES ('m', 'Maison');
      INSERT INTO element (id, maison_id, nom) VALUES ('el', 'm', 'PAC');
      INSERT INTO entretien (id, element_id, titre, echeance, delai_alerte_jours) VALUES ('en', 'el', 'Entretien', '2027-01-01', 7);
      INSERT INTO realisation (id, element_id, entretien_id, date, titre) VALUES ('r', 'el', 'en', '2026-01-01', 'Entretien');
      INSERT INTO document (id, realisation_id, nom, fichier, mime, taille) VALUES ('d', 'r', 'facture.pdf', 'x.pdf', 'application/pdf', 1);
    `);

    expect(migrer(base, DOSSIER_MIGRATIONS)).toContain("0003_maison_routines.sql");
    expect(base.query("SELECT element_id, maison_id FROM entretien").get()).toEqual({ element_id: "el", maison_id: null });
    expect(base.query("SELECT entretien_id, element_id FROM realisation").get()).toEqual({ entretien_id: "en", element_id: "el" });
    expect(base.query("SELECT realisation_id FROM document").get()).toEqual({ realisation_id: "r" });
    expect(base.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    // Les clés étrangères des tables reconstruites fonctionnent : supprimer la maison emporte tout.
    base.exec("DELETE FROM maison WHERE id = 'm'");
    expect(base.query("SELECT count(*) AS n FROM document").get()).toEqual({ n: 0 });
  });
});
