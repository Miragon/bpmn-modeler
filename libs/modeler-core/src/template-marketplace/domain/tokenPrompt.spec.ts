import { describe, expect, it } from "vitest";

import { enteredToken, tokenPrompt } from "./tokenPrompt";

describe("tokenPrompt", () => {
    it.each([
        {
            behaviour: "names github.com in the title and asks with the given reason",
            host: "github.com",
            reason: "github.com denied access to acme/templates (HTTP 404); it may be private. Enter a personal access token.",
        },
        {
            behaviour: "names a self-hosted host in the title",
            host: "gitlab.acme.com",
            reason: "gitlab.acme.com hosts a private template source. Enter a personal access token to fetch it.",
        },
    ])("$behaviour, in a masked input", ({ host, reason }) => {
        expect(tokenPrompt(host, reason)).toStrictEqual({
            host,
            title: `Personal Access Token for ${host}`,
            prompt: reason,
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
