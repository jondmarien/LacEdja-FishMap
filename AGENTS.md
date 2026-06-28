# AGENTS.md — LacEdja-FishMap

This document helps AI agents (and future contributors) work effectively on this project.

## Project Overview
Seasonal fish map PWA for Lac Edja, Quebec. Built for Jon + family use at the cottage. Mobile-first with excellent desktop experience.

## Core Principles
- **Keep it simple and fast** — Bun + Vite + Vercel serverless is the chosen stack.
- **Privacy first** — All reports are anonymous. No personal accounts in v1.
- **Family sharing** — Designed for a small trusted group.
- **Chrono aesthetic** — Dark, terminal-inspired, minimal, high-signal.

## Tech Decisions
- **Frontend**: Vite 8 + React + TypeScript + Tailwind + MapLibre GL JS
- **Backend**: Vercel Functions (TypeScript)
- **Database**: Vercel Postgres
- **Photos**: Vercel Blob (direct client upload preferred)
- **PWA**: Enabled with offline map caching
- **Deployment**: Vercel only

## When Working on This Project
1. Always commit and push after completing a logical phase or feature.
2. Prefer small, focused commits with clear messages.
3. Use the latest stable versions of Bun, Vite, and libraries when possible.
4. If unsure about any integration (Vercel Blob, Postgres, MapLibre, etc.), use `context7` or `crawl4ai` for the latest docs.
5. Keep the UI dark and minimal.

## Current Status (as of last commit)
- Interactive map with season selector
- Click-to-report flow with full form + photo upload
- API routes for reports and uploads
- PWA enabled
- Ready for Vercel Postgres integration and final deployment

## Next Priorities
- Replace in-memory storage with real Vercel Postgres
- Final visual polish
- Deploy to production

## Useful Commands
```bash
bun dev          # Start dev server
bun run build    # Production build
bun install      # Install dependencies
```

## Contact / Ownership
Maintained by Jon Marien (chrono). Family use only for v1.