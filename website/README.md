# OIMDB Documentation Site

This directory contains the [Docusaurus](https://docusaurus.io/) site for OIMDB.

## Development

From the repository root:

```bash
npm install
npm run docs:dev
```

Open [http://localhost:3000/oimdb/](http://localhost:3000/oimdb/) (baseUrl is `/oimdb/` to match GitHub Pages).

## Build

```bash
npm run docs:build
npm run docs:serve
```

## Deployment

Docs deploy automatically to GitHub Pages on push to `main` via `.github/workflows/docs.yml`.

Live site: [https://oimdb.org/](https://oimdb.org/)

## Content

| Path | Source |
|------|--------|
| `docs/intro.md` | Project overview |
| `docs/getting-started/` | Installation and quick start |
| `docs/packages/` | Package index (Phase 2: full API from READMEs) |
| `docs/architecture/` | From `docs/ARCHITECTURE.md` |
| `docs/guides/` | From `docs/PERFORMANCE.md` |
