import { describe, expect, it } from "vitest";

import { ElementXmlDiff, ElementXmlDiffView } from "../diff/port/ElementXmlDiffView";

/** What the user sees of one XML diff a host shows. */
export interface ShownElementXmlDiff {
    readonly title: string;
    readonly before: string;
    readonly after: string;
}

/** One {@link ElementXmlDiffView} adapter under the {@link describeElementXmlDiffViewContract} scenarios. */
export interface ElementXmlDiffViewContractFixture {
    readonly view: ElementXmlDiffView;
    /** Every XML diff the host shows. */
    shown(): readonly ShownElementXmlDiff[];
    /** The user closes the XML diff that shows `diff`. */
    closeByUser(diff: ElementXmlDiff): void;
}

const ORDER_DIFF = "element-xml-1";
const INVOICE_DIFF = "element-xml-2";

const elementDiff = (elementId: string, diffKey = ORDER_DIFF): ElementXmlDiff => ({
    diffKey,
    elementId,
    title: `${elementId} (XML): order.bpmn (HEAD ↔ Working Tree)`,
    before: `<bpmn:task id="${elementId}" name="old" />`,
    after: `<bpmn:task id="${elementId}" name="new" />`,
});

const seen = ({ title, before, after }: ElementXmlDiff): ShownElementXmlDiff => ({
    title,
    before,
    after,
});

/**
 * What the core relies on of a host's element XML diff: at most one per
 * diagram diff, a refresh that never reopens what the user closed, calls
 * applied in the order the core made them, and a close by the user reported
 * to the callback the host was built with, which the core's own close and
 * replacements never call.
 */
export function describeElementXmlDiffViewContract(
    adapter: string,
    createFixture: (onClosedByUser: (diffKey: string) => void) => ElementXmlDiffViewContractFixture,
): void {
    describe(`${adapter} keeps the ElementXmlDiffView contract`, () => {
        const fixtureReportingCloses = () => {
            const closedByUser: string[] = [];
            const fixture = createFixture((diffKey) => closedByUser.push(diffKey));
            return { ...fixture, closedByUser };
        };

        it("shows an element's XML from both sides under its title", async () => {
            const { view, shown } = fixtureReportingCloses();

            await view.show(elementDiff("Task_1"));

            expect(shown()).toStrictEqual([seen(elementDiff("Task_1"))]);
        });

        it("replaces what the open XML diff of a diagram diff shows on a show or a refresh", async () => {
            const { view, shown } = fixtureReportingCloses();
            await view.show(elementDiff("Task_1"));

            await view.refresh(elementDiff("Gateway_1"));
            await view.show(elementDiff("Event_1"));

            expect(shown()).toStrictEqual([seen(elementDiff("Event_1"))]);
        });

        it("ends on the later of two refreshes the core made without waiting", async () => {
            const { view, shown } = fixtureReportingCloses();
            await view.show(elementDiff("Task_1"));

            await Promise.all([
                view.refresh(elementDiff("Gateway_1")),
                view.refresh(elementDiff("Event_1")),
            ]);

            expect(shown()).toStrictEqual([seen(elementDiff("Event_1"))]);
        });

        it("opens nothing on a refresh while no XML diff is open", async () => {
            const { view, shown } = fixtureReportingCloses();

            await view.refresh(elementDiff("Task_1"));

            expect(shown()).toStrictEqual([]);
        });

        it("opens nothing on a refresh after the user closed the XML diff", async () => {
            const { view, shown, closeByUser, closedByUser } = fixtureReportingCloses();
            await view.show(elementDiff("Task_1"));

            closeByUser(elementDiff("Task_1"));
            await view.refresh(elementDiff("Gateway_1"));

            expect(shown()).toStrictEqual([]);
            expect(closedByUser).toStrictEqual([ORDER_DIFF]);
        });

        it("opens the XML diff again on a show after the user closed it", async () => {
            const { view, shown, closeByUser } = fixtureReportingCloses();
            await view.show(elementDiff("Task_1"));
            closeByUser(elementDiff("Task_1"));

            await view.show(elementDiff("Gateway_1"));

            expect(shown()).toStrictEqual([seen(elementDiff("Gateway_1"))]);
        });

        it("closes the XML diff of one diagram diff and leaves another's open", async () => {
            const { view, shown } = fixtureReportingCloses();
            await view.show(elementDiff("Task_1"));
            await view.show(elementDiff("Invoice_1", INVOICE_DIFF));

            await view.close(ORDER_DIFF);

            expect(shown()).toStrictEqual([seen(elementDiff("Invoice_1", INVOICE_DIFF))]);
        });

        it("closes nothing for a diagram diff without an XML diff", async () => {
            const { view, shown } = fixtureReportingCloses();

            await view.close(ORDER_DIFF);

            expect(shown()).toStrictEqual([]);
        });

        it("reports no close by the user for the core's own replacements and close", async () => {
            const { view, closedByUser } = fixtureReportingCloses();

            await view.show(elementDiff("Task_1"));
            await view.refresh(elementDiff("Gateway_1"));
            await view.show(elementDiff("Event_1"));
            await view.close(ORDER_DIFF);

            expect(closedByUser).toStrictEqual([]);
        });
    });
}
