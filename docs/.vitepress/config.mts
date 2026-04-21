import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(defineConfig({
    title: "Miragon BPMN Modeler",
    description: "Professional BPMN/DMN process modeling for VS Code and beyond",
    base: "/bpmn-vscode-modeler/",
    appearance: false,
    head: [
        [
            "link",
            {
                rel: "icon",
                type: "image/png",
                href: "/bpmn-vscode-modeler/miragon-favicon.png",
            },
        ],
    ],
    themeConfig: {
        logo: "/miragon-favicon.png",
        nav: [
            { text: "Getting Started", link: "/vscode/getting-started" },
            { text: "Features", link: "/vscode/features/" },
        ],
        sidebar: {
            "/vscode/": [
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
                        { text: "Overview", link: "/vscode/features/" },
                        { text: "Append Menu", link: "/vscode/features/append-menu" },
                        { text: "BPMN Diff", link: "/vscode/features/bpmn-diff" },
                        { text: "Copy & Paste", link: "/vscode/features/copy-paste" },
                        { text: "Deployment", link: "/vscode/features/deployment" },
                        {
                            text: "Element Template Chooser",
                            link: "/vscode/features/element-template-chooser",
                        },
                        {
                            text: "Language Support",
                            link: "/vscode/features/language-support",
                        },
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
                            text: "Internals",
                            collapsed: true,
                            items: [
                                {
                                    text: "Append Menu",
                                    link: "/vscode/contributing/architecture/append-menu",
                                },
                                {
                                    text: "BPMN Diff",
                                    link: "/vscode/contributing/architecture/bpmn-diff",
                                },
                                {
                                    text: "Copy & Paste",
                                    link: "/vscode/contributing/architecture/copy-paste",
                                },
                                {
                                    text: "Deployment",
                                    link: "/vscode/contributing/architecture/deployment",
                                },
                                {
                                    text: "Element Template Chooser",
                                    link: "/vscode/contributing/architecture/element-template-chooser",
                                },
                                {
                                    text: "Language Support",
                                    link: "/vscode/contributing/architecture/language-support",
                                },
                            ],
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
                link: "https://github.com/Miragon/bpmn-vscode-modeler",
            },
            {
                icon: "linkedin",
                link: "https://www.linkedin.com/company/miragon-io",
            },
        ],
        search: { provider: "local" },
    },
}));
