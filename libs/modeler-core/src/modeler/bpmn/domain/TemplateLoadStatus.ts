/** What the element-templates status item shows. */
export type TemplateLoadDisplay =
    | { readonly state: "hidden" }
    | { readonly state: "loading" }
    | { readonly state: "ready"; readonly count: number };

export class TemplateLoadStatus {
    static readonly idle = new TemplateLoadStatus();

    get display(): TemplateLoadDisplay {
        return { state: "hidden" };
    }

    started(_token: symbol): TemplateLoadStatus {
        return this;
    }

    finished(_token: symbol, _count: number): TemplateLoadStatus {
        return this;
    }

    abandoned(_token: symbol): TemplateLoadStatus {
        return this;
    }
}
