/**
 * The Miragon opinion layer of the bundled default (`plugin:miragon/recommended`) —
 * the place for genuine, non-engine Miragon conventions.
 *
 * Intentionally empty for now. It stays wired into the default (so adding a rule
 * later is a one-line change here) but ships no rule yet: our first planned
 * convention — uniform, modeler-default element sizes — is landing in bpmnlint
 * itself (https://github.com/bpmn-io/bpmnlint/pull/214) and will reach us via
 * `miragon-rules`, so shipping a throwaway copy now is not worth it.
 *
 * Tracked in https://github.com/Miragon/bpmn-modeler/issues/1333.
 */
export const miragonRecommended = {
    rules: {},
};
