import { getDiffPaneHostApi, getHostApi, isDiffPane } from "./adapter/out/host";
import { bootstrap } from "./composition/bootstrap";
import { createHarvestRecorder } from "@miragon/bpmn-modeler-shared";

if (isDiffPane()) {
    // A diff pane needs neither the modeler nor its properties panel.
    void import("./composition/diffBootstrap").then(({ bootstrapDiffPane }) =>
        bootstrapDiffPane(getDiffPaneHostApi()),
    );
} else {
    // DEV-only: one recorder per dmn-js view so a translate-harvest drain can walk
    // all four editors. Every recorder appends to the same `window.__harvested` set.
    const additionalModules = import.meta.env.DEV
        ? {
              drd: [createHarvestRecorder()],
              decisionTable: [createHarvestRecorder()],
              literalExpression: [createHarvestRecorder()],
              boxedExpression: [createHarvestRecorder()],
          }
        : undefined;
    bootstrap(getHostApi(), { additionalModules });
}
