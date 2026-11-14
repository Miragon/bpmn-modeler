import { describe, expect, it } from "vitest";

import {
    formatRepositoryFacts,
    githubRepositoryFactsOf,
    gitlabRepositoryFactsOf,
    parseRepositoryFacts,
} from "./repositoryFactsParsing";

describe("githubRepositoryFactsOf", () => {
    it("reads the stars and the SPDX license", () => {
        expect(
            githubRepositoryFactsOf({
                stargazers_count: 1234,
                license: { spdx_id: "MIT", name: "MIT License" },
            }),
        ).toEqual({
            host: "github",
            stars: 1234,
            license: { kind: "known", id: "MIT", name: "MIT License" },
        });
    });

    it("tells a license file GitHub did not recognise from none", () => {
        expect(githubRepositoryFactsOf({ license: { spdx_id: "NOASSERTION", name: "Other" } })).toEqual({
            host: "github",
            license: { kind: "other" },
        });
        expect(githubRepositoryFactsOf({ stargazers_count: 0, license: null })).toEqual({
            host: "github",
            stars: 0,
            license: { kind: "none" },
        });
    });

    it("keeps nothing it cannot trust", () => {
        expect(githubRepositoryFactsOf({ stargazers_count: -1, license: "MIT" })).toEqual({
            host: "github",
        });
        expect(githubRepositoryFactsOf("nonsense")).toEqual({ host: "github" });
    });
});

describe("gitlabRepositoryFactsOf", () => {
    it("reads the stars and the license GitLab detected", () => {
        expect(
            gitlabRepositoryFactsOf({
                star_count: 7,
                license: { key: "apache-2.0", name: "Apache License 2.0", nickname: null },
            }),
        ).toEqual({
            host: "gitlab",
            stars: 7,
            license: { kind: "known", id: "Apache-2.0", name: "Apache License 2.0" },
        });
    });

    it("tells a license file GitLab did not recognise from none", () => {
        expect(gitlabRepositoryFactsOf({ license: { key: "other", name: "Other" } }).license).toEqual({
            kind: "other",
        });
        expect(gitlabRepositoryFactsOf({ license: null }).license).toEqual({ kind: "none" });
        expect(gitlabRepositoryFactsOf({}).license).toBeUndefined();
    });
});

describe("the cached repository facts", () => {
    it("read back as they were written", () => {
        const facts = {
            host: "github",
            stars: 12,
            license: { kind: "known", id: "MIT", name: "MIT License" },
        } as const;

        expect(parseRepositoryFacts(formatRepositoryFacts(facts))).toEqual(facts);
    });

    it("read as nothing when the file is not facts", () => {
        expect(parseRepositoryFacts("{")).toBeUndefined();
        expect(parseRepositoryFacts('{"host":"bitbucket"}')).toBeUndefined();
        expect(parseRepositoryFacts('{"host":"gitlab","license":{"kind":"known"}}')).toEqual({
            host: "gitlab",
        });
    });
});
