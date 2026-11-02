/**
 * [B] Theme selection for a single instance. The modeler toggles a
 * `data-bpmn-theme` attribute on its container + panel parent (the authoritative
 * mechanism — dark rules are scoped under `[data-bpmn-theme="dark"]`, so two
 * instances on one page can hold different themes) and mirrors the choice onto a
 * legacy page-global `#theme-link` when the consumer still links one.
 * `"automatic"` follows the OS/browser `prefers-color-scheme` live;
 * `"light"`/`"dark"` force a fixed kind. A host that themes off its own chrome
 * (VS Code `<body>` classes) maps that signal to a forced mode in its adapter —
 * the package does not read host chrome.
 */
export type ThemeMode = "light" | "dark" | "automatic";
