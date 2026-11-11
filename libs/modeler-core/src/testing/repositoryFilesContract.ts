import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RepositoryFilesPort } from "../kernel/port/repositoryFilesPort";

/** One {@link RepositoryFilesPort} adapter under the {@link describeRepositoryFilesContract} scenarios. */
export interface RepositoryFilesContractFixture {
    readonly files: RepositoryFilesPort;
    /** An empty directory, given as its realpath spelled like `toWorkspacePath`. */
    readonly root: string;
    /** Writes the file and its missing parent directories. */
    writeFile(path: string, content: string): void;
    createDirectory(path: string): void;
    /** Links `path` to `target`, which need not exist. */
    createSymbolicLink(path: string, target: string): void;
    dispose(): void;
}

const TEXT_OUTSIDE_ASCII = "gitdir: /wörk/repo/.git/worktrees/täsk\n";

/**
 * The rules of {@link RepositoryFilesPort} the core relies on to tell which
 * repository holds code, run against one adapter. The kind of an entry must
 * not follow a link: a linked `.git` could name any repository.
 */
export function describeRepositoryFilesContract(
    adapter: string,
    createFixture: () => RepositoryFilesContractFixture,
): void {
    describe(`${adapter} keeps the RepositoryFilesPort contract`, () => {
        let fixture: RepositoryFilesContractFixture;
        let files: RepositoryFilesPort;
        let root: string;

        beforeEach(() => {
            fixture = createFixture();
            ({ files, root } = fixture);
        });

        afterEach(() => {
            fixture.dispose();
        });

        describe("realPath", () => {
            it("gives an existing directory as it is", () => {
                expect(files.realPath(root)).toBe(root);
            });

            it("resolves a linked folder on the way to a file", () => {
                fixture.writeFile(`${root}/store/pkg/index.js`, "x");
                fixture.createSymbolicLink(`${root}/linked`, `${root}/store/pkg`);

                expect(files.realPath(`${root}/linked/index.js`)).toBe(
                    `${root}/store/pkg/index.js`,
                );
            });

            it("gives nothing for a missing path or a dangling link", () => {
                fixture.createSymbolicLink(`${root}/dangling`, `${root}/nowhere`);

                expect(files.realPath(`${root}/missing`)).toBeUndefined();
                expect(files.realPath(`${root}/dangling`)).toBeUndefined();
            });
        });

        describe("entryKindOf", () => {
            it("tells a file from a directory", () => {
                fixture.writeFile(`${root}/repo/.git`, "gitdir: x");
                fixture.createDirectory(`${root}/main/.git`);

                expect(files.entryKindOf(`${root}/repo/.git`)).toBe("file");
                expect(files.entryKindOf(`${root}/main/.git`)).toBe("directory");
            });

            it("reports a link as a link, whatever it names", () => {
                fixture.createDirectory(`${root}/main/.git`);
                fixture.createDirectory(`${root}/repo`);
                fixture.createSymbolicLink(`${root}/repo/.git`, `${root}/main/.git`);
                fixture.createSymbolicLink(`${root}/dangling`, `${root}/nowhere`);

                expect(files.entryKindOf(`${root}/repo/.git`)).toBe("symbolicLink");
                expect(files.entryKindOf(`${root}/dangling`)).toBe("symbolicLink");
            });

            it("follows a linked folder on the way to the entry", () => {
                fixture.writeFile(`${root}/store/repo/.git`, "gitdir: x");
                fixture.createSymbolicLink(`${root}/linked`, `${root}/store/repo`);

                expect(files.entryKindOf(`${root}/linked/.git`)).toBe("file");
            });

            it("gives nothing for a missing path", () => {
                expect(files.entryKindOf(`${root}/missing/.git`)).toBeUndefined();
            });
        });

        describe("readTextFile", () => {
            it("reads a file as UTF-8", () => {
                fixture.writeFile(`${root}/repo/.git`, TEXT_OUTSIDE_ASCII);

                expect(files.readTextFile(`${root}/repo/.git`)).toBe(TEXT_OUTSIDE_ASCII);
            });

            it("reads nothing for a missing path or a directory", () => {
                expect(files.readTextFile(`${root}/missing`)).toBeUndefined();
                expect(files.readTextFile(root)).toBeUndefined();
            });
        });
    });
}
