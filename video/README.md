# video — programmatic video for Darkroom (Remotion)

[Remotion](https://www.remotion.dev) renders video from React components, so promo
clips and development-night animations are code in this repo rather than a project
file in someone's editor.

## Run it

```bash
cd video && npm install
npm run dev      # opens Remotion Studio — live preview, scrubbing, prop editing
npm run build    # renders out/development-night.mp4
npm run still    # renders a single frame as a PNG
```

## What's here

| File | Role |
|---|---|
| `src/index.ts` | Entry point — registers the root with Remotion |
| `src/Root.tsx` | Composition registry: id, dimensions, fps, duration |
| `src/DevelopmentNight.tsx` | The one composition — a 6s 1080×1920 frame-counter that climbs to 24, then reveals the wordmark |
| `remotion.config.ts` | Render defaults (JPEG frames, overwrite output) |

`DevelopmentNight` is vertical (1080×1920) for stories/reels and uses the safelight
palette from `../higgsfield-app/src/darkroom.css`, so it matches the app it advertises.

## Rendering where Chrome can't be downloaded

Remotion downloads its own Chrome Headless Shell on first render. In sandboxes that
block that download, point it at a local browser instead:

```bash
npx remotion render DevelopmentNight out/video.mp4 \
  --browser-executable=/path/to/chrome
```

## Licensing

Remotion is source-available, not MIT: free for individuals and companies of up to
three people, but **companies with four or more people need a paid company license**.
See [remotion.dev/license](https://www.remotion.dev/license).
