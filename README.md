# To-Do Liste

Persönliche To-do-App fürs iPhone als installierbare Progressive Web App (PWA).
Alle Daten bleiben ausschließlich auf dem Gerät im Browser-Speicher. Kein Server, kein Login.

**Live:** https://nadja-lld.github.io/todo-liste/

## Funktionen

- Mehrere Listen, Ansicht „Heute" für fällige und überfällige Aufgaben
- Fälligkeitsdatum, Priorität (hoch/mittel/niedrig), Wiederholung (täglich/wöchentlich/monatlich)
- Export und Import aller Daten als JSON
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

Details für Mitwirkende: `CONTRIBUTING.md`. Architektur und Konventionen: `CLAUDE.md`.
