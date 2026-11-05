import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { openOrcaEditorBundle } from "@miragon/modeler-shell/testing/orca-editor-bundle";
import type { OrcaEditorStub } from "@miragon/modeler-shell/testing/orca-stub";
import { chromium, type Browser, type Page } from "playwright";

import { EDITOR_SIZE } from "../fixtures/smokePoints";

const plugin = fileURLToPath(new URL("../../plugin", import.meta.url));

export const fixture = (name: string): string =>
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

export interface EditorPageOptions {
    editor: "bpmn" | "dmn";
    text: string;
    readOnly?: boolean;
    colorScheme?: "light" | "dark";
}

type StubState = Pick<OrcaEditorStub, "text" | "disk" | "dirty" | "banner"> & {
    edits: number;
    errors: readonly string[];
    cspViolations: number;
};

/** One editor of the built plugin in Chromium, as Orca's isolated frame serves it, with the Orca stub. */
export class EditorPage {
    private constructor(readonly page: Page) {}

    static async open(browser: Browser, options: EditorPageOptions): Promise<EditorPage> {
        const page = await browser.newPage({ viewport: EDITOR_SIZE });
        await page.addInitScript(addSaveRequests);
        await openOrcaEditorBundle(page, {
            plugin,
            entry: `editor/${options.editor}/index.html`,
            text: options.text,
            readOnly: options.readOnly,
            colorScheme: options.colorScheme,
        });
        await page.waitForSelector(".djs-container .djs-shape", { timeout: 30_000 });
        return new EditorPage(page);
    }

    stub(): Promise<StubState> {
        return this.page.evaluate(() => {
            const stub = (window as unknown as { __modelerShellOrcaStub: OrcaEditorStub })
                .__modelerShellOrcaStub;
            return {
                text: stub.text,
                disk: stub.disk,
                dirty: stub.dirty,
                banner: stub.banner,
                edits: stub.edits.length,
                errors: stub.errors(),
                cspViolations: stub.cspViolations().length,
            };
        });
    }

    /** As Orca saves: every `editor.flush` handler first, then the tab's buffer to disk. */
    async save(): Promise<void> {
        await this.page.evaluate(() =>
            Promise.all(
                (
                    window as unknown as { __saveRequests: (() => Promise<void>)[] }
                ).__saveRequests.map((listener) => listener()),
            ),
        );
        await this.run("save");
    }

    run(action: "save" | "idle" | "reload"): Promise<void> {
        return this.page.evaluate(
            (name) =>
                (
                    window as unknown as { __modelerShellOrcaStub: OrcaEditorStub }
                ).__modelerShellOrcaStub[name](),
            action,
        ) as Promise<void>;
    }

    replace(text: string): Promise<void> {
        return this.page.evaluate(
            (next) =>
                (
                    window as unknown as { __modelerShellOrcaStub: OrcaEditorStub }
                ).__modelerShellOrcaStub.replace(next),
            text,
        );
    }

    setColorScheme(colorScheme: "light" | "dark"): Promise<void> {
        return this.page.evaluate(
            (next) =>
                (
                    window as unknown as { __modelerShellOrcaStub: OrcaEditorStub }
                ).__modelerShellOrcaStub.setColorScheme(next),
            colorScheme,
        );
    }

    /** The diagram element's id under a point of the editor, as a click there hits it. */
    elementAt([x, y]: readonly [number, number]): Promise<string | null> {
        return this.page.evaluate(
            ([px, py]) =>
                document
                    .elementFromPoint(px!, py!)
                    ?.closest("[data-element-id]")
                    ?.getAttribute("data-element-id") ?? null,
            [x, y],
        );
    }

    /** Lets Orca's debounce and the stub's replies run out. */
    async settle(): Promise<void> {
        await this.page.waitForTimeout(600);
        await this.run("idle");
    }
}

/**
 * The shell's Orca stub knows no `editor.flush`; this wraps its `window.orca` so
 * the editor can register for it, as in Orca.
 */
function addSaveRequests(): void {
    const scope = window as unknown as {
        orca?: object;
        __saveRequests: (() => Promise<void>)[];
    };
    scope.__saveRequests = [];
    let orca: object | undefined;
    Object.defineProperty(window, "orca", {
        configurable: true,
        get: () => orca,
        set: (api: { on(event: string, listener: unknown): { dispose(): void } }) => {
            orca = Object.freeze({
                ...api,
                on(event: string, listener: () => Promise<void>) {
                    if (event !== "editor.flush") return api.on(event, listener);
                    scope.__saveRequests.push(listener);
                    return {
                        dispose: () =>
                            scope.__saveRequests.splice(scope.__saveRequests.indexOf(listener), 1),
                    };
                },
            });
        },
    });
}

export const launch = (): Promise<Browser> => chromium.launch();
