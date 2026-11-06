/** The form ids the host last reported as resolvable. */
export class FormReferenceAvailability {
    known = false;
    private availableFormIds: ReadonlySet<string> = new Set();
    private readonly listeners = new Set<() => void>();

    has(formId: string): boolean {
        return this.availableFormIds.has(formId);
    }

    onChanged(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** @returns whether the set of available form ids changed. */
    update(formIds: readonly string[]): boolean {
        const nextFormIds = new Set(formIds);
        const changed =
            !this.known ||
            nextFormIds.size !== this.availableFormIds.size ||
            [...nextFormIds].some((formId) => !this.availableFormIds.has(formId));
        this.availableFormIds = nextFormIds;
        this.known = true;
        if (changed) {
            this.listeners.forEach((listener) => listener());
        }
        return changed;
    }
}
