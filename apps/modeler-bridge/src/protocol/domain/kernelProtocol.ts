import { ProtocolEntry } from "./protocolEntry";
import { TEMPLATE_PREFERENCES_SAMPLE } from "./sharedSamples";
import {
    ActionNoticeShowParams,
    ActionNoticeShowResult,
    ClipboardReadResult,
    ClipboardWriteParams,
    ConfirmShowParams,
    ConfirmShowResult,
    EmptyParams,
    NotifierLogParams,
    NotifierMessageParams,
    NotifierOpenDocumentParams,
    NotifierProgressParams,
    PickerShowParams,
    PickerShowResult,
    StatusBarUpdateParams,
    TemplatePreferencesChangeParams,
    WorkspaceTrustSnapshot,
} from "./types";

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
export const HOST_INPUT_REQUESTS = [
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

export const ACTION_NOTICE_REQUESTS = [
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

export const TEMPLATE_PREFERENCE_REQUESTS = [
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
