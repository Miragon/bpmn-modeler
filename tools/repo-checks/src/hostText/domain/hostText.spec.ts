import { describe, expect, it } from "vitest";

import {
    type CallSite,
    hostTextFindings,
    isHostFile,
    isKotlinSource,
    isScannedSource,
    type WrittenText,
} from "./hostText";

const HOST = "apps/vscode-plugin/src/x/adapter/in/Controller.ts";

function written(parts: string[], ...argumentOf: CallSite[]): WrittenText {
    return { line: 3, parts, argumentOf };
}

function messagesOf(...texts: WrittenText[]): string[] {
    return hostTextFindings([{ path: HOST, texts }]).map(({ message }) => message);
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
        { call: "log(…)", site: { construct: false, callee: "log" } },
        { call: "logError(…)", site: { construct: false, callee: "logError" } },
        {
            call: "notifier.logInfo(…)",
            site: { construct: false, callee: "logInfo", receiver: "notifier" },
        },
        {
            call: "this.logger.warn(…)",
            site: { construct: false, callee: "warn", receiver: "logger" },
        },
        {
            call: "console.error(…)",
            site: { construct: false, callee: "error", receiver: "console" },
        },
        { call: "new Error(…)", site: { construct: true, callee: "Error" } },
        { call: "log.warn(…)", site: { construct: false, callee: "warn", receiver: "log" } },
        { call: "LOG.info(…)", site: { construct: false, callee: "info", receiver: "LOG" } },
        {
            call: "thisLogger().warn(…), IntelliJ's logger",
            site: { construct: false, callee: "warn", receiver: "thisLogger" },
        },
        {
            call: "throw IOException(…), a Kotlin constructor",
            site: { construct: false, callee: "IOException", thrown: true },
        },
    ])("does not read an argument of $call", ({ site }) => {
        expect(messagesOf(written(["Could not save"], site))).toEqual([]);
    });

    it("does not read a text nested anywhere inside a logging call", () => {
        const showCall: CallSite = { construct: false, callee: "format" };
        const logCall: CallSite = { construct: false, callee: "info", receiver: "logger" };

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
        { call: "a call without a name", site: { construct: false } },
    ])("reads an argument of $call", ({ site }) => {
        expect(messagesOf(written(["Could not save"], site))).toHaveLength(1);
    });

    it("keys a finding by its path and its text, not its line, so moved code keeps its identity", () => {
        const [atLine3] = hostTextFindings([{ path: HOST, texts: [written(["Token for ", ""])] }]);
        const [atLine9] = hostTextFindings([
            { path: HOST, texts: [{ ...written(["Token for ", ""]), line: 9 }] },
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

        const [finding] = hostTextFindings([{ path: HOST, texts: [written([text])] }]);

        expect(finding.message).toBe(`\`${text.slice(0, 99)}…\``);
        expect(finding.key).toBe(`${HOST} — ${text}`);
    });

    it("lists the findings of every file in path and line order", () => {
        const findings = hostTextFindings([
            { path: "b/Second.ts", texts: [{ ...written(["Second file"]), line: 1 }] },
            {
                path: "a/First.ts",
                texts: [
                    { ...written(["Later text"]), line: 8 },
                    { ...written(["Earlier text"]), line: 2 },
                ],
            },
        ]);

        expect(findings.map(({ path, line }) => `${path}:${line}`)).toEqual([
            "a/First.ts:2",
            "a/First.ts:8",
            "b/Second.ts:1",
        ]);
    });
});
