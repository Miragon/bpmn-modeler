import { describe, expect, it } from "vitest";

import type { BpmnIqSyncSnapshot } from "./BpmnIqState";
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

const CLOUD = "https://example-bpmn-iq.test";

describe("buildMenuItems", () => {
    it("syncing state offers Open Web UI, Copy link, and Stop sync", () => {
        const result = actions(
            buildMenuItems(syncing, "http://localhost:4000", CLOUD),
        );
        expect(result).toContain("openWebUi");
        expect(result).toContain("copyWebUiUrl");
        expect(result).toContain("stop");
    });

    it("error state offers Retry plus Stop trying", () => {
        const result = actions(buildMenuItems(error, "http://localhost:4000", CLOUD));
        expect(result).toContain("retry");
        expect(result).toContain("stop");
        expect(result).not.toContain("openWebUi");
    });

    it("localhost daemon offers Switch to Cloud, remote daemon offers Switch to Local", () => {
        const local = actions(
            buildMenuItems(syncing, "http://localhost:4000", CLOUD),
        );
        expect(local).toContain("switchToCloud");
        expect(local).not.toContain("switchToLocal");

        const cloud = actions(buildMenuItems(syncing, CLOUD, CLOUD));
        expect(cloud).toContain("switchToLocal");
        expect(cloud).not.toContain("switchToCloud");
    });

    it("offers Switch to Cloud even when sync is off, so users can switch before connecting", () => {
        const off: BpmnIqSyncSnapshot = { status: "off" };
        const result = actions(buildMenuItems(off, "http://localhost:4000", CLOUD));
        expect(result).toContain("switchToCloud");
    });

    it("offers Switch to Local from a cloud daemon while connecting", () => {
        const connecting: BpmnIqSyncSnapshot = { status: "connecting" };
        const result = actions(buildMenuItems(connecting, CLOUD, CLOUD));
        expect(result).toContain("switchToLocal");
    });

    it("hides Switch to Cloud when no cloud URL is configured (OSS default)", () => {
        const result = actions(buildMenuItems(syncing, "http://localhost:4000", ""));
        expect(result).not.toContain("switchToCloud");
        expect(result).not.toContain("switchToLocal");
    });

    it("hides Switch to Cloud in OSS default even when sync is off", () => {
        const off: BpmnIqSyncSnapshot = { status: "off" };
        const result = actions(buildMenuItems(off, "http://localhost:4000", ""));
        expect(result).not.toContain("switchToCloud");
    });
});
