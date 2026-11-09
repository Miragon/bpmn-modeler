import { describe, expect, it } from "vitest";

import { GetAddOnCatalogCommand } from "@miragon/bpmn-modeler-shared";

import { RecordingHost } from "../__fixtures__/recordingHost";
import { bootstrap } from "./bootstrap";

describe("bootstrap", () => {
    it("asks the host for the catalog once it loads", () => {
        document.body.innerHTML = '<div id="app"></div>';
        const host = new RecordingHost();

        bootstrap(host);

        expect(host.posted).toEqual([new GetAddOnCatalogCommand()]);
    });
});
