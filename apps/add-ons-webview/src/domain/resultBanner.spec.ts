import { describe, expect, it } from "vitest";

import type { AddOnActionResultPayload } from "@miragon/bpmn-modeler-shared";

import { Banner, resultBannerOf } from "./resultBanner";

describe("resultBannerOf", () => {
    it.each<{ case: string; result: AddOnActionResultPayload; banner: Banner | undefined }>([
        {
            case: "a done message as a status",
            result: { kind: "done", message: "Allowed Resize Tasks." },
            banner: { tone: "status", text: "Allowed Resize Tasks." },
        },
        {
            case: "nothing for a done without a message",
            result: { kind: "done" },
            banner: undefined,
        },
        {
            case: "a refusal as an alert",
            result: { kind: "refused", reason: "staleView", message: "The list changed." },
            banner: { tone: "alert", text: "The list changed." },
        },
        {
            case: "a failure as an alert",
            result: { kind: "failed", message: "Could not remove." },
            banner: { tone: "alert", text: "Could not remove." },
        },
        {
            case: "nothing for a flow that reported in the host's own UI",
            result: { kind: "reportedByFlow" },
            banner: undefined,
        },
    ])("shows $case", ({ result, banner }) => {
        expect(resultBannerOf(result)).toEqual(banner);
    });
});
