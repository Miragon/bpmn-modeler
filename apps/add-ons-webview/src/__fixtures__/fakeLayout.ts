import type { Layout } from "../adapter/in/layout";

/**
 * The container query's two layouts for jsdom, which lays nothing out:
 * narrow shows the list or the detail by the app's pane, wide shows both.
 * Outside the ready phase only the list shows.
 */
export class FakeLayout implements Layout {
    narrow = false;
    reducedMotion = false;
    pageTop = 0;
    readonly scrolledTo: number[] = [];
    readonly scrolledIntoView: Element[] = [];

    isShown(element: Element): boolean {
        if (element.closest("[hidden]") !== null) return false;
        const app = element.closest<HTMLElement>(".av-app");
        if (app === null) return element.isConnected;
        const inToolbar = element.closest(".av-toolbar") !== null;
        const inDetail = element.closest(".av-detail") !== null;
        const inList = element.closest(".av-list") !== null;
        if (app.dataset.page === "listWithTab" && inDetail) return false;
        if (app.dataset.page === "detail") {
            return !inToolbar && !inList && !element.classList.contains("av-back");
        }
        if (app.dataset.phase !== "ready" && (inToolbar || inDetail)) return false;
        if (!this.narrow) return !element.classList.contains("av-back");
        const detailPane = app.dataset.pane === "detail";
        return detailPane ? !inToolbar && element.closest(".av-list") === null : !inDetail;
    }

    prefersReducedMotion = (): boolean => this.reducedMotion;

    pageScrollTop = (): number => this.pageTop;

    scrollPageTo = (top: number): void => {
        this.scrolledTo.push(top);
        this.pageTop = top;
    };

    scrollIntoView = (element: Element): void => {
        this.scrolledIntoView.push(element);
    };

    private readonly heightWatchers: { element: Element; onHeight: (height: number) => void }[] =
        [];

    watchHeight = (element: Element, onHeight: (height: number) => void): void => {
        this.heightWatchers.push({ element, onHeight });
    };

    /** Lays the element that matches the selector out at a new height. */
    resize(selector: string, height: number): void {
        this.heightWatchers
            .filter(({ element }) => element.matches(selector))
            .forEach(({ onHeight }) => onHeight(height));
    }
}
