import { ElementTemplateSource } from "../domain/elementTemplates";

type LoadTemplateSource = () => Promise<ElementTemplateSource>;
type LoadTemplateSources = () => Promise<readonly ElementTemplateSource[]>;

/**
 * Parsed element templates shared by every editor of a host process. An entry
 * holds the load from the moment it starts, so concurrent editors share one
 * read, and a load overtaken by an invalidation is never stored again.
 */
export class ElementTemplateCache {
    private readonly directories = new Map<string, Promise<ElementTemplateSource>>();
    private marketplace: Promise<readonly ElementTemplateSource[]> | undefined;

    holdsDirectory(dir: string): boolean {
        return this.directories.has(dir);
    }

    holdsMarketplace(): boolean {
        return this.marketplace !== undefined;
    }

    directory(dir: string, load: LoadTemplateSource): Promise<ElementTemplateSource> {
        const cached = this.directories.get(dir);
        if (cached) {
            return cached;
        }
        const loading = load();
        this.directories.set(dir, loading);
        loading.catch(() => {
            if (this.directories.get(dir) === loading) {
                this.directories.delete(dir);
            }
        });
        return loading;
    }

    marketplaceTemplates(load: LoadTemplateSources): Promise<readonly ElementTemplateSource[]> {
        if (this.marketplace) {
            return this.marketplace;
        }
        const loading = load();
        this.marketplace = loading;
        loading.catch(() => {
            if (this.marketplace === loading) {
                this.marketplace = undefined;
            }
        });
        return loading;
    }

    forgetDirectories(keep: ReadonlySet<string> = new Set()): void {
        for (const dir of [...this.directories.keys()]) {
            if (!keep.has(dir)) {
                this.directories.delete(dir);
            }
        }
    }

    forgetMarketplace(): void {
        this.marketplace = undefined;
    }
}
