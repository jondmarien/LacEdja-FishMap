# Lac Edja Fish Map

Seasonal, interactive fish map for Lac Edja (Blue Sea, Outaouais, Quebec) with anonymous catch reporting and family sharing.

## Features (v0.3)

- Interactive MapLibre map centered on Lac Edja
- Season selector (Spring / Summer / Fall / Winter)
- Click anywhere on the lake to submit a catch report
- Full report form with species, size, bait, notes, and photo upload
- Photos stored via Vercel Blob
- Reports saved to Vercel Postgres (via serverless functions)
- PWA with offline map tile caching
- Dark, chrono-inspired terminal aesthetic

## Tech Stack

- **Frontend**: Bun 1.3.14 + Vite 8.1.0 (Rolldown) + React 19 + TypeScript + Tailwind
- **Map**: MapLibre GL JS 5.24.0
- **Backend**: Vercel Serverless Functions
- **Database**: Vercel Postgres
- **File Storage**: Vercel Blob
- **PWA**: vite-plugin-pwa + Workbox
- **Hosting**: Vercel

## Getting Started (Local)

```bash
bun install
bun dev
```

The app runs on `http://localhost:5173`.

## Deployment

The project is configured for zero-config deployment on Vercel.

1. Connect the repo to Vercel
2. Add environment variables:
   - `POSTGRES_URL` (or connection string)
   - `BLOB_READ_WRITE_TOKEN`
3. Deploy

## Project Structure

```
src/
├── components/
│   ├── LacEdjaMap.tsx
│   ├── SeasonSelector.tsx
│   └── ReportForm.tsx
├── App.tsx
api/
├── reports.ts
└── upload.ts
```

## Contributing

This is a personal/family project. Feel free to open issues or PRs.

## License

MIT

---

Built with ❤️ for the cottage.