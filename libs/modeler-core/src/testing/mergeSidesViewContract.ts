import { describe, expect, it } from "vitest";

import { MergePaneUris, MergeSidesView } from "../diff/port/MergeSidesView";

/** One {@link MergeSidesView} adapter; every `createView` stands for a fresh run of the host. */
export interface MergeSidesViewContractFixture<V extends MergeSidesView = MergeSidesView> {
    createView(): V;
    /** The text the host serves `view`'s documents with under `uri`, or `undefined` for none. */
    servedText(view: V, uri: string): string | undefined;
}

const FILE = "file:///work/repo/process/order.bpmn";

const SIDES = {
    current: { text: "<current/>", basename: "order.current.bpmn" },
    incoming: { text: "<incoming/>", basename: "order.incoming.bpmn" },
};

const pathOf = (uri: string): string => decodeURIComponent(new URL(uri).pathname);

const urisOf = (uris: MergePaneUris): string[] => [uris.current, uris.incoming];

/**
 * What the core relies on of a host's merge panes: each side and each
 * opening has its own URI, also across runs of the host, so a restored tab of
 * an earlier opening is never mistaken for a live one; the URI's path sits
 * beside the working file and ends in the side's basename; each URI serves
 * its side's text until it is released.
 */
export function describeMergeSidesViewContract<V extends MergeSidesView>(
    adapter: string,
    fixture: MergeSidesViewContractFixture<V>,
): void {
    describe(`${adapter} keeps the MergeSidesView contract`, () => {
        it("serves each side under its own URI", () => {
            const view = fixture.createView();

            const uris = view.serve(FILE, SIDES);

            expect(uris.current).not.toBe(uris.incoming);
            expect(fixture.servedText(view, uris.current)).toBe("<current/>");
            expect(fixture.servedText(view, uris.incoming)).toBe("<incoming/>");
        });

        it("gives every opening its own URIs", () => {
            const view = fixture.createView();

            const uris = [...urisOf(view.serve(FILE, SIDES)), ...urisOf(view.serve(FILE, SIDES))];

            expect(new Set(uris).size).toBe(4);
        });

        it("never repeats a URI an earlier run of the host served", () => {
            const earlier = fixture.createView().serve(FILE, SIDES);

            const later = fixture.createView().serve(FILE, SIDES);

            expect(new Set([...urisOf(earlier), ...urisOf(later)]).size).toBe(4);
        });

        it("puts each side beside the working file under its basename", () => {
            const uris = fixture.createView().serve(FILE, SIDES);

            expect(pathOf(uris.current)).toBe("/work/repo/process/order.current.bpmn");
            expect(pathOf(uris.incoming)).toBe("/work/repo/process/order.incoming.bpmn");
        });

        it("serves nothing under released URIs and keeps another opening served", () => {
            const view = fixture.createView();
            const released = view.serve(FILE, SIDES);
            const kept = view.serve(FILE, SIDES);

            view.release(released);

            expect(fixture.servedText(view, released.current)).toBeUndefined();
            expect(fixture.servedText(view, released.incoming)).toBeUndefined();
            expect(fixture.servedText(view, kept.current)).toBe("<current/>");
        });
    });
}
