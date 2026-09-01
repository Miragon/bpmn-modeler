export interface URLConstructor {
    new (url: string | URL, base?: string | URL): URL;
    canParse?: (url: string | URL, base?: string | URL) => boolean;
}

export interface ArraySortPrototype {
    toSorted?: <T>(this: T[], compareFn?: (a: T, b: T) => number) => T[];
}

/** Installs the URL API used by form-js on VS Code's Chromium 102 runtime. */
export function ensureUrlCanParse(urlApi: URLConstructor = URL): void {
    if (typeof urlApi.canParse === "function") return;

    urlApi.canParse = (url, base) => {
        try {
            new urlApi(url, base);
            return true;
        } catch {
            return false;
        }
    };
}

/** Installs the immutable sort API used by form-js on Chromium 102. */
export function ensureArrayToSorted(
    arrayPrototype: ArraySortPrototype = Array.prototype as unknown as ArraySortPrototype,
): void {
    if (typeof arrayPrototype.toSorted === "function") return;

    Object.defineProperty(arrayPrototype, "toSorted", {
        configurable: true,
        writable: true,
        value: function <T>(this: T[], compareFn?: (a: T, b: T) => number): T[] {
            return [...this].sort(compareFn);
        },
    });
}
