import { describe, expect, it } from "vitest";

import { ImplementationStatusQuery, SyncActivitiesCommand } from "@miragon/bpmn-modeler-shared";
import { implementationStatusKey } from "@miragon/bpmn-modeler-types";

import { ArtifactService } from "../kernel/service/ArtifactService";
import { createTestHost } from "../testing";
import { CodeLinkFeature } from "./CodeLinkFeature";
import { CodeLinkParticipant } from "./session/CodeLinkParticipant";

describe("CodeLinkFeature", () => {
    it("reports which of the editor's activities link to code", async () => {
        const host = createTestHost({
            folders: ["/work"],
            files: {
                "/work/src/main/java/com/example/OrderService.java":
                    "package com.example;\npublic class OrderService {}",
            },
        });
        const editor = host.openEditor("/work/order.bpmn");
        const { editorContribution } = new CodeLinkFeature({
            ...host,
            artifacts: new ArtifactService(host.workspace, host.settings, host.notifier),
        });
        const linked = {
            activityId: "Task_1",
            kind: "javaClass",
            reference: "com.example.OrderService",
        } as const;
        const unlinked = {
            activityId: "Task_2",
            kind: "javaClass",
            reference: "com.example.Missing",
        } as const;

        await editorContribution.commandHandlers.SyncActivitiesCommand(
            new SyncActivitiesCommand([linked, unlinked]),
            editor.id,
        );

        expect(editor.postedOfType("ImplementationStatusQuery").at(-1)).toEqual(
            new ImplementationStatusQuery({
                [implementationStatusKey(linked.activityId, linked.reference)]: true,
                [implementationStatusKey(unlinked.activityId, unlinked.reference)]: false,
            }),
        );
        expect(editorContribution.participant).toBeInstanceOf(CodeLinkParticipant);
    });

    it("stops watching the source files once disposed", async () => {
        const host = createTestHost({
            folders: ["/work"],
            files: {
                "/work/src/main/java/com/example/OrderService.java":
                    "package com.example;\npublic class OrderService {}",
            },
        });
        const editor = host.openEditor("/work/order.bpmn");
        const feature = new CodeLinkFeature({
            ...host,
            artifacts: new ArtifactService(host.workspace, host.settings, host.notifier),
        });
        await feature.editorContribution.commandHandlers.SyncActivitiesCommand(
            new SyncActivitiesCommand([
                { activityId: "Task_1", kind: "javaClass", reference: "com.example.OrderService" },
            ]),
            editor.id,
        );
        const watching = () => host.workspace.watchers.filter(({ disposed }) => !disposed);
        expect(watching()).not.toEqual([]);

        feature.dispose();

        expect(watching()).toEqual([]);
    });
});
