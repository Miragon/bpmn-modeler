import { describe, expect, it } from "vitest";

import { PROCESS_RESTART_TEXT, PROCESS_RESTARTS } from "./approvableCodeTexts";

describe("process restarts", () => {
    it.each(PROCESS_RESTARTS)("names how to %s", (restart) => {
        expect(PROCESS_RESTART_TEXT[restart]).toMatch(/^[a-z]+ the \w+$/);
    });
});
