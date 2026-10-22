# yrd Design System

Design-System für **yrd.app** – Zeitfenster- und Yard-Management für Lager im DACH-Raum (B2B-SaaS). Ein System, drei Dichten (Büro · Halle · Fahrer), hell und dunkel gleichwertig. Styling-Grundlage: **Tailwind CSS v4 + shadcn/ui-Namensgebung**, Komponenten als React.

## Kontext

- **Tenant** (Lager, zahlt): Disposition, Einrichtung, Reports. Desktop 1920×1080. Persona Sandra (Disponentin), Thomas (Lagerleiter).
- **Carrier** (Spedition, kostenlos): Buchen, Fahrer zuweisen. Desktop + Smartphone, auch als Gast über Carrier-Link. Persona Agnieszka, Jürgen.
- **Ops** (Gate, Lager, Wallboard, Kiosk): Tablet quer, TV 55", Kiosk. Persona Erwin (Pförtner), Kemal (Stapler).
- **Fahrer** (Deeplink per SMS, kein Konto): Smartphone 360×800, 14 Sprachen (hier DE + PL). Persona Andrzej.
- **Plattform** (yrd-Team): Admin, Support, Supportleiter. Persona Lena, Markus.

Zwei Zeiten, streng getrennt: **Ankunftszeit** („Anmeldung an der Pforte bis 13:45 Uhr“, sehen Carrier und Fahrer) und **Rampenzeit** (14:00 an Rampe 8, sieht nur die Disposition).

Quellen: nur das Briefing im Chat. Keine Figma-Datei, kein Repository, kein Logo geliefert. Die Marke ist offen – Akzentfarbe **Petrol** ist ein Vorschlag.

## Content Fundamentals

- Sprache: Deutsch, Sie-Form gegenüber Fahrern („Bitte fahren Sie zu Rampe 8“), sachlich-knapp im Büro („Bestätigen“, „Verschieben“, „Abweisen“).
- Begriffe genau so: Tenant · Carrier · Standort · Halle · Rampengruppe · Rampe · Buchungsart · Buchung · Ankunftszeit · Rampenzeit · Check-in · Aufruf · Abfahrtsfreigabe · Check-out · Walk-in · Entscheidungsfall · Eingangskorb · Konflikt · Verbindung · Carrier-Link · Gast-Carrier · Zugangsseite · Wartezeit · Standzeit · Freie Zeit · Standgeld · Pünktlichkeit (früh, pünktlich, spät in Toleranz, spät). **Nicht**: Termin, Zeitfenster, Dock, Tor, Pool, Zone, Mandant.
- Status klein geschrieben wie Adjektive: angefragt, bestätigt, eingecheckt, aufgerufen, an Rampe, abgefertigt, ausgecheckt, abgelehnt, storniert, abgewiesen; Eigennamen groß: No-Show, Konflikt.
- Zahlen: Datum „Do 15.10.“, Uhrzeit 24 h ohne Sekunden, 15-Minuten-Raster, Tabellenziffern. Kennzeichen und Nummern (B-1042, 4500123456, LS-88213, WGM 4KX21) in Mono.
- Fahrer-App: keine Fachbegriffe, ein Thema pro Screen, Icon + kurzer Text („Bitte warten“, „Sie werden aufgerufen“).
- Unentschiedenes dezent als Badge „Vorschlag“ markieren. Keine Emoji. Live-Hinweis „aktualisiert vor 5 s“.
- Button-Texte sind Verben im Infinitiv; destruktive Aktionen nennen den Grund im Dialog.

## Visual Foundations

- **Farbe**: eine Akzentfarbe Petrol (`--primary` #0E6E73 hell / #5FC6CA dunkel), kühle Neutrale (#16191D … #FFFFFF; dunkel #0F1215 … #E8ECEF). Statusfarben nach Bedeutung: Amber wartet, Blau aktiv, Grün erledigt (dann Grau), Rot Problem, Grau durchgestrichen storniert. Jede Statusfarbe hat Fläche + `-foreground` (Badge) und `-solid` (Punkt, Block). Alle Textpaare ≥ 4,5:1 in beiden Varianten – live belegt in `guidelines/kontrast-*.html`.
- **Typografie**: IBM Plex Sans (400–700) + IBM Plex Mono; Tabellenziffern global. Stufen je Dichte: Büro 12/13/14/16/18/22/28/40, Halle 14/16/18/22/28/36/48/120, Fahrer 13/15/17/20/24/30/40/56.
- **Dichte**: `data-density="halle" | "fahrer"` am Wurzelelement (Büro = Standard). `--control-h` 36/56/48, Primärknopf 36/72/56, Touch-Minimum 24/56/44, `--radius` 6/10/10.
- **Abstände**: 4-px-Raster, `--pad` 16/20/16, `--gap` 8/12/12.
- **Ecken**: sm 4, md 6, lg 10, xl 16. Keine Pillen außer Progress.
- **Schatten**: Flächen in der Seite haben Rahmen, keinen Schatten; Popover shadow-md, Dialog/Sheet/Toast shadow-lg. Keine Verläufe, kein Glas, Blur nur 2 px hinter dem Dialog.
- **Hintergründe**: flache Flächen, keine Bilder, keine Illustrationen, keine Muster.
- **Bewegung**: 120–180 ms, `cubic-bezier(.2,0,0,1)`, nur Farbe/Opacity/Transform; Pulsieren nur für neuen Aufruf am Wallboard. Keine Bounces.
- **Hover**: muted-Fläche oder brightness(1.1) auf Primär; **Press**: translate-y 1 px; **Fokus**: 2 px Ring `--ring` mit 2 px Offset, immer sichtbar. Halle hat keinen Hover – Information sichtbar machen.
- **Karten**: 1 px `--border`, Radius lg, Fläche `--card`, kein Schatten. Gate-Karte 2 px Rahmen, ausgewählt in Primär.
- **Layout**: Büro mit Sidebar 240 px (einklappbar 56), Sheet 480 px rechts, nicht modal. Halle: Offline-Banner oben volle Breite, ein Primärknopf. Fahrer: Statuskarte ganz oben.
- **Transparenz**: nur Overlay hinter Dialog (foreground 40 %) und sticky Header (95 %).
- **Dunkel**: eigener Token-Satz `.dark`, gleichwertig; Statusfarben als dunkle Fläche mit heller Schrift, Volltöne heller.

## Iconography

- **lucide** (wie shadcn/ui), Strich 2. Büro 16 px (in Badges 12–14), Halle 22–28, Fahrer 24–48. Nur mit Bedeutung, immer neben Text.
- Feste Status-Icons: Clock angefragt · CalendarCheck bestätigt · MapPin eingecheckt · Megaphone aufgerufen · Forklift an Rampe · CheckCircle2 abgefertigt · LogOut ausgecheckt · AlertTriangle Konflikt · UserX No-Show · Ban abgewiesen · XCircle abgelehnt · MinusCircle storniert.
- Einbindung in React über `lucide-react` (UMD-Bundle `window.LucideReact`, in den Karten geladen), in plain HTML über `lucide.createIcons()`. Keine SVG im Projekt, keine Emoji, keine Unicode-Zeichen als Icons, keine Stockfotos, keine Lkw-Illustrationen.
- **Kein Logo geliefert**: Wortmarke „yrd“ in Plex Sans Semibold, wo eine Marke stehen würde.

## Tailwind v4 einbinden (Produktion)

```css
@import "tailwindcss";
@import "./tokens/fonts.css";
@import "./tokens/theme.css";
@import "./tokens/typography.css";
@import "./tokens/tailwind.css"; /* @custom-variant dark + @theme inline */
```
Klassen: `bg-primary text-primary-foreground`, `bg-status-called text-status-called-foreground`, `h-control`, `h-control-primary`, `rounded-control`, `text-base/md/lg/display`, `p-pad gap-gap`, `shadow-md`, `font-mono`. Dunkel: Klasse `dark` am `<html>`. Dichte: `data-density`.

In den Karten dieses Projekts läuft Tailwind als Browser-Build (`card-runtime-v2.js` / `card-lite-v2.js` + `tokens/tailwind-theme.js`, generiert aus `tokens/tailwind.css`).

## Components

Alle in `components/<gruppe>/`, Namespace `window.YrdDesignSystem_d6c60f`.

- core: Button, Icon, ToggleGroup, ThemeSwitch (Darstellung), Tooltip, Skeleton, Progress
- status: StatusBadge, PunctualityChip, Badge, Alert (+ OfflineBanner), Toast
- forms: FormField, Input, Select, InputOTP, Calendar, DatePicker, Command
- surfaces: Card, Dialog, Sheet, DropdownMenu, Tabs
- data: Table (Data Table), Chart
- navigation: Sidebar
- yard (eigene Bausteine, Entwurf): Timeline (Zeitleiste), DockTile (Rampen-Kachel), GateCard, CallScreen (Aufruf-Vollbild), Wallboard

Intentional additions: Icon (Wrapper für lucide), StatusBadge/PunctualityChip (Badge-Varianten als eigene API), ThemeSwitch (Toggle Group spezialisiert), OfflineBanner (Alert spezialisiert).

shadcn/ui-Komponenten noch ohne eigene Umsetzung: Checkbox, Switch, Radio, Textarea (als `Input multiline`), Popover (in Select/DatePicker/Dropdown enthalten), Separator, Avatar, Breadcrumb, Pagination.

## Index

- `styles.css` – Einstieg, importiert `tokens/`
- `tokens/theme.css` (Hell/Dunkel, Status, Pünktlichkeit, Dichte) · `tokens/typography.css` · `tokens/fonts.css` · `tokens/tailwind.css` (Tailwind-Binding) · `tokens/tailwind-theme.js` (generiert)
- `guidelines/` – Foundation-Karten: Farben (Akzent, Neutrale, Status, Pünktlichkeit, Chart), Kontrasttabellen hell/dunkel, Typografie (Schrift, Stufen je Dichte), Abstände, Dichte, Ecken, Schatten, Icons, `komponenten.html` (klickbare Übersicht mit Umschaltern), `probe-buero/halle/fahrer.html`, `regeln.html`
- `components/` – siehe oben, je Verzeichnis eine Karte `*.card.html`, je Komponente `.jsx`, `.d.ts`, `.prompt.md`
- `thumbnail.html`, `card-runtime-v2.js`, `card-lite-v2.js`, `SKILL.md`
- UI-Kits (ganze Screens) folgen in den nächsten Aufträgen.

## Noch nicht entschieden (als „Vorschlag“ markieren)

Avis mit Mengenzeilen je Ladungsträger · Warentyp an Buchungsart, Gefahrgut Ja/Nein · Partner vor Zeitwahl · Anmeldefenster „13:15–13:45“.
