# todo-sync worker

The sync endpoint for the to-do PWA: one shared JSON document, one version counter,
one shared access code. Deployed to Cloudflare Workers with a D1 database.

## Endpoints

Both require `Authorization: Bearer <access code>`.

| Request                                    | Response                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `GET /state`                               | `200 { version, state }` — `{ version: 0, state: null }` when nothing is stored yet |
| `PUT /state` with `{ baseVersion, state }` | `200 { version }` on success, `409 { version, state }` when someone wrote first     |

Other answers: `400` malformed body, `401` wrong or missing code, `404` unknown path,
`405` unsupported method, `413` body over 1 MB.

## One-time setup

```bash
cd server
npx wrangler login

# 1. Create the database and copy the printed database_id into wrangler.toml
npx wrangler d1 create todo-sync

# 2. Apply the schema
npx wrangler d1 execute todo-sync --remote --file=./schema.sql

# 3. Generate an access code and store it as a secret.
#    Write the printed code down — it is needed on both phones and is not
#    recoverable from Cloudflare afterwards.
openssl rand -base64 24 | tr -d '/+=' | cut -c1-32
npx wrangler secret put ACCESS_CODE

# 4. Deploy
npx wrangler deploy
```

`wrangler deploy` prints the worker URL. That URL goes into the repository variable
`SYNC_URL` so the built app knows where to sync to.

## Notes

- `ACCESS_CODE` is a secret and must never be written into `wrangler.toml` or committed.
- `ALLOWED_ORIGIN` in `wrangler.toml` must match exactly where the PWA is served from;
  requests from any other origin are refused by CORS.
- The document is stored unencrypted. Anyone with the access code, and anyone with
  access to the Cloudflare account, can read it.
