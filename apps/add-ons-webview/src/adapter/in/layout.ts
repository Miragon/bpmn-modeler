/** What the view asks of the page's layout; jsdom lays nothing out, so specs pass their own. */
export interface Layout {
    /** Whether the element takes room on screen: a pane the container query hides does not. */
    isShown(element: Element): boolean;
    prefersReducedMotion(): boolean;
    pageScrollTop(): number;
    scrollPageTo(top: number): void;
    scrollIntoView(element: Element): void;
    watchHeight(element: Element, onHeight: (height: number) => void): void;
}

export const BROWSER_LAYOUT: Layout = {
    isShown: (element) => element.getClientRects().length > 0,
    prefersReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    pageScrollTop: () => window.scrollY,
    scrollPageTo: (top) => window.scrollTo({ top }),
    scrollIntoView(element) {
        element.scrollIntoView({
            block: "center",
            behavior: this.prefersReducedMotion() ? "auto" : "smooth",
        });
    },
    watchHeight(element, onHeight) {
        new ResizeObserver(() => onHeight(element.getBoundingClientRect().height)).observe(element);
    },
};
