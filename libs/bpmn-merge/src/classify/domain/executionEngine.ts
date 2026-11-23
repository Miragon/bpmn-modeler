import type { ExecutionEngine } from "@miragon/bpmn-modeler-diff/domain";
import {
    ENGINE_NAMESPACE,
    detectEngineWithNamespaceFallback,
} from "@miragon/bpmn-modeler-types/engine";

/** The engine whose descriptor parses the document, detected as the modeler detects it. */
export function executionEngineOf(xml: string): ExecutionEngine | undefined {
    const engine = detectEngineWithNamespaceFallback(xml);
    return engine === undefined ? undefined : ENGINE_NAMESPACE[engine].prefix;
}
