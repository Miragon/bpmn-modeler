/** The editor's size in every shot of Orca's smoke test (`runOrcaSmoke`'s default). */
export const EDITOR_SIZE = { width: 1200, height: 800 };

/** Where `runOrcaSmoke` clicks to give the keys back to the canvas. */
export const BLANK_POINT: readonly [number, number] = [
    EDITOR_SIZE.width / 2,
    EDITOR_SIZE.height - 120,
];

/** The centre of "Place Order" in `smoke.bpmn`, fitted into the editor beside the properties panel. */
export const BPMN_DELETION = { at: [351, 400] as const, id: "Task_Place", label: "Place Order" };
