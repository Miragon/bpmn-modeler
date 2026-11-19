import { BpmnlintResultsQuery } from "@miragon/bpmn-modeler-shared";

/** No `.bpmnlintrc` behind the preview, so linting stays off. */
export function noLintConfig(): BpmnlintResultsQuery {
    return new BpmnlintResultsQuery(null);
}
