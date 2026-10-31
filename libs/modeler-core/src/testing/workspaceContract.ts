import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DirectoryNotFound,
    FileNotFound,
    NoWorkspaceFolderFoundError,
} from "../kernel/domain/errors";
import { WorkspacePort } from "../kernel/domain/hostPorts";
import { WatcherEventKind } from "../kernel/domain/watcherEvents";

/** One {@link WorkspacePort} adapter under the {@link describeWorkspaceContract} scenarios. */
export interface WorkspaceContractFixture {
    readonly workspace: WorkspacePort;
    /** An absolute, `/`-separated directory the scenarios may fill. */
    readonly root: string;
    openFolder(folder: string): void;
    /** Creates an empty directory, which the port itself cannot. */
    createDirectory(path: string): Promise<void>;
    /** Moves a directory holding `files` in from outside the root, as another program would. */
    moveDirectoryIn(path: string, files: Readonly<Record<string, string>>): Promise<void>;
    /** Removes a file the way another program would; the port has no file delete. */
    removeFile(path: string): Promise<void>;
    /** Resolves once the watchers created before the call report changes. */
    watchersReady(): Promise<void>;
    /** Resolves once the events of earlier changes have been delivered. */
    eventsDelivered(): Promise<void>;
    dispose(): Promise<void>;
}

interface WatcherEvent {
    readonly kind: WatcherEventKind;
    readonly path: string;
}

const EVENT_TIMEOUT_MS = 5000;
const WATCHER_SCENARIO_TIMEOUT_MS = 15000;

/**
 * The rules of {@link WorkspacePort} the core relies on, run against one
 * adapter. The in-memory fake and the bridge's `NodeWorkspace` both run them,
 * so within these scenarios a spec that passes on the fake cannot rely on a
 * rule the bridge breaks. Where the hosts differ, VS Code is the reference.
 * A directory created or deleted as a whole may arrive as one event for it or
 * as one for each of its files; the fake reports the directory, as VS Code does.
 */
export function describeWorkspaceContract(
    adapter: string,
    createFixture: () => Promise<WorkspaceContractFixture>,
): void {
    describe(`${adapter} keeps the WorkspacePort contract`, () => {
        let fixture: WorkspaceContractFixture;
        const watchers: { dispose(): void }[] = [];

        beforeEach(async () => {
            fixture = await createFixture();
        });

        afterEach(async () => {
            watchers.splice(0).forEach((watcher) => watcher.dispose());
            await fixture.dispose();
        });

        function watch(root: string, glob: string) {
            const events: WatcherEvent[] = [];
            const record = (kind: WatcherEventKind) => (path: string) => {
                events.push({ kind, path });
            };
            const watcher = fixture.workspace.createWatcher(root, glob, {
                onCreate: record("create"),
                onChange: record("change"),
                onDelete: record("delete"),
            });
            watchers.push(watcher);
            return { events, watcher };
        }

        const kindsFor = (events: readonly WatcherEvent[], path: string) =>
            events.filter((event) => event.path === path).map((event) => event.kind);
        const pathsOf = (events: readonly WatcherEvent[]) => [
            ...new Set(events.map((event) => event.path)),
        ];
        const reportsWholeDirectory =
            (kind: WatcherEventKind, directory: string, files: readonly string[]) =>
            (events: readonly WatcherEvent[]) =>
                kindsFor(events, directory).includes(kind) ||
                files.every((file) => kindsFor(events, file).includes(kind));

        // Delivery may be synchronous, as in the fake, or deferred, as in the hosts.
        const eventually = (assertion: () => void) =>
            vi.waitFor(assertion, { timeout: EVENT_TIMEOUT_MS, interval: 20 });

        describe("workspace folders", () => {
            it("resolves a document to the innermost folder that encloses it", () => {
                const { workspace, root } = fixture;
                fixture.openFolder(root);
                fixture.openFolder(`${root}/nested`);

                expect(workspace.getWorkspaceFolderPaths()).toEqual([root, `${root}/nested`]);
                expect(
                    workspace.findWorkspaceFolderForDocument(`${root}/nested/a/order.bpmn`),
                ).toBe(`${root}/nested`);
                expect(workspace.getWorkspaceFolderForDocument(`${root}/order.bpmn`)).toBe(root);
                expect(workspace.getWorkspaceFolderForDocument(root)).toBe(root);
            });

            it.each([
                {
                    behaviour:
                        "encloses every document of a workspace opened at the filesystem root",
                    folder: "/",
                    document: "/work/order.bpmn",
                    enclosing: "/",
                },
                {
                    behaviour: "encloses the documents of a workspace opened at a drive root",
                    folder: "C:/",
                    document: "C:/work/order.bpmn",
                    enclosing: "C:/",
                },
                {
                    behaviour: "encloses the documents of a drive root spelled as a URI path",
                    folder: "/c:/",
                    document: "/c:/work/order.bpmn",
                    enclosing: "/c:/",
                },
                {
                    behaviour:
                        "does not count a sibling that shares the folder's name prefix as inside",
                    folder: "/work",
                    document: "/work2/order.bpmn",
                    enclosing: undefined,
                },
            ])("$behaviour", ({ folder, document, enclosing }) => {
                fixture.openFolder(folder);

                expect(fixture.workspace.findWorkspaceFolderForDocument(document)).toBe(enclosing);
            });

            it("throws NoWorkspaceFolderFoundError for a document outside every folder", () => {
                fixture.openFolder("/work");

                expect(() =>
                    fixture.workspace.getWorkspaceFolderForDocument("/work2/order.bpmn"),
                ).toThrow(NoWorkspaceFolderFoundError);
            });

            // VS Code answers in the folder's spelling, the bridge in the document's.
            it("resolves a file:// document in either spelling", () => {
                const { workspace, root } = fixture;
                fixture.openFolder(root);
                const document = `file://${root}/a/order.bpmn`;

                expect([root, `file://${root}`]).toContain(
                    workspace.findWorkspaceFolderForDocument(document),
                );
                expect([root, `file://${root}`]).toContain(
                    workspace.getWorkspaceFolderForDocument(document),
                );
                expect([`${root}/a`, `file://${root}/a`]).toContain(
                    workspace.getDocumentDirectory(document),
                );
            });
        });

        describe("files and directories", () => {
            it("lists an empty directory as empty and as a directory of its parent", async () => {
                const { workspace, root } = fixture;
                await fixture.createDirectory(`${root}/config/empty`);

                await expect(workspace.readDirectory(`${root}/config/empty`)).resolves.toEqual([]);
                await expect(workspace.readDirectory(`${root}/config`)).resolves.toEqual([
                    ["empty", "directory"],
                ]);
            });

            it("keeps a directory, listed as empty, once its last file is removed", async () => {
                const { workspace, root } = fixture;
                await workspace.writeFile(`${root}/forms/a.form`, "{}");

                await fixture.removeFile(`${root}/forms/a.form`);

                await expect(workspace.readDirectory(`${root}/forms`)).resolves.toEqual([]);
                await expect(workspace.readDirectory(root)).resolves.toEqual([
                    ["forms", "directory"],
                ]);
            });

            it("lists the files and directories directly inside a directory", async () => {
                const { workspace, root } = fixture;
                await workspace.writeFile(`${root}/forms/a.form`, "{}");
                await workspace.writeFile(`${root}/forms/nested/b.form`, "{}");

                const entries = await workspace.readDirectory(`${root}/forms`);

                expect(entries.sort(([a], [b]) => a.localeCompare(b))).toEqual([
                    ["a.form", "file"],
                    ["nested", "directory"],
                ]);
            });

            it("reports what is missing with the core errors", async () => {
                const { workspace, root } = fixture;

                await expect(workspace.readDirectory(`${root}/missing`)).rejects.toThrow(
                    DirectoryNotFound,
                );
                await expect(workspace.readFile(`${root}/missing.bpmn`)).rejects.toThrow(
                    FileNotFound,
                );
                await expect(workspace.isSymbolicLink(`${root}/missing`)).resolves.toBe(false);
            });

            it("reads, writes and lists through file:// paths", async () => {
                const { workspace, root } = fixture;

                await workspace.writeFile(`file://${root}/a/order.bpmn`, "<order/>");

                await expect(workspace.readFile(`${root}/a/order.bpmn`)).resolves.toBe("<order/>");
                await expect(workspace.readFile(`file://${root}/a/order.bpmn`)).resolves.toBe(
                    "<order/>",
                );
                await expect(workspace.readDirectory(`file://${root}/a`)).resolves.toEqual([
                    ["order.bpmn", "file"],
                ]);
            });

            it("deletes a directory with everything below it and ignores a missing one", async () => {
                const { workspace, root } = fixture;
                await workspace.writeFile(`${root}/cache/slot/t.json`, "[]");
                await fixture.createDirectory(`${root}/cache/empty`);

                await workspace.deleteDirectory(`${root}/cache`);

                await expect(workspace.readDirectory(`${root}/cache`)).rejects.toThrow(
                    DirectoryNotFound,
                );
                await expect(workspace.readFile(`${root}/cache/slot/t.json`)).rejects.toThrow(
                    FileNotFound,
                );
                await expect(workspace.deleteDirectory(`${root}/cache`)).resolves.toBeUndefined();
            });

            it("finds the files of every folder as absolute, /-separated paths", async () => {
                const { workspace, root } = fixture;
                await workspace.writeFile(`${root}/one/order.bpmn`, "");
                await workspace.writeFile(`${root}/one/sub/ship.bpmn`, "");
                await workspace.writeFile(`${root}/two/pay.bpmn`, "");
                await workspace.writeFile(`${root}/two/pay.form`, "");
                await workspace.writeFile(`${root}/outside.bpmn`, "");
                fixture.openFolder(`${root}/one`);
                fixture.openFolder(`${root}/two`);

                const found = await workspace.findFiles("**/*.bpmn");

                expect(found.sort()).toEqual([
                    `${root}/one/order.bpmn`,
                    `${root}/one/sub/ship.bpmn`,
                    `${root}/two/pay.bpmn`,
                ]);
            });
        });

        describe("watchers", () => {
            it(
                "reports a new file as created, a rewrite as changed or created, a removal as deleted",
                async () => {
                    const { workspace, root } = fixture;
                    const file = `${root}/order.bpmn`;
                    const { events } = watch(root, "**/*.bpmn");
                    await fixture.watchersReady();

                    await workspace.writeFile(file, "<v1/>");
                    await eventually(() => expect(kindsFor(events, file)).toContain("create"));

                    events.length = 0;
                    await workspace.writeFile(file, "<v2/>");
                    // A host that cannot tell a rewrite from a create (the bridge on
                    // macOS) reports it as created, so consumers treat a create as a
                    // superset of a change.
                    await eventually(() =>
                        expect(["change", "create"]).toContain(kindsFor(events, file)[0]),
                    );

                    events.length = 0;
                    await fixture.removeFile(file);
                    await eventually(() => expect(kindsFor(events, file)).toContain("delete"));
                },
                WATCHER_SCENARIO_TIMEOUT_MS,
            );

            it(
                "reports every path of a burst",
                async () => {
                    const { workspace, root } = fixture;
                    const files = ["a", "b", "c"].map((name) => `${root}/burst/${name}.bpmn`);
                    await fixture.createDirectory(`${root}/burst`);
                    const { events } = watch(root, "**/*.bpmn");
                    await fixture.watchersReady();

                    await Promise.all(files.map((file) => workspace.writeFile(file, "")));

                    await eventually(() => expect(pathsOf(events).sort()).toEqual(files));
                },
                WATCHER_SCENARIO_TIMEOUT_MS,
            );

            it(
                "matches the glob against the path below the watched root",
                async () => {
                    const { workspace, root } = fixture;
                    const template = `${root}/config/templates/task.json`;
                    await fixture.createDirectory(`${root}/config/templates`);
                    const { events } = watch(root, "config/templates/*.json");
                    await fixture.watchersReady();

                    await workspace.writeFile(template, "[]");

                    await eventually(() => expect(kindsFor(events, template)).toContain("create"));
                },
                WATCHER_SCENARIO_TIMEOUT_MS,
            );

            it(
                "does not match the glob against the folders above the watched root",
                async () => {
                    const { workspace, root } = fixture;
                    // Only the absolute path of a file directly in `proj` ends in `proj/*.json`.
                    const watched = `${root}/proj`;
                    const matchedOnlyAbsolute = `${watched}/order.json`;
                    const matchedBelowRoot = `${watched}/proj/ship.json`;
                    await fixture.createDirectory(`${watched}/proj`);
                    const { events } = watch(watched, "**/proj/*.json");
                    await fixture.watchersReady();

                    await workspace.writeFile(matchedOnlyAbsolute, "{}");
                    await workspace.writeFile(matchedBelowRoot, "{}");

                    await eventually(() => expect(pathsOf(events)).toContain(matchedBelowRoot));
                    await fixture.eventsDelivered();
                    expect(pathsOf(events)).not.toContain(matchedOnlyAbsolute);
                },
                WATCHER_SCENARIO_TIMEOUT_MS,
            );

            it(
                "hands handlers absolute, /-separated paths spelled like findFiles results",
                async () => {
                    const { workspace, root } = fixture;
                    const file = `${root}/sub/order.bpmn`;
                    fixture.openFolder(root);
                    await fixture.createDirectory(`${root}/sub`);
                    const { events } = watch(`file://${root}`, "**/*.bpmn");
                    await fixture.watchersReady();

                    await workspace.writeFile(file, "");

                    await eventually(() => expect(pathsOf(events)).toHaveLength(1));
                    await expect(workspace.findFiles("**/*.bpmn")).resolves.toEqual(
                        pathsOf(events),
                    );
                    expect(pathsOf(events)).toEqual([file]);
                },
                WATCHER_SCENARIO_TIMEOUT_MS,
            );

            it(
                "reports a directory moved in by a create for it or for each of its files",
                async () => {
                    const { root } = fixture;
                    const directory = `${root}/models`;
                    const files = [`${directory}/order.bpmn`, `${directory}/sub/ship.bpmn`];
                    const { events } = watch(root, "**/*");
                    await fixture.watchersReady();

                    await fixture.moveDirectoryIn(
                        directory,
                        Object.fromEntries(files.map((file) => [file, "<model/>"])),
                    );

                    await eventually(() =>
                        expect(events).toSatisfy(reportsWholeDirectory("create", directory, files)),
                    );
                },
                WATCHER_SCENARIO_TIMEOUT_MS,
            );

            it(
                "reports a deleted directory by a delete for it or for each of its files",
                async () => {
                    const { workspace, root } = fixture;
                    const directory = `${root}/models`;
                    const files = [`${directory}/order.bpmn`, `${directory}/sub/ship.bpmn`];
                    for (const file of files) await workspace.writeFile(file, "<model/>");
                    const { events } = watch(root, "**/*");
                    await fixture.watchersReady();

                    await workspace.deleteDirectory(directory);

                    await eventually(() =>
                        expect(events).toSatisfy(reportsWholeDirectory("delete", directory, files)),
                    );
                },
                WATCHER_SCENARIO_TIMEOUT_MS,
            );

            it(
                "stops reporting once disposed",
                async () => {
                    const { workspace, root } = fixture;
                    const file = `${root}/order.bpmn`;
                    const disposed = watch(root, "**/*.bpmn");
                    const live = watch(root, "**/*.bpmn");
                    await fixture.watchersReady();

                    disposed.watcher.dispose();
                    await workspace.writeFile(file, "");

                    await eventually(() => expect(pathsOf(live.events)).toEqual([file]));
                    await fixture.eventsDelivered();
                    expect(disposed.events).toEqual([]);
                },
                WATCHER_SCENARIO_TIMEOUT_MS,
            );
        });
    });
}
