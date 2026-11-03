import { miragonDocs } from "./miragon/config";

export default miragonDocs({
    repo: "Miragon/bpmn-modeler",
    title: "Miragon BPMN Modeler",
    description:
        "Model, simulate, review and deploy BPMN, DMN and Camunda Forms in VS Code, IntelliJ or a desktop app.",
    footerMessage: "Released under the Apache 2.0 License.",
    // ADRs are contributor-facing; see adr/README.md#publication.
    srcExclude: ["adr/**"],
    head: [["link", { rel: "icon", type: "image/svg+xml", href: `${process.env.DOCS_BASE ?? "/"}favicon-bpmn.svg` }]],
    vite: {
        server: {
            // portless proxies the dev server behind a `<name>.localhost` host;
            // Vite rejects unknown Host headers unless the suffix is allow-listed.
            allowedHosts: [".localhost"],
        },
    },
    nav: [
        {
            text: "Get started",
            link: "/vscode/getting-started",
            activeMatch: "^/(vscode/getting-started|vscode/configuration|intellij/|standalone/)",
        },
        { text: "Features", link: "/vscode/features/", activeMatch: "^/vscode/features/" },
        { text: "Download", link: "/download" },
    ],
    sidebar: [
        {
            text: "Get started",
            items: [
                { text: "VS Code", link: "/vscode/getting-started" },
                { text: "IntelliJ (Preview)", link: "/intellij/getting-started" },
                { text: "Desktop app (Preview)", link: "/standalone/getting-started" },
                { text: "Configuration", link: "/vscode/configuration" },
            ],
        },
        {
            text: "Features",
            items: [{ text: "Overview", link: "/vscode/features/" }],
        },
        {
            text: "Model",
            items: [
                { text: "Editor modes", link: "/vscode/features/modes" },
                { text: "Append menu", link: "/vscode/features/append-menu" },
                { text: "Flow navigation", link: "/vscode/features/flow-navigation" },
                { text: "Element templates", link: "/vscode/features/element-template-chooser" },
                { text: "Element template editor", link: "/vscode/features/element-template-editor" },
                { text: "Template marketplace", link: "/vscode/features/template-marketplace" },
                { text: "Forms", link: "/vscode/features/form-editing" },
                { text: "Language support", link: "/vscode/features/language-support" },
            ],
        },
        {
            text: "Simulate and check",
            items: [
                { text: "Token simulation", link: "/vscode/features/token-simulation" },
                { text: "Linting", link: "/vscode/features/linting" },
            ],
        },
        {
            text: "Code",
            items: [
                { text: "Jump to code and models", link: "/vscode/features/code-navigation" },
                { text: "Inline scripts", link: "/vscode/features/inline-scripting" },
            ],
        },
        {
            text: "Review and deploy",
            items: [
                { text: "BPMN diff", link: "/vscode/features/bpmn-diff" },
                { text: "Deployment", link: "/vscode/features/deployment" },
            ],
        },
        {
            text: "Contributing",
            collapsed: true,
            items: [
                { text: "Development", link: "/vscode/contributing/development" },
                { text: "Architecture", link: "/vscode/contributing/architecture-overview" },
                { text: "Release process", link: "/vscode/contributing/release-process" },
            ],
        },
    ],
});
