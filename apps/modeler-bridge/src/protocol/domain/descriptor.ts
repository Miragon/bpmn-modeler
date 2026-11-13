/**
 * The aggregate of the host↔core RPC surface: {@link METHODS} and the flat
 * {@link PROTOCOL} array pairing every method with its direction, kind, and a
 * representative param (and, for requests, result) fixture. Each feature owns
 * its methods and fixtures in its own `<feature>Protocol.ts` module; this file
 * only puts their groups in the wire order. The TS side owns this contract;
 * the IntelliJ Kotlin host verifies against the derived {@link protocolSnapshot}
 * (committed as `protocol.json`).
 *
 * Drift is caught two ways. Compile-time: each fixture is checked against its
 * named param/result type via `satisfies`, so renaming a field in `types.ts`
 * without updating the fixture is a build error. Runtime: `protocol.spec.ts`
 * pins the method set, directions, and per-method key sets against the snapshot.
 *
 * Adding a method = add it to its feature's `*_METHODS` constant and to one of
 * that feature's entry groups (a new group also goes into {@link PROTOCOL}),
 * then refresh `protocol.json`; the contract test fails until all agree. The
 * IntelliJ `ProtocolHandlerCoverageTest` reads `protocol.json` too: a Core→Host
 * method needs its Kotlin handler, a Host→Core method a Kotlin sender, both
 * must use the param keys listed here, and a Kotlin reply the result keys.
 */

import {
    ADD_ONS_CORE_TO_HOST_NOTIFICATIONS,
    ADD_ONS_CORE_TO_HOST_REQUESTS,
    ADD_ONS_HOST_TO_CORE_NOTIFICATIONS,
    ADD_ONS_METHODS,
} from "./addOnsProtocol";
import {
    BPMN_PLUGINS_CORE_TO_HOST_REQUESTS,
    BPMN_PLUGINS_HOST_TO_CORE_NOTIFICATIONS,
    BPMN_PLUGINS_METHODS,
} from "./bpmnPluginsProtocol";
import {
    DEPLOYMENT_COMMAND_NOTIFICATIONS,
    DEPLOYMENT_CORE_TO_HOST_NOTIFICATIONS,
    DEPLOYMENT_CORE_TO_HOST_REQUESTS,
    DEPLOYMENT_HOST_TO_CORE_NOTIFICATIONS,
    DEPLOYMENT_METHODS,
} from "./deploymentProtocol";
import {
    DIFF_CORE_TO_HOST_NOTIFICATIONS,
    DIFF_HOST_TO_CORE_NOTIFICATIONS,
    DIFF_METHODS,
} from "./diffProtocol";
import {
    EDITOR_SESSION_CORE_TO_HOST_NOTIFICATIONS,
    EDITOR_SESSION_CORE_TO_HOST_REQUESTS,
    EDITOR_SESSION_HOST_TO_CORE_NOTIFICATIONS,
    EDITOR_SESSION_METHODS,
} from "./editorSessionProtocol";
import {
    ACTION_NOTICE_REQUESTS,
    HOST_INPUT_REQUESTS,
    KERNEL_CORE_TO_HOST_NOTIFICATIONS,
    KERNEL_HOST_TO_CORE_NOTIFICATIONS,
    KERNEL_METHODS,
    TEMPLATE_PREFERENCE_REQUESTS,
} from "./kernelProtocol";
import {
    MODELER_COMMAND_NOTIFICATIONS,
    MODELER_CORE_TO_HOST_REQUESTS,
    MODELER_HOST_TO_CORE_NOTIFICATIONS,
    MODELER_METHODS,
} from "./modelerProtocol";
import {
    MODELER_SETTINGS_CORE_TO_HOST_REQUESTS,
    MODELER_SETTINGS_METHODS,
} from "./modelerSettingsProtocol";
import { Direction, Kind, ProtocolEntry, ReplyWait } from "./protocolEntry";
import {
    SCRIPT_TASK_CORE_TO_HOST_NOTIFICATIONS,
    SCRIPT_TASK_HOST_TO_CORE_NOTIFICATIONS,
    SCRIPT_TASK_METHODS,
} from "./scriptTaskProtocol";
import {
    TEMPLATE_MARKETPLACE_CORE_TO_HOST_REQUESTS,
    TEMPLATE_MARKETPLACE_HOST_TO_CORE_NOTIFICATIONS,
    TEMPLATE_MARKETPLACE_METHODS,
} from "./templateMarketplaceProtocol";

/**
 * Ergonomic name constants for call-sites (`METHODS.sessionRegister`). The
 * contract test asserts that they name exactly the methods of {@link PROTOCOL}.
 */
export const METHODS = {
    ...EDITOR_SESSION_METHODS,
    ...KERNEL_METHODS,
    ...MODELER_METHODS,
    ...MODELER_SETTINGS_METHODS,
    ...DIFF_METHODS,
    ...DEPLOYMENT_METHODS,
    ...SCRIPT_TASK_METHODS,
    ...TEMPLATE_MARKETPLACE_METHODS,
    ...BPMN_PLUGINS_METHODS,
    ...ADD_ONS_METHODS,
} as const;

/**
 * Every RPC method, in a fixed order. `paramsFixture`/`resultFixture` are bound
 * to their named types via `satisfies` (compile-time drift guard); `as const`
 * keeps `method`/`direction`/`kind` literal so the union types below can be
 * derived and filtered by direction.
 */
export const PROTOCOL = [
    // ── Host → Core notifications ────────────────────────────────────────────
    ...EDITOR_SESSION_HOST_TO_CORE_NOTIFICATIONS,
    ...MODELER_HOST_TO_CORE_NOTIFICATIONS,
    ...DIFF_HOST_TO_CORE_NOTIFICATIONS,
    ...DEPLOYMENT_HOST_TO_CORE_NOTIFICATIONS,
    ...SCRIPT_TASK_HOST_TO_CORE_NOTIFICATIONS,
    ...TEMPLATE_MARKETPLACE_HOST_TO_CORE_NOTIFICATIONS,
    ...MODELER_COMMAND_NOTIFICATIONS,
    ...DEPLOYMENT_COMMAND_NOTIFICATIONS,
    ...BPMN_PLUGINS_HOST_TO_CORE_NOTIFICATIONS,
    ...KERNEL_HOST_TO_CORE_NOTIFICATIONS,
    ...ADD_ONS_HOST_TO_CORE_NOTIFICATIONS,

    // ── Core → Host requests ─────────────────────────────────────────────────
    ...EDITOR_SESSION_CORE_TO_HOST_REQUESTS,
    ...HOST_INPUT_REQUESTS,
    ...DEPLOYMENT_CORE_TO_HOST_REQUESTS,
    ...TEMPLATE_MARKETPLACE_CORE_TO_HOST_REQUESTS,
    ...MODELER_SETTINGS_CORE_TO_HOST_REQUESTS,
    ...MODELER_CORE_TO_HOST_REQUESTS,
    ...ACTION_NOTICE_REQUESTS,
    ...BPMN_PLUGINS_CORE_TO_HOST_REQUESTS,
    ...TEMPLATE_PREFERENCE_REQUESTS,
    ...ADD_ONS_CORE_TO_HOST_REQUESTS,

    // ── Core → Host notifications ────────────────────────────────────────────
    ...EDITOR_SESSION_CORE_TO_HOST_NOTIFICATIONS,
    ...KERNEL_CORE_TO_HOST_NOTIFICATIONS,
    ...DIFF_CORE_TO_HOST_NOTIFICATIONS,
    ...DEPLOYMENT_CORE_TO_HOST_NOTIFICATIONS,
    ...SCRIPT_TASK_CORE_TO_HOST_NOTIFICATIONS,
    ...ADD_ONS_CORE_TO_HOST_NOTIFICATIONS,
] as const satisfies readonly ProtocolEntry[];

/** Short, because the caller falls back to another surface once it passes. */
export const HOST_SHOW_REPLY_DEADLINE_MS = 10_000;

/** Generous, because host work can queue behind a modal dialog or a keychain prompt. */
export const HOST_WORK_REPLY_DEADLINE_MS = 120_000;

const DEADLINE_MS_BY_REPLY_WAIT: Readonly<Partial<Record<ReplyWait, number>>> = {
    hostWork: HOST_WORK_REPLY_DEADLINE_MS,
    hostShow: HOST_SHOW_REPLY_DEADLINE_MS,
};

const REPLY_DEADLINES: ReadonlyMap<string, number | undefined> = new Map(
    PROTOCOL.flatMap((entry) =>
        "replyWait" in entry
            ? [[entry.method, DEADLINE_MS_BY_REPLY_WAIT[entry.replyWait]] as const]
            : [],
    ),
);

/** How long a request to `method` waits for its reply; `undefined` waits until the host answers. */
export function replyDeadlineMs(method: string): number | undefined {
    return REPLY_DEADLINES.get(method);
}

/** Language-neutral, per-method key contract — what the Kotlin host verifies against. */
export interface ProtocolSnapshotEntry {
    method: string;
    direction: Direction;
    kind: Kind;
    /** Sorted top-level param keys actually carried on the wire. */
    paramKeys: string[];
    /** Sorted top-level result keys; absent for notifications and void requests. */
    resultKeys?: string[];
    /** How long the core waits for the reply; absent where it waits until the host answers. */
    replyDeadlineMs?: number;
}

/**
 * Projects {@link PROTOCOL} to the JSON-serializable, key-level contract stored
 * in `protocol.json`. Keys (not full types) are the part a different-language
 * host can check — the Kotlin silent break is a `params.get("editorId")`
 * field-name mismatch, which a key set catches and a type signature wouldn't.
 */
export function protocolSnapshot(): ProtocolSnapshotEntry[] {
    return PROTOCOL.map((entry) => {
        const snapshot: ProtocolSnapshotEntry = {
            method: entry.method,
            direction: entry.direction,
            kind: entry.kind,
            paramKeys: Object.keys(entry.paramsFixture).sort(),
        };
        if ("resultFixture" in entry && entry.resultFixture) {
            snapshot.resultKeys = Object.keys(entry.resultFixture).sort();
        }
        const deadlineMs = replyDeadlineMs(entry.method);
        if (deadlineMs !== undefined) snapshot.replyDeadlineMs = deadlineMs;
        return snapshot;
    });
}

/** The three real groups; there is no Host→Core request (the contract test enforces it). */
const TABLE_GROUPS = [
    { direction: "hostToCore", kind: "notification", title: "Host → Core (notifications)" },
    { direction: "coreToHost", kind: "request", title: "Core → Host (requests)" },
    { direction: "coreToHost", kind: "notification", title: "Core → Host (notifications)" },
] as const;

/**
 * Renders the canonical, human-readable protocol table from {@link PROTOCOL} so
 * the prose in `bridge.ts` can never rot against the real surface. Kept
 * branch-light (filter + map + join, no per-method special-casing) so the whole
 * renderer is covered by asserting its full output once.
 */
export function protocolTable(): string {
    return TABLE_GROUPS.map((group) => {
        const methods = PROTOCOL.filter(
            (entry) => entry.direction === group.direction && entry.kind === group.kind,
        ).map((entry) => `  ${entry.method}`);
        return [`${group.title}:`, ...methods].join("\n");
    }).join("\n\n");
}
