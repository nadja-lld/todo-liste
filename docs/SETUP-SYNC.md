# Abgleich zwischen zwei Handys einrichten

Ohne diese Einrichtung läuft die App unverändert nur auf dem jeweiligen Gerät. Alle
Schritte sind einmalig.

Was am Ende existiert: ein Cloudflare-Worker mit einer D1-Datenbank, ein Zugangscode,
und beide Handys, die ihn kennen.

## 1. Worker und Datenbank anlegen

```bash
cd server
npx wrangler login
npx wrangler d1 create todo-sync
```

Der Befehl gibt eine `database_id` aus. Diese in `server/wrangler.toml` bei
`database_id` eintragen (ersetzt `REPLACE_WITH_DATABASE_ID`).

Dann das Schema anlegen:

```bash
npx wrangler d1 execute todo-sync --remote --file=./schema.sql
```

## 2. Worker veröffentlichen

```bash
npx wrangler deploy
```

Der Befehl gibt die Worker-URL aus, etwa `https://todo-sync.<name>.workers.dev`. Notieren.

Der Worker läuft jetzt, weist aber noch jede Anfrage ab — der Zugangscode fehlt.

## 3. Zugangscode erzeugen und hinterlegen

Der Code muss **generiert** sein, nicht ausgedacht: der Endpunkt ist öffentlich
erreichbar und dieser eine Code schließt alles auf.

```bash
openssl rand -base64 24 | tr -d '/+=' | cut -c1-32
```

Die Ausgabe notieren — sie wird auf beiden Handys gebraucht und ist später nicht mehr
aus Cloudflare auslesbar. Dann:

```bash
npx wrangler secret put ACCESS_CODE
```

und den Code einfügen, wenn danach gefragt wird.

## 4. Worker prüfen, bevor die App im Spiel ist

```bash
curl -i -H "Authorization: Bearer <CODE>" https://todo-sync.<name>.workers.dev/state
```

Erwartet: `HTTP/2 200` und `{"version":0,"state":null}` — noch kein Dokument gespeichert.

Ohne den Header muss `401` kommen:

```bash
curl -i https://todo-sync.<name>.workers.dev/state
```

Kommt bei der ersten Anfrage etwas anderes als 200, stimmt der Code nicht oder das
Secret wurde nicht gesetzt. Erst weitermachen, wenn beide Antworten passen.

## 5. GitHub einrichten

Im Repository unter **Settings → Secrets and variables → Actions**:

| Art | Name | Wert |
|-----|------|------|
| Variable | `SYNC_URL` | die Worker-URL aus Schritt 2 |
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare-API-Token mit Worker- und D1-Rechten |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Account-ID aus dem Cloudflare-Dashboard |

`SYNC_URL` ist bewusst eine Variable und kein Secret: sie landet ohnehin im gebauten
Bundle. Der Zugangscode tut das nicht.

Danach einmal auf `main` pushen (oder den Workflow „Deploy to GitHub Pages" von Hand
starten), damit die App mit gesetzter `SYNC_URL` neu gebaut wird.

## 6. Auf beiden Handys

1. https://nadja-lld.github.io/todo-liste/ in Safari öffnen
2. Teilen → „Zum Home-Bildschirm"
3. App starten: sie fragt nach dem Zugangscode und danach, wer man ist
4. Auf dem zweiten Handy dasselbe, aber die **andere** Person wählen

Das erste Handy schiebt seinen bestehenden Stand hoch. Das zweite übernimmt ihn
vollständig — ein frisch eingerichtetes Gerät führt nicht zusammen, sonst gäbe es
doppelte Listen.

## Wenn etwas klemmt

- **„Abgleich fehlgeschlagen" dauerhaft:** Der Code stimmt nicht. In den Einstellungen
  „Gerät zurücksetzen" und neu eingeben.
- **Nichts kommt an:** Prüfen, ob `ALLOWED_ORIGIN` in `server/wrangler.toml` exakt der
  Adresse entspricht, unter der die App läuft.
- **Code verloren:** Neuen erzeugen, `wrangler secret put ACCESS_CODE` erneut ausführen
  und beide Geräte zurücksetzen. Die Aufgaben in der Datenbank bleiben erhalten.
