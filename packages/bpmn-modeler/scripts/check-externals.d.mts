export interface CheckExternalsOptions {
    distDir?: string;
    manifestPath?: string;
}

export function collectModuleSpecifiers(source: string, fileName?: string): string[];
export function packageName(specifier: string): string | undefined;
export function checkExternals(options?: CheckExternalsOptions): { checkedFiles: number };
