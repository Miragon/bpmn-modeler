import { CircleAlert, CircleCheck, X } from "lucide";

import { CHROME_TEXT } from "../../domain/chromeTexts";
import type { Banner } from "../../domain/resultBanner";
import { button, el, icon } from "./dom";

interface BannerParts {
    readonly box: HTMLElement;
    readonly live: HTMLElement;
    readonly decoration: readonly Element[];
}

/**
 * The result of the last action. Both live regions stay in the page and only
 * their text changes: a region inserted together with its text is announced
 * unreliably.
 */
export class ResultBanner {
    readonly element = el("div", "av-banner-slot");
    private readonly status = parts("status");
    private readonly alert = parts("alert");

    constructor() {
        this.element.append(this.status.box, this.alert.box);
        this.show(undefined);
    }

    show(banner: Banner | undefined): void {
        for (const [tone, each] of [
            ["status", this.status],
            ["alert", this.alert],
        ] as const) {
            const text = banner?.tone === tone ? banner.text : "";
            if (each.live.textContent !== text) each.live.textContent = text;
            each.box.toggleAttribute("data-empty", text === "");
            each.decoration.forEach((part) => part.toggleAttribute("hidden", text === ""));
        }
    }
}

function parts(tone: Banner["tone"]): BannerParts {
    const box = el("div", `ds-banner ds-banner-${tone}`);
    const live = el("div", "ds-banner-text");
    live.setAttribute("role", tone);
    if (tone === "status") live.setAttribute("aria-live", "polite");
    const mark = icon(tone === "alert" ? CircleAlert : CircleCheck, 16, "ds-banner-icon");
    const dismiss = button("ds-icon-btn", CHROME_TEXT.dismiss);
    dismiss.dataset.dismissBanner = "";
    dismiss.append(icon(X, 16));
    box.append(mark, live, dismiss);
    return { box, live, decoration: [mark, dismiss] };
}
