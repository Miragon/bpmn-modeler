import type { AddOnsViewCommand, HostApi } from "@miragon/bpmn-modeler-shared";

import type { PersistedChoices } from "../domain/viewState";

export type AddOnsHost = HostApi<PersistedChoices, AddOnsViewCommand>;
