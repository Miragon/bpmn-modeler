import { describe, expect, it } from "vitest";

import { FileNotFound } from "../../kernel/domain/errors";
import { aboutFetchFailureOf } from "./marketplaceAbout";
import { RepositoryAccessError } from "./repositoryAccessError";

describe("aboutFetchFailureOf", () => {
    it("counts a 404 and a missing local file as absent", () => {
        expect(
            aboutFetchFailureOf(new RepositoryAccessError("github.com", 404, "acme/t", false)),
        ).toEqual({ kind: "absent" });
        expect(aboutFetchFailureOf(new FileNotFound("/m/README.md"))).toEqual({ kind: "absent" });
    });

    it("keeps any other failure apart, so the cached copy stays", () => {
        expect(
            aboutFetchFailureOf(new RepositoryAccessError("github.com", 403, "acme/t", true)),
        ).toEqual({ kind: "failed", reason: "github.com denied access to acme/t (HTTP 403)" });
        expect(aboutFetchFailureOf(new Error("offline"))).toEqual({
            kind: "failed",
            reason: "offline",
        });
    });
});
