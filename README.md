# The Inner War

**Repo description:** A local-first dark fantasy discipline app that turns urges, routines, priorities, boss goals, XP, reports, and focus ambience into an immersive personal war room.

The Inner War is a browser-based self-discipline game built around one idea: the work you do on yourself should feel visible. Instead of another clean productivity dashboard, it frames daily discipline as a dark fantasy command room with XP, checkposts, boss battles, reports, a growing discipline cube, and ambient focus audio.

There is no auth, no backend, and no shared database. Your progress lives in your own browser through `localStorage`.

## Why This Exists

Most productivity tools treat self-control like a spreadsheet. That works for planning, but it often fails emotionally. The Inner War is designed to make discipline feel like a campaign:

- urges become battles you either beat or lose
- routines become checkposts on a war map
- major goals become boss battles
- XP makes progress visible
- reports turn the day into a written record
- ambient audio helps the app feel like a place, not a form

The goal is not perfect gamification. The goal is to build a personal ritual that makes showing up feel heavier, clearer, and more memorable.

## Features

- **Discipline Cube**
  - A visual cube that fills from XP events.
  - Positive events glow; losses corrupt the structure.
  - Cube cycles are preserved instead of deleted.

- **Urge Tracking**
  - Log urges as won or lost.
  - Strength levels: vague, medium, strong.
  - XP changes based on outcome and intensity.

- **War Map**
  - Daily Routine front.
  - Daily Priorities front.
  - Boss Battle front.
  - Add your own checkposts with time, priority, and notes.

- **Checkposts**
  - Start a timer.
  - Log victory, loss, or give up.
  - Giving up normal checkposts removes them from today without XP impact.
  - Missed planned checkposts can be evaluated at day end.

- **Boss Battles**
  - Long-running goals, not daily pass/fail chores.
  - Work sessions grant small progress XP.
  - Defeating a boss grants a larger reward.
  - Giving up costs XP.

- **Battle Reports**
  - Dedicated reports screen.
  - Shows XP delta, wins, losses, leave status, and written statements.
  - Today can be viewed as an in-progress draft.

- **Leave Requests**
  - File leave for a day.
  - Approved leave protects unresolved routine/priority tasks from penalties.

- **Audio Layer**
  - Ambient focus loops generated in-browser.
  - Options include rain, temple drones, night wind, ember hall, ocean, and brown noise.
  - Reward sound can be muted or stopped.

- **Local-First Storage**
  - Uses browser `localStorage`.
  - No account required.
  - No server-side personal data.

## How Data Works

The app stores progress under versioned browser storage keys such as:

```text
inner-war-v3
inner-war-ambient-v1
inner-war-reward-sound-v1
```

This means:

- your data stays in your browser
- another visitor on a published site gets their own separate data
- there is no shared public progress database
- clearing browser site data can erase your local progress
- switching browsers/devices will not automatically sync progress

The app is intentionally local-first for now.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Browser Web Audio API
- Browser `localStorage`

## Getting Started

Install dependencies:

```powershell
npm.cmd install
```

Run the development server:

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is busy, Next.js may offer another port such as `3001`.

## Available Scripts

```powershell
npm.cmd run dev
```

Runs the app locally in development mode.

```powershell
npm.cmd run build
```

Creates a production build.

```powershell
npm.cmd start
```

Runs the production build after `npm.cmd run build`.

```powershell
npm.cmd run lint
```

Runs ESLint.

## How To Use The App

1. Open the Cube screen.
2. Log urges as `Held the Line` or `Yielded Ground`.
3. Go to the War Map.
4. Add routine or priority checkposts for the day.
5. Start timers when you work.
6. Mark checkposts as victory, lost, or give up.
7. Add boss battles only for serious long-term goals.
8. Use Reports to review what happened during the day.
9. Use Focus Loop audio when you want background ambience.

## Deployment

This is a normal Next.js app and can be deployed to platforms like Vercel, Netlify, or any Node-capable host.

Because the app uses `localStorage`, publishing it does not create shared user data. Every visitor stores their own progress in their own browser.

## Contribution Ideas

Contributions are welcome. Useful directions include:

- export/import backup files
- better mobile layout polish
- more war map themes
- richer report analytics
- streak systems
- custom boss avatars
- keyboard shortcuts
- accessibility improvements
- better soundscape controls
- optional encrypted cloud sync

Please keep the core spirit intact: immersive, local-first, no forced accounts, and no generic dashboard feel.

## Development Notes

- Keep personal data local unless a future feature explicitly introduces opt-in sync.
- Do not add seeded dummy tasks to the default state.
- Avoid deleting history; archive completed or removed records instead.
- Keep visual changes aligned with the dark fantasy command-room theme.

## License

No license has been selected yet. Add one before accepting broad external contributions.
