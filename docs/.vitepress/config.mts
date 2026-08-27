import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(defineConfig({
    title: "Miragon BPMN Modeler",
    description: "Professional BPMN/DMN process modeling — as a VS Code extension or a standalone desktop app",
    base: "/bpmn-modeler/",
    // The decision log is contributor-facing, not user documentation (ADR 0001).
    srcExclude: ["adr/**"],
    vite: {
        server: {
            // portless proxies the dev server behind a `<name>.localhost` host;
            // Vite rejects unknown Host headers unless the suffix is allow-listed.
            allowedHosts: [".localhost"],
        },
    },
    head: [
        [
            "link",
            {
                rel: "icon",
                type: "image/png",
                href: "/bpmn-modeler/miragon-favicon.png",
            },
        ],
    ],
    themeConfig: {
        logo: "/miragon-favicon.png",
        nav: [
            { text: "VS Code", link: "/vscode/getting-started" },
            { text: "IntelliJ", link: "/intellij/getting-started" },
            { text: "Standalone", link: "/standalone/getting-started" },
            { text: "Features", link: "/vscode/features/" },
        ],
        sidebar: {
            "/": [
                {
                    text: "VS Code",
                    items: [
                        { text: "Installation & Quick Start", link: "/vscode/getting-started" },
                        { text: "Configuration", link: "/vscode/configuration" },
                    ],
                },
                {
                    text: "IntelliJ (Preview)",
                    items: [
                        { text: "Getting Started", link: "/intellij/getting-started" },
                    ],
                },
                {
                    text: "Standalone (Preview)",
                    items: [
                        { text: "Getting Started", link: "/standalone/getting-started" },
                    ],
                },
                {
                    text: "Features",
                    items: [
                        { text: "Overview", link: "/vscode/features/" },
                        { text: "Append Menu", link: "/vscode/features/append-menu" },
                        { text: "BPMN Diff", link: "/vscode/features/bpmn-diff" },
                        { text: "Inline Scripting", link: "/vscode/features/inline-scripting" },
                        { text: "Deployment", link: "/vscode/features/deployment" },
                        {
                            text: "Element Template Chooser",
                            link: "/vscode/features/element-template-chooser",
                        },
                        {
                            text: "Template Marketplace",
                            link: "/vscode/features/template-marketplace",
                        },
                        {
                            text: "Language Support",
                            link: "/vscode/features/language-support",
                        },
                        { text: "Linting", link: "/vscode/features/linting" },
                    ],
                },
                {
                    text: "Contributing",
                    collapsed: true,
                    items: [
                        { text: "Development", link: "/vscode/contributing/development" },
                        {
                            text: "Architecture",
                            link: "/vscode/contributing/architecture-overview",
                        },
                        {
                            text: "Release process",
                            link: "/vscode/contributing/release-process",
                        },
                    ],
                },
            ],
        },
        socialLinks: [
            {
                icon: "github",
                link: "https://github.com/Miragon/bpmn-modeler",
            },
        ],
        search: { provider: "local" },
    },
}));
