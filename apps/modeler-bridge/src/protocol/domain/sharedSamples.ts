import { Command, Query } from "@miragon/bpmn-modeler-shared";

// Plain-object stand-ins for the opaque message payloads. The snapshot only
// records top-level param keys, so the message body's shape is irrelevant — but
// it must be a structural `Command`/`Query` (just `{ type: string }`) and a JSON
// round-trippable plain object (no class instance), which these are.
export const SAMPLE_COMMAND: Command = { type: "GetBpmnFileCommand" };
export const SAMPLE_QUERY: Query = { type: "FormDefaultsQuery" };

export const PLUGIN_APPROVAL_SAMPLE = {
    pluginId: "/ws/.camunda/plugins/resize-tasks",
    contentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
};
