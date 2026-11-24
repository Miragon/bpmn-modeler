import { describe, expect, it, vi } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";

import { exportFormattedXml, exportSvg, importDiagram } from "./diagramXml";

describe("importDiagram", () => {
    it("resolves with the importer's result", async () => {
        const result = { warnings: [] };
        const importXML = vi.fn().mockResolvedValue(result);

        await expect(importDiagram({ importXML }, "<x/>")).resolves.toBe(result);
        expect(importXML).toHaveBeenCalledWith("<x/>");
    });

    it("folds the parser warnings into the message and keeps the failure as cause", async () => {
        const failure = Object.assign(new Error("bad"), { warnings: ["w1"] });
        const importXML = vi.fn().mockRejectedValue(failure);

        const rejection = await importDiagram({ importXML }, "<x/>").catch((error) => error);

        expect(rejection).not.toBe(failure);
        expect(rejection).toBeInstanceOf(Error);
        expect((rejection as Error).message).toBe("bad w1");
        expect((rejection as Error).cause).toBe(failure);
    });

    it("wraps a failure whose warnings are empty", async () => {
        const failure = Object.assign(new Error("bad"), { warnings: [] });
        const importXML = vi.fn().mockRejectedValue(failure);

        const rejection = await importDiagram({ importXML }, "<x/>").catch((error) => error);

        expect((rejection as Error).cause).toBe(failure);
    });

    it("rethrows a failure without warnings unchanged", async () => {
        const failure = new NoModelerError();
        const importXML = vi.fn().mockRejectedValue(failure);

        await expect(importDiagram({ importXML }, "<x/>")).rejects.toBe(failure);
    });
});

describe("exportFormattedXml", () => {
    it("requests formatted XML and returns it", async () => {
        const saveXML = vi.fn().mockResolvedValue({ xml: "<x/>" });

        await expect(exportFormattedXml({ saveXML })).resolves.toBe("<x/>");
        expect(saveXML).toHaveBeenCalledWith({ format: true });
    });

    it("rethrows the exporter's rejection unchanged", async () => {
        const failure = new Error("no definitions loaded");
        const saveXML = vi.fn().mockRejectedValue(failure);

        await expect(exportFormattedXml({ saveXML })).rejects.toBe(failure);
    });
});

describe("exportSvg", () => {
    it("returns the rendered SVG", async () => {
        const saveSVG = vi.fn().mockResolvedValue({ svg: "<svg/>" });

        await expect(exportSvg({ saveSVG })).resolves.toBe("<svg/>");
    });
});
