/** The part of `saxen`, which ships no `.d.ts`, that the declaration and root scans use. */
declare module "saxen" {
    export class Parser {
        constructor(options?: { proxy?: boolean });
        on(
            event: "openTag",
            handler: (name: string, getAttrs: () => Record<string, string>) => void,
        ): this;
        on(event: "closeTag", handler: (name: string) => void): this;
        on(event: "error", handler: (error: Error) => void): this;
        parse(xml: string): Error | undefined;
    }

    export function decode(text: string): string;
}
