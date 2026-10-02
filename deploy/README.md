# Deploy

Production layout:

```
trimdcv.com      -> AWS Amplify (static build of frontend/, see ../amplify.yml)
api.trimdcv.com  -> Lightsail: Caddy (Caddyfile) -> uvicorn (trimdcv-api.service)
```

Backend auto-deploys from the `prod` branch (`../.github/workflows/deploy-backend.yml`):
`git push origin main:prod`.

## Local rehearsal (same shape, no AWS)

Builds the frontend like Amplify and serves it with Caddy, and runs uvicorn with the production command behind a Caddy proxy.
Stop `npm run dev` first, because Caddy takes port 5173. Each command runs in its own terminal, from the repo root.

```bash
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
```

```bash
cd frontend && VITE_API_URL=http://api.localhost:8081 VITE_USE_MOCKS=false npm run build
```

```bash
caddy run --config deploy/Caddyfile.local
```

Then open http://localhost:5173. API calls go to http://api.localhost:8081, which Caddy proxies to :8000.
The extension works unchanged because it still opens `localhost:5173`.
Rebuild the frontend after any frontend change; there is no hot reload here.
