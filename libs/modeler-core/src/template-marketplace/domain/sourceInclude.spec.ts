import { describe, expect, it } from "vitest";

import { includedFiles } from "./sourceInclude";

const MONOREPO_LISTING = [
    "connectors/http/element-templates/rest.json",
    "connectors/http/src/test/fixture.json",
    "connectors/http/element-templates/versioned/old.json",
    "connectors/aws/lambda/element-templates/lambda.json",
];

describe("includedFiles", () => {
    it.each<{
        behaviour: string;
        listed: string[];
        subtreePath: string;
        include: string[] | undefined;
        included: string[];
    }>([
        {
            behaviour: "keeps every listed file of a source without include",
            listed: MONOREPO_LISTING,
            subtreePath: "connectors",
            include: undefined,
            included: MONOREPO_LISTING,
        },
        {
            behaviour: "matches below the subtree and keeps the full listed paths",
            listed: MONOREPO_LISTING,
            subtreePath: "connectors",
            include: ["**/element-templates/*.json"],
            included: [
                "connectors/http/element-templates/rest.json",
                "connectors/aws/lambda/element-templates/lambda.json",
            ],
        },
        {
            behaviour: "excludes a nested file from a single-depth pattern",
            listed: ["element-templates/a.json", "element-templates/nested/b.json"],
            subtreePath: "element-templates",
            include: ["*.json"],
            included: ["element-templates/a.json"],
        },
        {
            behaviour: "keeps a file any one of several patterns matches",
            listed: ["t/a.json", "t/b.json", "t/c.json"],
            subtreePath: "t",
            include: ["a.json", "c.json"],
            included: ["t/a.json", "t/c.json"],
        },
        {
            behaviour: "matches every listed path whole at the subtree root, even a rooted one",
            listed: ["a.json", "sub/b.json", "/c.json"],
            subtreePath: "",
            include: ["*.json"],
            included: ["a.json"],
        },
        {
            behaviour: "matches a listed path outside the subtree whole instead of dropping it",
            listed: ["other/a.json"],
            subtreePath: "connectors",
            include: ["other/*.json"],
            included: ["other/a.json"],
        },
        {
            behaviour: "strips the subtree only at a folder boundary",
            listed: ["connectors/a.json"],
            subtreePath: "conn",
            include: ["connectors/*.json"],
            included: ["connectors/a.json"],
        },
        {
            behaviour: "keeps nothing when no pattern matches",
            listed: ["connectors/http/element-templates/rest.json"],
            subtreePath: "connectors",
            include: ["**/nope/*.json"],
            included: [],
        },
    ])("$behaviour", ({ listed, subtreePath, include, included }) => {
        expect(includedFiles(listed, subtreePath, include)).toEqual(included);
    });
});
