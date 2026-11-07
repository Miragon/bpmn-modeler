import { beforeEach, describe, expect, it } from "vitest";

import { ActionNotice, ActionNoticeTone } from "../kernel/domain/actionNotice";
import { ActionNotifierPort } from "../kernel/port/hostPorts";

/** What the host showed for a notice. */
export interface ShownNotice {
    readonly tone: ActionNoticeTone;
    readonly message: string;
    /** The action buttons, in the order the host shows them. */
    readonly labels: readonly string[];
}

/**
 * One {@link ActionNotifierPort} adapter under the
 * {@link describeActionNotifierContract} scenarios, with the user who answers
 * it. Each answer is given before the notice is offered and answers the next
 * notice the host shows.
 */
export interface ActionNotifierContractFixture {
    readonly notifier: ActionNotifierPort;
    /** The user clicks the action at `index` of the notice shown for `notice`. */
    userClicks(notice: ActionNotice<unknown>, index: number): void;
    /** The user closes the notice shown for `notice` without clicking an action. */
    userCloses(notice: ActionNotice<unknown>): void;
    /** The notice the host showed last. */
    lastShown(): ShownNotice | undefined;
}

const REVIEW: ActionNotice<string> = {
    id: "bpmnPluginApprovalNotice",
    tone: "info",
    message: "2 BPMN plugins in this workspace are not allowed yet.",
    actions: [{ label: "Review…", value: "review" }],
};

/** Out of label order, so a host that sorted its buttons would answer another value. */
const CHOICES: ActionNotice<{ readonly scope: string }> = {
    id: "scopeNotice",
    tone: "warning",
    message: "Where should the marketplace be saved?",
    actions: [
        { label: "This project", value: { scope: "workspace" } },
        { label: "All my projects", value: { scope: "user" } },
    ],
};

const EMPTY_VALUE: ActionNotice<string> = {
    id: "emptyValueNotice",
    tone: "info",
    message: "Keep the default?",
    actions: [
        { label: "Keep", value: "" },
        { label: "Change", value: "change" },
    ],
};

/**
 * The rules of {@link ActionNotifierPort} the core relies on, run against one
 * adapter. A host shows the message with the notice's tone and one button per
 * action, in the notice's order. A click returns the offered value of that
 * action itself, never its label or a copy. Closing the notice is the answer
 * `undefined`, never a rejection, and an empty value is no dismissal.
 *
 * Left out: how long a host keeps the notice and where it shows it. VS Code
 * keeps an unanswered notification in its notification centre.
 */
export function describeActionNotifierContract(
    adapter: string,
    createFixture: () => Promise<ActionNotifierContractFixture>,
): void {
    describe(`${adapter} keeps the ActionNotifierPort contract`, () => {
        let fixture: ActionNotifierContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        it.each([REVIEW, CHOICES] as ActionNotice<unknown>[])(
            "shows the message of $id with its tone and its actions in order",
            async (notice) => {
                fixture.userCloses(notice);

                await fixture.notifier.offer(notice);

                expect(fixture.lastShown()).toEqual({
                    tone: notice.tone,
                    message: notice.message,
                    labels: notice.actions.map((action) => action.label),
                });
            },
        );

        it("returns the clicked action's value, not its label", async () => {
            fixture.userClicks(REVIEW, 0);

            await expect(fixture.notifier.offer(REVIEW)).resolves.toBe("review");
        });

        it.each([0, 1])("returns the offered value itself for the action at %i", async (index) => {
            fixture.userClicks(CHOICES, index);

            const chosen = await fixture.notifier.offer(CHOICES);

            expect(chosen).toBe(CHOICES.actions[index].value);
        });

        it("returns an empty value as itself, which is not a dismissal", async () => {
            fixture.userClicks(EMPTY_VALUE, 0);

            await expect(fixture.notifier.offer(EMPTY_VALUE)).resolves.toBe("");
        });

        it("resolves undefined when the user closes the notice", async () => {
            fixture.userCloses(REVIEW);

            await expect(fixture.notifier.offer(REVIEW)).resolves.toBeUndefined();
        });
    });
}
