# UniCircle

UniCircle is Pointfex's campus marketplace for verified university members to buy, sell, rent, exchange, donate, and lend items.

## Run the frontend

Use Node.js 20.19+ or 22.12+.

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. To work without the API, follow the [development mock setup](frontend/README.md).

## v3.0.1 implementation

- [Product requirements](PRD.md)
- [API contract](API_CONTRACT.md) and [OpenAPI](openapi.yaml)
- [Frontend mapping](FRONTEND_API_MAPPING.md) and [UI handoff](UniCircle_Frontend_UI_Fix_Handoff_FINAL.md)
- [Architecture](ARCHITECTURE.md) and [database design](DATABASE.md)
- [Phased build plan](CODEX_TASKS.md) and [baseline status](FRONTEND_V3_BASELINE.md)

See the [frontend guide](frontend/README.md) to run the baseline tests and build.

## Deployment preparation

The repository is configured for a single Vercel project containing the Vite frontend and Express backend as same-origin Services. Review [DEPLOYMENT.md](DEPLOYMENT.md) and the [Phase 6 readiness evidence](PHASE6_READINESS.md) before linking the repository or adding production environment variables. No credential belongs in Git.
