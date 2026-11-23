import { type ElementIdReviewView, RawModelerSettings } from "@miragon/bpmn-modeler-core";

import { EditorRefParams } from "./editorSessionProtocol";
import { EmptyParams, ProtocolEntry } from "./protocolEntry";

/** `settings/didChange` — a fresh `miragon.bpmnModeler.*` snapshot from the host. */
export interface SettingsDidChangeParams {
    settings: RawModelerSettings;
}

/**
 * `migration/migrateAll` — migrate every `.bpmn` under a workspace root to a
 * user-picked engine version. Carries the root explicitly because the action can
 * fire with no editor open, so no `session/register` has registered it yet and
 * `NodeWorkspace.findFiles` only globs registered roots. (`modeler/changeEngineVersion`
 * needs no dedicated params — it reuses {@link EditorRefParams}.)
 */
export interface MigrateAllParams {
    workspaceRoot: string;
}

/** `elementIdReview/setChecked` — the user ticked or cleared these rows in the host's panel. */
export interface ElementIdReviewSetCheckedParams {
    ids: string[];
    checked: boolean;
}

/** `elementIdReview/reveal` — the user clicked a row; the core centres its element. */
export interface ElementIdReviewRevealParams {
    elementId: string;
}

/** `elementIdReview/show` — what the host's element ID review panel shows. */
export interface ElementIdReviewShowParams {
    view: ElementIdReviewView;
}

/**
 * `settings/setLintingEnabled` — the user's lint choice from the webview or the
 * BPMNlint widget. The host stores it and pushes the new snapshot to every
 * bridge before it acks an empty reply.
 */
export interface SettingsSetLintingEnabledParams {
    enabled: boolean;
}

export const MODELER_METHODS = {
    settingsDidChange: "settings/didChange",
    modelerChangeEngineVersion: "modeler/changeEngineVersion",
    modelerChangeLanguage: "modeler/changeLanguage",
    lintingToggle: "linting/toggle",
    migrationMigrateAll: "migration/migrateAll",
    layoutFormat: "layout/format",
    layoutCleanup: "layout/cleanup",
    elementIdsGenerate: "elementIds/generate",
    elementIdReviewSetChecked: "elementIdReview/setChecked",
    elementIdReviewApply: "elementIdReview/apply",
    elementIdReviewDiscard: "elementIdReview/discard",
    elementIdReviewReveal: "elementIdReview/reveal",
    elementIdReviewShow: "elementIdReview/show",
    elementIdReviewFocus: "elementIdReview/focus",
    elementIdReviewClose: "elementIdReview/close",
    settingsSetLintingEnabled: "settings/setLintingEnabled",
} as const;

export const MODELER_HOST_TO_CORE_NOTIFICATIONS = [
    {
        method: MODELER_METHODS.settingsDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { settings: {} } satisfies SettingsDidChangeParams,
    },
] as const satisfies readonly ProtocolEntry[];

/** The modeler's IDE actions, sent when the user runs one. */
export const MODELER_COMMAND_NOTIFICATIONS = [
    {
        method: MODELER_METHODS.modelerChangeEngineVersion,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1" } satisfies EditorRefParams,
    },
    {
        method: MODELER_METHODS.modelerChangeLanguage,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.lintingToggle,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.migrationMigrateAll,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies MigrateAllParams,
    },
    {
        method: MODELER_METHODS.layoutFormat,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.layoutCleanup,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.elementIdsGenerate,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.elementIdReviewSetChecked,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            ids: ["Activity_1"],
            checked: false,
        } satisfies ElementIdReviewSetCheckedParams,
    },
    {
        method: MODELER_METHODS.elementIdReviewApply,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.elementIdReviewDiscard,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.elementIdReviewReveal,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { elementId: "Participant_1" } satisfies ElementIdReviewRevealParams,
    },
] as const satisfies readonly ProtocolEntry[];

/** What the host's element ID review panel shows, and when the review is over. */
export const MODELER_CORE_TO_HOST_NOTIFICATIONS = [
    {
        method: MODELER_METHODS.elementIdReviewShow,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {
            view: {
                title: "order.bpmn",
                message: "1 of 1 IDs will change.",
                renameCount: 1,
                groups: [
                    {
                        id: "activity",
                        label: "Activities",
                        checked: true,
                        collapsed: false,
                        rows: [
                            {
                                id: "Activity_1",
                                label: "Check stock",
                                description: "Activity_1 → serviceTask_checkStock",
                                tooltip: "Check stock: Activity_1 becomes serviceTask_checkStock",
                                checked: true,
                                revealId: "Activity_1",
                            },
                        ],
                    },
                ],
            },
        } satisfies ElementIdReviewShowParams,
    },
    {
        method: MODELER_METHODS.elementIdReviewFocus,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.elementIdReviewClose,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
] as const satisfies readonly ProtocolEntry[];

export const MODELER_CORE_TO_HOST_REQUESTS = [
    {
        method: MODELER_METHODS.settingsSetLintingEnabled,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: { enabled: false } satisfies SettingsSetLintingEnabledParams,
    },
] as const satisfies readonly ProtocolEntry[];
