import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { samePathStamp } from "../modeler/bpmn/domain/packageClosure";
import { InstalledPackagesPort } from "../modeler/bpmn/port/installedPackagesPort";

/** One {@link InstalledPackagesPort} adapter under the {@link describeInstalledPackagesContract} scenarios. */
export interface InstalledPackagesContractFixture {
    readonly packages: InstalledPackagesPort;
    /** An empty directory, given as its realpath spelled like `toWorkspacePath`. */
    readonly root: string;
    /** Writes the file and its missing parent directories, as a package manager would. */
    writeFile(path: string, content: string | Uint8Array): void;
    createDirectory(path: string): void;
    /** Links `path` to `target`, which need not exist. */
    createSymbolicLink(path: string, target: string): void;
    dispose(): void;
}

const TEXT_OUTSIDE_ASCII = "Prüfung ✓";

const WINDOWS_DRIVE = /^[A-Za-z]:/;

// Longer than the coarsest file system clock tick a host may run on.
const CLOCK_TICK_MS = 25;

/**
 * The rules of {@link InstalledPackagesPort} the core relies on to find and
 * stamp a rule package, run against one adapter on a real or in-memory
 * directory. A stamp follows links, so retargeting a link changes it.
 *
 * `realPath` and `readTextFile` are pinned by `describeRepositoryFilesContract`,
 * which every adapter of this port runs too.
 *
 * Left out: the order of directory entries, which the core sorts, and a same
 * size rewrite within one clock tick, which no stamp can see. The `/c:/…`
 * spelling runs only where the root has a drive letter, that is on Windows.
 */
export function describeInstalledPackagesContract(
    adapter: string,
    createFixture: () => InstalledPackagesContractFixture,
): void {
    describe(`${adapter} keeps the InstalledPackagesPort contract`, () => {
        let fixture: InstalledPackagesContractFixture;
        let packages: InstalledPackagesPort;
        let root: string;

        beforeEach(() => {
            fixture = createFixture();
            ({ packages, root } = fixture);
        });

        afterEach(() => {
            fixture.dispose();
        });

        describe("listDirectory", () => {
            it("names each entry with its kind, reporting links rather than following them", () => {
                fixture.writeFile(`${root}/pkg/index.js`, "x");
                fixture.createDirectory(`${root}/pkg/rules`);
                fixture.createSymbolicLink(`${root}/pkg/linked-dir`, `${root}/pkg/rules`);
                fixture.createSymbolicLink(`${root}/pkg/linked-file`, `${root}/pkg/index.js`);
                fixture.createSymbolicLink(`${root}/pkg/dangling`, `${root}/nowhere`);

                const entries = packages.listDirectory(`${root}/pkg`) ?? [];

                expect([...entries].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
                    { name: "dangling", kind: "symbolicLink" },
                    { name: "index.js", kind: "file" },
                    { name: "linked-dir", kind: "symbolicLink" },
                    { name: "linked-file", kind: "symbolicLink" },
                    { name: "rules", kind: "directory" },
                ]);
            });

            it("lists an empty directory as empty", () => {
                fixture.createDirectory(`${root}/empty`);

                expect(packages.listDirectory(`${root}/empty`)).toEqual([]);
            });

            it("lists nothing for a missing path or a file", () => {
                fixture.writeFile(`${root}/file.js`, "x");

                expect(packages.listDirectory(`${root}/missing`)).toBeUndefined();
                expect(packages.listDirectory(`${root}/file.js`)).toBeUndefined();
            });
        });

        describe("stamp", () => {
            it("stamps a file with its kind and byte size", () => {
                fixture.writeFile(`${root}/a.js`, TEXT_OUTSIDE_ASCII);

                expect(packages.stamp(`${root}/a.js`)).toMatchObject({
                    kind: "file",
                    size: BigInt(new TextEncoder().encode(TEXT_OUTSIDE_ASCII).length),
                });
                expect(packages.stamp(root)?.kind).toBe("directory");
            });

            it("stamps an untouched path alike each time", () => {
                fixture.writeFile(`${root}/a.js`, "x");

                expect(
                    samePathStamp(packages.stamp(`${root}/a.js`), packages.stamp(`${root}/a.js`)),
                ).toBe(true);
                expect(samePathStamp(packages.stamp(root), packages.stamp(root))).toBe(true);
            });

            it("stamps a link as its target", () => {
                fixture.writeFile(`${root}/a.js`, "x");
                fixture.createSymbolicLink(`${root}/link.js`, `${root}/a.js`);

                expect(
                    samePathStamp(
                        packages.stamp(`${root}/link.js`),
                        packages.stamp(`${root}/a.js`),
                    ),
                ).toBe(true);
            });

            it("stamps a rewritten file differently", () => {
                fixture.writeFile(`${root}/a.js`, "x");
                const before = packages.stamp(`${root}/a.js`);

                fixture.writeFile(`${root}/a.js`, "xy");

                expect(samePathStamp(packages.stamp(`${root}/a.js`), before)).toBe(false);
            });

            it("stamps a directory differently once it holds a new entry", async () => {
                fixture.createDirectory(`${root}/pkg`);
                const before = packages.stamp(`${root}/pkg`);
                await new Promise((resolve) => setTimeout(resolve, CLOCK_TICK_MS));

                fixture.writeFile(`${root}/pkg/added.js`, "x");

                expect(samePathStamp(packages.stamp(`${root}/pkg`), before)).toBe(false);
            });

            it("stamps nothing for a missing path or a dangling link", () => {
                fixture.createSymbolicLink(`${root}/dangling`, `${root}/nowhere`);

                expect(packages.stamp(`${root}/missing`)).toBeUndefined();
                expect(packages.stamp(`${root}/dangling`)).toBeUndefined();
            });
        });

        it("reads a Windows path spelled as a URI path, /c:/…", (context) => {
            if (!WINDOWS_DRIVE.test(root)) context.skip();
            fixture.writeFile(`${root}/pkg/package.json`, "abc");
            const uriPath = `/${root}/pkg`;

            expect(packages.realPath(uriPath)).toBe(`${root}/pkg`);
            expect(packages.entryKindOf(uriPath)).toBe("directory");
            expect(packages.listDirectory(uriPath)).toEqual([
                { name: "package.json", kind: "file" },
            ]);
            expect(packages.stamp(`${uriPath}/package.json`)?.kind).toBe("file");
            expect(packages.readTextFile(`${uriPath}/package.json`)).toBe("abc");
        });
    });
}
