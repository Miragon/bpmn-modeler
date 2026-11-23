import {
    ActionNoticeTone,
    ProjectScope,
    StatusSlot,
    StatusView,
    TemplateSwitch,
} from "@miragon/bpmn-modeler-core";

import { EmptyParams, ProtocolEntry } from "./protocolEntry";

/**
 * `workspaceTrust/didChange` — whether the user trusts the project, pushed
 * after the IDE's trust changed and after every spawn. `revision` grows with
 * every read, so the mirror keeps the newest of what its queues apply.
 */
export interface WorkspaceTrustSnapshot {
    trusted: boolean;
    revision: number;
}

/** One scope's template switches as the host stores them, with that scope's revision. */
export interface TemplatePreferencesScopeSnapshot {
    disabled: TemplateSwitch[];
    revision: number;
}

/**
 * `templatePreferences/didChange` — both scopes' switches as the host stores
 * them for this bridge's project, pushed after a change: an `allProjects`
 * change to every running bridge of the IDE, a `project` change to the
 * project's own. Also the result of `templatePreferences/change` and
 * `templatePreferences/read`. Each scope's `revision` grows with every list
 * the host stores for it, so a mirror keeps the newest per scope.
 */
export interface TemplatePreferencesSnapshot {
    project: TemplatePreferencesScopeSnapshot;
    allProjects: TemplatePreferencesScopeSnapshot;
}

/** `templatePreferences/change` — the host merges it into the scope's stored list, so no switch another writer stored is lost. */
export interface TemplatePreferencesChangeParams {
    scope: ProjectScope;
    disable: TemplateSwitch[];
    enable: TemplateSwitch[];
}

/** One row offered to the host popup: a label plus optional greyed detail. */
interface PickItem {
    label: string;
    description?: string;
}

/** `picker/show` — round-trip one native chooser; result is the chosen indices. */
export interface PickerShowParams {
    title?: string;
    placeholder: string;
    canPickMany: boolean;
    items: PickItem[];
}
export interface PickerShowResult {
    selected?: number[] | null;
}

/**
 * `confirm/show` — a modal yes/no the host renders natively.
 *
 * A request rather than a notification because the core has to wait for the
 * answer before deleting anything; requests only run core→host, which is the
 * direction needed here.
 *
 * `details` arrives as the core's `ConfirmRequest` holds it, already
 * summarised, so the host renders it verbatim and never shortens it.
 */
export interface ConfirmShowParams {
    title: string;
    confirmLabel: string;
    details: string[];
}
export interface ConfirmShowResult {
    confirmed?: boolean;
}

/** `clipboard/read` — the host reads the system clipboard on the core's behalf. */
export interface ClipboardReadResult {
    text?: string;
}

/**
 * `actionNotice/show` — a non-modal notification with one button per label,
 * in order. The result names the clicked button by its index; no index means
 * the user dismissed the notification.
 */
export interface ActionNoticeShowParams {
    tone: ActionNoticeTone;
    message: string;
    labels: string[];
}
export interface ActionNoticeShowResult {
    chosen?: number;
}

/** `clipboard/write` — fire-and-forget system-clipboard write. */
export interface ClipboardWriteParams {
    text: string;
}

/**
 * `notifier/showInfo`, `notifier/showWarning`, `notifier/showError` — a balloon
 * with the core's text as it is, including the context line `notifyError` adds.
 */
interface NotifierMessageParams {
    message: string;
}

/** `notifier/openDocument` — reveal a file in the host. */
interface NotifierOpenDocumentParams {
    path: string;
}

/**
 * `notifier/log` — a leveled line to the IDE log/console. `message` is the whole
 * line: the core tags a line a webview forwarded (`[webview]` or
 * `[webview:<source>]`), so the host adds no origin label.
 */
interface NotifierLogParams {
    level: "debug" | "info" | "warn" | "error";
    message: string;
}

/** `notifier/progressStart`, `notifier/progressEnd` — bracket a host spinner. */
export interface NotifierProgressParams {
    title: string;
}

/** `statusBar/update` — what one status slot shows, or `null` to hide the slot. */
export interface StatusBarUpdateParams {
    slot: StatusSlot;
    view: StatusView | null;
}

export const TEMPLATE_PREFERENCES_SAMPLE = {
    project: {
        disabled: [{ source: "configFolder:shop/.camunda", templateId: 'mail#2@"v"' }],
        revision: 3,
    },
    allProjects: {
        disabled: [{ source: "marketplace:github:github.com/acme/templates" }],
        revision: 7,
    },
} satisfies TemplatePreferencesSnapshot;

export const KERNEL_METHODS = {
    templatePreferencesDidChange: "templatePreferences/didChange",
    workspaceTrustDidChange: "workspaceTrust/didChange",
    pickerShow: "picker/show",
    confirmShow: "confirm/show",
    clipboardRead: "clipboard/read",
    actionNoticeShow: "actionNotice/show",
    templatePreferencesChange: "templatePreferences/change",
    templatePreferencesRead: "templatePreferences/read",
    clipboardWrite: "clipboard/write",
    notifierShowInfo: "notifier/showInfo",
    notifierShowWarning: "notifier/showWarning",
    notifierShowError: "notifier/showError",
    notifierOpenConsole: "notifier/openConsole",
    notifierOpenDocument: "notifier/openDocument",
    notifierLog: "notifier/log",
    notifierProgressStart: "notifier/progressStart",
    notifierProgressEnd: "notifier/progressEnd",
    statusBarUpdate: "statusBar/update",
} as const;

export const KERNEL_HOST_TO_CORE_NOTIFICATIONS = [
    // An allProjects change goes to every running bridge of the IDE, a project
    // change to the project's own; each carries both scopes of that project.
    {
        method: KERNEL_METHODS.templatePreferencesDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: TEMPLATE_PREFERENCES_SAMPLE,
    },
    {
        method: KERNEL_METHODS.workspaceTrustDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { trusted: false, revision: 5 } satisfies WorkspaceTrustSnapshot,
    },
] as const satisfies readonly ProtocolEntry[];

/** The requests that ask the host for an answer: a pick, a confirmation, the clipboard's text. */
export const KERNEL_HOST_INPUT_REQUESTS = [
    {
        method: KERNEL_METHODS.pickerShow,
        direction: "coreToHost",
        kind: "request",
        replyWait: "prompt",
        paramsFixture: {
            title: "Pick",
            placeholder: "Pick one",
            canPickMany: false,
            items: [{ label: "a", description: "/a" }],
        } satisfies PickerShowParams,
        resultFixture: { selected: [0] } satisfies PickerShowResult,
    },
    {
        method: KERNEL_METHODS.confirmShow,
        direction: "coreToHost",
        kind: "request",
        replyWait: "prompt",
        paramsFixture: {
            title: "Remove 2 leftover item(s)?",
            confirmLabel: "Clean Up",
            details: ["bpmndi:BPMNShape without a model element"],
        } satisfies ConfirmShowParams,
        resultFixture: { confirmed: true } satisfies ConfirmShowResult,
    },
    {
        method: KERNEL_METHODS.clipboardRead,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {} satisfies EmptyParams,
        resultFixture: { text: "copied" } satisfies ClipboardReadResult,
    },
] as const satisfies readonly ProtocolEntry[];

export const KERNEL_ACTION_NOTICE_REQUESTS = [
    {
        method: KERNEL_METHODS.actionNoticeShow,
        direction: "coreToHost",
        kind: "request",
        replyWait: "prompt",
        paramsFixture: {
            tone: "info",
            message: "1 BPMN plugin in this workspace is not allowed yet.",
            labels: ["Review…"],
        } satisfies ActionNoticeShowParams,
        // `chosen` is absent when the user dismissed the notification.
        resultFixture: { chosen: 0 } satisfies ActionNoticeShowResult,
    },
] as const satisfies readonly ProtocolEntry[];

export const KERNEL_TEMPLATE_PREFERENCE_REQUESTS = [
    // The host merges the change into the scope's stored list, pushes the
    // lists in `templatePreferences/didChange`, then answers with both.
    {
        method: KERNEL_METHODS.templatePreferencesChange,
        direction: "coreToHost",
        kind: "request",
        replyWait: "syncedWrite",
        paramsFixture: {
            scope: "project",
            disable: [{ source: "configFolder:shop/.camunda", templateId: 'mail#2@"v"' }],
            enable: [{ source: "configFolder:shop/.camunda" }],
        } satisfies TemplatePreferencesChangeParams,
        resultFixture: TEMPLATE_PREFERENCES_SAMPLE,
    },
    // Both scopes as the host stores them, never a mirror; a read, so under the host-work deadline.
    {
        method: KERNEL_METHODS.templatePreferencesRead,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {} satisfies EmptyParams,
        resultFixture: TEMPLATE_PREFERENCES_SAMPLE,
    },
] as const satisfies readonly ProtocolEntry[];

export const KERNEL_CORE_TO_HOST_NOTIFICATIONS = [
    {
        method: KERNEL_METHODS.clipboardWrite,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { text: "copied" } satisfies ClipboardWriteParams,
    },
    {
        method: KERNEL_METHODS.notifierShowInfo,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: "ready" } satisfies NotifierMessageParams,
    },
    {
        method: KERNEL_METHODS.notifierShowWarning,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: "careful" } satisfies NotifierMessageParams,
    },
    {
        method: KERNEL_METHODS.notifierShowError,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: "boom" } satisfies NotifierMessageParams,
    },
    {
        method: KERNEL_METHODS.notifierOpenConsole,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: KERNEL_METHODS.notifierOpenDocument,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { path: "/a.bpmn" } satisfies NotifierOpenDocumentParams,
    },
    {
        method: KERNEL_METHODS.notifierLog,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { level: "info", message: "hi" } satisfies NotifierLogParams,
    },
    {
        method: KERNEL_METHODS.notifierProgressStart,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { title: "Working" } satisfies NotifierProgressParams,
    },
    {
        method: KERNEL_METHODS.notifierProgressEnd,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { title: "Working" } satisfies NotifierProgressParams,
    },
    {
        method: KERNEL_METHODS.statusBarUpdate,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {
            slot: "engineVersion",
            view: {
                text: "Camunda 7 (7.20)",
                icon: "engine",
                tooltip: "Click to change engine version",
                tone: "neutral",
                action: "changeEngineVersion",
                transient: false,
            },
        } satisfies StatusBarUpdateParams,
    },
] as const satisfies readonly ProtocolEntry[];
