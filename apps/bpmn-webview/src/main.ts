import { getHostApi } from "./adapter/out/host";
import { bootstrap } from "./composition/bootstrap";
import { createHarvestRecorder } from "@miragon/bpmn-modeler-shared";

const extraModules = import.meta.env.DEV ? [createHarvestRecorder()] : undefined;
bootstrap(getHostApi(), { extraModules });
