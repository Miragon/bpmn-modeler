import { getHostApi } from "./host";
import { bootstrap } from "./bootstrap";
import { createHarvestRecorder } from "./harvestRecorder";

const extraModules = import.meta.env.DEV ? [createHarvestRecorder()] : undefined;
bootstrap(getHostApi(), { extraModules });
