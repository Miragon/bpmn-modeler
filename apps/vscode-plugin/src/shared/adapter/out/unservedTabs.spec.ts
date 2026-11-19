import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeTab {
    readonly label: string;
}

const tabs = vi.hoisted(() => ({
    open: [] as { label: string }[],
    closed: [] as { tabs: readonly { label: string }[]; preserveFocus: boolean | undefined }[],
    listener: undefined as ((event: { opened: readonly { label: string }[] }) => void) | undefined,
}));

vi.mock("vscode", () => ({
    window: {
        tabGroups: {
            get all() {
                return [{ tabs: tabs.open }];
            },
            close: async (closing: readonly FakeTab[], preserveFocus?: boolean) => {
                tabs.closed.push({ tabs: closing, preserveFocus });
                return true;
            },
            onDidChangeTabs: (listener: typeof tabs.listener) => {
                tabs.listener = listener;
                return { dispose: () => undefined };
            },
        },
    },
}));

import { closeUnservedTabs } from "./unservedTabs";

const RESTORED = { label: "restored" };
const SERVED = { label: "served" };

function sweep(context = { subscriptions: [] as unknown[] }) {
    closeUnservedTabs(context as never, (tab) => tab.label !== SERVED.label);
    return context;
}

beforeEach(() => {
    tabs.open = [];
    tabs.closed = [];
    tabs.listener = undefined;
});

describe("closeUnservedTabs", () => {
    it("closes the unserved tabs a reload restored at once, keeping the focus where it is", () => {
        tabs.open = [RESTORED, SERVED];

        sweep();

        expect(tabs.closed).toEqual([{ tabs: [RESTORED], preserveFocus: true }]);
    });

    it("closes an unserved tab as it opens, as Reopen Closed Editor brings one back", () => {
        const context = sweep();

        tabs.listener?.({ opened: [SERVED] });
        tabs.listener?.({ opened: [RESTORED] });

        expect(tabs.closed).toEqual([{ tabs: [RESTORED], preserveFocus: true }]);
        expect(context.subscriptions).toHaveLength(1);
    });

    it("closes nothing while every tab is served", () => {
        tabs.open = [SERVED];

        sweep();

        expect(tabs.closed).toEqual([]);
    });
});
