/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * bpmn-js DI module registering the engine-neutral properties provider.
 */
import NeutralPropertiesProvider from "./NeutralPropertiesProvider";

export default {
    __init__: ["neutralPropertiesProvider"],
    neutralPropertiesProvider: ["type", NeutralPropertiesProvider],
};
