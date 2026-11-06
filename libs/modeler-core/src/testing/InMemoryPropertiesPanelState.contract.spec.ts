import { InMemoryPropertiesPanelState } from "./inMemoryHostSurfaces";
import { describePropertiesPanelStateContract } from "./propertiesPanelStateContract";

describePropertiesPanelStateContract("InMemoryPropertiesPanelState", async () => {
    const panelState = new InMemoryPropertiesPanelState();
    // The fake is its own store, so the next start finds the same instance.
    return { panelState, reopen: () => panelState };
});
