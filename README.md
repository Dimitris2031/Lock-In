# Lock-In Focus

Lock-In Focus is a full-screen study and work timer that keeps you in the zone by temporarily locking your device. Hit the big focus button, the screen fills with a countdown, and stay on task until the bell rings.

This repository now ships a React + Vite implementation of the Lock-In Focus timer. The app runs in any modern browser and can be wrapped as a Progressive Web App (PWA) or bundled with Capacitor for Android and iOS delivery.

## Why It Works

Traditional Pomodoro timers are easy to ignore. Lock-In Focus enforces focus with a full-screen overlay and an optional whitelist, so you only access the tools you really need while the timer runs.

## Core Features

- **Preset sessions:** 25-, 50-, and 90-minute focus blocks.
- **Full-screen lock:** Prevents distractions with an overlay lock. Optional app/site blocking via browser extension or Android guided-access experience.
- **Progress tracking:** Streaks, session history, and lightweight charts to visualize consistency.
- **Background audio:** Launch a curated playlist to keep you in flow.

## Product Walkthrough

1. Press one of the preset duration buttons or enter a custom length.
2. Add an optional tag and whitelist reminder, then hit **Start focus**.
3. The app requests fullscreen and displays a lock overlay with the countdown.
4. Once the timer reaches zero, the alarm plays and the session is logged to history.

## MVP Tech Notes

- **Stack:** React + Vite with modern ES modules and Tailwind-inspired glassmorphism styling.
- **Fullscreen lock:** Uses the browser Fullscreen API to dim the rest of your device during a session.
- **Persistence:** Sessions, active timers, and whitelist notes are saved in `localStorage` so you can refresh without losing progress.
- **Charts & streaks:** A lightweight canvas chart summarizes the past seven days, and the app keeps a rolling streak of daily sessions.
- **Mobile readiness:** Ship the PWA directly for mobile browsers or wrap the build output with Capacitor to reach the Play Store and App Store while reusing the React codebase.

## Data Model

- `sessions` — `start`, `end`, `tag`
- `goals` — target streaks or hours per period
- `whitelist` — allowed apps or URLs during sessions

## Monetization

- **Free Tier:** Core timer, fullscreen lock, and playlist link.
- **Pro (€8/year):** Streak analytics, backups, whitelist management, and advanced charts.

## Go-To-Market

- Share progress and demos in study communities (Discord, r/StopGaming, r/ADHD).
- Create short "study with me" clips highlighting the lock-in experience.

## Try It Locally

Install dependencies, start the dev server, or produce a production build:

```bash
npm install
npm run dev       # Start Vite locally with hot reloading
npm run build     # Create an optimized production bundle in dist/
npm run preview   # Preview the production build locally
```

The production bundle inside `dist/` can be deployed to any static host or used as the web assets folder when wrapping with Capacitor.

## Launch Plan

- Publish as a web PWA and Android app first.
- Expand to iOS after validating demand and navigating background restrictions.

## Roadmap Highlights

1. MVP web timer with fullscreen lock overlay and local session tracking.
2. Android parity with persistent lock and offline storage.
3. Optional browser extension/app blocking integrations.
4. Cloud sync, advanced analytics, and community leaderboard for pro users.

Stay focused and lock in! 
