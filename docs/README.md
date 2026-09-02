# Jangoing Documentation

The repository root `README.md` is the project entry point. Detailed plans,
operational guides, decisions, and learning references live in this directory.

Use one language tree at a time:

- [English documentation index](./ENG/README.md)
- [Korean documentation index](./KO/README.md)

This root index no longer links to individual documents. Its only job is to
route readers into the correct language tree and explain the structure.

## Structure

Both language trees use the same category layout:

- `decisions/`
- `planning/`
- `annotation/`
- `ml/`
- `operations/`

## Usage Rules

- Start from either `docs/ENG/README.md` or `docs/KO/README.md`.
- Stay in that language tree while reading.
- Treat root-level legacy docs as source or migration references, not the
  primary reading path.
- The progress log remains English-only by design and is excluded from
  translation.
- The design guide is intentionally not mirrored yet and remains root-only.

## Maintenance Rule

When a document is meant to exist in both languages, keep the same relative
path under `docs/ENG/` and `docs/KO/`.
