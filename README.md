# cc-hive

Visual dashboard for all your Claude Code projects.

See every project at a glance — sized by lines of code, colored by activity — on an infinite canvas you can pan and zoom like Figma.

## Features

- **Visual overview** — projects displayed as hexagonal cells, sized proportionally to code volume
- **Infinite canvas** — pan, zoom, and navigate your entire project landscape
- **Launch Claude Code** — open any project in your terminal with one click
- **Project discovery** — automatically finds all projects with Claude Code session history
- **Search** — find projects instantly with `Cmd+K`
- **Rename** — give projects custom display names
- **Git status** — see branch and dirty state at a glance
- **Cross-platform** — works on macOS, Linux, and Windows

## Quick start

```bash
git clone https://github.com/magnuspaues/cc-hive.git
cd cc-hive
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### macOS desktop app

You can also install cc-hive as a standalone app in your dock:

```bash
bash desktop/install.sh
```

This installs `cc-hive.app` to `~/Applications`. Open it from Spotlight, Launchpad, or your dock — it starts the server automatically and opens your browser.

## How it works

cc-hive reads Claude Code session data from `~/.claude/projects/` and scans your project directories to build a visual map. It runs **entirely locally** — no data leaves your machine.

### What it reads

- `~/.claude/projects/` — session history and project metadata
- Your project directories — git status and lines of code (excludes `node_modules`, `dist`, etc.)

### Security

- **Localhost only** — the server rejects all non-localhost connections
- **Origin validation** — mutation endpoints validate the Origin header to prevent CSRF
- **Command whitelist** — terminal launch only allows pre-defined commands (no arbitrary execution)
- **Delete protection** — only discovered projects can be deleted, with a two-step confirmation

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Search projects |
| `Escape` | Close search / drawer |
| `Tab` | Navigate between cells |
| `Enter` | Open selected project |
| `Scroll` | Zoom in/out |
| `Click + drag` | Pan canvas |

## Configuration

Project aliases are stored in `~/.claude/hive-aliases.json`. You can edit this file directly or use the rename feature in the UI.

## Tech stack

- [Next.js](https://nextjs.org) 15
- [React](https://react.dev) 19
- [Tailwind CSS](https://tailwindcss.com) 4

## License

MIT
