---
titel: Regeln und Best Practices für UI und UX
typ: konventionen
stand: 2026-10-21
status: gültig
bezug: [E1, E7, E19, "ADR 0001", "ADR 0004", glossar.md, research/ui-stil-belege.md, research/claude-design-prompt.md, research/detailseite-sheet-dialog.md, research/mustersprache.md]
---

# Regeln und Best Practices für UI und UX

Diese Datei fasst alle Regeln für Oberfläche und Bedienung an einer Stelle zusammen. Sie trifft keine eigene Entscheidung. Jede Regel nennt ihre Quelle. Bei Widerspruch gilt die Quelle, also zuerst [E1](entscheidungen.md#e1--tech-stack-und-app-schnitt) und [ADR 0004](adr/0004-mustersprache.md).

Die Spalte **Stand** sagt, wie fest eine Regel ist:

| Stand | Bedeutung |
|---|---|
| entschieden | Steht im Entscheidungslog oder in einem angenommenen ADR. Gilt ohne Ausnahme, bis der Fachbereich eine ansagt |
| Vorgabe | Vom Fachbereich im Gespräch vorgegeben, noch nicht im Entscheidungslog. Gilt wie entschieden |
| Vorschlag | Folgerung aus der Recherche, nicht bestätigt. Im Prototyp als „Vorschlag“ zeigen, nicht stillschweigend bauen |

## 1. Grundsätze

| Regel | Stand | Quelle |
|---|---|---|
| **Muster wählen, nicht entwerfen.** Jeder Screen ist ein Muster aus dem Katalog (§3). Wer ein neues Aussehen erfindet, macht einen Fehler | entschieden | ADR 0004 §1 |
| **Ein Muster, ein Baustein.** Jedes Muster ist genau eine Komponente in `packages/ui`. Ihre Props lassen nur erlaubte Varianten zu | entschieden | ADR 0004 §1, §6 |
| **shadcn/ui ist die Vorlage.** Bausteine kommen aus shadcn/ui und werden über Varianten angepasst. Vor dem Bauen die Quelle lesen und Klassen, z-index, Overlay, Animation und Scroll-Sperre übernehmen. Eigene Komponenten nur, wo shadcn/ui nichts hat | entschieden | E1, Ergänzung 2026-10-11 |
| **Layout mit CSS, nicht mit JavaScript.** Kein Skript, das Positionen beim Scrollen nachrechnet | Vorgabe | Fachbereich, 2026-10-11 |
| **Industriestandard vor Innovation.** Was etabliert ist (Design-Systeme, Branchenbegriffe), wird übernommen. Neues nur, wo nichts verankert ist, und dann so benannt | Vorgabe | Fachbereich, 2026-10-09 |
| **Für die echte Menge bauen.** Jede Liste für die größte erwartete Menge nach Jahren im Betrieb entwerfen, nicht für 9 Beispielzeilen. Beispieldaten in dieser Menge erzeugen | entschieden | ADR 0004 §3 Frage 4, §6 |
| **Schlank statt Geflecht.** Das einfachste Modell, das den Zweck erfüllt. Teure UI-Features nur bei klarem Bedarf | Vorgabe | Fachbereich, 2026-10-16 |
| **Abweichung nur durch den Fachbereich.** Eine Ausnahme steht im Steckbrief als „Ausnahme (Fachbereich, Datum, Grund)“ und im Code als `biome-ignore` mit Task-ID. Kommt sie zum zweiten Mal, fehlt ein Muster | entschieden | ADR 0004 §7 |

## 2. Design-System und Styling

| Regel | Stand | Quelle |
|---|---|---|
| Tailwind CSS v4 ist die Grundlage. Styling nur über Tailwind-Klassen | entschieden | E1, ADR 0001 |
| Themes sind eigene CSS-Variablen nach shadcn-Namen (`--background`, `--primary`, `--destructive` usw.), ergänzt um Tokens für Status und Dichte | entschieden | E1, claude-design-prompt.md §4 |
| Tokens aus dem Design-System: Akzent Petrol `#0E6E73` hell, `#5FC6CA` dunkel. Schrift IBM Plex Sans und IBM Plex Mono. Radius 6 und 10 px. Sidebar 240 px. Schriftstufen Büro 12, 13, 14, 16, 18, 22, 28, 40 px | Vorgabe | Design-System in Claude Design, freigegeben 2026-10-11 |
| Icons von lucide, wie in shadcn/ui. Icons in Menüs 14 px, nicht 16 px | entschieden | E1, Ergänzung 2026-10-12 |
| Icons nur, wo sie Bedeutung tragen. Eine Aktion hat immer ein Wort, das Icon allein reicht nicht | Vorschlag | ui-stil-belege.md §4 (NN/g) |
| Keine Stockfotos und keine Lkw-Illustrationen als Dekoration | Vorschlag | claude-design-prompt.md §7 |
| Tabellen mit Tabellenziffern (`tabular-nums`), damit Zahlen in Spalten bündig stehen | Vorschlag | claude-design-prompt.md §4 |

### Hell und dunkel

| Regel | Stand | Quelle |
|---|---|---|
| Jede App hat eine helle und eine dunkle Variante | entschieden | E1, Ergänzung 2026-10-11 |
| Der Benutzer wählt Hell, Dunkel oder Wie System. Mit Konto gilt die Wahl für alle seine Apps. Der Fahrer wählt in der Fahrer-App, Kiosk und Wallboard pro Gerät | entschieden | E1 |
| Ohne Wahl gilt Wie System, in der Ops-App Hell | entschieden | E1 |
| Statusfarben, Kontrast und Bedeutung sind in beiden Varianten gleich. Jeden Screen in beiden Varianten prüfen | Vorschlag | claude-design-prompt.md §4, §7 |

## 3. Muster der Oberfläche

Die vollständige Tabelle mit Aufbau steht in [ADR 0004 §2](adr/0004-mustersprache.md#2-muster-der-oberfläche). Hier die Kurzfassung.

| Muster | Baustein | Wann |
|---|---|---|
| Objektliste | `ObjectListPage` | Viele Datensätze, Menge kann über 50 liegen |
| Kurzliste | `SimpleTable` | Fest begrenzt auf höchstens 50 Einträge |
| Objektseite | `ObjectPage` | Objekt mit eigener ID, Ziel von Links, mehrere Themen |
| Einstellungsseite | `SettingsPage` | Genau ein Datensatz je Organisation, Standort, App oder Benutzer |
| Formular | `FormSheet`, `SectionCard` | Anlegen, Bearbeiten, kurze Aktion |
| Assistent | `Wizard` | Nur vom Fachbereich als mehrstufig festgelegte Abläufe |
| Bestätigung | `ConfirmDialog` | Aktion ohne Eingabe |
| Einstiegsseite | `EntryPage` | Seiten vor dem Login oder ohne Zugang |
| Sprung-Suche | `GlobalSearch` | Im Kopf jeder App mit Konto |
| Startseite je Rolle | Sonderbaustein | Startseite einer Rolle in der Plattform-App |
| Sonderbaustein | eigene Komponente | Nichts passt. Entscheidet der Fachbereich einzeln |

### Entscheidungsbaum

Von oben nach unten fragen. Die erste passende Antwort gilt ([ADR 0004 §3](adr/0004-mustersprache.md#3-entscheidungsbaum)).

1. Nur bestätigen, ohne Eingabe? **Bestätigung**.
2. Vom Fachbereich als mehrstufig festgelegt? **Assistent**.
3. Daten anlegen, ändern oder kurze Aktion? **Formular** (§6).
4. Größte Menge je Organisation kann über 50 liegen? **Objektliste**.
5. Fest begrenzt auf höchstens 50? **Kurzliste**.
6. Objekt mit eigener ID, Ziel von Links, mehrere Themen? **Objektseite**. Fehlt eins davon, ist es eine Karte auf einer anderen Seite.
7. Genau ein Datensatz je Organisation, Standort, App oder Benutzer? **Einstellungsseite**.
8. Nichts davon? **Sonderbaustein**, Frage an den Fachbereich.

## 4. Listen und Suche

| Regel | Stand | Quelle |
|---|---|---|
| **Objektliste** wie shadcn/ui Data Table: Kopf mit Titel und „Neu“, Ansichten als Tabs mit Anzahl, Textfilter, Facetten mit Anzahl, Sortierung im Spaltenkopf | entschieden | ADR 0004 §2 |
| Seiten auf dem Server, 20 Zeilen je Seite, die Seite steht in der URL | entschieden | ADR 0004 §2 |
| **Standardansicht ist die mit Handlungsbedarf**, nicht „Alle“. Beispiel: „Braucht Aufmerksamkeit“ | entschieden | ADR 0004 §2 |
| Eine Arbeitsliste ist kein eigenes Muster, sondern eine Objektliste mit Ansichten nach Status | entschieden | ADR 0004 §2 |
| Klick auf die Zeile öffnet die Objektseite | entschieden | ADR 0004 §2 |
| **Kurzliste**: Tabelle mit Zeilenaktionen und „Neu“ darüber. Kein Filter, keine Seiten, keine Ansichten | entschieden | ADR 0004 §2 |
| **Die Suche springt, sie filtert nicht.** Die Sprung-Suche sucht über alle Objekte mit Objektseite, zeigt Treffer nach Typ gruppiert, Enter öffnet die Objektseite | entschieden | ADR 0004 §2 |
| Kein Select mit allen Datensätzen. Bei großen Mengen Auswahl mit Suche | Vorgabe | Fachbereich, 2026-10-12 |
| Vor einem neuen Listen- oder Arbeitsbereich prüfen, wie etablierte Tools es lösen | Vorgabe | Fachbereich, 2026-10-12 |

## 5. Zeilenaktionen

Gilt für alle Tabellen in allen Apps ([E1, Ergänzung 2026-10-12](entscheidungen.md#e1--tech-stack-und-app-schnitt)).

| Regel | Stand |
|---|---|
| Rechts in der Zeile ein „…“-Menü wie im shadcn/ui Data Table, als eine gemeinsame Komponente `RowActions` | entschieden |
| Oben die Standardaktionen mit Icon: Ansehen (`eye`), Bearbeiten (`pencil`), Duplizieren (`copy`) | entschieden |
| Dann ein Trenner und die übrigen Aktionen | entschieden |
| Ganz unten nach einem Trenner die roten Aktionen: Löschen (`trash-2`), Archivieren | entschieden |
| Icons 14 px. Einträge ohne Icon und das Label rücken auf dieselbe Textkante ein (shadcn `inset`) | entschieden |
| Die Gruppen leitet die Komponente aus dem Aktionstyp ab, nicht der Aufrufer | entschieden (ADR 0004 §2) |

## 6. Formulare

### Wo ein Formular steht

Nach [E1, Ergänzung 2026-10-14](entscheidungen.md#e1--tech-stack-und-app-schnitt):

| Fall | Wo |
|---|---|
| Anlegen | Sheet rechts mit allen Pflichtfeldern, in einem Schritt. Danach bleibt man in der Liste, ein Toast meldet das neue Objekt und hat „Öffnen“. Keine zweite Stufe |
| Bearbeiten, Objekt mit Objektseite | Auf der Objektseite je Abschnitt: „Bearbeiten“ im Kopf einer Karte macht nur diese Karte zum Formular, mit „Abbrechen“ und „Speichern“ in der Karte. Immer nur ein Abschnitt zugleich |
| Bearbeiten, abhängige Felder | Ganze Objektseite im Bearbeiten-Modus mit fester Leiste unten. Nur wenn ein Feld die gültigen Werte eines anderen Abschnitts ändert |
| Bearbeiten, Objekt ohne Objektseite | Sheet |
| Kurze Aktion | Sheet, z. B. Zahlung erfassen, Sperren mit Grund, Planwechsel |
| Bestätigung ohne Eingabe | AlertDialog (§7) |

Nie ein Formular als Modal-Dialog, nie inline in einer Tabelle.

### Sheet

| Regel | Stand |
|---|---|
| Sheet nach shadcn/ui: fixed, volle Höhe, z-50, Overlay mit Blur | Vorgabe (2026-10-11) |
| Feste Größe beim Aufruf: `sm` 384 px (1 bis 3 Felder), `md` 480 px (Standard), `lg` 640 px (zwei Spalten, viele Abschnitte, kleine Tabellen), `xl` 896 px (nur mit breiter Tabelle) | entschieden |
| Auf dem Handy volle Breite. Keine frei ziehbare Breite | entschieden |
| In der Fußleiste nur „Abbrechen“ und genau eine Hauptaktion. Weitere Aktionen stehen im Abschnitt oder Tab, zu dem sie gehören | entschieden |

### Abschnitte im Formular

| Regel | Stand |
|---|---|
| Standard sind Abschnitte mit Überschrift, alle offen | entschieden |
| Pflichtfelder stehen nie in einem zugeklappten Bereich | entschieden |
| Collapsible nur für selten geänderte Abschnitte: zugeklappt, im Kopf eine Zusammenfassung der Werte, bei einem Fehler klappt er von selbst auf | entschieden |
| Tabs (Variante `line`) nur für unabhängige Bereiche: höchstens 4, ein „Speichern“ für alle, Punkt am Tab mit Fehler, Sprung zum ersten Fehler, keine Tabs in Tabs | entschieden |
| Kein Accordion mit `type="single"` in Formularen | entschieden |

### Speichern

| Regel | Stand |
|---|---|
| Kein automatisches Speichern je Feld. Jede Änderung steht im Audit, Speichern ist bewusst | entschieden (E1, 2026-10-14) |
| Ungespeicherte Änderungen: Beim Verlassen der Seite oder des Tabs fragt ein AlertDialog | entschieden (E1, 2026-10-14) |
| Ein Fehler darf nie in einem verborgenen Teil bleiben | entschieden (E1, 2026-10-12) |

## 7. Bestätigungen

| Regel | Stand | Quelle |
|---|---|---|
| Eine Aktion ohne Eingabe (Löschen, Archivieren, Verwerfen) bestätigt ein AlertDialog von shadcn/ui | entschieden | ADR 0004 §2 |
| Bei Löschen und Archivieren ist die Hauptaktion rot | entschieden | ADR 0004 §2 |
| Braucht die Aktion eine Eingabe, etwa einen Grund, ist sie eine kurze Aktion im Sheet | entschieden | E1, 2026-10-14 |

## 8. Assistent, Einstiegsseite, Startseite

| Regel | Stand | Quelle |
|---|---|---|
| **Assistent** nur für festgelegte Abläufe. Heute: Registrierung eines Tenants oder Carriers (Konto, dann Firma) und Ersteinrichtung eines Standorts | entschieden | ADR 0004 §2, §8 |
| Assistent: Schritte mit Nummer und Titel oben, „Zurück“ und „Weiter“ unten. Jeder Schritt speichert, man kann abbrechen und später weitermachen. Der Nutzer sieht immer, wo er steht und was fehlt | entschieden | ADR 0004 §2 |
| **Einstiegsseite** nach shadcn/ui Block login-02: zwei Spalten ab 1024 px, links Formular mit Logo, rechts ein Bild über die volle Höhe. Darunter nur die Formularspalte. Formular höchstens 320 px breit. Im Dunkelmodus Bild abgedunkelt und grau | entschieden | ADR 0004 §2 |
| Kein Knopf für Social Login | entschieden | E1, Ergänzung 2026-10-17 |
| **Startseite je Rolle**: Kacheln mit Kurzlisten, jede Kachel führt in eine Ansicht des Katalogs. Diagramme später | entschieden | ADR 0004 §2 |

## 9. Status und Farben

| Regel | Stand | Quelle |
|---|---|---|
| **Farbe nie allein.** Jeder Status hat Farbe, Icon und Textwort | entschieden für alle Apps über WCAG 2.2 AA (§10), Zuordnung Vorschlag | WCAG 1.4.1, ui-stil-belege.md §5 |
| Farben rot-grün-sicher wählen. Rund 8 % der Männer haben eine Farbsehschwäche | Vorschlag | ui-stil-belege.md §5 |
| Statusfarbe gegen Hintergrund mindestens 3:1, Beschriftung mindestens 4,5:1 | Vorschlag | WCAG 1.4.11, 1.4.3 |

Vorschlag für die Zuordnung zum Status einer Buchung ([claude-design-prompt.md §5](research/claude-design-prompt.md)):

| Bedeutung | Status | Farbe |
|---|---|---|
| Geplant | bestätigt | neutral oder Akzent |
| Wartet | angefragt, eingecheckt | Amber |
| Aktiv | aufgerufen, an Rampe | Blau |
| Erledigt | abgefertigt, ausgecheckt | Grün, dann Grau |
| Problem | Konflikt, No-Show, abgewiesen, abgelehnt | Rot |
| Ohne Folge | storniert | Grau, durchgestrichen |

## 10. Barrierefreiheit

Ziel ist WCAG 2.2 Stufe AA in jeder App ([claude-design-prompt.md §7](research/claude-design-prompt.md), Belege in [ui-stil-belege.md](research/ui-stil-belege.md)).

| Regel | Norm |
|---|---|
| Text mindestens 4,5:1 Kontrast, großer Text 3:1 | WCAG 1.4.3 |
| Bedienelemente und Grafiken mit Bedeutung mindestens 3:1 | WCAG 1.4.11 |
| Farbe nie als einziger Träger einer Information | WCAG 1.4.1 |
| Touch-Ziele mindestens 24 × 24 px, mit Abstand | WCAG 2.5.8 |
| Fokus immer sichtbar, alles per Tastatur bedienbar | WCAG 2.4.7, 2.1.1 |

## 11. Drei Dichten

Ein Design-System, drei Dichten. Farben, Status, Begriffe und Icons sind überall gleich, Größe und Dichte folgen dem Ort. Stand: **Vorschlag** ([claude-design-prompt.md §4](research/claude-design-prompt.md)). Die Zahlen für Halle und Handschuh sind geschätzt und müssen mit echten Handschuhen getestet werden.

| Dichte | Apps | Regeln |
|---|---|---|
| Büro | Tenant, Carrier, Plattform | Ruhig und dicht, eine Akzentfarbe, Tabellenziffern, Tastaturkürzel in der Disposition |
| Halle | Ops (Gate, Lager, Kiosk, Wallboard) | Touch-Ziele 56 px, Hauptaktion 72 px, Abstand mindestens 8 px, hoher Kontrast, wenige Aktionen je Screen, ein Hauptknopf, Hell als Standard |
| Fahrerhaus | Fahrer | Mobil zuerst, ein Schritt je Screen, Status oben, Icon plus Wort, kurze Sätze, ein Verb je Knopf, Zahlen und Rampennummer sehr groß, kleines Bundle |

## 12. Fahrer-App und Sprachen

| Regel | Stand | Quelle |
|---|---|---|
| 14 Sprachen im MVP: DE, PL, RU, UK, EN, RO, LT, CS, HU, BG, SK, SL, BKS, TR | entschieden | E7 |
| Sprache vorgewählt aus der Browsersprache, umstellbar, Wahl bleibt gespeichert | entschieden | E7 |
| Jede Übersetzung wird professionell geprüft. Maschinelle Übersetzung höchstens für Freitext | entschieden (Prüfung), Vorschlag (Freitext) | E7, ui-stil-belege.md §4 |
| Sprachwahl ohne Flaggen, Sprache mit ihrem Eigennamen (Polski, Română, Українська). Wechsel immer oben sichtbar | Vorschlag | ui-stil-belege.md §4 (W3C) |
| Deeplink ohne Login und ohne Installation. PWA-Installation nur anbieten | Vorschlag | ui-stil-belege.md §4 |
| Schwaches Netz: letzter Status zwischengespeichert, klare Meldung bei Offline | Vorschlag | ui-stil-belege.md §4 |

## 13. Texte, Begriffe und Formate

| Regel | Stand | Quelle |
|---|---|---|
| Ein Begriff, ein Name. In der UI genau die Namen aus dem [Glossar](glossar.md) | entschieden | Glossar, AGENTS.md |
| In der UI nicht verwenden: Termin, Zeitfenster, Dock, Tor, Pool, Zone, Mandant | Vorschlag | claude-design-prompt.md §5.1 Abschnitt 4 |
| Datum im DE-Format „Do 15.10.“, Uhrzeit 24 h, Zeiten im 15-Minuten-Raster | Vorschlag | claude-design-prompt.md §5.1 Abschnitt 6 |
| Kurze Verben auf Knöpfen. Keine Fachwörter, die der Nutzer nicht kennt, besonders in der Fahrer-App | Vorschlag | ui-stil-belege.md §4 |

## 14. Fachliche Regeln, die jeder Screen einhält

Stand: **Vorschlag** aus [claude-design-prompt.md §5.1 Abschnitt 7](research/claude-design-prompt.md), soweit nicht anders genannt.

- Carrier und Fahrer sehen nie Rampenzeit oder Rampengruppe. Die Rampe sieht der Fahrer erst beim Aufruf.
- Das System schlägt vor, ein Mensch entscheidet. Kein Knopf führt eine Umplanung ohne Bestätigung aus.
- Jede Aktion erzeugt einen Eintrag in der Historie (wer, wann, was). Die Objektseite zeigt sie.
- Live-Daten erscheinen ohne Neuladen, dezent mit „aktualisiert vor 5 s“.
- Die Navigation zeigt jedem nur, was seine Rolle erlaubt (entschieden, E1, Ergänzung 2026-10-11).
- Noch nicht entschiedene Elemente zeigt ein Prototyp dezent als „Vorschlag“.

## 15. Arbeitsweise bei Screens

| Schritt | Regel | Quelle |
|---|---|---|
| Vorher | Projekt-Skill `yrd-muster` laden, ADR 0004 und E1 lesen | AGENTS.md |
| Vorher | Den vorhandenen Prototyp der App lesen und gegen ADR 0004 abgleichen. Abweichungen als Befund nennen, nicht still übernehmen | Vorgabe, 2026-10-14 |
| Verfeinern | Jede Task mit Screen hat einen `## Steckbrief`: Screen, Muster, größte Menge, Anmerkung. Erst dann wird gebaut | ADR 0004 §4 |
| Bauen | Gerüst mit `bun run gen screen <muster> <name>`, sobald es existiert. Vorbild ist das Epic EP7 Kunden | ADR 0004 §6, §8 |
| Bauen | Apps importieren `Table`, `Sheet`, `Dialog`, `AlertDialog` nicht direkt, nur die Bausteine aus §3 | ADR 0004 §6 |
| Beweisen | Jede Liste mit Beispieldaten in der Menge aus dem Steckbrief zeigen. Hell und dunkel ansehen | ADR 0004 §6, yrd-muster |
| Beweisen | Nach einer Änderung die laufende Seite ansehen, erst dann „fertig“ melden | Vorgabe, 2026-10-16 |
| Prüfen | Review gegen Steckbrief und ADR 0004 §2 und §3. Ein Muster, das nicht im Katalog steht, ist ein Befund | ADR 0004 §6 |

## 16. Offen

- Zuordnung der Statusfarben, die drei Dichten und die Zielgrößen für Handschuhe sind Vorschläge. Sie brauchen eine Entscheidung des Fachbereichs und einen Test mit Handschuhen.
- Motiv des Bildes auf der Einstiegsseite hängt an E10 (Domain, Branding).