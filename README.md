# SyncSpot

SyncSpot is a collaborative meetup planner that helps small groups find the fairest place to meet using real travel time, not rough midpoint guesses.

Instead of one person dropping random venue ideas in chat, SyncSpot lets a host create a room, invite friends, collect where everyone is coming from, and use Grab Maps search + routing to rank meetup spots based on convenience, balance, and total group effort.

## Why This Is Cool

- It turns a messy group decision into a shared map experience.
- It uses real routing data instead of straight-line distance.
- It makes the tradeoff visible: who travels more, who travels less, and which place is fairest overall.
- It feels social, not just technical: room links, voting, final venue selection, and in-room chat.

## What Judges Should Look At

- The room-based flow: host creates a room, others join from a link, everyone sets their starting point.
- The recommendation engine: meetup spots are ranked using actual route durations from Grab Maps.
- The map-first UI: participants, recommendations, and routes are all shown visually.
- The social layer: voting, room chat, and final venue locking.
- The final handoff: each person gets a direct route link to the chosen venue.

## Core Features

- Room creation and join-by-link flow
- Shared room state backed by a local JSON database
- Participant origin search with Grab Places API
- Fair meetup recommendation scoring using Grab routing
- Ranking modes:
  - Fairest for everyone
  - Fastest overall
  - Closest midpoint
- Recommendation badges and explanation text
- Voting on shortlisted meetup spots
- Host finalization flow with a final result overlay
- Room chat
- Google Maps route links for each participant after final selection
- Grab Maps-powered background map, place search, nearby discovery, and routing

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- MapLibre GL
- Grab Maps APIs
- Local JSON file storage for MVP testing

## Grab Maps Usage

SyncSpot keeps the Grab API key on the server side. The frontend never calls Grab directly.

Implemented Grab-backed flows:

- Map style + tile proxying
- Place keyword search
- Nearby place discovery
- Reverse geocoding
- Route calculation with travel time and geometry

Main Grab routes used in the app:

- `GET /api/v1/maps/poi/v1/search`
- `GET /api/v1/maps/place/v2/nearby`
- `GET /api/v1/maps/poi/v1/reverse-geo`
- `GET /api/v1/maps/eta/v1/direction`

## Demo Flow

1. Host creates a room.
2. Friends join through the room link.
3. Each participant confirms where they are coming from.
4. Host chooses a meetup category and optional area.
5. SyncSpot computes the top meetup recommendations.
6. The group compares routes, votes, and discusses in chat.
7. Host finalizes one venue.
8. Everyone gets a clear final card and route links.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.local.example`

3. Add your Grab API key:

```bash
GRAB_MAPS_API_KEY=your_key_here
```

You can also use:

```bash
GRAB_API_TOKEN=your_key_here
```

Optional:

```bash
GRAB_MAPS_BASE_URL=https://maps.grab.com
```

4. Start the app:

```bash
npm run dev
```

5. Open:

```bash
http://localhost:3000
```

## Useful Scripts

```bash
npm run dev
npm run build
npm run typecheck
```

## Project Structure

- `app/` — Next.js app routes and API routes
- `components/` — UI components for the landing page, room flow, and map views
- `lib/grab-maps.ts` — Grab Maps config helpers
- `lib/syncspot/` — local JSON store, room service, Grab client, scoring logic, and types
- `data/syncspot-db.json` — local MVP database

## Current MVP Notes

- Database is local-file based for hackathon speed.
- The app is optimized for small groups of 2 to 4 people.
- Recommendations are candidate-based and route-scored rather than true isochrone overlap.
- The focus is on shipping a polished end-to-end demo flow.

## Future Improvements

- Pin-drop origin selection directly on the room map
- Stronger live sync beyond polling
- Better compare view for top recommendations
- More category presets and filters
- Better sharing/export of the final decision

## Submission Note

If this repository is being used for hackathon judging, make sure the GitHub repository is public so judges can view the code and README.
