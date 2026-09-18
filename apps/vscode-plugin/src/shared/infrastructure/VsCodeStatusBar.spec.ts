import { beforeEach, describe, expect, it, vi } from "vitest";

const statusBarItems: Array<{
    text?: string;
    tooltip?: string;
    color?: unknown;
    command?: string;
    show: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("vscode", () => ({
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class ThemeColor {
        constructor(readonly id: string) {}
    },
    window: {
        createStatusBarItem: vi.fn(() => {
            const item = { show: vi.fn() };
            statusBarItems.push(item);
            return item;
        }),
    },
}));

import { VsCodeStatusBar } from "./VsCodeStatusBar";

beforeEach(() => {
    statusBarItems.length = 0;
});

describe("VsCodeStatusBar deployment tooltip", () => {
    it("describes a differing deployment without inferring which version is newer", () => {
        new VsCodeStatusBar().showDeploymentTarget("dev", "superseded");

        expect(statusBarItems[0].tooltip).toBe("Deployed version differs from your diagram");
    });

    it("retains deployment and verification timestamps", () => {
        const deployedAt = "2026-09-17T14:40:00.000Z";
        const verifiedAt = "2026-09-17T15:00:00.000Z";

        new VsCodeStatusBar().showDeploymentTarget("dev", "superseded", deployedAt, verifiedAt);

        expect(statusBarItems[0].tooltip).toBe(
            `Deployed version differs from your diagram (deployed ${new Date(deployedAt).toLocaleString()}) — verified ${new Date(verifiedAt).toLocaleString()}`,
        );
    });
});
