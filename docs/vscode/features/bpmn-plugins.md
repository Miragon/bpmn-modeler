# BPMN plugins

Extend the BPMN editor with [bpmn-js](https://bpmn.io/toolkit/bpmn-js/) plugins that live in your repository, including many plugins written for the Camunda Modeler.

A plugin runs its own code inside the editor. The modeler loads it only after you allow it, and asks again whenever its files change.

## Add a plugin

Put each plugin in its own folder under `<configFolder>/plugins/` (`.camunda/plugins/` by default). Like element templates, plugins are collected from the diagram's folder up to the workspace root:

```
my-project/
├── .camunda/plugins/
│   ├── example-plugin/           # a Camunda Modeler plugin, unchanged
│   │   ├── index.js
│   │   ├── dist/client.js
│   │   └── style/style.css
│   └── naming-hints/             # a plugin with its own manifest
│       ├── plugin.json
│       └── dist/plugin.js
└── processes/
    └── order.bpmn
```

The modeler learns from one file per folder which script to load. A `plugin.json` wins when both exist.

**`plugin.json`**

```json
{ "name": "Naming hints", "script": "dist/plugin.js", "style": "dist/plugin.css" }
```

| Field | Description |
|---|---|
| `script` | Required. The plugin's browser bundle. |
| `style` | Optional. A stylesheet loaded with the script. |
| `name` | Optional. Shown when you allow the plugin and in the log. The folder name if omitted. |

**`index.js` of a Camunda Modeler plugin**

```js
module.exports = {
    name: 'Example Plug-in',
    menu: './menu/menu.js',
    style: './style/style.css',
    script: './dist/client.js',
};
```

The modeler reads `name`, `script` and `style` from it as plain string literals and never runs the file. If the values are computed, for example with `path.join`, add a `plugin.json` next to it. `menu` and other entries are ignored.

Paths are relative to the plugin folder and must stay inside it. The script is the built bundle: build the plugin (for a Camunda plugin usually `npm run build`) and commit its output, because the modeler neither installs nor builds anything. A folder the modeler cannot read, for example without a manifest or with a missing script, is skipped and named in the *bpmn.modeler* output channel. The other plugins still load.

## What a plugin can register

A plugin script registers itself on `window.plugins`, the contract of [`camunda-modeler-plugin-helpers`](https://github.com/camunda/camunda-modeler-plugin-helpers). The [Camunda example plugin](https://github.com/camunda/camunda-modeler-plugin-example) is a good start for a new one.

| Registration type | Helper | Applies to |
|---|---|---|
| `bpmn.modeler.additionalModules` | `registerBpmnJSPlugin` | Every diagram |
| `bpmn.platform.modeler.additionalModules` | `registerPlatformBpmnJSPlugin` | Camunda 7 diagrams |
| `bpmn.cloud.modeler.additionalModules` | `registerCloudBpmnJSPlugin` | Camunda 8 diagrams |
| `bpmn.modeler.moddleExtension` | `registerBpmnJSModdleExtension` | Every diagram |
| `bpmn.platform.modeler.moddleExtension` | `registerPlatformBpmnJSModdleExtension` | Camunda 7 diagrams |
| `bpmn.cloud.modeler.moddleExtension` | `registerCloudBpmnJSModdleExtension` | Camunda 8 diagrams |

A diagram without an execution platform gets only the registrations for every diagram. A moddle extension needs a `prefix`. Everything else, such as the Camunda Modeler's `client` extensions (its React UI) and `dmn.*` registrations, is skipped and named in the output channel.

Plugins load in the [Design and Implement modes](/vscode/features/modes), never in View, which has no modeling for them to extend. The [BPMN diff](/vscode/features/bpmn-diff) never loads plugins.

## Allow a plugin

When you open a diagram and its workspace holds plugins you have not allowed yet, the editor opens right away with the plugins you already allowed, and a notification says how many are waiting, for example *2 BPMN plugins in this workspace are not allowed yet.*

1. Click **Review…** to see the list. Each entry shows the plugin's name, whether it is new or changed since you allowed it, and its folder.
2. Check the plugins you trust and confirm. Every open BPMN editor that offered one of them reloads with it.

A plugin you leave unchecked is not offered again until the window reloads or its files change. Closing the notification without **Review…** decides nothing: the modeler does not ask again in this window for the same plugins, and asks again in a later session. Only one question is open at a time, even when you open several diagrams.

An approval is for one plugin folder and its exact content, a SHA-256 hash of the script and the stylesheet:

- Any change, from a `git pull`, an update or an edit, makes the plugin *changed*. It is left out until you allow it again.
- The same plugin in another folder or repository asks on its own.
- Approvals are kept for you in VS Code's global state, outside every workspace, so a repository cannot allow its own plugins. [Workspace Trust](https://code.visualstudio.com/docs/editor/workspace-trust) does not replace them.
- The editor loads a copy of the bytes you allowed from VS Code's global storage, never the files in your workspace. A file changed after you allowed it does not run.

## What an allowed plugin can do

::: warning Only allow plugins you trust
An allowed plugin has the same access as the BPMN editor itself.
:::

A plugin runs inside the editor's webview, not in the extension host, so it has no Node.js access. Within the editor it can do everything the editor can:

- It gets the modeler's injector, so it can change the diagram. Its changes are written to the file like your own edits.
- It can call every editor service, including the ones that reach VS Code: opening files and other models, the clipboard and the script editors.
- The editor may show images from any `https:` URL, which element template icons need. A plugin can therefore send data out through an image URL.

The approval is the control. Neither the webview's sandbox nor its Content Security Policy keeps an allowed plugin from doing this.

## When a plugin breaks

- A script that cannot be loaded or throws while it runs is left out, and the other plugins still load. A notification says how many were left out, and the output channel says why.
- If the plugins keep the editor from being built, or the editor cannot load its plugin loader, the editor opens without any plugin and tells you so. A broken plugin never keeps a diagram from opening.

## Limits

- Prebuilt plugins bring their own copies of the libraries they are built with, such as diagram-js and preact. Modules that only use the services the editor injects work. Plugins that rely on sharing those libraries with the editor, such as properties panel extensions built on preact hooks, may fail.
- Camunda Modeler `client` extensions, menus and DMN plugins do not run. Plugins extend the BPMN editor only, not DMN or forms.
- Plugins load when an editor opens. A change to a plugin's files reaches an editor the next time it opens, after you allow the changed version.
- There is no command yet to list or revoke approvals. Remove a plugin's folder to stop loading it. Copies of allowed plugins stay in VS Code's global storage.

## IntelliJ

The IntelliJ plugin loads BPMN plugins the same way: the same folders, the same notification with **Review…**, the same list and the same rules. These parts differ:

- The question is an IDE notification balloon. Closing the balloon with its X keeps it in the **Notifications** tool window, where **Review…** still works. Clearing it there decides nothing, like closing the notification in VS Code.
- Approvals are kept by the IDE for all your projects, outside every project, so a repository cannot allow its own plugins. A plugin you allow in one project window is allowed in the others too.
- The editor loads a copy of the bytes you allowed from the IDE's system folder (`miragon-bpmn-modeler/bpmn-plugins`), never the files in your project.
- After you allow a plugin, every open BPMN editor that offered it loads anew. Your unsaved edits stay.
- An allowed plugin can do everything the editor can, as in VS Code, including sending its own messages to the IDE plugin. The approval is the control here too.
- Messages that VS Code writes to the *bpmn.modeler* output channel, for example why a plugin was skipped, go to the IDE log (**Help ▸ Show Log in Finder**; **Explorer** on Windows, **Files** on Linux).

## Next steps

- [Editor modes](/vscode/features/modes): Design and Implement are the modes with plugins.
- [Element templates](/vscode/features/element-template-chooser): extend the editor with templates instead of code.
- [Configuration](/vscode/configuration): set the config folder name.
