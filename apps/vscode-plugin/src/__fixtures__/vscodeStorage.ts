import type { Event, Memento, SecretStorage, SecretStorageChangeEvent } from "vscode";

export class InMemoryMemento implements Memento {
    private readonly values = new Map<string, unknown>();

    keys(): readonly string[] {
        return [...this.values.keys()];
    }

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.values.has(key) ? (this.values.get(key) as T) : defaultValue;
    }

    async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.values.delete(key);
        } else {
            this.values.set(key, value);
        }
    }
}

/**
 * Rejects every write after `failAfter(writes)` lets that many through.
 * `keepsRejectedValue` models VS Code's `ExtensionMemento`, which sets the value
 * in memory before the persist that rejects; without it a rejected write changes
 * nothing.
 */
export class FailingMemento extends InMemoryMemento {
    private writesLeft = Number.POSITIVE_INFINITY;

    constructor(private readonly keepsRejectedValue: boolean) {
        super();
    }

    failAfter(writes: number): void {
        this.writesLeft = writes;
    }

    override async update(key: string, value: unknown): Promise<void> {
        if (this.writesLeft > 0) {
            this.writesLeft--;
            return super.update(key, value);
        }
        if (this.keepsRejectedValue) await super.update(key, value);
        throw new Error(`cannot write ${key}`);
    }
}

export class InMemorySecretStorage implements SecretStorage {
    readonly entries = new Map<string, string>();

    readonly onDidChange: Event<SecretStorageChangeEvent> = () => ({ dispose: () => undefined });

    async get(key: string): Promise<string | undefined> {
        return this.entries.get(key);
    }

    async store(key: string, value: string): Promise<void> {
        this.entries.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.entries.delete(key);
    }
}
