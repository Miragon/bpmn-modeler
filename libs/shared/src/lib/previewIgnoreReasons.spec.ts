import { describe, expect, it } from "vitest";

import { requireIgnoreReason } from "./ignoredCommand";
import * as reasons from "./previewIgnoreReasons";

describe("the reasons more than one browser preview drops a command for", () => {
    it.each(Object.entries(reasons))("names a reason the router accepts: %s", (name, reason) => {
        expect(() => requireIgnoreReason(name, reason)).not.toThrow();
    });
});
