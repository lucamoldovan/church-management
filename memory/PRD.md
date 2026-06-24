# Casa Pâinii Ocna Mureș — Church Management Web App

## Original Problem Statement
User wanted to redesign the UI of their existing website (GitHub repo: lucamoldovan/church-management) using https://app.rhema.ro/home as a visual reference, while keeping ALL existing functionality intact.

## Tech Stack
- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS v4 (oklch design tokens via @theme inline)
- Supabase (@supabase/ssr) — auth, profiles, registrations, sermons, livestream_config
- lucide-react + react-icons; fonts: Outfit (headings) + DM Sans (body) via next/font/google
- Runs via supervisor: `yarn start` → `next dev -H 0.0.0.0 -p 3000`

## Core Functionality (all preserved — only restyled)
- Home (hero carousel + values + upcoming events)
- Events list (search + category filter), Event detail (schedule + packages), Event registration (package select + Supabase insert)
- Auth: Login / Signup (email+password + Google OAuth via Supabase), callback route
- Dashboard (profile, stats, registrations, attendee pass) — protected
- Watch Live (livestream embed + sermons grid from Supabase)
- Navbar + Footer

## UI Redesign — Done (June 2026)
- Warm "House of Bread" aesthetic inspired by Rhema: cream background, terracotta/clay primary, soft peach accents
- Large rounded radii (rounded-3xl cards), pill buttons, soft shadows, image-rich cards, hero carousel with auto-advance + dots
- New warm oklch palette (light + dark) in globals.css; Outfit + DM Sans typography
- Replaced 🍞 emoji placeholders with real contextual imagery (Unsplash/Pexels) + Wheat lucide logo
- data-testid added across interactive elements
- Fixed pre-existing bug: empty `src/lib/utils.ts` (missing `cn`) which would have broken the build
- Removed junk files: src/components/homepage.tsx, layout.tsx (contained shell heredoc text)

## Environment Notes
- `/app/frontend/.env` is configured with the user's REAL Supabase project (ref ptayzwskyjtomnitkfur).
  Public reads verified live (sermons/livestream on /live). Email confirmation is ENABLED, so
  authenticated flows (dashboard, registration) need a confirmed account to test — user opted to verify later.

## What's Verified
- All routes compile and return HTTP 200
- Visual redesign verified on Home, Events, Event Detail, Live (screenshots)
- Testing agent: 100% of public UI flows pass (carousel, search, filters, password toggles, mobile nav)
- Supabase connection live: /live renders real sermon categories + next-stream title from the DB

## Backlog / Next
- P0: User to add real Supabase keys to /app/frontend/.env, then test auth → register → dashboard flow
- P1: Routes referenced in nav but not present in repo: /groups, /about, /contact, /profile, /reset-password (currently 404). Build these pages.
- P2: Consider next/image + remotePatterns for image optimization (currently plain <img>)
