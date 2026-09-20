# Security Policy

## Supported Versions

| Version          | Supported |
| ---------------- | --------- |
| Latest on `main` | Yes       |
| Older versions   | No        |

## Reporting a Vulnerability

**Bitte KEINE öffentlichen Issues für Sicherheitslücken erstellen.**

1. Sende eine E-Mail an admin@lillydoo.com
2. Beschreibe die Schwachstelle mit Reproduktionsschritten
3. Wir bestätigen den Eingang innerhalb von 48 Stunden
4. Kritische Fixes innerhalb von 7 Tagen

## Datenhaltung

- Aufgaben liegen lokal im Browser-Speicher und, sofern der Abgleich eingerichtet ist,
  zusätzlich **unverschlüsselt** in einer Cloudflare-D1-Datenbank.
- Der Zugang ist ein einziger generierter 32-Zeichen-Code, der beiden Personen gemeinsam
  gehört. Er liegt als Worker-Secret, nie im Repository und nie im gebauten Bundle.
- Es gibt bewusst **keine Trennung zwischen den beiden Personen**: getrennt sind nur die
  Ansichten, nicht die Daten. Wer den Code hat, kann das gesamte Dokument lesen.
- Zugriff auf den Cloudflare-Account bedeutet Zugriff auf alle Aufgaben.

## Erwartungen

- Kein Zugriff auf Daten anderer Nutzer
- Kein Denial-of-Service
- Verantwortungsvolle Offenlegung (Responsible Disclosure)
