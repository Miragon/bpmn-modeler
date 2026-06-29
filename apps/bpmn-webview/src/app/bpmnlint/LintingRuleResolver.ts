/**
 * Runtime replacement for `bpmnlint-loader`.
 *
 * bpmnlint's normal config resolution (`bpmnlint-loader`) bundles rule modules
 * at *build* time from a `.bpmnlintrc` known to the bundler.
 * We discover the config at *runtime*, so the loader cannot run.
 * Thus, we statically import every built-in rule
 *
 * This cache is the single source of truth for what the current scope supports:
 * custom / 3rd-party rule packages are intentionally absent and are dropped (with a warning)
 */
import StaticResolver from "bpmnlint/lib/resolver/static-resolver";

import recommended from "bpmnlint/config/recommended";
import all from "bpmnlint/config/all";
import correctness from "bpmnlint/config/correctness";

import adHocSubProcess from "bpmnlint/rules/ad-hoc-sub-process";
import conditionalEvent from "bpmnlint/rules/conditional-event";
import conditionalFlows from "bpmnlint/rules/conditional-flows";
import endEventRequired from "bpmnlint/rules/end-event-required";
import eventBasedGateway from "bpmnlint/rules/event-based-gateway";
import eventSubProcessTypedStartEvent from "bpmnlint/rules/event-sub-process-typed-start-event";
import fakeJoin from "bpmnlint/rules/fake-join";
import global from "bpmnlint/rules/global";
import labelRequired from "bpmnlint/rules/label-required";
import linkEvent from "bpmnlint/rules/link-event";
import noBpmndi from "bpmnlint/rules/no-bpmndi";
import noComplexGateway from "bpmnlint/rules/no-complex-gateway";
import noDisconnected from "bpmnlint/rules/no-disconnected";
import noDuplicateSequenceFlows from "bpmnlint/rules/no-duplicate-sequence-flows";
import noGatewayJoinFork from "bpmnlint/rules/no-gateway-join-fork";
import noImplicitEnd from "bpmnlint/rules/no-implicit-end";
import noImplicitSplit from "bpmnlint/rules/no-implicit-split";
import noImplicitStart from "bpmnlint/rules/no-implicit-start";
import noInclusiveGateway from "bpmnlint/rules/no-inclusive-gateway";
import noOverlappingElements from "bpmnlint/rules/no-overlapping-elements";
import singleBlankStartEvent from "bpmnlint/rules/single-blank-start-event";
import singleEventDefinition from "bpmnlint/rules/single-event-definition";
import startEventRequired from "bpmnlint/rules/start-event-required";
import subProcessBlankStartEvent from "bpmnlint/rules/sub-process-blank-start-event";
import superfluousGateway from "bpmnlint/rules/superfluous-gateway";
import superfluousTermination from "bpmnlint/rules/superfluous-termination";

/**
 * The full built-in rule + config cache.
 * Explicit imports (rather than `import.meta.glob`) are preferred so this file doubles as the current-scope allow-list
 * and bundles deterministically.
 */
const cache: Record<string, unknown> = {
    "config:bpmnlint/recommended": recommended,
    "config:bpmnlint/all": all,
    "config:bpmnlint/correctness": correctness,
    "rule:bpmnlint/ad-hoc-sub-process": adHocSubProcess,
    "rule:bpmnlint/conditional-event": conditionalEvent,
    "rule:bpmnlint/conditional-flows": conditionalFlows,
    "rule:bpmnlint/end-event-required": endEventRequired,
    "rule:bpmnlint/event-based-gateway": eventBasedGateway,
    "rule:bpmnlint/event-sub-process-typed-start-event": eventSubProcessTypedStartEvent,
    "rule:bpmnlint/fake-join": fakeJoin,
    "rule:bpmnlint/global": global,
    "rule:bpmnlint/label-required": labelRequired,
    "rule:bpmnlint/link-event": linkEvent,
    "rule:bpmnlint/no-bpmndi": noBpmndi,
    "rule:bpmnlint/no-complex-gateway": noComplexGateway,
    "rule:bpmnlint/no-disconnected": noDisconnected,
    "rule:bpmnlint/no-duplicate-sequence-flows": noDuplicateSequenceFlows,
    "rule:bpmnlint/no-gateway-join-fork": noGatewayJoinFork,
    "rule:bpmnlint/no-implicit-end": noImplicitEnd,
    "rule:bpmnlint/no-implicit-split": noImplicitSplit,
    "rule:bpmnlint/no-implicit-start": noImplicitStart,
    "rule:bpmnlint/no-inclusive-gateway": noInclusiveGateway,
    "rule:bpmnlint/no-overlapping-elements": noOverlappingElements,
    "rule:bpmnlint/single-blank-start-event": singleBlankStartEvent,
    "rule:bpmnlint/single-event-definition": singleEventDefinition,
    "rule:bpmnlint/start-event-required": startEventRequired,
    "rule:bpmnlint/sub-process-blank-start-event": subProcessBlankStartEvent,
    "rule:bpmnlint/superfluous-gateway": superfluousGateway,
    "rule:bpmnlint/superfluous-termination": superfluousTermination,
};

export const lintingRuleResolver = new StaticResolver(cache);

const RULE_PREFIX = "rule:bpmnlint/";
const CONFIG_PREFIX = "config:bpmnlint/";

/**
 * Bare rule names supported in the current scope (e.g. `label-required`). Derived
 * from the cache so the allow-list can never drift from what the resolver can resolve.
 */
export const KNOWN_RULES: ReadonlySet<string> = new Set(
    Object.keys(cache)
        .filter((key) => key.startsWith(RULE_PREFIX))
        .map((key) => key.slice(RULE_PREFIX.length)),
);

/**
 * Supported `extends` values in `.bpmnlintrc` syntax (e.g.
 * `bpmnlint:recommended`). Built from the config cache keys.
 */
export const KNOWN_EXTENDS: ReadonlySet<string> = new Set(
    Object.keys(cache)
        .filter((key) => key.startsWith(CONFIG_PREFIX))
        .map((key) => "bpmnlint:" + key.slice(CONFIG_PREFIX.length)),
);
