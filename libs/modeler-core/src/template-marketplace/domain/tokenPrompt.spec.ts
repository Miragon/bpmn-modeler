import { describe, expect, it } from "vitest";

import { AccessDenial } from "./accessDenial";
import { RepositoryAccessError } from "./ports";
import { enteredToken, TokenPromptReason, tokenPromptFor } from "./tokenPrompt";

describe("tokenPromptFor", () => {
    it.each<{
        behaviour: string;
        host: string;
        reason: TokenPromptReason;
        title: string;
        prompt: string;
    }>([
        {
            behaviour: "asks with the denial's wording after a refused request",
            host: "github.com",
            reason: AccessDenial.of(
                new RepositoryAccessError("github.com", 404, "acme/templates", false),
                { tokenTried: false },
            ),
            title: "Personal Access Token for github.com",
            prompt: "github.com denied access to acme/templates (HTTP 404); it may be private. Enter a personal access token.",
        },
        {
            behaviour: "asks up front for a source the marketplace declares private",
            host: "gitlab.acme.com",
            reason: "declaredPrivate",
            title: "Personal Access Token for gitlab.acme.com",
            prompt: "gitlab.acme.com hosts a private template source. Enter a personal access token to fetch it.",
        },
    ])("$behaviour, in a masked input", ({ host, reason, title, prompt }) => {
        expect(tokenPromptFor(host, reason)).toStrictEqual({
            host,
            title,
            prompt,
            password: true,
        });
    });
});

describe("enteredToken", () => {
    it.each<{ behaviour: string; answer: string | undefined; token: string | undefined }>([
        { behaviour: "keeps a typed token", answer: "ghp_abc", token: "ghp_abc" },
        {
            behaviour: "drops the whitespace a paste leaves around a token",
            answer: "  ghp_abc\n",
            token: "ghp_abc",
        },
        { behaviour: "keeps the whitespace inside a token", answer: "a b", token: "a b" },
        { behaviour: "takes an empty answer for no token", answer: "", token: undefined },
        { behaviour: "takes a blank answer for no token", answer: " \t\n ", token: undefined },
        { behaviour: "takes a dismissed prompt for no token", answer: undefined, token: undefined },
    ])("$behaviour", ({ answer, token }) => {
        expect(enteredToken(answer)).toBe(token);
    });
});
