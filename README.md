# ⚡ Projekt-Hub

A self-hosted company hub for electrical planning, modelled on the Notion **JBAG Projekt-Hub**.
Projects, open items (Pendenzen), contacts, clients, knowledge and apartments all live in one place.
The interface is in German.

No dependencies and no build step. You only need Node.js 18 or newer.

## Start

```bash
npm start            # → http://localhost:3000
```

On first start the hub is empty. Click **«Beispieldaten laden»** to try it with demo data, or import your Notion data (see below).

Everyone on the network can open `http://<server-name>:3000` and work on the same data.

| Variable       | Default          | Purpose                                            |
| -------------- | ---------------- | -------------------------------------------------- |
| `PORT`         | `3000`           | Port                                               |
| `DATA_FILE`    | `data/db.json`   | Location of the database (a single JSON file)      |
| `HUB_PASSWORD` | –                | Turns on a password prompt (HTTP Basic Auth)       |
| `HUB_USER`     | –                | Optional user name for the password prompt         |

```bash
HUB_PASSWORD=geheim PORT=8080 npm start
```

> If you open `public/index.html` directly, without the server, the hub still works. In that case the data is stored **only in that browser**.

## What's included (same as in Notion)

| Area | Contents |
| --- | --- |
| 🏠 **Übersicht** (overview) | Header, quick links, search across everything, **Auf einen Blick** (key numbers, projects by phase and by status), **Mein Arbeitstag** (my Pendenzen, upcoming deadlines, fees, project progress) with an «Ich bin …» person filter, running projects |
| 🚧 **Projekte** | Status, project phase, project number, deadline, SharePoint folder, fee total / already billed / **still open** / **% billed**, client, contacts, project lead, building type, location, year. **Progress** = Pendenzen done ÷ all Pendenzen. Views: all, board, by building type, by client, by year |
| ✅ **Pendenzen** | Linked to a project, with status, priority, due date (overdue shown in red), SIA phase, owner. Tick a checkbox to mark one done. Views: all, board (drag & drop), by SIA phase, by project |
| 🤝 **Kontakte** | Company, role, project role, e-mail/phone (clickable), linked projects |
| 🏢 **Kunden** | Client type, contact person, address, linked projects |
| 📚 **Wissen** | Category, keywords, SIA phase, source, date last checked, text |
| 🏠 **Wohnungen** | Building, floor, and five steps: planning → plan dispatch → coordination → buyer requests → handover. Click a step in the table to move it forward. Progress per apartment and per project |

When you open a project you see its linked Pendenzen, apartments and knowledge entries, and you can create new ones there directly.
Every list can be exported as **CSV for Excel**. Under Settings you can back up or restore all data as JSON.

## Importing data from Notion

1. In Notion, open «JBAG Projekt-Hub» → `•••` → **Exportieren** (Export) → choose «Markdown & CSV» and include subpages.
2. Unzip the file, including any ZIP files inside it.
3. `node tools/import-notion.js <unzipped-folder> notion-import.json`
4. In the hub, go to **Einstellungen → JSON importieren…** and pick `notion-import.json`.

## Data and backups

- All data is stored in `data/db.json`. Every day the server copies the file to `data/backups/db-YYYY-MM-DD.json`.
- The `data/` folder is in `.gitignore`, so company data never ends up in git.
- To change fields or dropdown options, edit `public/schema.js`.

## Structure

```
server.js              small Node server (API + static files)
public/index.html      app shell
public/schema.js       data model: databases, fields, views
public/app.js          interface (dashboard, tables, boards, detail view)
public/styles.css      Notion-like design, light and dark
public/seed.js         demo data
tools/import-notion.js converts a Notion CSV export into hub JSON
```
