import { describe, expect, it } from "vitest";

import { AddOnCatalogQuery, GetAddOnCatalogCommand } from "@miragon/bpmn-modeler-shared";

import { CATALOG } from "../__fixtures__/catalogs";
import { RecordingHost } from "../__fixtures__/recordingHost";
import { bootstrap } from "./bootstrap";

function booted() {
    document.body.innerHTML = '<div id="app"></div>';
    const host = new RecordingHost();
    bootstrap(host);
    return { host, app: document.getElementById("app")! };
}

describe("bootstrap", () => {
    it("asks the host for the catalog once it loads", () => {
        expect(booted().host.posted).toEqual([new GetAddOnCatalogCommand()]);
    });

    it("builds the view in the empty container every host ships", () => {
        const { app } = booted();

        expect([
            app.querySelector("[role=toolbar]") !== null,
            app.querySelector(".outline")?.textContent,
        ]).toEqual([true, "Loading…"]);
    });

    it("renders the catalog the host posts", () => {
        const { app } = booted();

        window.dispatchEvent(new MessageEvent("message", { data: new AddOnCatalogQuery(CATALOG) }));

        expect(app.querySelector("h2 button")?.textContent).toBe("work");
    });

    it("focuses the active head when the view gets focus from its host", () => {
        const { app } = booted();
        window.dispatchEvent(new MessageEvent("message", { data: new AddOnCatalogQuery(CATALOG) }));

        window.dispatchEvent(new FocusEvent("focus"));

        expect(document.activeElement).toBe(app.querySelector("h2 button"));
    });
});
