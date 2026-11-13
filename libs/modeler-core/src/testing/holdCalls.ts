import { vi } from "vitest";

import { InMemoryWorkspace } from "./InMemoryWorkspace";

export interface Hold {
    readonly reached: Promise<void>;
    release(): void;
}

interface PendingHold extends Hold {
    readonly held: Promise<void>;
    reach(): void;
}

function pendingHold(): PendingHold {
    let release: () => void = () => undefined;
    let reach: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
        reach = resolve;
    });
    return { held, reached, reach: () => reach(), release: () => release() };
}

/** Holds the next call to a method until the test releases it; `reached` resolves once it is called. */
export function holdNext<T extends object, K extends keyof T>(target: T, method: K): Hold {
    const original = (target[method] as (...args: unknown[]) => Promise<unknown>).bind(target);
    const hold = pendingHold();
    const spy = vi.spyOn(target, method as never) as unknown as {
        mockImplementationOnce(impl: (...args: unknown[]) => Promise<unknown>): void;
    };
    spy.mockImplementationOnce(async (...args: unknown[]) => {
        hold.reach();
        await hold.held;
        return original(...args);
    });
    return { reached: hold.reached, release: hold.release };
}

/** Holds the first listing of each path until the test releases it, in the order of `paths`. */
export function holdListings(workspace: InMemoryWorkspace, paths: readonly string[]): Hold[] {
    const holds = new Map(paths.map((path) => [path, pendingHold()]));
    const listed = [...holds.values()];
    const readDirectory = workspace.readDirectory.bind(workspace);
    vi.spyOn(workspace, "readDirectory").mockImplementation(async (path) => {
        const hold = holds.get(path);
        if (hold !== undefined) {
            holds.delete(path);
            hold.reach();
            await hold.held;
        }
        return readDirectory(path);
    });
    return listed;
}
