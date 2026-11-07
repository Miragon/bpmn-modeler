import { describe, expect, it } from "vitest";

import { MARKETPLACE_PROVIDERS, MarketplaceProvider } from "../../kernel/domain/modelerSettings";
import {
    hostForConfig,
    publicHostOf,
    repositoryHostOf,
    RepositorySourceConfig,
} from "./repositorySourceConfig";

describe("publicHostOf", () => {
    it.each<{ provider: MarketplaceProvider; host: string }>([
        { provider: "github", host: "github.com" },
        { provider: "gitlab", host: "gitlab.com" },
    ])("names $host for $provider", ({ provider, host }) => {
        expect(publicHostOf(provider)).toBe(host);
    });
});

describe("repositoryHostOf", () => {
    it.each<{ provider: MarketplaceProvider; baseUrl: string | undefined; host: string }>([
        { provider: "github", baseUrl: undefined, host: "github.com" },
        { provider: "gitlab", baseUrl: undefined, host: "gitlab.com" },
        { provider: "github", baseUrl: "", host: "github.com" },
        { provider: "gitlab", baseUrl: "", host: "gitlab.com" },
        { provider: "github", baseUrl: "https://ghe.acme.com", host: "ghe.acme.com" },
        {
            provider: "gitlab",
            baseUrl: "https://gitlab.acme.com:8443/sub",
            host: "gitlab.acme.com:8443",
        },
    ])("names $host for $provider with baseUrl '$baseUrl'", ({ provider, baseUrl, host }) => {
        expect(repositoryHostOf(provider, baseUrl)).toBe(host);
    });

    it.each(MARKETPLACE_PROVIDERS)("rejects a %s baseUrl that is not a URL", (provider) => {
        expect(() => repositoryHostOf(provider, "not a url")).toThrow(TypeError);
    });
});

describe("hostForConfig", () => {
    it.each<{ behaviour: string; config: RepositorySourceConfig; host: string | undefined }>([
        {
            behaviour: "sends a local folder's credentials nowhere",
            config: { kind: "local", rootDir: "/srv/templates", path: "" },
            host: undefined,
        },
        {
            behaviour: "sends a public GitHub repo's credentials to github.com",
            config: { kind: "github", owner: "acme", repo: "templates", path: "" },
            host: "github.com",
        },
        {
            behaviour: "sends a self-hosted GitLab project's credentials to its baseUrl's host",
            config: {
                kind: "gitlab",
                projectPath: "group/templates",
                path: "",
                baseUrl: "https://gitlab.acme.com",
            },
            host: "gitlab.acme.com",
        },
    ])("$behaviour", ({ config, host }) => {
        expect(hostForConfig(config)).toBe(host);
    });
});
