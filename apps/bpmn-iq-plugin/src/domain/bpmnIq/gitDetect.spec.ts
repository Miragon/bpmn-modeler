import { describe, expect, it } from "vitest";

import { deriveWorkspaceId, extractRepoSlug, normalizeRemoteUrl } from "./gitDetect";

describe("normalizeRemoteUrl", () => {
    it("converges SSH and HTTPS to the same id", () => {
        expect(normalizeRemoteUrl("git@github.com:Miragon/bpmn-iq.git")).toBe(
            normalizeRemoteUrl("https://github.com/Miragon/bpmn-iq"),
        );
    });

    it("strips .git suffix and trailing slashes", () => {
        expect(normalizeRemoteUrl("https://github.com/Miragon/bpmn-iq/")).toBe(
            "github.com/miragon/bpmn-iq",
        );
        expect(normalizeRemoteUrl("https://github.com/Miragon/bpmn-iq.git")).toBe(
            "github.com/miragon/bpmn-iq",
        );
    });

    it("strips embedded credentials", () => {
        expect(
            normalizeRemoteUrl("https://user:token@github.com/Miragon/bpmn-iq.git"),
        ).toBe("github.com/miragon/bpmn-iq");
    });

    it("handles ssh:// with custom port", () => {
        expect(normalizeRemoteUrl("ssh://git@github.com:22/Miragon/bpmn-iq.git")).toBe(
            "github.com:22/miragon/bpmn-iq",
        );
    });

    it("handles GitLab subgroups", () => {
        expect(normalizeRemoteUrl("git@gitlab.com:group/subgroup/repo.git")).toBe(
            "gitlab.com/group/subgroup/repo",
        );
    });

    it("handles Azure DevOps SSH layout", () => {
        expect(normalizeRemoteUrl("git@ssh.dev.azure.com:v3/Org/Project/Repo")).toBe(
            "ssh.dev.azure.com/v3/org/project/repo",
        );
    });

    it("rejects file:// (returns null)", () => {
        expect(normalizeRemoteUrl("file:///home/me/repo")).toBeNull();
        expect(normalizeRemoteUrl("file:///tmp/foo.git")).toBeNull();
    });

    it("is case-insensitive on host and path", () => {
        expect(normalizeRemoteUrl("git@GITHUB.com:MyOrg/MyRepo.git")).toBe(
            normalizeRemoteUrl("git@github.com:myorg/myrepo.git"),
        );
    });

    it("differs by org (same repo name, different org)", () => {
        expect(normalizeRemoteUrl("git@github.com:Miragon/bpmn-iq.git")).not.toBe(
            normalizeRemoteUrl("git@github.com:OtherOrg/bpmn-iq.git"),
        );
    });
});

describe("extractRepoSlug", () => {
    it("preserves original case for display", () => {
        expect(extractRepoSlug("git@github.com:Miragon/bpmn-iq.git")).toBe(
            "Miragon/bpmn-iq",
        );
        expect(extractRepoSlug("https://github.com/Miragon/bpmn-iq")).toBe(
            "Miragon/bpmn-iq",
        );
    });

    it("includes subgroups verbatim", () => {
        expect(extractRepoSlug("git@gitlab.com:group/subgroup/repo.git")).toBe(
            "group/subgroup/repo",
        );
    });

    it("returns undefined for unrecognised shapes", () => {
        expect(extractRepoSlug("not-a-url")).toBeUndefined();
    });
});

describe("deriveWorkspaceId", () => {
    // Golden-value test: locks in the exact workspaceId across versions and processes.
    // If this fails, the hash algorithm, truncation length, or input format
    // changed — peers on older agents would no longer share the workspace.
    it("hash output is stable (golden value)", () => {
        expect(deriveWorkspaceId("repo-a", "main")).toBe("d309511cce325388b821fe51d3d0b7f2");
    });

    it("differs per branch", () => {
        expect(deriveWorkspaceId("repo-a", "main")).not.toBe(deriveWorkspaceId("repo-a", "feature"));
    });

    it("differs per repo", () => {
        expect(deriveWorkspaceId("repo-a", "main")).not.toBe(deriveWorkspaceId("repo-b", "main"));
    });

    it("returns 32 hex chars (128 bit)", () => {
        expect(deriveWorkspaceId("repo", "branch")).toMatch(/^[a-f0-9]{32}$/);
    });
});
