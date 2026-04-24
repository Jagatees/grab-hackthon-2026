# grab-hackthon-2026

Simple Next.js starter for calling GrabMaps from the backend only.

## Setup

1. Copy `.env.local.example` to `.env.local`
2. Set:
   - `GRAB_MAPS_API_KEY` or `GRAB_API_TOKEN`
   - `GRAB_MAPS_BASE_URL` (optional, defaults to `https://maps.grab.com`)
   - `GRAB_API_DEFAULT_PATH` (optional)
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm run dev
```

## What is implemented

- `Embed & Style Maps` is the first feature because search and routing build on top of it
- The app renders a real GrabMaps base map with `maplibre-gl`
- The browser does not call `maps.grab.com` directly
- `Search & Discover Places` is now wired too:
  - keyword search
  - nearby search around the current map center
  - reverse geocoding by clicking the map
- `SyncSpot` local backend is now wired with a JSON-file store for:
  - room creation
  - room join
  - participant origin confirmation
  - fair meetup recommendation scoring

## How it works

- The browser requests `/api/grab-maps/style` and `/api/grab-maps/resource`
- Those routes forward requests to GrabMaps with `Authorization: Bearer ...`
- `MapLibre` uses the proxied style, tiles, glyphs, and sprite assets
- Places requests go through:
  - `/api/grab-maps/places/search`
  - `/api/grab-maps/places/nearby`
  - `/api/grab-maps/places/reverse-geo`
- SyncSpot room state is stored in `data/syncspot-db.json`
- SyncSpot backend routes:
  - `POST /api/syncspot/rooms`
  - `POST /api/syncspot/rooms/join`
  - `GET /api/syncspot/rooms/[roomId]`
  - `PATCH /api/syncspot/rooms/[roomId]`
  - `PATCH /api/syncspot/rooms/[roomId]/participants/[participantId]`
  - `GET /api/syncspot/rooms/[roomId]/recommendations`
  - `POST /api/syncspot/rooms/[roomId]/recommendations`
- The generic `/api/grab` tester is still available for experimenting with other endpoints

## Files

- `app/page.tsx`: landing page
- `components/grab-map.tsx`: GrabMaps map view
- `components/grab-playground.tsx`: simple request form
- `app/api/grab-maps/style/route.ts`: style proxy
- `app/api/grab-maps/resource/route.ts`: resource proxy
- `app/api/grab-maps/places/*/route.ts`: places proxy routes
- `app/api/syncspot/**`: SyncSpot room + recommendation backend routes
- `lib/syncspot/*`: JSON store, Grab client, scoring service, and types
- `data/syncspot-db.json`: local test database
- `app/api/grab/route.ts`: server-side proxy
