CREATE TABLE IF NOT EXISTS documents (
  id         TEXT    PRIMARY KEY,
  version    INTEGER NOT NULL,
  state      TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
