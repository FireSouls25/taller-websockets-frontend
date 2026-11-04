# Frontend · Preconteo electoral en tiempo real

Solo frontend. Backend en `taller-websockets-backend/` (lo hace otro compañero, no modificar).

## Contrato

Fuente provisional: brief del taller (SSE `seq`, WS jurado/consola, polling ops).
Referencia definitiva cuando exista: `docs/CONTRATO-API.md` del backend. Si difiere, gana ese documento.

## Arquitectura: monorepo por dominios

4 bundles separados (exigencia RT-9: la página pública no puede compartir bundle con React):

```
apps/public/    # Vanilla TS · resultados públicos (SSE)
apps/jurado/    # React + PWA · transmisión de actas (WS + POST fallback + IndexedDB)
apps/consola/   # React · verificación (WS)
apps/ops/       # React · tablero operación (polling 2s + WS)
packages/shared/ # kernel: tipos electorales + conectividad, sin frameworks
mock-server/    # mock local SSE + WS + REST con este contrato
```

Cada app organiza por **dominio**, no por capa técnica:

```
src/
  domains/<dominio>/  # tipos + servicio + estado + ui del dominio
  app/                # composición (router, providers, bootstrap)
  config/             # env (VITE_API_URL)
```

Dominios: `resultados`, `actas`, `verificacion`, `operacion`, `auth`, `conectividad`.
Reglas: `shared` no importa de `apps`; los dominios no se importan entre sí salvo vía `app/`; todo I/O pasa por `packages/shared`.

## Comandos

```bash
cp .env.example .env
npm install
npm run dev:mock     # mock en :3000
npm run dev:public   # y así con cada app
npm test
```

## Deploy (RT-10)

4 proyectos Cloudflare Pages, uno por `apps/*`. Ver `deploy/cloudflare.md`
(proyectos, `VITE_API_URL`, `_headers`/`_redirects` y lista de `CORS_ORIGIN`).
Pasar los 4 dominios `*.pages.dev` al backend para `CORS_ORIGIN`.
