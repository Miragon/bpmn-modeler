import { posix } from "path";

/**
 * Applied when no `.bpmnlintrc` is found anywhere from the document's directory
 * up to the workspace root, so every diagram gets baseline execution-safety
 * checks — disconnected flows, missing start/end events, fake joins, and the
 * like — without any setup.
 *
 * This is `bpmnlint:recommended`'s rule set (see
 * `bpmnlint/config/recommended.js`) with the three purely
 * authoring/style rules removed: `label-required` (an unlabeled task is bad
 * practice, not a broken diagram), `no-overlapping-elements` (a canvas-layout
 * nit), and `global` (warns about elements reachable from multiple processes —
 * a modelling-convention call, not a correctness one). A diagram that expressed
 * no `.bpmnlintrc` preference at all should get flagged for things that break
 * execution or deployment, not for style choices a project hasn't opted into.
 *
 * Listed as bare `rules`, not `extends: "bpmnlint:recommended"`, so removing
 * those three stays a one-line diff against the upstream preset instead of a
 * second config layering rule overrides on top of it. Every rule name here
 * resolves against the statically-bundled {@link builtinResolver} (see
 * `../infrastructure/bpmnlint/builtinResolver.ts`), so this works with no
 * workspace `bpmnlint` install and no network access.
 *
 * Adding *any* `.bpmnlintrc` — even an empty `{}` — fully overrides this default
 * and hands the workspace complete control again, per
 * {@link BpmnLintConfigLocator}'s existing nearest-config-wins resolution.
 */
export const DEFAULT_BPMNLINT_CONFIG: Record<string, unknown> = {
    rules: {
        "ad-hoc-sub-process": "error",
        "conditional-flows": "error",
        "end-event-required": "error",
        "event-based-gateway": "error",
        "event-sub-process-typed-start-event": "error",
        "fake-join": "warn",
        "link-event": "error",
        "no-bpmndi": "error",
        "no-complex-gateway": "error",
        "no-disconnected": "error",
        "no-duplicate-sequence-flows": "error",
        "no-gateway-join-fork": "error",
        "no-implicit-end": "error",
        "no-implicit-split": "error",
        "no-implicit-start": "error",
        "no-inclusive-gateway": "warn",
        "single-blank-start-event": "error",
        "single-event-definition": "error",
        "start-event-required": "error",
        "sub-process-blank-start-event": "error",
        "superfluous-gateway": "warn",
        "superfluous-termination": "warn",
    },
};

/**
 * A virtual `.bpmnlintrc` path used only to anchor {@link NodeBpmnLinter}'s
 * scoped-require resolution root (`dirname(configPath)`) when linting against
 * {@link DEFAULT_BPMNLINT_CONFIG}. No file exists at this path — the default
 * config references no plugins, so nothing is ever read from it — but it must
 * still look like a config file inside `documentDir` for that resolution to
 * anchor correctly. The `<...>` name keeps it visibly distinct from a real
 * `.bpmnlintrc` in logs/tooltips, since no such file is ever written or read.
 */
export function defaultConfigPathFor(documentDir: string): string {
    return posix.join(documentDir, "<bpmnlint-default>");
}
