import { getHostApi } from "./app";
import { bootstrap } from "./bootstrap";
import { createHarvestRecorder } from "./app/harvestRecorder";

const extraModules = import.meta.env.DEV ? [createHarvestRecorder()] : undefined;
bootstrap(getHostApi(), { extraModules });
