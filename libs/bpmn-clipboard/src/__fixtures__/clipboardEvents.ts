/** jsdom ships neither `DataTransfer` nor `ClipboardEvent`; these cover what the modules touch. */
export class FakeDataTransfer {
    private readonly dataByFormat = new Map<string, string>();

    setData(format: string, data: string): void {
        this.dataByFormat.set(format, data);
    }

    getData(format: string): string {
        return this.dataByFormat.get(format) ?? "";
    }
}

export class FakeClipboardEvent extends Event {
    readonly clipboardData: FakeDataTransfer | null;

    constructor(type: string, init: EventInit & { clipboardData?: FakeDataTransfer } = {}) {
        super(type, init);
        this.clipboardData = init.clipboardData ?? null;
    }
}

export function createCopyEvent(): FakeClipboardEvent & { clipboardData: FakeDataTransfer } {
    return new FakeClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData: new FakeDataTransfer(),
    }) as FakeClipboardEvent & { clipboardData: FakeDataTransfer };
}
