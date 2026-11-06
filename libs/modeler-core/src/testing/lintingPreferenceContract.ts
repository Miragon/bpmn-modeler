import { beforeEach, describe, expect, it } from "vitest";

import { SettingsPort } from "../kernel/port/hostPorts";
import { LintingPreferencePort } from "../modeler/bpmn/port/bpmnPorts";

/**
 * One {@link LintingPreferencePort} adapter under the
 * {@link describeLintingPreferenceContract} scenarios, with the settings of
 * the same host and no choice stored yet.
 */
export interface LintingPreferenceContractFixture {
    readonly preference: LintingPreferencePort;
    // Only the reader the suite exercises: the whole SettingsPort would make this count as its suite.
    readonly settings: Pick<SettingsPort, "getLintingEnabled">;
    /** The settings of another project the same user opens afterwards. */
    openAnotherProject(): Promise<Pick<SettingsPort, "getLintingEnabled">>;
}

/**
 * The rules of {@link LintingPreferencePort} the core relies on, run against
 * one adapter and the settings of its host. The port returns nothing; the
 * core reads the choice back through `SettingsPort.getLintingEnabled`.
 * `setLintingEnabledHandler` stores a choice only when it differs from that
 * read, and the bridge's lint widget stores the opposite of it, so both rely
 * on the read returning the stored choice once the call resolves. The choice
 * is the user's and holds for every project, as both hosts store it.
 *
 * Left out: the settings change that re-lints the open editors. It reaches
 * the core through `EditorHandle.onDidChangeSetting`, another port.
 */
export function describeLintingPreferenceContract(
    adapter: string,
    createFixture: () => Promise<LintingPreferenceContractFixture>,
): void {
    describe(`${adapter} keeps the LintingPreferencePort contract`, () => {
        let fixture: LintingPreferenceContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        it("reads linting as on while no choice is stored", () => {
            expect(fixture.settings.getLintingEnabled()).toBe(true);
        });

        it.each([
            { behaviour: "turns linting off", choices: [false], enabled: false },
            { behaviour: "turns linting back on", choices: [false, true], enabled: true },
        ])(
            "reads back the choice that $behaviour once the call resolves",
            async ({ choices, enabled }) => {
                for (const choice of choices) {
                    await fixture.preference.setLintingEnabled(choice);
                }

                expect(fixture.settings.getLintingEnabled()).toBe(enabled);
            },
        );

        it("keeps the choice for every project the user opens afterwards", async () => {
            await fixture.preference.setLintingEnabled(false);

            const anotherProject = await fixture.openAnotherProject();

            expect(anotherProject.getLintingEnabled()).toBe(false);
        });
    });
}
