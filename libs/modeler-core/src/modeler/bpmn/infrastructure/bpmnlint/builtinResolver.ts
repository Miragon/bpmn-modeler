/**
 * A `StaticResolver` over bpmnlint's built-in rules and configs, statically
 * imported so every bundler (webpack for VS Code, Bun for the IntelliJ bridge)
 * includes them deterministically.
 *
 * It is the fallback half of {@link CompositeResolver}: built-in `bpmnlint/*`
 * rules resolve from here even when the workspace has no `bpmnlint` installed, so
 * the zero-config case never regresses. Custom `bpmnlint-plugin-*` rules are
 * intentionally absent — those come from the workspace via `NodeResolver`.
 *
 * bpmnlint ships no type declarations; its deep entry points are typed by the
 * ambient shim in `src/types/bpmnlint.d.ts`, which every consuming tsconfig picks
 * up through its `include`.
 */
import type { Resolver } from "./CompositeResolver";

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

export const builtinResolver: Resolver = new StaticResolver(cache);
