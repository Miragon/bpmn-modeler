import type { MergePaneBuild } from "@miragon/bpmn-modeler-shared";
import { createButton, createElement } from "@miragon/bpmn-modeler-types";

import { buildBlockedText } from "../../domain/mergeBarTexts";
import { MERGE_BUILD_TEXTS } from "../../domain/mergeTexts";
import type { MergeTranslate } from "../../domain/mergeTranslate";
import { MERGE_TOOLTIP_ATTRIBUTE } from "./mergeTooltip";

/**
 * Build, on the bar or in the menu: disabled while conflicts are left, with
 * how many as its description and as the tooltip of `wrap`, since a
 * disabled button gets no pointer events.
 */
export class MergeBuildButton {
    readonly button: HTMLButtonElement;
    private readonly blocked = createElement("span", "");

    constructor(
        readonly wrap: HTMLElement,
        buttonClass: string,
        blockedId: string,
        onClick: () => void,
    ) {
        this.button = createButton(buttonClass, onClick);
        this.blocked.id = blockedId;
        this.blocked.hidden = true;
        wrap.append(this.button, this.blocked);
    }

    render(
        build: Pick<MergePaneBuild, "canBuild" | "openConflicts"> | undefined,
        translate: MergeTranslate,
    ): void {
        this.button.textContent = translate(MERGE_BUILD_TEXTS.build);
        this.button.disabled = !build?.canBuild;
        const reason =
            build !== undefined && !build.canBuild
                ? buildBlockedText(build.openConflicts, translate)
                : "";
        this.blocked.textContent = reason;
        if (reason) {
            this.wrap.setAttribute(MERGE_TOOLTIP_ATTRIBUTE, reason);
            this.button.setAttribute("aria-describedby", this.blocked.id);
        } else {
            this.wrap.removeAttribute(MERGE_TOOLTIP_ATTRIBUTE);
            this.button.removeAttribute("aria-describedby");
        }
    }
}
