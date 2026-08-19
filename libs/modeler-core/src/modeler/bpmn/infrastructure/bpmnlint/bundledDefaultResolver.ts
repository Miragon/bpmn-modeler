/**
 * A `StaticResolver` over the bundled default lint layers, mirroring
 * {@link builtinResolver} for bpmnlint's own rules. It backs the zero-config
 * default only (see {@link CompositeResolver}) — never a workspace `.bpmnlintrc`,
 * so a project's own `plugin:camunda-compat/*` still resolves against its copy.
 *
 * Structure mirrors how the default is assembled, grouped so it stays legible:
 * - MIRAGON — our own (currently empty) opinion layer.
 * - CONFIGS — the two pinned camunda-compat engine configs, one per platform.
 *   A config is plain data on the imported plugin index, hence a direct lookup.
 * - C7_RULES / C8_RULES — the rule *modules* each of those two configs references.
 *   A rule is a separate module the plugin only names by a require-path string a
 *   bundler cannot follow, so — like {@link builtinResolver} — each is a static
 *   import. They are split by engine: `camunda-platform-7-24` references only
 *   `history-time-to-live`; every other entry belongs to `camunda-cloud-8-10`.
 *
 * Staying up to date: this list is hand-maintained, but not by eye — the
 * `bundledDefaultResolver` spec iterates both pinned configs' referenced rules and
 * asserts each resolves here, so a `bpmnlint-plugin-camunda-compat` bump that adds
 * or renames a referenced rule fails the build until this file is updated. Keys use
 * the full `bpmnlint-plugin-*` name because bpmnlint normalises a plugin's short
 * name before calling the resolver.
 */
import type { Resolver } from "./CompositeResolver";

import StaticResolver from "bpmnlint/lib/resolver/static-resolver";

import camundaCompat from "bpmnlint-plugin-camunda-compat";

import { miragonRecommended } from "./miragonConfig";

// C7 rules — referenced by `camunda-platform-7-24`.
import rule_history_time_to_live from "bpmnlint-plugin-camunda-compat/rules/camunda-platform/history-time-to-live";

// C8 rules — referenced by `camunda-cloud-8-10`.
import rule_ad_hoc_sub_process from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/ad-hoc-sub-process";
import rule_agent_fromai_contract from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/agent-fromai-contract";
import rule_agent_tool_documentation from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/agent-tool-documentation";
import rule_agent_tool_output_key from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/agent-tool-output-key";
import rule_before_all_execution_listener from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/before-all-execution-listener";
import rule_called_element from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/called-element";
import rule_cancel_execution_listener from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/cancel-execution-listener";
import rule_connector_properties from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/connector-properties";
import rule_duplicate_execution_listener_headers from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/duplicate-execution-listener-headers";
import rule_duplicate_execution_listeners from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/duplicate-execution-listeners";
import rule_duplicate_task_headers from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/duplicate-task-headers";
import rule_element_type from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/element-type";
import rule_error_reference from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/error-reference";
import rule_escalation_boundary_event_attached_to_ref from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/escalation-boundary-event-attached-to-ref";
import rule_escalation_reference from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/escalation-reference";
import rule_event_based_gateway_target from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/event-based-gateway-target";
import rule_executable_process from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/executable-process";
import rule_execution_listener from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/execution-listener";
import rule_feel from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/feel";
import rule_feel_compatibility from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/feel-compatibility";
import rule_implementation from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/implementation";
import rule_io_mapping from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/io-mapping";
import rule_link_event from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/link-event";
import rule_loop_characteristics from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/loop-characteristics";
import rule_message_reference from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/message-reference";
import rule_no_expression from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/no-expression";
import rule_no_interrupting_event_subprocess from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/no-interrupting-event-subprocess";
import rule_no_loop from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/no-loop";
import rule_no_multiple_none_start_events from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/no-multiple-none-start-events";
import rule_priority_definition from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/priority-definition";
import rule_secrets from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/secrets";
import rule_sequence_flow_condition from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/sequence-flow-condition";
import rule_signal_reference from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/signal-reference";
import rule_start_event_form from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/start-event-form";
import rule_start_event_form_embedded from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/start-event-form-embedded";
import rule_subscription from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/subscription";
import rule_task_listener from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/task-listener";
import rule_task_schedule from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/task-schedule";
import rule_timer from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/timer";
import rule_user_task_definition from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/user-task-definition";
import rule_user_task_form from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/user-task-form";
import rule_variable_name from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/variable-name";
import rule_version_tag from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/version-tag";
import rule_wait_for_completion from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/wait-for-completion";
import rule_zeebe_user_task from "bpmnlint-plugin-camunda-compat/rules/camunda-cloud/zeebe-user-task";

/** Our own opinion layer (currently empty; see {@link miragonRecommended}). */
const MIRAGON: Record<string, unknown> = {
    "config:bpmnlint-plugin-miragon/recommended": miragonRecommended,
};

/** The two pinned engine configs — plain data off the imported plugin index. */
const CONFIGS: Record<string, unknown> = {
    "config:bpmnlint-plugin-camunda-compat/camunda-platform-7-24":
        camundaCompat.configs["camunda-platform-7-24"],
    "config:bpmnlint-plugin-camunda-compat/camunda-cloud-8-10":
        camundaCompat.configs["camunda-cloud-8-10"],
};

/** Rule modules `camunda-platform-7-24` (C7) references. */
const C7_RULES: Record<string, unknown> = {
    "rule:bpmnlint-plugin-camunda-compat/history-time-to-live": rule_history_time_to_live,
};

/** Rule modules `camunda-cloud-8-10` (C8) references. */
const C8_RULES: Record<string, unknown> = {
    "rule:bpmnlint-plugin-camunda-compat/ad-hoc-sub-process": rule_ad_hoc_sub_process,
    "rule:bpmnlint-plugin-camunda-compat/agent-fromai-contract": rule_agent_fromai_contract,
    "rule:bpmnlint-plugin-camunda-compat/agent-tool-documentation": rule_agent_tool_documentation,
    "rule:bpmnlint-plugin-camunda-compat/agent-tool-output-key": rule_agent_tool_output_key,
    "rule:bpmnlint-plugin-camunda-compat/before-all-execution-listener":
        rule_before_all_execution_listener,
    "rule:bpmnlint-plugin-camunda-compat/called-element": rule_called_element,
    "rule:bpmnlint-plugin-camunda-compat/cancel-execution-listener": rule_cancel_execution_listener,
    "rule:bpmnlint-plugin-camunda-compat/connector-properties": rule_connector_properties,
    "rule:bpmnlint-plugin-camunda-compat/duplicate-execution-listener-headers":
        rule_duplicate_execution_listener_headers,
    "rule:bpmnlint-plugin-camunda-compat/duplicate-execution-listeners":
        rule_duplicate_execution_listeners,
    "rule:bpmnlint-plugin-camunda-compat/duplicate-task-headers": rule_duplicate_task_headers,
    "rule:bpmnlint-plugin-camunda-compat/element-type": rule_element_type,
    "rule:bpmnlint-plugin-camunda-compat/error-reference": rule_error_reference,
    "rule:bpmnlint-plugin-camunda-compat/escalation-boundary-event-attached-to-ref":
        rule_escalation_boundary_event_attached_to_ref,
    "rule:bpmnlint-plugin-camunda-compat/escalation-reference": rule_escalation_reference,
    "rule:bpmnlint-plugin-camunda-compat/event-based-gateway-target":
        rule_event_based_gateway_target,
    "rule:bpmnlint-plugin-camunda-compat/executable-process": rule_executable_process,
    "rule:bpmnlint-plugin-camunda-compat/execution-listener": rule_execution_listener,
    "rule:bpmnlint-plugin-camunda-compat/feel": rule_feel,
    "rule:bpmnlint-plugin-camunda-compat/feel-compatibility": rule_feel_compatibility,
    "rule:bpmnlint-plugin-camunda-compat/implementation": rule_implementation,
    "rule:bpmnlint-plugin-camunda-compat/io-mapping": rule_io_mapping,
    "rule:bpmnlint-plugin-camunda-compat/link-event": rule_link_event,
    "rule:bpmnlint-plugin-camunda-compat/loop-characteristics": rule_loop_characteristics,
    "rule:bpmnlint-plugin-camunda-compat/message-reference": rule_message_reference,
    "rule:bpmnlint-plugin-camunda-compat/no-expression": rule_no_expression,
    "rule:bpmnlint-plugin-camunda-compat/no-interrupting-event-subprocess":
        rule_no_interrupting_event_subprocess,
    "rule:bpmnlint-plugin-camunda-compat/no-loop": rule_no_loop,
    "rule:bpmnlint-plugin-camunda-compat/no-multiple-none-start-events":
        rule_no_multiple_none_start_events,
    "rule:bpmnlint-plugin-camunda-compat/priority-definition": rule_priority_definition,
    "rule:bpmnlint-plugin-camunda-compat/secrets": rule_secrets,
    "rule:bpmnlint-plugin-camunda-compat/sequence-flow-condition": rule_sequence_flow_condition,
    "rule:bpmnlint-plugin-camunda-compat/signal-reference": rule_signal_reference,
    "rule:bpmnlint-plugin-camunda-compat/start-event-form": rule_start_event_form,
    "rule:bpmnlint-plugin-camunda-compat/start-event-form-embedded": rule_start_event_form_embedded,
    "rule:bpmnlint-plugin-camunda-compat/subscription": rule_subscription,
    "rule:bpmnlint-plugin-camunda-compat/task-listener": rule_task_listener,
    "rule:bpmnlint-plugin-camunda-compat/task-schedule": rule_task_schedule,
    "rule:bpmnlint-plugin-camunda-compat/timer": rule_timer,
    "rule:bpmnlint-plugin-camunda-compat/user-task-definition": rule_user_task_definition,
    "rule:bpmnlint-plugin-camunda-compat/user-task-form": rule_user_task_form,
    "rule:bpmnlint-plugin-camunda-compat/variable-name": rule_variable_name,
    "rule:bpmnlint-plugin-camunda-compat/version-tag": rule_version_tag,
    "rule:bpmnlint-plugin-camunda-compat/wait-for-completion": rule_wait_for_completion,
    "rule:bpmnlint-plugin-camunda-compat/zeebe-user-task": rule_zeebe_user_task,
};

export const bundledDefaultResolver: Resolver = new StaticResolver({
    ...MIRAGON,
    ...CONFIGS,
    ...C7_RULES,
    ...C8_RULES,
});
