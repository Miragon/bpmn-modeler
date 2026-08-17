import { LintResults } from "@miragon/bpmn-modeler-shared";

import { Linter } from "bpmnlint";
import StaticResolver from "bpmnlint/lib/resolver/static-resolver";

import recommended from "bpmnlint/config/recommended";

import adHocSubProcess from "bpmnlint/rules/ad-hoc-sub-process";
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
 * Dev-only browser bpmnlint runner for the standalone Vite preview.
 *
 * The shipping product lints in the extension host (a full Node context that
 * resolves custom `bpmnlint-plugin-*` rules against the workspace — see
 * `NodeBpmnLinter` in modeler-core). The browser preview has no such host, so
 * this runs bpmnlint's built-in `recommended` config directly in the page to
 * give a realistic panel instead of canned findings. It cannot see workspace
 * custom rules — that limitation is inherent to running without a host.
 *
 * The rule set mirrors modeler-core's `builtinResolver` (kept as a flat
 * StaticResolver so every rule is bundled deterministically). It is not shared
 * with that file because importing it would drag Node-only code
 * (`NodeBpmnLinter`, `path`) through modeler-core's barrel into the browser
 * bundle. Drift only affects this preview, never shipped linting.
 *
 * The whole module is dead-code-eliminated from production builds along with
 * the `MockHost` that lazy-imports it (guarded by `NODE_ENV === "development"`).
 */
const resolver = new StaticResolver({
    "config:bpmnlint/recommended": recommended,
    "rule:bpmnlint/ad-hoc-sub-process": adHocSubProcess,
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
});

/**
 * Lints `xml` against bpmnlint's `recommended` config, returning results in the
 * same shape the host would send via `BpmnlintResultsQuery`. Parses with a bare
 * `bpmn-moddle` factory (recommended rules inspect only core BPMN structure, so
 * Camunda/Zeebe moddle extensions are unnecessary; unknown namespaces parse
 * laxly).
 *
 * A fresh `Linter` per call is mandatory, not wasteful: bpmnlint caches each
 * rule instance for the lifetime of the linter, and stateful rules
 * (e.g. `no-duplicate-sequence-flows` keys seen flows in a closure) would carry
 * that state into the next relint and flag every flow as a duplicate. This is
 * exactly why `NodeBpmnLinter` also constructs the linter inside `lint()`. The
 * `resolver` is safe to share — it only caches rule factories, not lint state.
 */
export async function lintBpmnXml(xml: string): Promise<LintResults> {
    const linter = new Linter({ config: { extends: "bpmnlint:recommended" }, resolver });

    // Vite's dep optimizer exposes the factory as the named `BpmnModdle` export;
    // some interops also surface it as `default` (mirrors the diff path above).
    const moddleMod = (await import("bpmn-moddle")) as unknown as {
        default?: () => { fromXML: (xml: string) => Promise<{ rootElement: unknown }> };
        BpmnModdle?: () => { fromXML: (xml: string) => Promise<{ rootElement: unknown }> };
    };
    const createBpmnModdle = moddleMod.default ?? moddleMod.BpmnModdle;
    if (typeof createBpmnModdle !== "function") {
        throw new Error("bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.");
    }

    const { rootElement } = await createBpmnModdle().fromXML(xml);
    return (await linter.lint(rootElement)) as LintResults;
}
