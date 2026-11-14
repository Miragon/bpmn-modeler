import { describe, expect, it } from "vitest";

import { FileNotFound } from "../../kernel/domain/errors";
import { readmeFetchFailureOf } from "./marketplaceReadme";
import { RepositoryAccessError } from "./repositoryAccessError";

describe("readmeFetchFailureOf", () => {
    it("counts a 404 and a missing local file as no README", () => {
        expect(
            readmeFetchFailureOf(new RepositoryAccessError("github.com", 404, "acme/t", false)),
        ).toEqual({ kind: "absent" });
        expect(readmeFetchFailureOf(new FileNotFound("/m/README.md"))).toEqual({ kind: "absent" });
    });

    it("keeps any other failure apart, so the cached README stays", () => {
        expect(
            readmeFetchFailureOf(new RepositoryAccessError("github.com", 403, "acme/t", true)),
        ).toEqual({ kind: "failed", reason: "github.com denied access to acme/t (HTTP 403)" });
        expect(readmeFetchFailureOf(new Error("offline"))).toEqual({
            kind: "failed",
            reason: "offline",
        });
    });
});
