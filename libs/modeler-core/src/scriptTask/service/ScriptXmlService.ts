import type { ScriptKind } from "@miragon/bpmn-modeler-shared";

/**
 * One script surface's new content, addressed exactly as the webview addresses
 * it (see `scriptModel.ts`): element id + kind, plus the filtered listener
 * index for the two listener kinds (`undefined` for a script task).
 */
export interface ScriptContentUpdate {
    elementId: string;
    kind: ScriptKind;
    listenerIndex: number | undefined;
    content: string;
}

/** A parsed `camunda:Script` element — only its body `value` matters here. */
interface ModdleScript {
    value?: string;
}

/** A parsed listener extension element carrying an optional inline script. */
interface ModdleListener {
    $type: string;
    script?: ModdleScript;
}

/** The subset of a parsed moddle element this service reads or mutates. */
interface ModdleElement {
    $type: string;
    // `bpmn:ScriptTask.script` is the inline body String property, not a nested
    // element — moddle exposes it as a plain string (unset ⇒ `undefined`).
    script?: string;
    extensionElements?: { values?: ModdleListener[] };
    [key: string]: unknown;
}

type BpmnModdleFactory = (additionalPackages?: Record<string, unknown>) => ModdleInstance;

interface ModdleInstance {
    fromXML(xml: string): Promise<{
        rootElement: ModdleElement;
        elementsById: Record<string, ModdleElement>;
    }>;
    toXML(element: ModdleElement, options?: { format?: boolean }): Promise<{ xml: string }>;
}

/**
 * Writes inline-script content directly into BPMN XML on the host, without a
 * live modeler.
 *
 * The extension host has no bpmn-js instance of its own — script keystrokes
 * normally stream into the *webview's* model. When the diagram tab is closed
 * before a buffered edit can be replayed, that path is gone; this service is
 * the host-only fallback that re-parses the `.bpmn`, applies the pending script
 * values through the same addressing the webview uses (`scriptModel.ts` /
 * `modeler.ts#updateScriptContent`), and re-serialises.
 *
 * It compares *parsed values*, never strings, and returns `undefined` when
 * nothing diverged: a round-trip of already-current XML must be a no-op so an
 * untouched, externally-formatted file is never rewritten. This is safe because
 * the webview exports with `saveXML({ format: true })` over the same
 * `bpmn-moddle` writer, so a host round-trip of webview-exported XML is
 * byte-stable.
 */
export class ScriptXmlService {
    // The *promise* is cached (not the resolved instance) so concurrent callers
    // share a single moddle construction rather than racing to build their own.
    private moddlePromise: Promise<ModdleInstance> | undefined;

    /**
     * Applies each update's content to the matching script surface and returns
     * the re-serialised XML — or `undefined` when no update changed a value
     * (so the caller can skip the write entirely).
     */
    async applyScriptContents(
        xml: string,
        updates: ScriptContentUpdate[],
    ): Promise<string | undefined> {
        if (updates.length === 0) {
            return undefined;
        }

        const moddle = await this.getModdle();
        const { rootElement, elementsById } = await moddle.fromXML(xml);

        let changed = false;
        for (const update of updates) {
            if (this.applyOne(elementsById, update)) {
                changed = true;
            }
        }
        if (!changed) {
            return undefined;
        }

        const { xml: serialized } = await moddle.toXML(rootElement, { format: true });
        return serialized;
    }

    /** Applies one update in place; returns whether it actually changed a value. */
    private applyOne(
        elementsById: Record<string, ModdleElement>,
        update: ScriptContentUpdate,
    ): boolean {
        const element = elementsById[update.elementId];
        if (!element) {
            // The element was deleted since the tab opened — nothing to write.
            return false;
        }

        if (update.kind === "script-task") {
            // Unset `script` maps to "" (mirrors `readScriptContent`), so an
            // untouched empty script never counts as a divergence.
            const current = element.script ?? "";
            if (current === update.content) {
                return false;
            }
            element.script = update.content;
            return true;
        }

        const listenerType =
            update.kind === "execution-listener"
                ? "camunda:ExecutionListener"
                : "camunda:TaskListener";
        const listener = this.findListenerAt(element, listenerType, update.listenerIndex);
        if (!listener?.script) {
            // Missing listener or a listener without an inline script — skip,
            // matching the webview's warn-and-skip in `updateScriptContent`.
            return false;
        }
        const current = listener.script.value ?? "";
        if (current === update.content) {
            return false;
        }
        listener.script.value = update.content;
        return true;
    }

    /**
     * Returns the `index`-th listener of `listenerType`, mirroring the upstream
     * properties-panel filtering so indices align with what the user saw.
     */
    private findListenerAt(
        element: ModdleElement,
        listenerType: "camunda:ExecutionListener" | "camunda:TaskListener",
        index: number | undefined,
    ): ModdleListener | undefined {
        if (index === undefined) {
            return undefined;
        }
        const values = element.extensionElements?.values ?? [];
        return values.filter((value) => value.$type === listenerType)[index];
    }

    private getModdle(): Promise<ModdleInstance> {
        if (!this.moddlePromise) {
            this.moddlePromise = this.createModdle();
        }
        return this.moddlePromise;
    }

    /**
     * Constructs a moddle with the Camunda 7 descriptor set — the same
     * extension package the C7 webview registers — via dynamic import so the
     * ~200 KB of moddle/descriptors stay off the eager module graph.
     * Both `bpmn-moddle` and the descriptor JSON are accessed through a
     * `default`-interop fallback so the code compiles under either the
     * bundler's ESM→CJS shape or a native ESM namespace.
     */
    private async createModdle(): Promise<ModdleInstance> {
        const moddleMod = (await import("bpmn-moddle")) as unknown as {
            default?: BpmnModdleFactory;
            BpmnModdle?: BpmnModdleFactory;
        };
        const createBpmnModdle = moddleMod.default ?? moddleMod.BpmnModdle;
        if (typeof createBpmnModdle !== "function") {
            throw new Error(
                "bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.",
            );
        }

        const camundaMod =
            (await import("camunda-bpmn-moddle/resources/camunda.json")) as unknown as {
                default?: unknown;
            };
        const camunda = camundaMod.default ?? camundaMod;

        return createBpmnModdle({ camunda });
    }
}
