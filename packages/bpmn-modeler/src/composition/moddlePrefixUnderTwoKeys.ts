import type { BpmnFeature } from "../kernel/domain/bpmnFeature";
import { moddlePrefixOf } from "../kernel/domain/featureMerge";

/**
 * The prefix two different keys carry once the features' moddle extensions merge
 * by key, as bpmn-js's own `moddleExtensions` option merges; moddle rejects such
 * a pair, where the kernel's merge would keep the later package. Only the modeler
 * preset keeps that rejection, until plugins are features (#2802 S8).
 */
export function moddlePrefixUnderTwoKeys(features: readonly BpmnFeature[]): string | undefined {
    const byKey: Record<string, object> = Object.assign(
        {},
        ...features.map((feature) => feature.moddleExtensions ?? {}),
    );
    const seen = new Set<string>();
    for (const [key, extension] of Object.entries(byKey)) {
        const prefix = moddlePrefixOf(key, extension);
        if (seen.has(prefix)) {
            return prefix;
        }
        seen.add(prefix);
    }
    return undefined;
}
