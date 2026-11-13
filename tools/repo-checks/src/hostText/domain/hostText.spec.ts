import { describe, expect, it } from "vitest";

import {
    type CallSite,
    type HostFileTexts,
    hostTextFindings,
    isHostFile,
    isKotlinSource,
    isScannedSource,
    type WrittenText,
} from "./hostText";

const HOST = "apps/vscode-plugin/src/x/adapter/in/Controller.ts";
const KOTLIN_HOST = "apps/intellij-plugin/src/main/kotlin/io/x/Router.kt";
const INTELLIJ_LOGGER = "com.intellij.openapi.diagnostic.Logger";

function written(parts: string[], ...argumentOf: CallSite[]): WrittenText {
    return { line: 3, parts, argumentOf };
}

function fileOf(
    path: string,
    texts: readonly WrittenText[],
    declarations: Partial<Pick<HostFileTexts, "importedSpecifiers" | "initializedValues">> = {},
): HostFileTexts {
    return { path, texts, importedSpecifiers: [], initializedValues: [], ...declarations };
}

function messagesOf(...texts: WrittenText[]): string[] {
    return hostTextFindings([fileOf(HOST, texts)]).map(({ message }) => message);
}

describe("isScannedSource", () => {
    it.each([
        ["apps/vscode-plugin/src/main.ts", true],
        ["apps/vscode-plugin/src/ui/View.tsx", true],
        ["apps/modeler-bridge/src/server.mts", true],
        ["tools/x/config.cts", true],
        ["apps/vscode-plugin/src/main.spec.ts", false],
        ["apps/vscode-plugin/src/main.test.ts", false],
        ["apps/vscode-plugin/src/ui/View.spec.tsx", false],
        ["apps/vscode-plugin/src/__fixtures__/fakeWindow.ts", false],
        ["apps/vscode-plugin/src/types/vscode.d.ts", false],
        ["apps/vscode-plugin/scripts/package.mjs", false],
        ["apps/intellij-plugin/src/main/kotlin/io/miragon/x/Action.kt", true],
        ["x/src/main/kotlin/Action.kt", true],
        ["apps/intellij-plugin/src/test/kotlin/io/miragon/x/ActionTest.kt", false],
        ["apps/intellij-plugin/build.gradle.kts", false],
        ["apps/intellij-plugin/src/main/kotlin/x/script.kts", false],
    ])("reads %s: %s", (path, scanned) => {
        expect(isScannedSource(path)).toBe(scanned);
    });
});

describe("isKotlinSource", () => {
    it.each([
        ["apps/intellij-plugin/src/main/kotlin/io/miragon/x/Action.kt", true],
        ["apps/intellij-plugin/src/test/kotlin/io/miragon/x/ActionTest.kt", false],
        ["apps/vscode-plugin/src/main.ts", false],
    ])("reads %s as Kotlin: %s", (path, kotlin) => {
        expect(isKotlinSource(path)).toBe(kotlin);
    });
});

describe("isHostFile", () => {
    it.each([
        {
            file: "a file that imports vscode",
            path: HOST,
            importedSpecifiers: ["node:path", "vscode"],
            implementedInterfaceFiles: [],
            host: true,
        },
        {
            file: "a class outside the core that implements a core interface",
            path: "apps/modeler-bridge/src/kernel/adapter/out/RpcNotifier.ts",
            importedSpecifiers: ["@miragon/bpmn-modeler-core"],
            implementedInterfaceFiles: ["libs/modeler-core/src/kernel/port/hostPorts.ts"],
            host: true,
        },
        {
            file: "a core class that implements a core interface",
            path: "libs/modeler-core/src/testing/InMemoryNotifier.ts",
            importedSpecifiers: [],
            implementedInterfaceFiles: ["libs/modeler-core/src/kernel/port/hostPorts.ts"],
            host: false,
        },
        {
            file: "a class that implements an interface outside the core",
            path: "apps/modeler-bridge/src/transport/StdioTransport.ts",
            importedSpecifiers: ["node:stream"],
            implementedInterfaceFiles: ["apps/modeler-bridge/src/transport/Transport.ts"],
            host: false,
        },
        {
            file: "a Kotlin file that imports the IntelliJ Platform",
            path: "apps/intellij-plugin/src/main/kotlin/x/Action.kt",
            importedSpecifiers: ["java.io.File", "com.intellij.openapi.ui.DialogWrapper"],
            implementedInterfaceFiles: [],
            host: true,
        },
        {
            file: "a Kotlin file that imports the IntelliJ Platform with a wildcard",
            path: "apps/intellij-plugin/src/main/kotlin/x/Panel.kt",
            importedSpecifiers: ["com.intellij.ui.dsl.builder.*"],
            implementedInterfaceFiles: [],
            host: true,
        },
        {
            file: "a Kotlin file without an IntelliJ Platform import",
            path: "apps/intellij-plugin/src/main/kotlin/x/RpcParams.kt",
            importedSpecifiers: ["kotlinx.serialization.json.JsonObject", "com.intellijx.Other"],
            implementedInterfaceFiles: [],
            host: false,
        },
        {
            file: "a file that only names vscode in a longer specifier",
            path: "libs/x/src/a.ts",
            importedSpecifiers: ["vscode-uri", "@types/vscode"],
            implementedInterfaceFiles: [],
            host: false,
        },
    ])("reads $file as host code: $host", ({ host, ...file }) => {
        expect(isHostFile(file)).toBe(host);
    });
});

describe("hostTextFindings", () => {
    it.each([
        { form: "two words", parts: ["Could not save"] },
        { form: "words around a placeholder", parts: ["Token for ", ""] },
        { form: "words in a later stretch", parts: ["", " was saved to ", "."] },
        { form: "words across a line break", parts: ["Reload the\n    window"] },
        { form: "words beside a symbol", parts: ["Settings ▸ Tools"] },
        { form: "a word and a number", parts: ["Camunda 8"] },
        { form: "words in markup", parts: ["<code>marketplace.json</code>, one per line"] },
    ])("reports $form", ({ parts }) => {
        expect(messagesOf(written(parts))).toHaveLength(1);
    });

    it.each([
        { form: "one word", parts: ["Continue"] },
        { form: "padding around one word", parts: ["  Continue  "] },
        { form: "a placeholder and one word", parts: ["", " files"] },
        { form: "a format of placeholders", parts: ["", ": ", ""] },
        { form: "a codicon and a placeholder", parts: ["$(", ") ", ""] },
        { form: "an empty text", parts: [""] },
        { form: "punctuation after a word", parts: [":root {"] },
        {
            form: "a script's punctuation after a placeholder",
            parts: ["window.postMessage(", ", '*');"],
        },
        { form: "a Markdown format", parts: ["- `", "` — `", "`"] },
    ])("skips $form", ({ parts }) => {
        expect(messagesOf(written(parts))).toEqual([]);
    });

    it.each([
        { form: "a doctype", parts: ["<!DOCTYPE html>"] },
        {
            form: "a tag with attributes",
            parts: ['<meta name="viewport" content="width=device-width, initial-scale=1.0"/>'],
        },
        { form: "a tag around a placeholder", parts: ['<html lang="en" data-bpmn-theme="', '">'] },
        {
            form: "tags around placeholders",
            parts: ['<div id="js-panel-resizer" class="', '"></div> <div class="', '"></div>'],
        },
        { form: "a tag the literal leaves open", parts: ['<meta name="viewport" '] },
        { form: "a document's title", parts: ["<title>BPMN Modeler</title>"] },
        {
            form: "a style element",
            parts: ["<style>html, body { margin: 0; height: 100%; }</style>"],
        },
        {
            form: "a script element",
            parts: ['<script nonce="', '">window.postMessage({ type: "ready" }, "*");</script>'],
        },
        {
            form: "an HTML shell of structure, title, style and script",
            parts: [
                '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8"/>\n' +
                    "  <title>Element Template Editor</title>\n  <style>#app { height: 100vh; }</style>\n" +
                    '</head>\n<body>\n  <div id="app"></div>\n  <script nonce="',
                '" src="',
                '"></script>\n</body>\n</html>',
            ],
        },
    ])("skips markup: $form", ({ parts }) => {
        expect(messagesOf(written(parts))).toEqual([]);
    });

    it.each([
        { form: "words after a tag", parts: ["<code>marketplace.json</code>, one per line"] },
        {
            form: "words inside a tag's element",
            parts: ['<b>Help → Find Action → "Registry…"</b>, disable'],
        },
        {
            form: "a label wrapped in markup",
            parts: ["<html><center>JCEF (embedded Chromium) is not available.<br>"],
        },
        {
            form: "words in a shell's body",
            parts: ["<!DOCTYPE html><body><p>Loading the modeler…</p>"],
        },
        { form: "words beside a comparison", parts: ["Use fewer than < 5 or more than > 9 items"] },
    ])("reports text in markup: $form", ({ parts }) => {
        expect(messagesOf(written(parts))).toHaveLength(1);
    });

    it("keeps the markup of a reported text in its message", () => {
        expect(messagesOf(written(["<code>marketplace.json</code>, one per line"]))).toEqual([
            "`<code>marketplace.json</code>, one per line`",
        ]);
    });

    it.each([
        { call: "log(…)", site: { construct: false, callee: "log" } },
        { call: "logError(…)", site: { construct: false, callee: "logError" } },
        {
            call: "notifier.logInfo(…)",
            site: { construct: false, callee: "logInfo", receiver: "notifier" },
        },
        { call: "new Error(…)", site: { construct: true, callee: "Error" } },
    ])("does not read an argument of $call", ({ site }) => {
        expect(messagesOf(written(["Could not save"], site))).toEqual([]);
    });

    it.each([
        {
            call: "this.logger.warn(…)",
            site: { construct: false, callee: "warn", receiver: "logger" },
        },
        { call: "log.warn(…)", site: { construct: false, callee: "warn", receiver: "log" } },
        { call: "LOG.info(…)", site: { construct: false, callee: "info", receiver: "LOG" } },
    ])("reads a TypeScript argument of $call: no variable name makes a logger", ({ site }) => {
        expect(messagesOf(written(["Could not save"], site))).toHaveLength(1);
    });

    describe("in Kotlin", () => {
        const logWarn: CallSite = { construct: false, callee: "warn", receiver: "log" };

        function kotlinMessages(
            site: CallSite,
            declarations: Parameters<typeof fileOf>[2],
        ): string[] {
            return hostTextFindings([
                fileOf(KOTLIN_HOST, [written(["Could not save"], site)], declarations),
            ]).map(({ message }) => message);
        }

        it.each([
            {
                logger: "a value the file declares from IntelliJ's Logger.getInstance(…)",
                site: logWarn,
                declarations: {
                    importedSpecifiers: [INTELLIJ_LOGGER],
                    initializedValues: [{ name: "log", initializer: "Logger.getInstance" }],
                },
            },
            {
                logger: "a companion's LOG from Logger.getInstance(…), the package imported whole",
                site: { construct: false, callee: "info", receiver: "LOG" },
                declarations: {
                    importedSpecifiers: ["com.intellij.openapi.diagnostic.*"],
                    initializedValues: [{ name: "LOG", initializer: "Logger.getInstance" }],
                },
            },
            {
                logger: "a value from the fully qualified Logger.getInstance(…)",
                site: logWarn,
                declarations: {
                    initializedValues: [
                        {
                            name: "log",
                            initializer: "com.intellij.openapi.diagnostic.Logger.getInstance",
                        },
                    ],
                },
            },
            {
                logger: "a value the file declares from IntelliJ's logger<T>()",
                site: logWarn,
                declarations: {
                    importedSpecifiers: ["com.intellij.openapi.diagnostic.logger"],
                    initializedValues: [{ name: "log", initializer: "logger" }],
                },
            },
            {
                logger: "a value from the fully qualified fileLogger()",
                site: logWarn,
                declarations: {
                    initializedValues: [
                        { name: "log", initializer: "com.intellij.openapi.diagnostic.fileLogger" },
                    ],
                },
            },
            {
                logger: "IntelliJ's thisLogger()",
                site: { construct: false, callee: "warn", receiver: "thisLogger" },
                declarations: {
                    importedSpecifiers: ["com.intellij.openapi.diagnostic.thisLogger"],
                },
            },
        ])("does not read a call on $logger", ({ site, declarations }) => {
            expect(kotlinMessages(site, declarations)).toEqual([]);
        });

        it.each([
            {
                logger: "a log the file does not declare from Logger.getInstance(…)",
                site: logWarn,
                declarations: { importedSpecifiers: [INTELLIJ_LOGGER] },
            },
            {
                logger: "a log from another Logger.getInstance(…) than IntelliJ's",
                site: logWarn,
                declarations: {
                    importedSpecifiers: ["org.example.Logger"],
                    initializedValues: [{ name: "log", initializer: "Logger.getInstance" }],
                },
            },
            {
                logger: "a log from a logger<T>() not imported from IntelliJ",
                site: logWarn,
                declarations: {
                    importedSpecifiers: [INTELLIJ_LOGGER],
                    initializedValues: [{ name: "log", initializer: "logger" }],
                },
            },
            {
                logger: "a thisLogger() not imported from IntelliJ, called fully qualified or not",
                site: { construct: false, callee: "warn", receiver: "thisLogger" },
                declarations: {},
            },
            {
                logger: "a function whose name starts with log, which only TypeScript's LoggerPort names",
                site: { construct: false, callee: "logInfo", receiver: "notifier" },
                declarations: {},
            },
        ])("reads a call on $logger", ({ site, declarations }) => {
            expect(kotlinMessages(site, declarations)).toHaveLength(1);
        });

        it("does not read the arguments of a call a throw raises", () => {
            expect(
                kotlinMessages({ construct: false, callee: "IOException", thrown: true }, {}),
            ).toEqual([]);
        });
    });

    it.each(["require", "check", "requireNotNull", "checkNotNull"])(
        "does not read the message lambda of Kotlin's %s(…)",
        (callee) => {
            const precondition: CallSite = { construct: false, callee };
            const format: CallSite = { construct: false, callee: "format" };

            expect(
                messagesOf(
                    {
                        ...written(["A change names a switch twice"]),
                        trailingLambdaOf: precondition,
                    },
                    {
                        ...written(["A ", " change reached"], format),
                        trailingLambdaOf: precondition,
                    },
                ),
            ).toEqual([]);
        },
    );

    it.each([
        {
            call: "the lambda of another call, logAndRethrow(log) { … }",
            text: {
                ...written(["Could not save"]),
                trailingLambdaOf: { construct: false, callee: "logAndRethrow" },
            },
        },
        {
            call: "the lambda of a method named require, rules.require(…) { … }",
            text: {
                ...written(["Could not save"]),
                trailingLambdaOf: { construct: false, callee: "require", receiver: "rules" },
            },
        },
        {
            call: "the parentheses of require(…)",
            text: written(["Could not save"], { construct: false, callee: "require" }),
        },
        {
            call: "Kotlin's error(…), which the UI DSL's validation shows",
            text: written(["Could not save"], { construct: false, callee: "error" }),
        },
    ])("reads a text in $call", ({ text }) => {
        expect(messagesOf(text)).toHaveLength(1);
    });

    it("does not read a text nested anywhere inside a logging call", () => {
        const showCall: CallSite = { construct: false, callee: "format" };
        const logCall: CallSite = { construct: false, callee: "logInfo", receiver: "notifier" };

        expect(messagesOf(written(["Could not save"], logCall, showCall))).toEqual([]);
    });

    it.each([
        { call: "login(…)", site: { construct: false, callee: "login" } },
        { call: "catalog(…)", site: { construct: false, callee: "catalog" } },
        { call: "a logger factory, loggerFor(…)", site: { construct: false, callee: "loggerFor" } },
        {
            call: "window.showErrorMessage(…)",
            site: { construct: false, callee: "showErrorMessage", receiver: "window" },
        },
        { call: "new TypeError(…)", site: { construct: true, callee: "TypeError" } },
        {
            call: "console.error(…): host code logs through the core's LoggerPort",
            site: { construct: false, callee: "error", receiver: "console" },
        },
        { call: "a call without a name", site: { construct: false } },
    ])("reads an argument of $call", ({ site }) => {
        expect(messagesOf(written(["Could not save"], site))).toHaveLength(1);
    });

    it("keys a finding by its path and its text, not its line, so moved code keeps its identity", () => {
        const [atLine3] = hostTextFindings([fileOf(HOST, [written(["Token for ", ""])])]);
        const [atLine9] = hostTextFindings([
            fileOf(HOST, [{ ...written(["Token for ", ""]), line: 9 }]),
        ]);

        expect(atLine3).toEqual({
            key: `${HOST} — Token for \${…}`,
            path: HOST,
            paths: [HOST],
            line: 3,
            message: "`Token for ${…}`",
        });
        expect(atLine9.key).toBe(atLine3.key);
    });

    it("collapses the whitespace of a text into single spaces", () => {
        expect(messagesOf(written(["\n  Reload the\n    window.\n"]))).toEqual([
            "`Reload the window.`",
        ]);
    });

    it.each([
        { text: "Run `yarn build` first", message: "`` Run `yarn build` first ``" },
        { text: "Fence ``x`` twice", message: "``` Fence ``x`` twice ```" },
    ])("fences a text that holds backticks: $text", ({ text, message }) => {
        expect(messagesOf(written([text]))).toEqual([message]);
    });

    it("shortens a long text in the message but keys the whole text", () => {
        const text = `Saved ${"x".repeat(200)}`;

        const [finding] = hostTextFindings([fileOf(HOST, [written([text])])]);

        expect(finding.message).toBe(`\`${text.slice(0, 99)}…\``);
        expect(finding.key).toBe(`${HOST} — ${text}`);
    });

    it("lists the findings of every file in path and line order", () => {
        const findings = hostTextFindings([
            fileOf("b/Second.ts", [{ ...written(["Second file"]), line: 1 }]),
            fileOf("a/First.ts", [
                { ...written(["Later text"]), line: 8 },
                { ...written(["Earlier text"]), line: 2 },
            ]),
        ]);

        expect(findings.map(({ path, line }) => `${path}:${line}`)).toEqual([
            "a/First.ts:2",
            "a/First.ts:8",
            "b/Second.ts:1",
        ]);
    });
});
