# Publishing to the JetBrains Marketplace

The plugin currently ships through a **custom plugin repository** served from
GitHub Pages (`https://miragon.github.io/bpmn-modeler/updatePlugins.xml`). This
document captures the one-time steps to also publish on the official
[JetBrains Marketplace](https://plugins.jetbrains.com/) — these are the parts
the code in this repo cannot do for you.

Why bother publishing on the official Marketplace if the custom repository
already works? Two reasons:

1. **Discoverability.** Settings ▸ Plugins ▸ Marketplace search hits anyone
   with a fresh IDE; the custom repository does not.
2. **`.bpmn` recommendation banner.** JetBrains' Feature Extractor reads the
   `com.intellij.fileType` extensions of Marketplace plugins and, when a user
   opens an unknown file type, shows *"Plugins supporting `*.bpmn` files
   found"*. Per the
   [docs](https://plugins.jetbrains.com/docs/marketplace/intellij-plugin-recommendations.html),
   this only fires for plugins approved on the official Marketplace — a custom
   repository cannot trigger it. The `<fileType extensions="bpmn">` entry in
   `plugin.xml` is the bytecode-visible prerequisite; submission + JetBrains'
   review then activates the banner.

## Submission checklist

1. **Build the distributable ZIP** (release mode — bundles all platform bridges):

   ```bash
   corepack yarn build:libs
   corepack yarn build:bpmn-webview
   corepack yarn build:deployment-webview
   corepack yarn workspace @miragon/bpmn-modeler-bridge compile:all
   cd apps/intellij-plugin
   ./gradlew buildPlugin -PbundleAllPlatforms
   # → build/distributions/<plugin-name>-<version>.zip
   ```

2. **Create the Marketplace listing.** Sign in at
   <https://plugins.jetbrains.com/>, click *Upload plugin*, drop in the ZIP.
   The form prefills `name`, `id`, `version`, `description`, `change-notes`,
   `vendor`, and the plugin icon from `plugin.xml` / `pluginIcon.svg`.

3. **Fill in the Marketplace-only metadata** (no `plugin.xml` equivalent):

   - **License** — *mandatory*. Match the repo (`MIT` if matching `LICENSE`).
   - **Tags** — at least one is *mandatory*. Suggested: `BPMN`, `Camunda`,
     `Diagram`, `Modeling`.
   - **Screenshots** — at least one, **≥ 1200 × 760 px**. Capture *inside an
     IntelliJ-based IDE* — `images/modeler-preview.png` in the repo root is a
     VS Code shot and won't pass review.
   - **Category** — *Tools Integration* (or *Other Tools*).
   - **Plugin icon** — automatically picked up from
     `src/main/resources/META-INF/pluginIcon.svg`; double-check it renders in
     the upload preview.

4. **Submit for review.** First submissions go through JetBrains moderation
   (a few business days). The `.bpmn` recommendation banner activates only
   after approval.

## Known-issue note to surface in the listing

Marketplace users never see the repo `README.md`, so the Windows rendering-lag
workaround belongs in the listing **Description** (or a pinned review reply) too.
Suggested blurb — keep it in sync with the README's *Troubleshooting* section:

> **Windows: diagram feels "one interaction behind"?** On IntelliJ 2025+/2026
> the embedded Chromium (JCEF) runs out-of-process, and its off-screen frame
> pipeline presents a frame only on your *next* input. Fix it via **Help → Find
> Action → "Registry…"**: disable `ide.browser.jcef.out-of-process.enabled` and
> restart. (The plugin also shows this hint once on affected setups.) The
> `-Djcef.remote.enabled=false` VM option is **not** sufficient on 2026.1, and
> do **not** set `ide.browser.jcef.osr.enabled=false` — while out-of-process
> JCEF is active it breaks JCEF browser creation entirely.

## Automated publishing

The release pipeline now publishes to the official Marketplace on every
release, **in addition to** uploading to GitHub Releases and refreshing
`docs/public/updatePlugins.xml` — the custom repository keeps running in
parallel, unchanged.

- `build.gradle.kts` carries the `signing { }` and `publishing { }` blocks in
  the `intellijPlatform { }` configuration. Signing uses our own certificate so
  the Marketplace verifies the artefact's integrity; publishing reads the
  upload token from the environment.
- `publish-intellij.yml` runs `./gradlew publishPlugin -PbundleAllPlatforms`
  after the release-ZIP upload. `publishPlugin` pulls `signPlugin`/`buildPlugin`
  in as task dependencies, so signing + upload happen in one step.
- There is no idempotency guard: `publishPlugin` hard-fails when the release
  version already exists on the Marketplace, so re-running a completed release
  turns the job red. That's an accepted trade-off for keeping the workflow
  simple — add a skip step if it ever becomes a nuisance.

The four required credentials live in the `jetbrains-marketplace` GitHub
Environment: `JETBRAINS_MARKETPLACE_TOKEN` (Marketplace account ▸ *My Tokens*),
plus `CERTIFICATE_CHAIN`, `PRIVATE_KEY`, and `PRIVATE_KEY_PASSWORD` for signing.

The manual submission flow above remains the reference for the **first**
listing of the plugin (creating the Marketplace listing, metadata, screenshots,
and JetBrains moderation) — automation only takes over once that listing
exists.
