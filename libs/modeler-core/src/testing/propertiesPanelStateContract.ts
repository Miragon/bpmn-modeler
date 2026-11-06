import { beforeEach, describe, expect, it } from "vitest";

import { PropertiesPanelStatePort } from "../modeler/bpmn/port/bpmnPorts";

/** One {@link PropertiesPanelStatePort} adapter under the {@link describePropertiesPanelStateContract} scenarios, over an empty store. */
export interface PropertiesPanelStateContractFixture {
    readonly panelState: PropertiesPanelStatePort;
    /** A new adapter over the same store, as the host builds one when it starts again. */
    reopen(): PropertiesPanelStatePort;
}

const STORED_VISIBILITIES = [
    { behaviour: "a hidden panel", stored: [false], visible: false },
    { behaviour: "a panel shown again after hiding", stored: [false, true], visible: true },
];

/**
 * The rules of {@link PropertiesPanelStatePort} the core relies on, run
 * against one adapter. `BpmnPropertiesPanelService` stores the visibility the
 * user last chose and reads it synchronously to pre-render the next webview's
 * panel, so the panel is visible until a choice is stored, the stored choice
 * reads back once its write resolves, and it outlives the adapter, which
 * carries it across a restart of the host.
 *
 * Left out:
 * - A write that fails: the service logs it, so what an adapter reads after
 *   one is not pinned.
 * - Two defaults kept apart: VS Code keys the DMN editor's default on its own,
 *   which its composition decides; the core holds one port per editor.
 */
export function describePropertiesPanelStateContract(
    adapter: string,
    createFixture: () => Promise<PropertiesPanelStateContractFixture>,
): void {
    describe(`${adapter} keeps the PropertiesPanelStatePort contract`, () => {
        let fixture: PropertiesPanelStateContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        async function store(visibilities: readonly boolean[]): Promise<void> {
            for (const visible of visibilities) {
                await fixture.panelState.setVisibility(visible);
            }
        }

        it("shows the panel while no visibility is stored", () => {
            expect(fixture.panelState.getVisibility()).toBe(true);
            expect(fixture.reopen().getVisibility()).toBe(true);
        });

        it.each(STORED_VISIBILITIES)(
            "reads back $behaviour once the write resolves",
            async ({ stored, visible }) => {
                await store(stored);

                expect(fixture.panelState.getVisibility()).toBe(visible);
            },
        );

        it.each(STORED_VISIBILITIES)(
            "keeps $behaviour for the next start",
            async ({ stored, visible }) => {
                await store(stored);

                expect(fixture.reopen().getVisibility()).toBe(visible);
            },
        );
    });
}
