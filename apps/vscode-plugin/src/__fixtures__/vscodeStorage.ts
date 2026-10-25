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
        this.values.set(key, value);
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
