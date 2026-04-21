# Docs Restructure & Cleanup Plan (Revised)

## Context

The docs were migrated from a flat `docs/` folder to VitePress. **All content is identical to origin/main** — nothing was lost, files were only moved into `docs/vscode/`. The feature docs have always been technical feature encyclopedias (not pure user guides), written for a dual audience: users + contributors/maintainers. The VitePress migration created layout/nav issues but did not change content.

The core problems are:
1. Navigation is broken ("Docs" links to Contributor Guide, not a user entry point)
2. No Getting Started / Installation page exists
3. Development + Releases are misplaced in the main sidebar
4. One mermaid content bug in releases.md (v1 not connected to marketplace)
5. The mermaid module issue was already fixed in commit `3ca2fab`

**Feature docs are NOT being heavily trimmed.** The original detailed content (architecture, message flows, sequence diagrams) is valuable and was always part of the docs. The question is how to position it.

---

## Decision: What to do with technical feature docs

### Context

Each feature doc (copy-paste, bpmn-diff, etc.) is 104–271 lines and mixes:
- User-facing usage sections (how to use the feature)
- Technical architecture sections (DI modules, message protocols, sequence diagrams)

### Recommendation: Keep all feature docs as-is, just fix the framing

For a small open-source project with a developer-facing audience, the dual-purpose feature doc is fine. The Diataxis framework calls this "Explanation" — it enriches understanding for both users and contributors. Splitting into separate user/architecture files would add maintenance burden without clear benefit at this scale.

**What changes:**
- Add a short "user summary" intro to each feature page that anyone can read (most already have this)
- Keep all architecture content in place — it's useful and was always intended
- Fix the nav so users land on a Getting Started page, not a deep-dive doc

**Alternative considered (rejected): Move architecture sections to `docs/architecture/`**
- Pros: Cleaner user-facing site
- Cons: Splits related content, adds maintenance burden, less discoverable on the docs site, small open-source team gets little benefit from strict separation

---

## Changes Required

### 1. Fix Navigation Config

**File:** `docs/.vitepress/config.mts`

#### Top nav
Change `{ text: "Docs", link: "/vscode/development" }` → `{ text: "Docs", link: "/vscode/getting-started" }`

#### Sidebar restructure
```ts
sidebar: {
    "/vscode/": [
        { text: "Overview", link: "/" },
        {
            text: "Getting Started",
            items: [
                { text: "Installation & Quick Start", link: "/vscode/getting-started" },
                { text: "Configuration", link: "/vscode/configuration" },
            ],
        },
        {
            text: "Features",
            items: [
                { text: "Append Menu", link: "/vscode/features/append-menu" },
                { text: "BPMN Diff", link: "/vscode/features/bpmn-diff" },
                { text: "Copy & Paste", link: "/vscode/features/copy-paste" },
                { text: "Deployment", link: "/vscode/features/deployment" },
                { text: "Element Template Chooser", link: "/vscode/features/element-template-chooser" },
                { text: "Language Support", link: "/vscode/features/language-support" },
            ],
        },
        {
            text: "Contributing",
            collapsed: true,
            items: [
                { text: "Development", link: "/vscode/development" },
                { text: "Releases", link: "/vscode/releases" },
            ],
        },
    ],
},
```

---

### 2. Create `docs/vscode/getting-started.md` (new file, ~50 lines)

Content:
- **Install** — VS Code Marketplace link, one-liner install badge/command
- **Open a BPMN file** — create `.bpmn`, editor opens automatically
- **Element Templates** — where templates go: `<configFolder>/element-templates/` walking up from the file
- **Deploy** — one sentence + link to Deployment feature page
- **Language** — one sentence + link to Language Support page

No architecture. Pure user orientation.

---

### 3. Create `docs/vscode/configuration.md` (new file, ~40 lines)

Settings reference table pulled from `apps/modeler-plugin/package.json` contributes.configuration:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `miragon.bpmnModeler.language` | enum | `en` | UI language for the modeler |
| `miragon.bpmnModeler.alignToOrigin` | boolean | ... | ... |
| `miragon.bpmnModeler.deployment.*` | ... | ... | Deployment server settings |

(Verify exact settings from package.json when implementing)

---

### 4. Feature Page Intros (light touch — no trimming of existing content)

Some feature pages open immediately with architecture sections. Add a brief 2-3 sentence user-facing intro paragraph at the top of pages that lack one, so users immediately understand what the feature does before encountering technical sections.

Pages that need a user intro added at the top:
- **`copy-paste.md`**: Currently opens with a technical explanation of the clipboard limitation. Add: "The extension lets you copy and paste BPMN elements between tabs and copy/paste text within diagram labels using Cmd/Ctrl+C, Cmd/Ctrl+V as usual. Technical details follow for contributors."
- Other pages already have reasonable user-facing openers.

---

### 5. Fix `releases.md` Mermaid Diagram

**File:** `docs/vscode/releases.md`

Two issues:
1. **Content bug**: `v1` has no edge to `marketplace` — v0.1 connects but v1 silently doesn't. Add `v1 --> marketplace` or use a dotted line `marketplace -.- v1` consistent with the v0.1 style.
2. **Style on subgraph**: `style main stroke: #00E676, color: black` — `color` on subgraphs is unreliable in mermaid 10.9.3. Remove `color: black` from this line.

---

## Summary of File Changes

| File | Action |
|------|--------|
| `docs/.vitepress/config.mts` | Fix top nav link + restructure sidebar (3 sections: Getting Started, Features, Contributing) |
| `docs/vscode/getting-started.md` | **Create new** (~50 lines, pure user guide) |
| `docs/vscode/configuration.md` | **Create new** (~40 lines, settings reference table) |
| `docs/vscode/features/copy-paste.md` | Add 2-line user-facing intro at top only |
| `docs/vscode/releases.md` | Fix mermaid (add v1→marketplace edge, fix subgraph style) |
| All other feature docs | No changes — content kept intact |

---

## Verification

1. `corepack yarn docs:dev` — confirm all pages render, no console errors
2. Verify "Docs" nav → Getting Started page
3. Verify Contributing section is collapsed by default
4. Verify mermaid in releases.md shows v1 connected to marketplace
5. Verify mermaid diagrams in development.md and feature pages render cleanly
