import { Engine } from "@miragon/bpmn-modeler-types";

/**
 * Where a set of findings came from. `"workspace"` is a host-side (escalated)
 * Node run against a discovered `.bpmnlintrc`; `"in-page"` is a webview run,
 * either the zero-config default tier (no `configPath`) or the covered
 * workspace tier (`configPath` set).
 */
export type LintFindingsSource =
    | { readonly kind: "workspace"; readonly configPath: string }
    | {
          readonly kind: "in-page";
          readonly platform: Engine | undefined;
          readonly configPath?: string;
      };

/** What the bpmnlint status item shows for the focused editor. */
export type BpmnlintIndicator =
    | { readonly state: "active"; readonly configPath: string }
    | {
          readonly state: "unresolved";
          readonly configPath: string;
          readonly unresolved: readonly string[];
      }
    | { readonly state: "default"; readonly platform: Engine | undefined }
    | { readonly state: "disabled" }
    | { readonly state: "failed" };

export function indicatorForFindings(
    source: LintFindingsSource,
    unresolved: readonly string[],
): BpmnlintIndicator {
    if (source.kind === "workspace") {
        return unresolved.length > 0
            ? { state: "unresolved", configPath: source.configPath, unresolved }
            : { state: "active", configPath: source.configPath };
    }
    // A covered run lints a real `.bpmnlintrc`, so it never reads as the bundled default.
    return source.configPath !== undefined
        ? { state: "active", configPath: source.configPath }
        : { state: "default", platform: source.platform };
}
