import { RawModelerSettings } from "@miragon/bpmn-modeler-core";

/** Takes the host's settings snapshot, which the settings port then answers from. */
export interface HostSettingsMirror {
    apply(raw: RawModelerSettings): void;
}
