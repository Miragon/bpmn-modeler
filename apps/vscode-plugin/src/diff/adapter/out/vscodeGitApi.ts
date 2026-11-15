/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The members of extensions/git/src/api/git.d.ts@1.76.0, the engines floor, that the adapter
// reads; types only. `Change.status` is left out on purpose: `Status` is a const enum whose
// numbers moved in 1.79 and 1.81, so no code may compare it.

import type { Event, Uri } from "vscode";

export interface Commit {
    readonly hash: string;
    readonly message: string;
}

interface Branch {
    readonly name?: string;
    readonly commit?: string;
}

interface Change {
    readonly uri: Uri;
}

interface RepositoryState {
    readonly HEAD: Branch | undefined;
    readonly rebaseCommit: Commit | undefined;
    readonly mergeChanges: Change[];
    readonly onDidChange: Event<void>;
}

export interface Repository {
    readonly rootUri: Uri;
    readonly state: RepositoryState;
    buffer(ref: string, path: string): Promise<Uint8Array>;
    getCommit(ref: string): Promise<Commit>;
    status(): Promise<void>;
}

type APIState = "uninitialized" | "initialized";

export interface API {
    readonly state: APIState;
    readonly onDidChangeState: Event<APIState>;
    readonly repositories: Repository[];
    readonly onDidOpenRepository: Event<Repository>;
    readonly onDidCloseRepository: Event<Repository>;
    getRepository(uri: Uri): Repository | null;
}

export interface GitExtension {
    readonly enabled: boolean;
    getAPI(version: 1): API;
}
