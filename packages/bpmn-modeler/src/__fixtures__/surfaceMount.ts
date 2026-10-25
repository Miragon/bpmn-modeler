/**
 * DOM mounts and frame waits shared by the browser specs. Every mount is tracked,
 * so one `removeMounts()` in `afterEach` leaves the page clean for the next test.
 */

export interface SurfaceMount {
    container: HTMLElement;
    panel: HTMLElement;
}

const mountedNodes: HTMLElement[] = [];

/** A canvas host; pass `0, 0` for a container the host has not laid out yet. */
export function mountCanvas(width = 800, height = 600): HTMLElement {
    const canvasHost = document.createElement("div");
    canvasHost.style.cssText = `position:absolute;width:${width}px;height:${height}px`;
    document.body.appendChild(canvasHost);
    mountedNodes.push(canvasHost);
    return canvasHost;
}

/** A canvas host plus the properties-panel parent the editable surfaces require. */
export function mountWithPanel(width = 800, height = 600): SurfaceMount {
    const container = mountCanvas(width, height);
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    mountedNodes.push(panel);
    return { container, panel };
}

export function removeMounts(): void {
    for (const node of mountedNodes.splice(0)) {
        node.remove();
    }
}

function nextAnimationFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function animationFrames(count: number): Promise<void> {
    for (let frame = 0; frame < count; frame++) {
        await nextAnimationFrame();
    }
}

// ResizeObserver deliveries land before paint; six frames guarantee the initial
// delivery and any follow-up have been processed.
export function settleObserver(): Promise<void> {
    return animationFrames(6);
}

export function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Preact runs the properties panel's effects a frame plus a task after a render; tearing
// the modeler down before then trips the panel's selection reconcile on a destroyed canvas.
export async function afterPaint(): Promise<void> {
    await nextAnimationFrame();
    await wait(0);
}

/**
 * Counts `document` add/remove listener calls for one event type, so a spec can
 * assert a surface's teardown leaves its document listeners balanced.
 */
export function trackDocumentListeners(eventType: string) {
    const originalAdd = document.addEventListener.bind(document);
    const originalRemove = document.removeEventListener.bind(document);
    let added = 0;
    let removed = 0;
    document.addEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === eventType) added++;
        return (originalAdd as (...args: unknown[]) => void)(type, ...rest);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === eventType) removed++;
        return (originalRemove as (...args: unknown[]) => void)(type, ...rest);
    }) as typeof document.removeEventListener;
    return {
        counts: () => ({ added, removed }),
        restore: () => {
            document.addEventListener = originalAdd;
            document.removeEventListener = originalRemove;
        },
    };
}

/**
 * Counts `change` listeners added to and removed from every `matchMedia` list,
 * so a spec can assert the automatic theme leaves no scheme listener behind.
 */
export function trackColorSchemeListeners() {
    const originalMatchMedia = window.matchMedia;
    let added = 0;
    let removed = 0;
    window.matchMedia = (query: string) => {
        const list = originalMatchMedia.call(window, query);
        const originalAdd = list.addEventListener.bind(list);
        const originalRemove = list.removeEventListener.bind(list);
        list.addEventListener = ((type: string, ...rest: unknown[]) => {
            if (type === "change") added++;
            return (originalAdd as (...args: unknown[]) => void)(type, ...rest);
        }) as typeof list.addEventListener;
        list.removeEventListener = ((type: string, ...rest: unknown[]) => {
            if (type === "change") removed++;
            return (originalRemove as (...args: unknown[]) => void)(type, ...rest);
        }) as typeof list.removeEventListener;
        return list;
    };
    return {
        counts: () => ({ added, removed }),
        restore: () => {
            window.matchMedia = originalMatchMedia;
        },
    };
}
