import { describe, expect, it } from "vitest";

import { LOCAL_HOST } from "@miragon/bpmn-modeler-core";

import { UriParts } from "./canonicalPath";
import { originHostOf } from "./originHost";

const remoteFolder = (authority: string, path = "/work/repo"): UriParts => ({
    scheme: "vscode-remote",
    authority,
    path,
});

describe("originHostOf", () => {
    it.each<{
        behaviour: string;
        remoteName: string | undefined;
        folders: UriParts[];
        host: string;
    }>([
        {
            behaviour: "takes a local window as the local host",
            remoteName: undefined,
            folders: [{ scheme: "file", authority: "", path: "/work/repo" }],
            host: LOCAL_HOST,
        },
        {
            behaviour: "takes an SSH window by the authority of its folder",
            remoteName: "ssh-remote",
            folders: [remoteFolder("ssh-remote+box")],
            host: "ssh-remote+box",
        },
        {
            behaviour: "takes a remote window without folders by the kind of remote",
            remoteName: "ssh-remote",
            folders: [],
            host: "ssh-remote",
        },
        {
            behaviour: "skips a file folder of a remote window",
            remoteName: "wsl",
            folders: [
                { scheme: "file", authority: "", path: "/c:/work" },
                remoteFolder("wsl+Ubuntu"),
            ],
            host: "wsl+Ubuntu",
        },
        {
            behaviour: "never takes a remote window as local through a folder without authority",
            remoteName: "ssh-remote",
            folders: [remoteFolder("")],
            host: "ssh-remote",
        },
    ])("$behaviour", ({ remoteName, folders, host }) => {
        expect(originHostOf(remoteName, folders)).toBe(host);
    });

    it("tells two dev containers apart", () => {
        expect(originHostOf("dev-container", [remoteFolder("dev-container+61707031")])).not.toBe(
            originHostOf("dev-container", [remoteFolder("dev-container+61707032")]),
        );
    });
});
