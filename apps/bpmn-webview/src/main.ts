import { getHostApi } from "./host";
import { bootstrap } from "./bootstrap";
import { createHarvestRecorder } from "@miragon/bpmn-modeler-shared";

const extraModules = import.meta.env.DEV ? [createHarvestRecorder()] : undefined;
bootstrap(getHostApi(), { extraModules });
