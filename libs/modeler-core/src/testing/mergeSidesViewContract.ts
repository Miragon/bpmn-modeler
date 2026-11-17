import { describe, expect, it } from "vitest";

import { MergePaneUris, MergeSidesView } from "../diff/port/MergeSidesView";

/** One {@link MergeSidesView} adapter, as one run of the host builds it. */
export interface MergeSidesViewContractFixture {
    readonly view: MergeSidesView;
    /** The text the host serves under `uri`, or `undefined` for none. */
    servedText(uri: string): string | undefined;
    /** Every diff the host opened, in order. */
    opened(): readonly { left: string; right: string; title: string }[];
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
 * its side's text until it is released; a diff opens each URI on the side
 * the core names, which alone decides the positions.
 */
export function describeMergeSidesViewContract(
    adapter: string,
    createFixture: () => MergeSidesViewContractFixture,
): void {
    describe(`${adapter} keeps the MergeSidesView contract`, () => {
        it("serves each side under its own URI", () => {
            const { view, servedText } = createFixture();

            const uris = view.serve(FILE, SIDES);

            expect(uris.current).not.toBe(uris.incoming);
            expect(servedText(uris.current)).toBe("<current/>");
            expect(servedText(uris.incoming)).toBe("<incoming/>");
        });

        it("gives every opening its own URIs", () => {
            const { view } = createFixture();

            const uris = [...urisOf(view.serve(FILE, SIDES)), ...urisOf(view.serve(FILE, SIDES))];

            expect(new Set(uris).size).toBe(4);
        });

        it("never repeats a URI an earlier run of the host served", () => {
            const earlier = createFixture().view.serve(FILE, SIDES);

            const later = createFixture().view.serve(FILE, SIDES);

            expect(new Set([...urisOf(earlier), ...urisOf(later)]).size).toBe(4);
        });

        it("puts each side beside the working file under its basename", () => {
            const uris = createFixture().view.serve(FILE, SIDES);

            expect(pathOf(uris.current)).toBe("/work/repo/process/order.current.bpmn");
            expect(pathOf(uris.incoming)).toBe("/work/repo/process/order.incoming.bpmn");
        });

        it("serves a built result beside the sides, under its basename, until released", () => {
            const { view, servedText } = createFixture();

            const uris = view.serve(FILE, {
                ...SIDES,
                result: { text: "<result/>", basename: "order.result.bpmn" },
            });

            expect(pathOf(uris.result)).toBe("/work/repo/process/order.result.bpmn");
            expect(servedText(uris.result)).toBe("<result/>");
            view.release(uris);
            expect(servedText(uris.result)).toBeUndefined();
        });

        it("opens each URI on the side the core names", async () => {
            const { view, opened } = createFixture();
            const uris = view.serve(FILE, SIDES);

            await view.open(uris.incoming, uris.current, "order.bpmn (Merge: feature ↔ main)");

            expect(opened()).toStrictEqual([
                {
                    left: uris.incoming,
                    right: uris.current,
                    title: "order.bpmn (Merge: feature ↔ main)",
                },
            ]);
        });

        it("serves nothing under released URIs and keeps another opening served", () => {
            const { view, servedText } = createFixture();
            const released = view.serve(FILE, SIDES);
            const kept = view.serve(FILE, SIDES);

            view.release(released);

            expect(servedText(released.current)).toBeUndefined();
            expect(servedText(released.incoming)).toBeUndefined();
            expect(servedText(kept.current)).toBe("<current/>");
        });
    });
}
