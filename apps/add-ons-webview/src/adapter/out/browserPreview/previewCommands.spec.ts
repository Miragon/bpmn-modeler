import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ADD_ONS_PAGE_ATTRIBUTE,
    AddOnAboutQuery,
    AddOnActionResultQuery,
    AddOnRequestCommand,
    type AddOnsViewCommandType,
    GetAddOnAboutCommand,
    GetAddOnCatalogCommand,
    LogErrorCommand,
    LogInfoCommand,
    type MessageOfType,
    OpenAddOnDetailCommand,
    previewRouteOf,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "../host";
import { PREVIEW_COMMANDS } from "./previewCommands";

const COMMANDS: { [Type in AddOnsViewCommandType]: MessageOfType<Type> } = {
    LogInfoCommand: new LogInfoCommand("info"),
    LogErrorCommand: new LogErrorCommand("error"),
    GetAddOnCatalogCommand: new GetAddOnCatalogCommand(),
    AddOnRequestCommand: new AddOnRequestCommand(1, { kind: "refresh" }),
    OpenAddOnDetailCommand: new OpenAddOnDetailCommand("plugin:/work/x"),
    GetAddOnAboutCommand: new GetAddOnAboutCommand("plugin:/work/x"),
};

function previewAt(search = "") {
    window.history.replaceState(null, "", `/${search}`);
    vi.stubEnv("NODE_ENV", "development");
    const replies: Query[] = [];
    window.addEventListener("message", (event: MessageEvent<Query>) => replies.push(event.data));
    return { host: getHostApi(), replies };
}

describe("the preview's command routing", () => {
    let debug: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        document.documentElement.removeAttribute(ADD_ONS_PAGE_ATTRIBUTE);
    });

    it.each([
        { command: new LogInfoCommand("info"), level: "info" },
        { command: new LogErrorCommand("error"), level: "error" },
    ] as const)("writes a $command.type to the console's $level and sends nothing back", ({ command, level }) => {
        const write = vi.spyOn(console, level).mockImplementation(() => undefined);
        const { host, replies } = previewAt();

        host.postMessage(command);

        expect([write.mock.calls, replies]).toEqual([[[command.message]], []]);
    });

    it("logs a caught error's stack under its message", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { host } = previewAt();

        host.postMessage(new LogErrorCommand("Could not render", "Error: boom\n    at render"));

        expect(error).toHaveBeenCalledWith("Could not render\nError: boom\n    at render");
    });

    it("sends nothing back for an OpenAddOnDetailCommand", () => {
        const { host, replies } = previewAt();

        host.postMessage(new OpenAddOnDetailCommand("plugin:/work/x"));

        expect(replies).toEqual([]);
    });

    it("answers a GetAddOnAboutCommand with the about of the add-on it names", () => {
        const { host, replies } = previewAt();

        host.postMessage(new GetAddOnAboutCommand("plugin:/work/x"));

        expect(replies).toEqual([new AddOnAboutQuery("plugin:/work/x", expect.anything())]);
    });

    it("sends only the result when a request leaves the catalog as it was", () => {
        const { host, replies } = previewAt();
        host.postMessage(new GetAddOnCatalogCommand());
        replies.length = 0;

        host.postMessage(new AddOnRequestCommand(1, { kind: "addMarketplace" }));

        expect(replies).toEqual([new AddOnActionResultQuery(1, { kind: "reportedByFlow" })]);
    });

    it("shows the add-on a detail page names before the catalog", () => {
        const { host, replies } = previewAt("?page=detail&show=Palette");

        host.postMessage(new GetAddOnCatalogCommand());

        expect([
            document.documentElement.getAttribute(ADD_ONS_PAGE_ATTRIBUTE),
            replies.map(({ type }) => type),
        ]).toEqual(["detail", ["BrandModeQuery", "ShowAddOnQuery", "AddOnCatalogQuery"]]);
    });

    it("shows nothing for a detail page whose add-on is not listed", () => {
        const { host, replies } = previewAt("?page=detail&show=Gone");

        host.postMessage(new GetAddOnCatalogCommand());

        expect(replies.map(({ type }) => type)).toEqual(["BrandModeQuery", "AddOnCatalogQuery"]);
    });

    it("sends only the brand mode while the catalog never arrives", () => {
        const { host, replies } = previewAt("?state=loading&show=Palette&reveal=Palette");

        host.postMessage(new GetAddOnCatalogCommand());

        expect(replies.map(({ type }) => type)).toEqual(["BrandModeQuery"]);
    });

    it.each(["toString", "constructor", "hasOwnProperty"])(
        "rejects a message whose type names the inherited %s",
        (type) => {
            const { host } = previewAt();

            expect(() => host.postMessage({ type } as never)).toThrow(`Unknown message type: ${type}`);
        },
    );

    it.each(
        Object.values(COMMANDS).flatMap((command) => {
            const route = previewRouteOf(PREVIEW_COMMANDS, command.type);
            return "ignored" in route ? [{ command, reason: route.ignored }] : [];
        }),
    )("says why it drops a $command.type", ({ command, reason }) => {
        const { host } = previewAt();

        host.postMessage(command);

        expect(debug).toHaveBeenCalledWith(expect.stringContaining(reason), command);
    });
});
