import type { ExecutionEngine } from "@miragon/bpmn-modeler-diff";
import { type Engine, detectEngineWithNamespaceFallback } from "@miragon/bpmn-modeler-types/engine";

const EXECUTION_ENGINES: Readonly<Record<Engine, ExecutionEngine>> = {
    c7: "camunda",
    c8: "zeebe",
};

/** The engine whose descriptor parses the document, detected as the modeler detects it. */
export function executionEngineOf(xml: string): ExecutionEngine | undefined {
    const engine = detectEngineWithNamespaceFallback(xml);
    return engine === undefined ? undefined : EXECUTION_ENGINES[engine];
}
