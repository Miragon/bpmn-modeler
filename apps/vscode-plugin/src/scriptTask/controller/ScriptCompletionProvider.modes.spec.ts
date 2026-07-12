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
        additionalTextEdits?: unknown[];
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
    class Position {
        constructor(
            public line: number,
            public character: number,
        ) {}
    }
    // Mirrors the real `TextEdit.insert` shape (an empty range at the position)
    // so assertions can read `edit.range.start` through the vscode typings.
    class TextEdit {
        constructor(
            public range: { start: Position; end: Position },
            public newText: string,
        ) {}
        static insert(position: Position, newText: string): TextEdit {
            return new TextEdit({ start: position, end: position }, newText);
        }
    }
    return {
        CompletionItem,
        CompletionItemKind: { Text: 0, Method: 1, Function: 2, Variable: 5, Class: 6 },
        MarkdownString,
        Position,
        SnippetString,
        TextEdit,
        languages: { registerCompletionItemProvider: vi.fn() },
    };
});

import { ScriptUri, ScriptVariableStore, SettingsPort } from "@miragon/bpmn-modeler-core";
import { VariableDef } from "@miragon/bpmn-modeler-shared";

import { ScriptCompletionProvider } from "./ScriptCompletionProvider";

const EDITOR = "file:///work/diagram.bpmn";
const HASH = ScriptUri.hashEditorId(EDITOR);
// An on-disk script-task path keyed to EDITOR's hash; the provider derives
// both the kind (`script-task`) and the editor hash from the segments after
// the `tmp/scripting/` marker.
const SCRIPT_PATH = `/work/.camunda/tmp/scripting/${HASH}/Task_1/script-task/Task_1.groovy`;

function storeWith(...variables: VariableDef[]): ScriptVariableStore {
    const store = new ScriptVariableStore();
    store.setExtracted(EDITOR, variables);
    return store;
}

// Only `getScriptingSpin` is exercised by the provider; a partial stub keeps the
// test focused on the SPIN gate without standing up the full settings surface.
// The open-script registry accepts every path by default; the tracked-only
// guard has its own dedicated test.
function buildProvider(
    store: ScriptVariableStore,
    spinEnabled = true,
    openScripts: { getEditorIdForScriptUri(path: string): string | undefined } = {
        getEditorIdForScriptUri: () => EDITOR,
    },
): ScriptCompletionProvider {
    const settings = { getScriptingSpin: () => spinEnabled } as SettingsPort;
    return new ScriptCompletionProvider(store, settings, openScripts);
}

interface CompleteOptions {
    path?: string;
    triggerCharacter?: string;
    languageId?: string;
    /** Full document text for the local-declaration scan; defaults to the line prefix. */
    scriptText?: string;
    /** 0-based cursor line; drives the declaration self-suppression rule. */
    line?: number;
}

function completeItems(
    provider: ScriptCompletionProvider,
    linePrefix: string,
    options: CompleteOptions = {},
): ReturnType<ScriptCompletionProvider["provideCompletionItems"]> {
    const path = options.path ?? SCRIPT_PATH;
    const document = {
        uri: { path },
        languageId: options.languageId ?? "groovy",
        lineAt: () => ({ text: linePrefix }),
        getText: () => options.scriptText ?? linePrefix,
    } as never;
    const position = { line: options.line ?? 0, character: linePrefix.length } as never;
    const context = { triggerCharacter: options.triggerCharacter } as never;
    return provider.provideCompletionItems(document, position, undefined, context);
}

function complete(
    provider: ScriptCompletionProvider,
    linePrefix: string,
    options: CompleteOptions = {},
): string[] {
    return completeItems(provider, linePrefix, options).map((item) => item.label as string);
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
            path: "/work/.camunda/tmp/scripting/unknownhash/Task_1/script-task/Task_1.groovy",
        });
        expect(labels).toContain("execution");
        expect(labels).not.toContain("amount");
    });

    it("returns nothing for a path the service does not track as an open script", () => {
        const provider = buildProvider(storeWith(variable("amount")), true, {
            getEditorIdForScriptUri: () => undefined,
        });
        expect(complete(provider, "am")).toEqual([]);
    });

    it("member access on a known bean returns its methods, not variables", () => {
        const provider = buildProvider(storeWith(variable("amount")));
        const labels = complete(provider, "execution.");
        expect(labels).toContain("getVariable");
        expect(labels).not.toContain("amount");
    });

    it("member access on a SPIN-typed variable returns SpinJsonNode methods", () => {
        const provider = buildProvider(storeWith(variable("node", "SpinJsonNode")));
        const labels = complete(provider, "node.");
        expect(labels).toContain("prop");
        expect(labels).toContain("stringValue");
        expect(labels).toContain("mapTo");
        // Neither bean methods nor variable names leak into a typed-member list.
        expect(labels).not.toContain("amount");
        expect(labels).not.toContain("execution");
    });

    it("member access on a typed variable returns nothing when SPIN is off", () => {
        const provider = buildProvider(storeWith(variable("node", "SpinJsonNode")), false);
        expect(complete(provider, "node.")).toEqual([]);
    });

    it("member access on a variable without a typeHint returns nothing", () => {
        const provider = buildProvider(storeWith(variable("node")));
        expect(complete(provider, "node.")).toEqual([]);
    });

    it("member access on a primitive-typed variable returns nothing", () => {
        const provider = buildProvider(storeWith(variable("node", "long")));
        expect(complete(provider, "node.")).toEqual([]);
    });

    describe("javascript trim — tsserver owns the static surface", () => {
        it("root mode offers only process variables, no beans or SPIN globals", () => {
            const provider = buildProvider(storeWith(variable("amount")));
            const labels = complete(provider, "am", { languageId: "javascript" });
            expect(labels).toContain("amount");
            expect(labels).not.toContain("execution");
            expect(labels).not.toContain("S");
            expect(labels).not.toContain("JSON");
        });

        it("bean member access yields nothing — the d.ts serves it", () => {
            const provider = buildProvider(storeWith(variable("amount")));
            expect(complete(provider, "execution.", { languageId: "javascript" })).toEqual([]);
        });

        it("keeps the dynamic getVariable string-argument completion", () => {
            const provider = buildProvider(storeWith(variable("amount")));
            const labels = complete(provider, `execution.getVariable("am`, {
                languageId: "javascript",
            });
            expect(labels).toEqual(["amount"]);
        });

        it("keeps typed process-variable member completion — per-variable types are dynamic", () => {
            const provider = buildProvider(storeWith(variable("node", "SpinJsonNode")));
            const labels = complete(provider, "node.", { languageId: "javascript" });
            expect(labels).toContain("prop");
        });
    });

    describe("local declarations at root", () => {
        it("offers a local declared on an earlier line", () => {
            const provider = buildProvider(storeWith());
            const labels = complete(provider, "myT", {
                scriptText: "def myTotal = 1\nmyT",
                line: 1,
            });
            expect(labels).toContain("myTotal");
        });

        it("marks locals with a local-variable / local-function detail", () => {
            const provider = buildProvider(storeWith());
            const items = completeItems(provider, "x", {
                scriptText: "def myTotal = 1\ndef helper() {\nx",
                line: 2,
            });
            const byLabel = new Map(items.map((item) => [item.label as string, item]));
            expect(byLabel.get("myTotal")?.detail).toBe("local variable");
            expect(byLabel.get("helper")?.detail).toBe("local function");
        });

        it("does not suggest a declaration to itself while it is being typed", () => {
            const provider = buildProvider(storeWith());
            const labels = complete(provider, "def myTotal = 1", {
                scriptText: "def myTotal = 1",
                line: 0,
            });
            expect(labels).not.toContain("myTotal");
        });

        it("lets the bean win over a same-named local (no duplicate)", () => {
            const provider = buildProvider(storeWith());
            const labels = complete(provider, "ex", {
                scriptText: "def execution = wat\nex",
                line: 1,
            });
            expect(labels.filter((label) => label === "execution")).toHaveLength(1);
        });

        it("lets the process variable win over a same-named local (docs preserved)", () => {
            const provider = buildProvider(storeWith(variable("amount", "long")));
            const items = completeItems(provider, "am", {
                scriptText: "def amount = 1\nam",
                line: 1,
            });
            const amounts = items.filter((item) => item.label === "amount");
            expect(amounts).toHaveLength(1);
            // The surviving item is the store's (typeHint detail), not the local.
            expect(amounts[0].detail).toBe("long");
        });

        it("lets a SPIN global win while enabled, and frees the name when disabled", () => {
            const script = "def S = 5\nx";
            const spinOn = complete(buildProvider(storeWith()), "x", {
                scriptText: script,
                line: 1,
            });
            expect(spinOn.filter((label) => label === "S")).toHaveLength(1);

            const spinOff = complete(buildProvider(storeWith(), false), "x", {
                scriptText: script,
                line: 1,
            });
            expect(spinOff).toContain("S");
        });

        it("leaves javascript locals to tsserver (camunda.d.ts path)", () => {
            const provider = buildProvider(storeWith());
            const labels = complete(provider, "ra", {
                languageId: "javascript",
                scriptText: "const rate = 2\nfunction fmt(x) {}\nra",
                line: 2,
            });
            expect(labels).not.toContain("rate");
            expect(labels).not.toContain("fmt");
        });

        it("keeps locals out of the variable-string-arg mode", () => {
            const provider = buildProvider(storeWith(variable("amount")));
            const labels = complete(provider, `execution.getVariable("`, {
                scriptText: 'def myTotal = 1\nexecution.getVariable("',
                line: 1,
            });
            expect(labels).toEqual(["amount"]);
        });

        it("keeps locals out of member completion", () => {
            const provider = buildProvider(storeWith());
            const labels = complete(provider, "execution.", {
                scriptText: "def myTotal = 1\nexecution.",
                line: 1,
            });
            expect(labels).not.toContain("myTotal");
        });
    });

    describe("groovy SPIN auto-import", () => {
        it("attaches the S import at line 0 when the script has no imports", () => {
            const items = completeItems(buildProvider(storeWith()), "S", { scriptText: "S" });
            const edit = items.find((item) => item.label === "S")?.additionalTextEdits?.[0];
            expect(edit?.newText).toBe("import static org.camunda.spin.Spin.S\n");
            expect(edit?.range.start).toMatchObject({ line: 0, character: 0 });
        });

        it("inserts below the last existing import", () => {
            const items = completeItems(buildProvider(storeWith()), "S", {
                scriptText: "import foo.Bar\nS",
                line: 1,
            });
            const edit = items.find((item) => item.label === "S")?.additionalTextEdits?.[0];
            expect(edit?.range.start.line).toBe(1);
        });

        it("attaches no edit when the import is already present", () => {
            const items = completeItems(buildProvider(storeWith()), "S", {
                scriptText: "import static org.camunda.spin.Spin.S\nS",
                line: 1,
            });
            expect(items.find((item) => item.label === "S")?.additionalTextEdits).toBeUndefined();
        });

        it("treats a covering wildcard import as satisfying", () => {
            const items = completeItems(buildProvider(storeWith()), "JSO", {
                scriptText: "import static org.camunda.spin.Spin.*\nJSO",
                line: 1,
            });
            const item = items.find((candidate) => candidate.label === "JSON");
            expect(item?.additionalTextEdits).toBeUndefined();
        });

        it("attaches no import edit outside groovy", () => {
            const items = completeItems(buildProvider(storeWith()), "S", {
                languageId: "javascript",
                scriptText: "S",
            });
            expect(items.find((item) => item.label === "S")?.additionalTextEdits).toBeUndefined();
        });

        it("offers SpinJsonNode as a class completion carrying its import", () => {
            const items = completeItems(buildProvider(storeWith()), "Spin", {
                scriptText: "Spin",
            });
            const item = items.find((candidate) => candidate.label === "SpinJsonNode");
            expect(item?.kind).toBe(6); // CompletionItemKind.Class
            expect(item?.detail).toBe("import org.camunda.spin.json.SpinJsonNode");
            expect(item?.additionalTextEdits?.[0]?.newText).toBe(
                "import org.camunda.spin.json.SpinJsonNode\n",
            );
        });

        it("keeps SpinJsonNode out of non-groovy scripts", () => {
            const labels = complete(buildProvider(storeWith()), "Spin", {
                languageId: "javascript",
                scriptText: "Spin",
            });
            expect(labels).not.toContain("SpinJsonNode");
        });

        it("keeps SpinJsonNode out when the SPIN setting is off", () => {
            const labels = complete(buildProvider(storeWith(), false), "Spin", {
                scriptText: "Spin",
            });
            expect(labels).not.toContain("SpinJsonNode");
        });
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
