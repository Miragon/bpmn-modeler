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

## Future automation (out of scope today)

The release pipeline currently uploads to GitHub Releases and refreshes
`docs/public/updatePlugins.xml`. Marketplace uploads can be automated with
the official Gradle task:

```kotlin
// build.gradle.kts (sketch)
intellijPlatform {
    publishing {
        token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
        // channels = listOf("default")  // or "beta", "eap"
    }
}
```

Wire `./gradlew publishPlugin` into the release workflow and add
`JETBRAINS_MARKETPLACE_TOKEN` as a repository secret (generate it from your
Marketplace account ▸ *My Tokens*). Until that lands, every release re-uses
the manual flow above.
