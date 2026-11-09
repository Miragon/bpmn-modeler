import {
    AddOnActionResultQuery,
    AddOnCatalogQuery,
    AddOnsViewCommand,
    asProtocolMessage,
    HostApiImpl,
    MockHostApi,
    Query,
    RevealAddOnsQuery,
} from "@miragon/bpmn-modeler-shared";

import type { AddOnsHost, PersistedViewState } from "../../port/addOnsHost";
import { MockCatalog, PREVIEW_STATES, PreviewState } from "./mockCatalog";

declare const process: { env: { NODE_ENV: string } };

/** The preview's stand-in host in `development`; the embedding host's channel in every other build. */
export function getHostApi(): AddOnsHost {
    if (process.env.NODE_ENV === "development") {
        return new MockHost(new URLSearchParams(window.location.search));
    }
    return new HostApiImpl();
}

/** A few host colours, so the preview shows the view on a dark and a high-contrast host too. */
const PREVIEW_THEMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    dark: {
        "--vscode-foreground": "#cccccc",
        "--vscode-descriptionForeground": "#9d9d9d",
        "--vscode-sideBar-background": "#181818",
        "--vscode-sideBarSectionHeader-foreground": "#cccccc",
        "--vscode-panel-border": "#2b2b2b",
        "--vscode-list-hoverBackground": "#2a2d2e",
        "--vscode-focusBorder": "#0078d4",
        "--vscode-icon-foreground": "#cccccc",
        "--vscode-editor-background": "#1f1f1f",
        "--vscode-button-background": "#0078d4",
        "--vscode-button-foreground": "#ffffff",
        "--vscode-button-secondaryBackground": "#313131",
        "--vscode-button-secondaryForeground": "#cccccc",
        "--vscode-errorForeground": "#f85149",
        "--vscode-list-warningForeground": "#cca700",
        "--vscode-inputValidation-infoBackground": "#063b49",
        "--vscode-inputValidation-infoBorder": "#007acc",
        "--vscode-inputValidation-infoForeground": "#cccccc",
        "--vscode-inputValidation-errorBackground": "#5a1d1d",
        "--vscode-inputValidation-errorBorder": "#be1100",
        "--vscode-inputValidation-errorForeground": "#cccccc",
    },
    hc: {
        "--vscode-foreground": "#ffffff",
        "--vscode-descriptionForeground": "#ffffff",
        "--vscode-sideBar-background": "#000000",
        "--vscode-panel-border": "#6fc3df",
        "--vscode-focusBorder": "#f38518",
        "--vscode-contrastBorder": "#6fc3df",
        "--vscode-contrastActiveBorder": "#f38518",
        "--vscode-editor-background": "#000000",
        "--vscode-button-background": "#000000",
        "--vscode-button-foreground": "#ffffff",
        "--vscode-button-secondaryBackground": "#000000",
        "--vscode-button-secondaryForeground": "#ffffff",
        "--vscode-icon-foreground": "#ffffff",
        "--vscode-sideBarSectionHeader-foreground": "#ffffff",
        "--vscode-errorForeground": "#f48771",
        "--vscode-list-warningForeground": "#ffd700",
    },
};

/**
 * Answers the view's commands from {@link MockCatalog}. Query flags:
 * `state=loading|empty|noFolder|failed`, `reveal=<add-on id or name>`,
 * `stale=1` (the first allow is refused as stale) and `theme=dark|hc`.
 */
class MockHost extends MockHostApi<PersistedViewState, AddOnsViewCommand> {
    private readonly catalog: MockCatalog;
    private readonly revealed?: string;

    constructor(flags: URLSearchParams) {
        super();
        const state = flags.get("state") ?? "full";
        this.catalog = new MockCatalog(
            PREVIEW_STATES.includes(state as PreviewState) ? (state as PreviewState) : "full",
            { stale: flags.get("stale") === "1" },
        );
        this.revealed = flags.get("reveal") ?? undefined;
        Object.entries(PREVIEW_THEMES[flags.get("theme") ?? ""] ?? {}).forEach(([name, value]) =>
            document.documentElement.style.setProperty(name, value),
        );
    }

    override postMessage(message: AddOnsViewCommand): void {
        const command = asProtocolMessage(message);
        switch (command.type) {
            case "LogInfoCommand":
            case "LogErrorCommand":
                console.debug(`[add-ons preview] ${command.type}`, command.message);
                return;
            case "GetAddOnCatalogCommand":
                this.postModel();
                this.postReveal();
                return;
            case "AddOnRequestCommand": {
                const { result, changed } = this.catalog.act(command.request);
                dispatch(new AddOnActionResultQuery(command.requestId, result));
                if (changed) this.postModel();
                return;
            }
            default:
                throw new Error(`Unknown message type: ${message.type}`);
        }
    }

    private postModel(): void {
        const model = this.catalog.model();
        if (model !== undefined) dispatch(new AddOnCatalogQuery(model));
    }

    private postReveal(): void {
        const id = this.revealed === undefined ? undefined : this.catalog.idOf(this.revealed);
        if (id !== undefined) dispatch(new RevealAddOnsQuery({ revealId: 1, addOnIds: [id] }));
    }
}

function dispatch(query: Query): void {
    window.dispatchEvent(new MessageEvent("message", { data: query }));
}
