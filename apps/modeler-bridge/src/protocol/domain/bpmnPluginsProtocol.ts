import { ProtocolEntry } from "./protocolEntry";
import { PLUGIN_APPROVAL_SAMPLE } from "./sharedSamples";
import { EmptyParams, PluginApprovalsChangeParams, PluginApprovalsSnapshot } from "./types";

export const BPMN_PLUGINS_METHODS = {
    pluginApprovalsDidChange: "pluginApprovals/didChange",
    pluginApprovalsChange: "pluginApprovals/change",
    pluginApprovalsRead: "pluginApprovals/read",
} as const;

export const BPMN_PLUGINS_HOST_TO_CORE_NOTIFICATIONS = [
    {
        method: BPMN_PLUGINS_METHODS.pluginApprovalsDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            approvals: [PLUGIN_APPROVAL_SAMPLE],
            revision: 7,
        } satisfies PluginApprovalsSnapshot,
    },
] as const satisfies readonly ProtocolEntry[];

export const BPMN_PLUGINS_CORE_TO_HOST_REQUESTS = [
    // The host merges the change into the list it stores, pushes that list to
    // every running bridge in `pluginApprovals/didChange`, then answers with it.
    {
        method: BPMN_PLUGINS_METHODS.pluginApprovalsChange,
        direction: "coreToHost",
        kind: "request",
        replyWait: "syncedWrite",
        paramsFixture: {
            allow: [PLUGIN_APPROVAL_SAMPLE],
            revoke: ["/ws/.camunda/plugins/reduced-palette"],
        } satisfies PluginApprovalsChangeParams,
        resultFixture: {
            approvals: [PLUGIN_APPROVAL_SAMPLE],
            revision: 7,
        } satisfies PluginApprovalsSnapshot,
    },
    // The host's stored list, never a mirror; a read, so under the host-work deadline.
    {
        method: BPMN_PLUGINS_METHODS.pluginApprovalsRead,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {} satisfies EmptyParams,
        resultFixture: {
            approvals: [PLUGIN_APPROVAL_SAMPLE],
            revision: 7,
        } satisfies PluginApprovalsSnapshot,
    },
] as const satisfies readonly ProtocolEntry[];
