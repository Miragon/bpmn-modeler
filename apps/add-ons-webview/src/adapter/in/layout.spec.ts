import { afterEach, describe, expect, it, vi } from "vitest";

import { BROWSER_LAYOUT } from "./layout";

function reducedMotion(matches: boolean): void {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query }));
}

describe("BROWSER_LAYOUT", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("counts an element without boxes, as one a container query hides, as not shown", () => {
        const shown = document.createElement("div");
        vi.spyOn(shown, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);

        expect([
            BROWSER_LAYOUT.isShown(shown),
            BROWSER_LAYOUT.isShown(document.createElement("div")),
        ]).toEqual([true, false]);
    });

    it.each([
        [false, "smooth"],
        [true, "auto"],
    ] as const)(
        "scrolls an element to the centre, without motion when reduced motion is %s",
        (reduced, behavior) => {
            reducedMotion(reduced);
            const element = document.createElement("div");
            element.scrollIntoView = vi.fn();

            BROWSER_LAYOUT.scrollIntoView(element);

            expect(element.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior });
        },
    );

    it("reports an element's height whenever its size changes", () => {
        let observed: (() => void) | undefined;
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(callback: () => void) {
                    observed = callback;
                }
                observe = vi.fn();
            },
        );
        const element = document.createElement("div");
        vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ height: 160 } as DOMRect);
        const heights: number[] = [];

        BROWSER_LAYOUT.watchHeight(element, (height) => heights.push(height));
        observed?.();

        expect(heights).toEqual([160]);
    });

    it("reads and scrolls the page", () => {
        const scrollTo = vi.fn();
        vi.stubGlobal("scrollTo", scrollTo);

        BROWSER_LAYOUT.scrollPageTo(120);

        expect([BROWSER_LAYOUT.pageScrollTop(), scrollTo.mock.calls]).toEqual([
            window.scrollY,
            [[{ top: 120 }]],
        ]);
    });
});
