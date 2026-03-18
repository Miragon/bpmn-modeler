/**
 * Pure domain types and builder for the persisted implementation map.
 *
 * The persisted map is a JSON file that captures the process-to-code mapping
 * for a single BPMN file. It lives under
 * `<configFolder>/implementation-map/<bpmnFileName>.json` and uses
 * workspace-relative paths so the file is portable and committable.
 */
import { ImplementationKind } from "./implementation";

/**
 * Root structure of the persisted JSON file.
 *
 * One file is created per BPMN file, containing all resolved (and unresolved)
 * implementation references along with I/O parameter metadata.
 */
export interface PersistedProcessMap {
    /** JSON schema URL for validation. */
    readonly $schema: string;
    /** Schema version — allows future migrations. */
    readonly version: 1;
    /** BPMN process ID extracted from `<bpmn:process id="...">`. */
    readonly processId: string;
    /** Camunda engine variant the BPMN was authored for. */
    readonly engine: "c7" | "c8";
    /** ISO 8601 timestamp of last map generation. */
    readonly lastUpdated: string;
    /** Activity entries keyed by BPMN element ID. */
    readonly activities: Record<string, PersistedActivityEntry>;
}

/**
 * A single activity (service/send/business-rule task) in the persisted map.
 */
export interface PersistedActivityEntry {
    /** BPMN element `name` attribute. */
    readonly name: string;
    /** Implementation reference details. */
    readonly implementation: PersistedImplementation;
    /** Input parameters extracted from the BPMN XML. */
    readonly inputs: PersistedVariable[];
    /** Output parameters extracted from the BPMN XML. */
    readonly outputs: PersistedVariable[];
}

/**
 * Persisted representation of an implementation reference.
 */
export interface PersistedImplementation {
    /** Discriminator for the reference type. */
    readonly kind: ImplementationKind;
    /** Raw identifier value from the XML. */
    readonly identifier: string;
    /** Workspace-relative file path, or `null` if unresolved. */
    readonly filePath: string | null;
    /** Whether the file path points to an existing file. */
    readonly resolved: boolean;
}

/**
 * An I/O variable extracted from the BPMN XML.
 */
export interface PersistedVariable {
    /** Parameter name. */
    readonly name: string;
    /** Raw expression / value from the XML. */
    readonly value?: string;
}

/**
 * Input data required by {@link buildPersistedMap} to assemble a persisted map.
 */
export interface BuildPersistedMapInput {
    /** BPMN process ID. */
    readonly processId: string;
    /** Detected engine variant. */
    readonly engine: "c7" | "c8";
    /** Activity details keyed by BPMN element ID. */
    readonly activities: Record<
        string,
        {
            readonly name: string;
            readonly kind: ImplementationKind;
            readonly identifier: string;
            readonly filePath: string | null;
            readonly resolved: boolean;
            readonly inputs: PersistedVariable[];
            readonly outputs: PersistedVariable[];
        }
    >;
}

/** Placeholder schema URL — can be replaced with a real URL once published. */
const SCHEMA_URL =
    "https://raw.githubusercontent.com/Miragon/bpmn-vscode-modeler/main/schemas/implementation-map.v1.json";

/**
 * Assembles a {@link PersistedProcessMap} from in-memory data.
 *
 * Pure function with no side effects — fully testable.
 *
 * @param input Aggregated data from the XML parser and implementation map.
 * @returns A complete persisted map ready for JSON serialisation.
 */
export function buildPersistedMap(input: BuildPersistedMapInput): PersistedProcessMap {
    const activities: Record<string, PersistedActivityEntry> = {};

    for (const [activityId, data] of Object.entries(input.activities)) {
        activities[activityId] = {
            name: data.name,
            implementation: {
                kind: data.kind,
                identifier: data.identifier,
                filePath: data.filePath,
                resolved: data.resolved,
            },
            inputs: data.inputs,
            outputs: data.outputs,
        };
    }

    return {
        $schema: SCHEMA_URL,
        version: 1,
        processId: input.processId,
        engine: input.engine,
        lastUpdated: new Date().toISOString(),
        activities,
    };
}
