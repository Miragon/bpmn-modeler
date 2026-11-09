import { describe, expect, it } from "vitest";

import { AddOnViewRevealPort } from "../addOns/port/addOnViewPorts";

/** One {@link AddOnViewRevealPort} adapter under the {@link describeAddOnViewRevealContract} scenarios. */
export interface AddOnViewRevealContractFixture {
    readonly view: AddOnViewRevealPort;
    /** The rows the host's view was asked to show, one list per reveal. */
    shownRows(): readonly (readonly string[])[];
}

const ROWS = [
    "plugin:/work/.camunda/plugins/resize-tasks",
    "plugin:/work/.camunda/plugins/reduced-palette",
];

/** What the core relies on of a host's add-ons view that it opens at pending rows. */
export function describeAddOnViewRevealContract(
    name: string,
    createFixture: (host: {
        readonly showsView: boolean;
    }) => Promise<AddOnViewRevealContractFixture>,
): void {
    describe(`${name} (add-ons view reveal contract)`, () => {
        it("answers true once the view shows the rows it was given", async () => {
            const fixture = await createFixture({ showsView: true });

            await expect(fixture.view.reveal(ROWS)).resolves.toBe(true);
            expect(fixture.shownRows()).toEqual([ROWS]);
        });

        it("answers false, not an error, when the host cannot show its view", async () => {
            const fixture = await createFixture({ showsView: false });

            await expect(fixture.view.reveal(ROWS)).resolves.toBe(false);
        });
    });
}
