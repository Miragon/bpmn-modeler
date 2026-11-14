import { loadBpmnModdle, moddleDescriptor } from "@miragon/bpmn-modeler-diff";
import { resolveScriptWriteTarget, type ScriptKind } from "@miragon/bpmn-modeler-types";

/**
 * One script surface's new content, addressed exactly as the webview addresses
 * it (see `libs/modeler-types/src/scriptSurface.ts`): element id + kind, plus
 * the filtered listener index for the two listener kinds (`undefined` for a
 * script task).
 */
export interface ScriptContentUpdate {
    elementId: string;
    kind: ScriptKind;
    listenerIndex: number | undefined;
    content: string;
}

// One shape for both holders, so a target's property reads and writes as a string.
interface ScriptProperties {
    script?: string;
    scriptFormat?: string;
    value?: string;
}

/** The structural subset of a parsed BPMN element a script body can live on. */
interface ScriptHolder extends ScriptProperties {
    $type: string;
    extensionElements?: { values?: { $type: string; script?: ScriptProperties }[] };
}

interface ModdleInstance {
    fromXML(xml: string): Promise<{
        rootElement: unknown;
        elementsById: Record<string, ScriptHolder | undefined>;
    }>;
    toXML(element: unknown, options?: { format?: boolean }): Promise<{ xml: string }>;
}

/**
 * Writes inline-script content directly into BPMN XML on the host, without a
 * live modeler.
 *
 * The extension host has no bpmn-js instance of its own — script keystrokes
 * normally stream into the *webview's* model. When the diagram tab is closed
 * before a buffered edit can be replayed, that path is gone; this service is
 * the host-only fallback that re-parses the `.bpmn`, applies the pending script
 * values through the same addressing the webview uses
 * (`resolveScriptWriteTarget`), and re-serialises.
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
        elementsById: Record<string, ScriptHolder | undefined>,
        update: ScriptContentUpdate,
    ): boolean {
        const element = elementsById[update.elementId];
        const target =
            element &&
            resolveScriptWriteTarget(element, update.kind, update.listenerIndex, "content");
        if (!target) {
            return false;
        }
        // Unset maps to "" (mirrors `readScriptContent`), so an untouched empty
        // script never counts as a divergence.
        const current = target.moddleElement[target.propertyName] ?? "";
        if (current === update.content) {
            return false;
        }
        target.moddleElement[target.propertyName] = update.content;
        return true;
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
     */
    private async createModdle(): Promise<ModdleInstance> {
        const createBpmnModdle = await loadBpmnModdle();
        const camunda = moddleDescriptor(
            await import("camunda-bpmn-moddle/resources/camunda.json"),
        );
        return createBpmnModdle({ camunda });
    }
}
