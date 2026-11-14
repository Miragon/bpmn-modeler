import { describe, expect, it } from "vitest";

import {
    aboutPlacesOf,
    compactCountText,
    packageLicenseViewOf,
    repositoryAboutOf,
} from "./addOnAbout";
import { ShownCode } from "./codeAddOnCatalog";

const shown = (id: string): ShownCode => ({
    kind: "plugin",
    id,
    name: "x",
    allowance: {} as ShownCode["allowance"],
    actions: [],
    allowedFollowUp: "",
    revokedFollowUp: "",
});

describe("aboutPlacesOf", () => {
    it("reads a code add-on in the folder it was found at", () => {
        const places = aboutPlacesOf(
            new Map([["plugin:/work/.camunda/plugins/acme", shown("/work/.camunda/plugins/acme")]]),
            [],
        );

        expect(places.get("plugin:/work/.camunda/plugins/acme")).toEqual({
            kind: "folder",
            dir: "/work/.camunda/plugins/acme",
        });
    });

    it("takes a marketplace's README and facts from its cache, and nothing it has none of", () => {
        const repository = { host: "github", stars: 3 } as const;
        const places = aboutPlacesOf(new Map(), [
            { sourceId: "marketplace:acme", readmeFile: "/cache/acme/readme/README.md", repository },
            { sourceId: "marketplace:none" },
        ]);

        expect(places.get("marketplace:acme")).toEqual({
            kind: "marketplace",
            readmeFile: "/cache/acme/readme/README.md",
            repository,
        });
        expect(places.has("marketplace:none")).toBe(false);
    });
});

describe("repositoryAboutOf", () => {
    it("shows a detected license by its SPDX id and the stars compact", () => {
        expect(
            repositoryAboutOf({
                host: "github",
                stars: 1234,
                license: { kind: "known", id: "MIT", name: "MIT License" },
            }),
        ).toEqual({
            license: {
                kind: "known",
                text: "MIT",
                label: "License: MIT License, as GitHub detected it",
            },
            stars: {
                text: "1.2k",
                label: "1,234 stars on GitHub, as of the last marketplace update",
            },
        });
    });

    it("says when the host found no license, or one it does not recognise", () => {
        expect(repositoryAboutOf({ host: "gitlab", license: { kind: "none" } })).toEqual({
            license: {
                kind: "none",
                text: "No license",
                label: "GitLab found no license file in the repository.",
            },
        });
        expect(repositoryAboutOf({ host: "github", license: { kind: "other" } }).license?.text).toBe(
            "Custom license",
        );
        expect(repositoryAboutOf(undefined)).toEqual({});
    });
});

describe("packageLicenseViewOf", () => {
    it("reads an SPDX expression and a legacy type", () => {
        expect(packageLicenseViewOf('{"license":"Apache-2.0 OR MIT"}')).toEqual({
            kind: "known",
            text: "Apache-2.0 OR MIT",
            label: "License: Apache-2.0 OR MIT, as its package.json says",
        });
        expect(packageLicenseViewOf('{"license":{"type":"ISC"}}')?.text).toBe("ISC");
    });

    it("shortens a pointer at a file, and reads nothing from a package without one", () => {
        expect(packageLicenseViewOf('{"license":"SEE LICENSE IN LICENSE.txt"}')).toEqual({
            kind: "other",
            text: "Custom license",
            label: "License: SEE LICENSE IN LICENSE.txt, as its package.json says",
        });
        expect(packageLicenseViewOf('{"name":"x"}')).toBeUndefined();
        expect(packageLicenseViewOf("{")).toBeUndefined();
    });
});

describe("compactCountText", () => {
    it.each([
        [0, "0"],
        [999, "999"],
        [1000, "1k"],
        [1234, "1.2k"],
        [12_345, "12k"],
        [999_499, "999k"],
        [999_500, "1M"],
        [1_250_000, "1.3M"],
    ])("writes %i as %s", (count, text) => {
        expect(compactCountText(count)).toBe(text);
    });
});
