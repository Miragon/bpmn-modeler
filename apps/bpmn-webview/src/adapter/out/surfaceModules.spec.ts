import { describe, expect, it } from "vitest";

import { modulesToPrefetch } from "./surfaceModules";

describe("modulesToPrefetch", () => {
    it("predicts the modeler and the lint stack for a saved Implement", () => {
        expect(modulesToPrefetch("implement", { linting: true })).toEqual(["modeler", "lint"]);
    });

    it("leaves the lint stack out when the consumer injects linting", () => {
        expect(modulesToPrefetch("implement", { linting: false })).toEqual(["modeler"]);
    });

    it("predicts only the viewer for a saved View", () => {
        expect(modulesToPrefetch("view", { linting: true })).toEqual(["viewer"]);
    });

    it("predicts nothing for a saved Design, whose surface depends on the engine", () => {
        expect(modulesToPrefetch("design", { linting: true })).toEqual([]);
    });
});
