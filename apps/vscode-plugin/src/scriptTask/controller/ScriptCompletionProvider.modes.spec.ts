import { describe, expect, it, vi } from "vitest";

// The provider class touches the `vscode` value namespace (`CompletionItem`,
// `MarkdownString`, `SnippetString`, `languages`), so the factory supplies
// runtime stand-ins. The pure helper tests live in the sibling
// `ScriptCompletionProvider.spec.ts`, which needs no vscode mock.
vi.mock("vscode", () => {
    class CompletionItem {
        detail?: string;
        documentation?: unknown;
        insertText?: unknown;
        constructor(
            public label: string,
            public kind: number,
        ) {}
    }
    class MarkdownString {
        constructor(public value: string) {}
    }
    class SnippetString {
        constructor(public value: string) {}
    }
    return {
        CompletionItem,
        CompletionItemKind: { Variable: 5, Method: 1 },
        MarkdownString,
        SnippetString,
        languages: { registerCompletionItemProvider: vi.fn() },
    };
});

import { ScriptUri, ScriptVariableStore, SettingsPort } from "@miragon/bpmn-modeler-core";
import { VariableDef } from "@miragon/bpmn-modeler-shared";

import { ScriptCompletionProvider } from "./ScriptCompletionProvider";

const EDITOR = "file:///work/diagram.bpmn";
const HASH = ScriptUri.hashEditorId(EDITOR);
// A script-task URI path keyed to EDITOR's hash; the provider derives both the
// kind (`script-task`) and the editor hash from this path.
const SCRIPT_PATH = `/${HASH}/Task_1/script-task/Task_1.groovy`;

function storeWith(...variables: VariableDef[]): ScriptVariableStore {
    const store = new ScriptVariableStore();
    store.set(EDITOR, variables);
    return store;
}

// Only `getScriptingSpin` is exercised by the provider; a partial stub keeps the
// test focused on the SPIN gate without standing up the full settings surface.
function buildProvider(store: ScriptVariableStore, spinEnabled = true): ScriptCompletionProvider {
    const settings = { getScriptingSpin: () => spinEnabled } as SettingsPort;
    return new ScriptCompletionProvider(store, settings);
}

function complete(
    provider: ScriptCompletionProvider,
    linePrefix: string,
    options: { path?: string; triggerCharacter?: string } = {},
): string[] {
    const path = options.path ?? SCRIPT_PATH;
    const document = { uri: { path }, lineAt: () => ({ text: linePrefix }) } as never;
    const position = { character: linePrefix.length } as never;
    const context = { triggerCharacter: options.triggerCharacter } as never;
    const items = provider.provideCompletionItems(document, position, undefined, context);
    return items.map((item) => item.label as string);
}

const variable = (name: string, typeHint?: string): VariableDef => ({
    name,
    origin: `origin of ${name}`,
    typeHint,
    confidence: "declared",
});

describe("ScriptCompletionProvider modes", () => {
    it("root mode offers SPIN globals, beans and process variables", () => {
        const provider = buildProvider(storeWith(variable("amount")));
        const labels = complete(provider, "am");
        expect(labels).toContain("S");
        expect(labels).toContain("JSON");
        expect(labels).toContain("execution");
        expect(labels).toContain("amount");
    });

    it("root mode omits SPIN globals when the setting is off", () => {
        const provider = buildProvider(storeWith(variable("amount")), false);
        const labels = complete(provider, "am");
        expect(labels).not.toContain("S");
        expect(labels).not.toContain("JSON");
        // Beans and variables are unaffected by the SPIN gate.
        expect(labels).toContain("execution");
        expect(labels).toContain("amount");
    });

    it("variable-string-arg mode offers only process variables", () => {
        const provider = buildProvider(storeWith(variable("amount")));
        const labels = complete(provider, `execution.getVariable("am`);
        expect(labels).toEqual(["amount"]);
    });

    it("a quote trigger outside a variable argument returns nothing", () => {
        const provider = buildProvider(storeWith(variable("amount")));
        expect(complete(provider, `def label = "am`, { triggerCharacter: '"' })).toEqual([]);
    });

    it("an unknown editor hash yields beans only, no variables", () => {
        const provider = buildProvider(storeWith(variable("amount")));
        const labels = complete(provider, "am", {
            path: "/unknownhash/Task_1/script-task/Task_1.groovy",
        });
        expect(labels).toContain("execution");
        expect(labels).not.toContain("amount");
    });

    it("member access on a known bean returns its methods, not variables", () => {
        const provider = buildProvider(storeWith(variable("amount")));
        const labels = complete(provider, "execution.");
        expect(labels).toContain("getVariable");
        expect(labels).not.toContain("amount");
    });

    it("carries the typeHint as the completion detail", () => {
        const provider = buildProvider(storeWith(variable("amount", "long")));
        const document = {
            uri: { path: SCRIPT_PATH },
            lineAt: () => ({ text: `execution.getVariable("` }),
        } as never;
        const items = provider.provideCompletionItems(
            document,
            { character: 23 } as never,
            undefined,
            {} as never,
        );
        expect(items[0].detail).toBe("long");
    });
});
