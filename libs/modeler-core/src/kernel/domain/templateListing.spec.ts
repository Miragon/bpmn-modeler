import type { ElementTemplateRef } from "@miragon/bpmn-modeler-types";
import { describe, expectTypeOf, it } from "vitest";

import type { ListedTemplate } from "./templateListing";

describe("ListedTemplate", () => {
    it("names a template by the ref the modeler matches hidden templates with", () => {
        expectTypeOf<Pick<ListedTemplate, "id" | "version">>().toEqualTypeOf<
            Partial<ElementTemplateRef>
        >();
    });
});
