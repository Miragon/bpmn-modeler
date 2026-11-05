import type { PropertiesPanelUiState, WebviewStateStore } from "@miragon/bpmn-modeler-shared";

/**
 * The panel's width and visibility per editor kind, as Orca never tells a frame
 * which file it shows. A frame without storage keeps them for the session only.
 */
export function localPanelState(key: string): WebviewStateStore<PropertiesPanelUiState> {
    let inMemory: PropertiesPanelUiState | undefined;
    const read = (): PropertiesPanelUiState | undefined => {
        try {
            const stored = localStorage.getItem(key);
            return stored === null ? inMemory : (JSON.parse(stored) as PropertiesPanelUiState);
        } catch {
            return inMemory;
        }
    };
    return {
        read,
        merge: (partial) => {
            inMemory = { ...read(), ...partial };
            try {
                localStorage.setItem(key, JSON.stringify(inMemory));
            } catch {
                // Kept in memory only.
            }
        },
    };
}
