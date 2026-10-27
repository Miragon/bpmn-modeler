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
    | { readonly state: "hidden" }
    | { readonly state: "active"; readonly configPath: string }
    | {
          readonly state: "unresolved";
          readonly configPath: string;
          readonly unresolved: readonly string[];
      }
    | { readonly state: "default"; readonly platform: Engine | undefined }
    | { readonly state: "disabled" }
    | { readonly state: "noConfig" };

export function indicatorForFindings(
    _source: LintFindingsSource,
    _unresolved: readonly string[],
): BpmnlintIndicator {
    return { state: "hidden" };
}
