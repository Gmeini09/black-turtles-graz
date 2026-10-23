# Black Turtles Graz

Deutschsprachige Vereinspräsentation mit orange-schwarzem Design, Ligakader, Rückennummern, Spielplan 2026/27, Saisonkalender, Live-Ticker und Livestream.

**Website:** https://gmeini09.github.io/black-turtles-graz/

## Veröffentlichen

GitHub Pages veröffentlicht den Ordner `docs/` aus dem Branch `main`. Änderungen an diesen Dateien werden nach einem Push automatisch online gestellt. Kein Build und keine zusätzlichen Dienste notwendig. `.nojekyll` erhält die statischen Dateien unverändert.

## Inhalte pflegen

- `docs/data.js`: Spieler, belegte Rückennummern mit Quellen, historische Ergebnisse und Vereinsdaten.
- `docs/index.html`: Seiteninhalte und Metadaten.
- `docs/styles.css` und `docs/improvements.css`: Gestaltung und responsive Größen.
- `docs/app.js`: Filter, Suche, Dialoge und Kalenderdownload.
- `docs/schedule.js`: automatischer Abgleich mit dem offiziellen NHL-Graz-Saisonfeed.
- `docs/live.js`: offizieller Spielstatus, Tore und bestätigte Liveübertragung.

Die relativen Dateipfade funktionieren unter dem GitHub-Pages-Projektpfad. Ein lokaler Aufruf gelingt beispielsweise mit `python -m http.server 8765 --directory docs`.

Die Seitenbereiche folgen der Menüfolge Start, Verein, Mannschaft, Spielplan, Live, Ergebnisse, Geschichte und Mitspielen. Native Sprunglinks scrollen weich mit einem gemeinsamen Abstand zur festen Kopfzeile. Während der Animation bleibt das gewählte Menüziel aktiv; beim manuellen Scrollen folgt die Markierung dem sichtbaren Bereich. Die Einstellung für reduzierte Bewegung wird berücksichtigt. `#cups` zeigt auf die Cup-Überschrift, `#cup-cards` enthält die gerenderten Karten.

## Daten und Livebetrieb

Der Saisonspielplan wird beim Öffnen und alle fünf Minuten mit dem öffentlichen NHL-Graz-Feed abgeglichen. Bei Ausfällen bleibt der letzte bestätigte Stand erhalten. Zeitangaben verwenden Europe/Vienna. Der Kalender ist ein ICS-Download; Änderungen erfordern einen erneuten Import.

Rückennummern: geprüft am 23.10.2026. Der Ligakader 2026/27 enthält noch keine befüllten Nummern. 18 Karten zeigen die zuletzt belegte Nummer aus offiziellen Spielberichten 2025/26, jeweils mit Quellenlink. Alban und Jonas Schuller bleiben ohne Nummernbeleg.

Der Livestream startet erst nach einem Klick und nur bei einem frischen, passenden NHL-Live-Feed. Videosegmente werden auf Aktualität geprüft. Der offizielle Gamecenter-Link bleibt als Alternative verfügbar. Für den Browserzugriff werden keine Zugangsdaten benötigt.

## Quellen und Bildnachweise

- Liga, Wappen, Kader und Spiele: https://www.nhl-graz.com/teams/turtles/22090 und NHL Graz / hockeydata. Quellen zu historischen Angaben und Rückennummern stehen auf der Website.
- Hallenfoto: Gemeinde Hart bei Graz, https://www.hartbeigraz.at/Eisstadion . Das Foto zeigt Publikumslauf.
- Historische Mannschaftsaufnahme: ASVÖ Steiermark, ASVÖ-Cup 2024, https://www.asvoe-steiermark.at/de/newsshow-news-----asvoe-jubilaeums-eishockey-cup-20242?return=25 . Kein aktuelles Kaderfoto.
- Barlow Condensed und Manrope werden lokal mit ihren OFL-Lizenzdateien ausgeliefert.
- hls.js 1.7.3 wird lokal mit Apache-2.0-Lizenz ausgeliefert.

Impressum und Datenschutz sind hinsichtlich Verantwortlichem und Vereinskontakt weiterhin als Entwurf gekennzeichnet. Nicht bestätigte Vereinsanschrift, Kontaktangaben und Trainingszeiten wurden nicht ergänzt.

## Ergänzung der Cupgeschichte am 23.10.2026

Die Vereinschronik nennt sieben ASVÖ-Cupsiege (2015, 2020 und 2021 bis 2025) sowie fünf Titel in Folge. Diese Angaben wurden vom Verein erneut bestätigt und sind auf der Website ausdrücklich als Vereinsangaben gekennzeichnet. Auch die Penaltyentscheidung gegen Rattlesnakes 2025 stammt aus dieser Auskunft.

Die offiziellen ASVÖ-Berichte bestätigen die Gruppensiege in Gruppe B 2022 und 2023. Die archivierten Berichte für 2015 und 2021 nennen andere Sieger. Eine unabhängige Bestätigung der vollständigen Jahresliste liegt deshalb nicht vor; die unterschiedliche Quellenlage ist im Quellen-Dialog erläutert.
