import { GetAddOnCatalogCommand } from "@miragon/bpmn-modeler-shared";

import type { AddOnsHost } from "../port/addOnsHost";

export function bootstrap(host: AddOnsHost): void {
    host.postMessage(new GetAddOnCatalogCommand());
}
