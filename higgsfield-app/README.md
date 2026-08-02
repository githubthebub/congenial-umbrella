# higgsfield-app — the hosted deployment of Darkroom

These files are the Darkroom port for the Higgsfield-hosted deployment (React 19 +
TanStack Start on a Cloudflare Worker with D1), live at the `darkroom` project.
Same product as [`../server`](../server), different host: here the API is TanStack
server functions instead of a raw Worker, and the platform provisions the database.

| File | Role |
|---|---|
| `src/lib/api/darkroom.functions.ts` | The whole API as server functions — create/join/shoot/state/photos, with the blind gate enforced server-side (photos refuse to return until the roll develops) |
| `src/routes/index.tsx` | The entire app UI as one route: landing, load-a-roll, join, active roll (2.5s polling sync), develop ritual, gallery |
| `src/darkroom.css` | The visual world (safelight palette, film grain, filmstrip, polaroids), namespaced under `.dkr` |
| `migrations/0002_darkroom.sql` | D1 schema (rolls / members / frames), additive |
| `app.manifest.json` | Opts the platform database on (`"db": true`) |
| `src/app-meta.json` | Feed-card + og metadata |
| `design-brief.md` | The locked design contract |
| `overlay.sh` | Applied from the Higgsfield build sandbox: copies these files onto the scaffold clone, wires the stylesheet import, runs placeholder gate, pushes |

Deployed via the Higgsfield platform CI (`deploy_website`), which builds the pushed
repo and ships the Worker + D1 live.
