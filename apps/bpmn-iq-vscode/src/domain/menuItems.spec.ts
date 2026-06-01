import { describe, expect, it } from "vitest";

import type { BpmnIqSyncSnapshot } from "./syncState";
import { buildMenuItems, type MenuAction } from "./menuItems";

const syncing: BpmnIqSyncSnapshot = {
    status: "syncing",
    workspaceId: "ws-123",
    workspaceName: "demo",
    modelCount: 3,
};

const error: BpmnIqSyncSnapshot = {
    status: "error",
    detail: "boom",
};

const actions = (items: { action?: MenuAction }[]): MenuAction[] =>
    items.map((i) => i.action).filter((a): a is MenuAction => !!a);

const DAEMON_URL = "https://cloud.example.test";

describe("buildMenuItems", () => {
    it("syncing state offers Open Web UI, Copy link, and Stop sync", () => {
        const result = actions(buildMenuItems(syncing, DAEMON_URL));
        expect(result).toContain("openWebUi");
        expect(result).toContain("copyWebUiUrl");
        expect(result).toContain("stop");
    });

    it("error state offers Retry plus Stop trying", () => {
        const result = actions(buildMenuItems(error, DAEMON_URL));
        expect(result).toContain("retry");
        expect(result).toContain("stop");
        expect(result).not.toContain("openWebUi");
    });

    it("never offers cloud/local switch or settings (cloud-only build)", () => {
        const allActions = [
            ...actions(buildMenuItems(syncing, DAEMON_URL)),
            ...actions(buildMenuItems(error, DAEMON_URL)),
            ...actions(buildMenuItems({ status: "off" }, DAEMON_URL)),
            ...actions(buildMenuItems({ status: "connecting" }, DAEMON_URL)),
        ];
        expect(allActions).not.toContain("switchToCloud" as unknown as MenuAction);
        expect(allActions).not.toContain("switchToLocal" as unknown as MenuAction);
        expect(allActions).not.toContain("openSettings" as unknown as MenuAction);
    });
});
