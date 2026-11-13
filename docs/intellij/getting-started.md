# Get started in IntelliJ

Install the Miragon BPMN Modeler in IntelliJ IDEA and edit `.bpmn` files with the same modeler
as in VS Code.

## Requirements

- IntelliJ IDEA Community or Ultimate 2024.2 or newer, or Android Studio Ladybug or newer.
- macOS (arm64, x64), Linux (x64, arm64) or Windows (x64). The plugin brings its own bridge binary for these
  platforms, so you do not need Node.js.

## Install

1. Open **Settings ▸ Plugins** and select the **Marketplace** tab.
2. Search for **Miragon BPMN Modeler** and click **Install**.
3. Restart the IDE when asked.

You can also open the
[JetBrains Marketplace listing](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler) and click
**Get ▸ Install to IDE**. Updates arrive through **Settings ▸ Plugins ▸ Updates**.

## Open a file

Open any `.bpmn` or `.bpmn20.xml` file. The modeler is its default editor. To start from scratch, use
**New BPMN Model…** in the project view under **New**, then pick **Camunda 7**, **Camunda 8** or **Engine-neutral**
(an untagged model that opens in the Design mode).

The plugin edits BPMN only. **New DMN Model…** creates a `.dmn` file, which opens in the IDE's own editor.

## Element templates

An element template's JSON opens split, with the
[preview](/vscode/features/element-template-editor) of its properties panel
beside the IDE's JSON editor; the buttons in the editor's top right switch between editor, split and preview.
Templates live in the template folder under the config folder (`.camunda/element-templates/` by default). The form
that creates and edits them is in VS Code so far.

## BPMN plugins

The editor loads [bpmn-js plugins](/vscode/features/bpmn-plugins) from `.camunda/plugins/` in your project once you
allow them in the notification it shows, once per repository. The IDE keeps your allowances for all projects; see
[IntelliJ](/vscode/features/bpmn-plugins#intellij) for what differs from VS Code.

## Project trust

The modeler runs your project's BPMN plugins and bpmnlint rule packages only in a project you trust in the IDE. In a
project you did not trust, for example one you opened in **Safe Mode**, no plugin loads and no rule package runs,
even one you allowed in another worktree of the same repository; the bundled lint rules still run, and the modeler
asks about nothing. The lint status says that the skipped rules wait for your trust. The **Add-ons** tab offers no
**Allow** there and says why on each plugin and rule package; **Revoke** still works. The IDE counts a project it never
asked you about as not trusted.

Trust the project where the IDE offers it, for example in the banner of a project opened in Safe Mode, or add its
folder under **Settings ▸ Build, Execution, Deployment ▸ Trusted Locations**. Once you trust it, open BPMN editors
load anew with the plugins you allowed, lint again with the rule packages, the modeler asks about the ones you have not
allowed yet, and the **Add-ons** tab lists them again; no restart needed. A Trusted Locations change takes effect with the next diagram you open or when you click
**Refresh** in the **Add-ons** tab. Withdrawing the trust does the same in reverse, though rules a rule package
already ran stay loaded until you restart the IDE.

## Add-ons

The **Add-ons** tab of the **BPMN Modeler** tool window lists what your project brings to the modeler: the BPMN
plugins under the config folder, the bpmnlint rule packages your `.bpmnlintrc` takes from `node_modules`, the element
templates and the template marketplaces. It lists this project only. It is the same page as the
[Add-ons view in VS Code](/vscode/features/add-ons), which describes it in full.

- One list holds **Needs attention** (what waits for you to allow it or does not load), **Installed** with the
  project's config folders and packages, and **Marketplaces**. The search button and the kinds below the top line
  (**All**, **Plugins**, **Lint**, **Templates**) narrow the list.
- Click a row to see its details. A tool window wide enough shows the list and the details side by side; a narrow one
  opens the details in place of the list, with **Back**.
- Each plugin and rule package shows its state: **Allowed**, **Not allowed yet** or **Declined this session**. The
  review shows what you would allow and where the allowance would hold; **Allow** at its end allows the add-on in
  every worktree of its repository, later changes included, or in its folder outside a repository, and **Revoke**
  takes the allowance back in every worktree. A worktree of a repository you allowed an add-on in shows it as
  **Allowed** without asking; a second clone asks once. Rules from a rule package that already ran stay loaded until
  you restart the IDE.
- **Disable** and **Enable** switch an element template off and on; a source's **⋯** menu does it for all of its
  templates. A switch holds for this project, which the IDE keeps in `.idea/workspace.xml`, or for all your projects.
- **More actions** (**⋯**) adds and updates [template marketplaces](/vscode/features/template-marketplace); a
  marketplace's own **⋯** menu removes it.
- The **Refresh** button in the tab's title reads everything again, for example after you installed a rule package.
- The page wears the Miragon look in light, dark and high contrast. It follows whether your IDE theme is light, dark
  or high contrast, and the colour theme setting under **Settings ▸ Tools ▸ Miragon BPMN Modeler**; it does not take
  the IDE's colours or font size.

**Review…** in the notification about a new plugin or rule package opens this tab with it selected when everything
the notification names lies inside the project. Otherwise, or when the tab cannot open, the list appears as before.

**Tools ▸ Miragon BPMN Modeler ▸ Review Add-ons**, also in Find Action, opens this tab on the first add-on that
waits for your review.

## Actions

Find every action with **Find Action** (`Ctrl+Shift+A` / `Cmd+Shift+A`) or under **Tools ▸ Miragon BPMN Modeler**.

| Action | What it does |
|---|---|
| New BPMN Model… / New DMN Model… | Create a model (also in the project view under **New**) |
| Format Diagram (`Ctrl+Alt+L`) | Lay out the focused diagram |
| Clean Up Diagram | List leftovers in the diagram and remove them after you confirm |
| Change Engine Version… | Change the engine version of the focused diagram |
| Migrate All Diagrams… | Change the engine version of every BPMN diagram in the project, except copies in `node_modules`, build output or folders whose name starts with a dot |
| Change Modeler Language… | Switch the modeler UI language |
| Toggle Automatic Form Preview | Enable or disable automatic linked-form previews across all projects; manual preview remains available |
| Copy Diagram as SVG / Save Diagram as SVG… | Export the focused diagram as SVG |
| Deploy Diagram / Deploy Files… | Deploy to the active target (see the **BPMN Modeler** tool window, **Deploy** tab) |
| Switch Deployment Target… | Pick the active deployment target for the project |
| Verify Deployment on Engine… | Check the focused diagram against the active Camunda 7 target |
| Generate Script Files for Script Tasks | Write a file for every inline script task of the active diagram; edits sync back live |
| Add / Update / Remove Template Marketplace… | Manage [template marketplaces](/vscode/features/template-marketplace) |
| Reload Modeler | Re-read element templates and re-render open diagrams |
| Review Add-ons | Open the **Add-ons** tab on the add-ons that need your review |
| Refresh Add-ons | Read the plugins, rule packages and element templates of the **Add-ons** tab again |

## Status bar

The status bar shows the element-template load and, for the focused diagram, its engine version, its
[BPMNlint status](/vscode/features/linting#status-bar) and the active deployment target, one widget each. Click the
engine version to change it. Click `BPMNlint: off` to turn linting back on. Click the deployment target to switch
targets or, for Camunda 7, verify against the engine.

## Settings

The settings live under **Settings ▸ Tools ▸ Miragon BPMN Modeler**: default mode, language, colour theme, config
folder, Camunda 8 API version, align to origin, transaction boundaries, SPIN completion, the code-link map, favourite
elements and template marketplaces. They mean the same as the [VS Code settings](/vscode/configuration). The language
list offers every language under [Language support](/vscode/features/language-support). Linting has no field there:
the lint toggle in the editor and the BPMNlint widget turn it on or off for all your projects, and the IDE keeps the
choice across restarts.

**Automatically preview linked forms** is enabled by default. Its checkbox and
**Toggle Automatic Form Preview** action turn automatic previews off or on for
all projects. The context-pad eye still opens an available form manually.

## Next steps

- [Features](/vscode/features/): the feature pages live under VS Code, but the modeler is the same.
- [Editor modes](/vscode/features/modes): View, Design and Implement.
- [Jump to code and models](/vscode/features/code-navigation): from a task to its implementation.
