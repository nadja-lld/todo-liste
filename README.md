# To-Do Liste

To-do-App fürs iPhone als installierbare Progressive Web App (PWA), ausgelegt auf genau
zwei Personen: jede sieht ihre eigenen Listen und kann der anderen Aufgaben anlegen.

Die App arbeitet offline-first — sie liest und schreibt den lokalen Browser-Speicher und
gleicht im Hintergrund mit einem gemeinsamen Dokument ab. Ohne konfigurierten Abgleich
läuft sie unverändert nur auf dem Gerät.

**Live:** https://nadja-lld.github.io/todo-liste/

## Funktionen

- Mehrere Listen, Ansicht „Heute" für fällige und überfällige Aufgaben
- Fälligkeitsdatum, Priorität (hoch/mittel/niedrig), Wiederholung (täglich/wöchentlich/monatlich)
- Aufgaben für die zweite Person anlegen; dort als „Neu von …" markiert, bis sie geöffnet werden
- Offline nutzbar, Dark Mode

## Installation auf dem iPhone

1. Live-URL in Safari öffnen
2. Teilen-Symbol antippen, dann „Zum Home-Bildschirm"
3. App vom Home-Bildschirm starten

## Entwicklung

Voraussetzungen: Node 22, npm.

```bash
make install
make run       # Dev-Server, auch im lokalen Netz erreichbar
make check     # Lint, Typecheck, Tests
make build     # Produktions-Build nach dist/
```

## Abgleich einrichten

Ohne Einrichtung bleibt die App geräte-lokal. Für den Abgleich zwischen zwei Handys:
`docs/SETUP-SYNC.md`.

Details für Mitwirkende: `CONTRIBUTING.md`. Architektur und Konventionen: `CLAUDE.md`.
