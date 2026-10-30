import { describe, expect, it } from "vitest";

import { migrationScopePrompt } from "./migrationScopePrompt";

describe("migrationScopePrompt", () => {
    it.each([
        {
            workspace: "one diagram of each engine",
            c7Count: 1,
            c8Count: 1,
            c7Label: "Camunda 7 only (1 diagram)",
            c8Label: "Camunda 8 only (1 diagram)",
            bothLabel: "Both (2 diagrams)",
        },
        {
            workspace: "one C7 diagram and three C8 diagrams",
            c7Count: 1,
            c8Count: 3,
            c7Label: "Camunda 7 only (1 diagram)",
            c8Label: "Camunda 8 only (3 diagrams)",
            bothLabel: "Both (4 diagrams)",
        },
        {
            workspace: "two C7 diagrams and one C8 diagram",
            c7Count: 2,
            c8Count: 1,
            c7Label: "Camunda 7 only (2 diagrams)",
            c8Label: "Camunda 8 only (1 diagram)",
            bothLabel: "Both (3 diagrams)",
        },
    ])(
        "counts the diagrams each scope migrates for $workspace",
        ({ c7Count, c8Count, c7Label, c8Label, bothLabel }) => {
            expect(migrationScopePrompt({ c7Count, c8Count })).toEqual({
                id: "migrationScope",
                placeholder: "Which diagrams do you want to migrate?",
                items: [
                    { label: c7Label, value: "c7" },
                    { label: c8Label, value: "c8" },
                    { label: bothLabel, value: "both" },
                ],
            });
        },
    );
});
