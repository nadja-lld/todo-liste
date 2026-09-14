# Contributing to todo-liste

## Development Setup

```bash
git clone https://github.com/nadja-lld/todo-liste.git
cd todo-liste
make install
make run
```

## Code Style

- Folge den bestehenden Patterns im Projekt
- Lies `CLAUDE.md` für projektspezifische Conventions
- Linting: `make lint`
- Formatting: `make format`

## Workflow

1. Branch von `main` erstellen (`feature/...` oder `fix/...`)
2. Änderungen implementieren und testen (`make check`)
3. Commit mit aussagekräftiger Message (Imperativ, beschreibt "Warum")
4. Push und Pull Request erstellen
5. Review abwarten, Feedback einarbeiten

## Commit Messages

```
Add user export feature for GDPR compliance
Fix session timeout not respecting timezone
Remove deprecated v1 API endpoints
```

## Tests

- Neue Features brauchen Tests
- Bug-Fixes brauchen Regressionstests
- Tests laufen mit `make test`

## Fragen?

Erstelle ein Issue oder kontaktiere das Team.
