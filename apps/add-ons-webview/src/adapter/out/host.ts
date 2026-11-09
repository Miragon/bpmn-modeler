import { AddOnsViewCommand, HostApiImpl, MockHostApi } from "@miragon/bpmn-modeler-shared";

import type { AddOnsHost, PersistedViewState } from "../../port/addOnsHost";

declare const process: { env: { NODE_ENV: string } };

/** The preview's stand-in host in `development`; the embedding host's channel in every other build. */
export function getHostApi(): AddOnsHost {
    if (process.env.NODE_ENV === "development") {
        return new MockHost();
    }
    return new HostApiImpl();
}

class MockHost extends MockHostApi<PersistedViewState, AddOnsViewCommand> {
    override postMessage(message: AddOnsViewCommand): void {
        console.debug("[add-ons preview]", message.type);
    }
}
