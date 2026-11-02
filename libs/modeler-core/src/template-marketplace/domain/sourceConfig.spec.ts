import { describe, expect, it } from "vitest";

import { MarketplaceLocation, TemplateSource } from "./marketplace";
import { RepositorySourceConfig } from "./ports";
import {
    declaredPrivateHosts,
    describeSourceConfig,
    manifestConfig,
    sourceConfig,
    sourceIdentity,
} from "./sourceConfig";

const GITHUB_MARKETPLACE: MarketplaceLocation = {
    kind: "github",
    owner: "acme",
    repo: "templates",
    ref: "main",
};
const ENTERPRISE_GITHUB_MARKETPLACE: MarketplaceLocation = {
    kind: "github",
    owner: "acme",
    repo: "templates",
    baseUrl: "https://ghe.acme.com",
};
const SELF_HOSTED_GITLAB_MARKETPLACE: MarketplaceLocation = {
    kind: "gitlab",
    projectPath: "group/sub/templates",
    ref: "v1",
    baseUrl: "https://gitlab.acme.com",
};
const LOCAL_MARKETPLACE: MarketplaceLocation = { kind: "local", rootDir: "/srv/templates" };
const HOME_DIR = "/home/me";

const RELATIVE_SOURCE: TemplateSource = {
    kind: "relative",
    type: "element-templates",
    path: "element-templates",
    include: ["*.json"],
};
const PUBLIC_GITHUB_SOURCE: TemplateSource = {
    kind: "github",
    type: "element-templates",
    owner: "camunda",
    repo: "connectors",
    ref: "develop",
    path: "resources",
    visibility: "public",
    include: ["**/*.json"],
};
const UNDECLARED_GITHUB_SOURCE: TemplateSource = {
    kind: "github",
    type: "element-templates",
    owner: "acme",
    repo: "unknown",
    path: "t",
};
const PRIVATE_GITHUB_SOURCE: TemplateSource = {
    kind: "github",
    type: "element-templates",
    owner: "acme",
    repo: "private-one",
    path: "t",
    visibility: "private",
};
const OTHER_PRIVATE_GITHUB_SOURCE: TemplateSource = {
    ...PRIVATE_GITHUB_SOURCE,
    repo: "private-two",
};
const PRIVATE_ENTERPRISE_GITHUB_SOURCE: TemplateSource = {
    ...PRIVATE_GITHUB_SOURCE,
    baseUrl: "https://ghe.acme.com",
};
const PRIVATE_GITLAB_SOURCE: TemplateSource = {
    kind: "gitlab",
    type: "element-templates",
    projectPath: "group/project",
    path: "t",
    visibility: "private",
};
const PRIVATE_SELF_HOSTED_GITLAB_SOURCE: TemplateSource = {
    kind: "gitlab",
    type: "element-templates",
    projectPath: "group/sub/project",
    ref: "v2",
    path: "templates",
    baseUrl: "https://gitlab.acme.com",
    visibility: "private",
    include: ["*.json"],
};
const HOME_LOCAL_SOURCE: TemplateSource = {
    kind: "local",
    type: "element-templates",
    path: "~/ext-templates",
};
const ABSOLUTE_LOCAL_SOURCE: TemplateSource = {
    kind: "local",
    type: "element-templates",
    path: "/opt/ext",
    include: ["*.json"],
};

describe("manifestConfig", () => {
    it.each<{ behaviour: string; location: MarketplaceLocation; config: RepositorySourceConfig }>([
        {
            behaviour: "reads a github marketplace at its repository root and ref",
            location: GITHUB_MARKETPLACE,
            config: { kind: "github", owner: "acme", repo: "templates", ref: "main", path: "" },
        },
        {
            behaviour: "keeps the baseUrl of a GitHub Enterprise marketplace",
            location: ENTERPRISE_GITHUB_MARKETPLACE,
            config: {
                kind: "github",
                owner: "acme",
                repo: "templates",
                path: "",
                baseUrl: "https://ghe.acme.com",
            },
        },
        {
            behaviour: "reads a self-hosted gitlab marketplace at its project root and ref",
            location: SELF_HOSTED_GITLAB_MARKETPLACE,
            config: {
                kind: "gitlab",
                projectPath: "group/sub/templates",
                ref: "v1",
                path: "",
                baseUrl: "https://gitlab.acme.com",
            },
        },
        {
            behaviour: "reads a local marketplace at its folder",
            location: LOCAL_MARKETPLACE,
            config: { kind: "local", rootDir: "/srv/templates", path: "" },
        },
    ])("$behaviour", ({ location, config }) => {
        expect(manifestConfig(location)).toEqual(config);
    });
});

describe("sourceConfig", () => {
    it.each<{
        behaviour: string;
        source: TemplateSource;
        marketplace: MarketplaceLocation;
        config: RepositorySourceConfig;
    }>([
        {
            behaviour: "resolves a relative source against the github marketplace and its ref",
            source: RELATIVE_SOURCE,
            marketplace: GITHUB_MARKETPLACE,
            config: {
                kind: "github",
                owner: "acme",
                repo: "templates",
                ref: "main",
                path: "element-templates",
            },
        },
        {
            behaviour: "resolves a relative source against a self-hosted gitlab marketplace",
            source: RELATIVE_SOURCE,
            marketplace: SELF_HOSTED_GITLAB_MARKETPLACE,
            config: {
                kind: "gitlab",
                projectPath: "group/sub/templates",
                ref: "v1",
                path: "element-templates",
                baseUrl: "https://gitlab.acme.com",
            },
        },
        {
            behaviour: "resolves a relative source inside the local marketplace folder",
            source: RELATIVE_SOURCE,
            marketplace: LOCAL_MARKETPLACE,
            config: { kind: "local", rootDir: "/srv/templates", path: "element-templates" },
        },
        {
            behaviour: "reads a github source from its own repository, not the marketplace's",
            source: PUBLIC_GITHUB_SOURCE,
            marketplace: SELF_HOSTED_GITLAB_MARKETPLACE,
            config: {
                kind: "github",
                owner: "camunda",
                repo: "connectors",
                ref: "develop",
                path: "resources",
            },
        },
        {
            behaviour: "keeps the baseUrl of a GitHub Enterprise source",
            source: PRIVATE_ENTERPRISE_GITHUB_SOURCE,
            marketplace: GITHUB_MARKETPLACE,
            config: {
                kind: "github",
                owner: "acme",
                repo: "private-one",
                path: "t",
                baseUrl: "https://ghe.acme.com",
            },
        },
        {
            behaviour: "reads a self-hosted gitlab source from its own project",
            source: PRIVATE_SELF_HOSTED_GITLAB_SOURCE,
            marketplace: GITHUB_MARKETPLACE,
            config: {
                kind: "gitlab",
                projectPath: "group/sub/project",
                ref: "v2",
                path: "templates",
                baseUrl: "https://gitlab.acme.com",
            },
        },
        {
            behaviour: "expands a ~ local source against the home directory",
            source: HOME_LOCAL_SOURCE,
            marketplace: GITHUB_MARKETPLACE,
            config: { kind: "local", rootDir: "/home/me/ext-templates", path: "" },
        },
        {
            behaviour: "reads an absolute local source as its own folder",
            source: ABSOLUTE_LOCAL_SOURCE,
            marketplace: LOCAL_MARKETPLACE,
            config: { kind: "local", rootDir: "/opt/ext", path: "" },
        },
    ])("$behaviour", ({ source, marketplace, config }) => {
        expect(sourceConfig(source, marketplace, HOME_DIR)).toEqual(config);
    });
});

describe("declaredPrivateHosts", () => {
    it.each<{ behaviour: string; sources: TemplateSource[]; hosts: string[] }>([
        {
            behaviour: "names no host for a marketplace without sources",
            sources: [],
            hosts: [],
        },
        {
            behaviour: "names no host for public, undeclared, relative and local sources",
            sources: [
                PUBLIC_GITHUB_SOURCE,
                UNDECLARED_GITHUB_SOURCE,
                RELATIVE_SOURCE,
                HOME_LOCAL_SOURCE,
            ],
            hosts: [],
        },
        {
            behaviour: "names github.com for a private github source",
            sources: [PRIVATE_GITHUB_SOURCE],
            hosts: ["github.com"],
        },
        {
            behaviour: "names gitlab.com for a private gitlab source",
            sources: [PRIVATE_GITLAB_SOURCE],
            hosts: ["gitlab.com"],
        },
        {
            behaviour: "names the baseUrl host of a private self-hosted source",
            sources: [PRIVATE_ENTERPRISE_GITHUB_SOURCE, PRIVATE_SELF_HOSTED_GITLAB_SOURCE],
            hosts: ["ghe.acme.com", "gitlab.acme.com"],
        },
        {
            behaviour: "names a host once for two private sources on it",
            sources: [PRIVATE_GITHUB_SOURCE, OTHER_PRIVATE_GITHUB_SOURCE],
            hosts: ["github.com"],
        },
        {
            behaviour: "names each host in source order, skipping the public sources",
            sources: [
                PRIVATE_SELF_HOSTED_GITLAB_SOURCE,
                PUBLIC_GITHUB_SOURCE,
                PRIVATE_GITHUB_SOURCE,
                PRIVATE_GITLAB_SOURCE,
                OTHER_PRIVATE_GITHUB_SOURCE,
            ],
            hosts: ["gitlab.acme.com", "github.com", "gitlab.com"],
        },
    ])("$behaviour", ({ sources, hosts }) => {
        expect(declaredPrivateHosts(sources)).toEqual(hosts);
    });
});

describe("describeSourceConfig", () => {
    it.each<{ behaviour: string; config: RepositorySourceConfig; description: string }>([
        {
            behaviour: "names a github repository with its ref and path",
            config: {
                kind: "github",
                owner: "acme",
                repo: "templates",
                ref: "main",
                path: "element-templates",
            },
            description: 'github github.com/acme/templates@main path "element-templates"',
        },
        {
            behaviour: "names a github repository root without a ref or path",
            config: { kind: "github", owner: "acme", repo: "templates", path: "" },
            description: "github github.com/acme/templates",
        },
        {
            behaviour: "names the host of a GitHub Enterprise repository",
            config: {
                kind: "github",
                owner: "acme",
                repo: "templates",
                path: "",
                baseUrl: "https://ghe.acme.com",
            },
            description: "github ghe.acme.com/acme/templates",
        },
        {
            behaviour: "names a self-hosted gitlab project by its full path",
            config: {
                kind: "gitlab",
                projectPath: "group/sub/project",
                ref: "v2",
                path: "templates",
                baseUrl: "https://gitlab.acme.com",
            },
            description: 'gitlab gitlab.acme.com/group/sub/project@v2 path "templates"',
        },
        {
            behaviour: "never names the token a remote config carries",
            config: { kind: "gitlab", projectPath: "group/proj", path: "", token: "secret" },
            description: "gitlab gitlab.com/group/proj",
        },
        {
            behaviour: "names a local folder",
            config: { kind: "local", rootDir: "/srv/templates", path: "" },
            description: "local folder /srv/templates",
        },
        {
            behaviour: "names the path of a relative source in a local marketplace",
            config: { kind: "local", rootDir: "/srv/templates", path: "element-templates" },
            description: 'local folder /srv/templates path "element-templates"',
        },
    ])("$behaviour", ({ config, description }) => {
        expect(describeSourceConfig(config)).toBe(description);
    });
});

describe("sourceIdentity", () => {
    const GITHUB_CONFIG: RepositorySourceConfig = {
        kind: "github",
        owner: "acme",
        repo: "templates",
        ref: "main",
        path: "element-templates",
    };
    const GITLAB_CONFIG: RepositorySourceConfig = {
        kind: "gitlab",
        projectPath: "acme/templates",
        ref: "main",
        path: "element-templates",
    };
    const LOCAL_CONFIG: RepositorySourceConfig = {
        kind: "local",
        rootDir: "/srv/templates",
        path: "element-templates",
    };

    it.each<{
        behaviour: string;
        config: RepositorySourceConfig;
        other: RepositorySourceConfig;
        sameSource: boolean;
    }>([
        {
            behaviour: "names a source the same on every refresh",
            config: GITHUB_CONFIG,
            other: { ...GITHUB_CONFIG },
            sameSource: true,
        },
        {
            behaviour: "names a source the same whatever token it carries",
            config: GITHUB_CONFIG,
            other: { ...GITHUB_CONFIG, token: "secret" },
            sameSource: true,
        },
        {
            behaviour: "tells github repositories of two owners apart",
            config: GITHUB_CONFIG,
            other: { ...GITHUB_CONFIG, owner: "globex" },
            sameSource: false,
        },
        {
            behaviour: "tells two github repositories of one owner apart",
            config: GITHUB_CONFIG,
            other: { ...GITHUB_CONFIG, repo: "connectors" },
            sameSource: false,
        },
        {
            behaviour: "tells two refs apart",
            config: GITHUB_CONFIG,
            other: { ...GITHUB_CONFIG, ref: "develop" },
            sameSource: false,
        },
        {
            behaviour: "tells two paths apart",
            config: GITHUB_CONFIG,
            other: { ...GITHUB_CONFIG, path: "resources" },
            sameSource: false,
        },
        {
            behaviour: "tells a ref with a slash from a path that continues it",
            config: { ...GITHUB_CONFIG, ref: "release/1", path: "templates" },
            other: { ...GITHUB_CONFIG, ref: "release", path: "1/templates" },
            sameSource: false,
        },
        {
            behaviour: "tells a self-hosted instance from the public host",
            config: GITHUB_CONFIG,
            other: { ...GITHUB_CONFIG, baseUrl: "https://ghe.acme.com" },
            sameSource: false,
        },
        {
            behaviour: "tells a github repository from a gitlab project of the same name",
            config: GITHUB_CONFIG,
            other: GITLAB_CONFIG,
            sameSource: false,
        },
        {
            behaviour: "tells two gitlab projects apart",
            config: GITLAB_CONFIG,
            other: { ...GITLAB_CONFIG, projectPath: "acme/sub/templates" },
            sameSource: false,
        },
        {
            behaviour: "tells two local folders apart",
            config: LOCAL_CONFIG,
            other: { ...LOCAL_CONFIG, rootDir: "/opt/templates" },
            sameSource: false,
        },
        {
            behaviour: "tells two paths in one local folder apart",
            config: LOCAL_CONFIG,
            other: { ...LOCAL_CONFIG, path: "" },
            sameSource: false,
        },
    ])("$behaviour", ({ config, other, sameSource }) => {
        expect(sourceIdentity(config) === sourceIdentity(other)).toBe(sameSource);
    });

    it("never holds the token a remote config carries", () => {
        expect(sourceIdentity({ ...GITLAB_CONFIG, token: "secret" })).not.toContain("secret");
    });
});
