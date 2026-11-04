# Despliegue en Cloudflare Pages (RT-10)

Un proyecto Pages por app: la página pública nunca comparte bundle con React (RT-9).
`VITE_API_URL` se fija por proyecto; va horneada en el build, así que cada cambio
de backend exige reconstruir.

## Proyectos

| Proyecto sugerido | Directorio raíz | Comando de build | Directorio de salida | Variable |
|---|---|---|---|---|
| `preconteo-publica` | `apps/public` | `npm run build` | `dist` | `VITE_API_URL` |
| `preconteo-jurado` | `apps/jurado` | `npm run build` | `dist` | `VITE_API_URL` |
| `preconteo-consola` | `apps/consola` | `npm run build` | `dist` | `VITE_API_URL` |
| `preconteo-ops` | `apps/ops` | `npm run build` | `dist` | `VITE_API_URL` |

Comando de build raíz del repo: no se usa; cada proyecto compila su app.
Node 20+ (el repo pide `>=20`).

`VITE_API_URL` = URL pública del balanceador en Render
(presunta `https://difusion-backend.onrender.com`; **confirmar en el tablero de Render**).
Local: `http://localhost:3000` (mock) — ver `.env.example` de cada app.

## Archivos ya incluidos

- `public/_headers` en cada app: assets con hash a 1 año inmutable;
  `sw.js`/`workbox-*` del jurado siempre sin caché.
- `public/_redirects` con `/* /index.html 200` en jurado, consola y ops
  (la pública es una sola página y no lo necesita).

## CORS (coordinar con backend)

Pasarle al equipo del backend estas 4 URLs para `CORS_ORIGIN` en Render
(hoy vale `*`; al cerrarlo, usar esta lista + `http://localhost:51xx` para dev):

- `https://preconteo-publica.pages.dev`
- `https://preconteo-jurado.pages.dev`
- `https://preconteo-consola.pages.dev`
- `https://preconteo-ops.pages.dev`

## Verificación tras desplegar (sustentación)

1. Abrir las 4 y leer la insignia `instancia`: conexiones distintas caen en
   instancias distintas (sin sesiones pegajosas).
2. Pública: `mun:11` en vivo, medir INP con CPU throttling 6x y anotar el valor.
3. Jurado: login `JUR-`, transmitir, cortar red a mitad del envío, reconectar.
4. Consola: dos auditores, tomar el mismo caso (uno ve `NO_DISPONIBLE`), resolver.
5. Ops: polling 2 s, probar `?modo=redis-down` contra el mock en local.

## Alternativa por CLI

```bash
npm run build -w apps-public
npx wrangler pages deploy apps/public/dist --project-name=preconteo-publica
```
