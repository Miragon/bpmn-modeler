import { afterEach, describe, expect, it } from "vitest";

import {
    AddOnCatalogQuery,
    BrandModeQuery,
    GetAddOnCatalogCommand,
} from "@miragon/bpmn-modeler-shared";

import { CATALOG, RESIZE } from "../__fixtures__/catalogs";
import { FakeLayout } from "../__fixtures__/fakeLayout";
import { RecordingHost } from "../__fixtures__/recordingHost";
import { bootstrap } from "./bootstrap";

function booted() {
    document.body.innerHTML = '<div id="app"></div>';
    const host = new RecordingHost();
    bootstrap(host, new FakeLayout());
    return { host, app: document.getElementById("app")! };
}

const post = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data }));

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
            app.querySelector("main")?.getAttribute("aria-label"),
            app.querySelector(".av-loading[role=status]")?.textContent,
        ]).toEqual(["Add-ons", "Loading…"]);
    });

    it("renders the catalog the host posts", () => {
        const { app } = booted();

        post(new AddOnCatalogQuery(CATALOG));

        expect(app.querySelector(".av-detail-name")?.textContent).toBe(RESIZE.name);
    });

    it("focuses the selected add-on when the view gets focus from its host", () => {
        const { app } = booted();
        post(new AddOnCatalogQuery(CATALOG));

        window.dispatchEvent(new FocusEvent("focus"));

        expect(document.activeElement).toBe(app.querySelector("[aria-current=true]"));
    });

    it("leaves a page without its container alone", () => {
        document.body.innerHTML = "";
        const host = new RecordingHost();

        bootstrap(host);

        expect(host.posted).toEqual([]);
    });

    it("switches the page to the brand mode the host posts on a theme change", () => {
        booted();

        post(new BrandModeQuery({ theme: "dark" }));

        expect(document.documentElement.getAttribute("data-cd-theme")).toBe("dark");
    });
});
