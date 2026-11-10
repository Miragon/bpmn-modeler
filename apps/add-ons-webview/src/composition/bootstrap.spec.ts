import { afterEach, describe, expect, it } from "vitest";

import {
    AddOnCatalogQuery,
    BrandModeQuery,
    GetAddOnCatalogCommand,
} from "@miragon/bpmn-modeler-shared";

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
    afterEach(() => {
        document.documentElement.removeAttribute("data-cd-theme");
        document.documentElement.removeAttribute("data-cd-kontrast");
    });

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

    it("switches the page to the brand mode the host posts on a theme change", () => {
        booted();

        window.dispatchEvent(
            new MessageEvent("message", { data: new BrandModeQuery({ theme: "dark" }) }),
        );

        expect(document.documentElement.getAttribute("data-cd-theme")).toBe("dark");
    });
});
