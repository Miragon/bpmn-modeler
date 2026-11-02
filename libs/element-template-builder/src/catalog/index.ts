import type { Engine } from "@miragon/bpmn-modeler-types";

import { C7_CATALOG } from "./c7";
import { C8_CATALOG } from "./c8";
import type { EngineCatalog } from "./types";

export type * from "./types";

const CATALOGS: Readonly<Record<Engine, EngineCatalog>> = { c7: C7_CATALOG, c8: C8_CATALOG };

export function catalogFor(engine: Engine): EngineCatalog {
    return CATALOGS[engine];
}
