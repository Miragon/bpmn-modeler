import { getHostApi } from "./host";
import { bootstrap } from "./bootstrap";
import { createHarvestRecorder } from "@miragon/bpmn-modeler-shared";

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
