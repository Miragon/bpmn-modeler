export interface TreeCheckout {
    withTreeAt<T>(commit: string, use: (root: string) => T): T;
}
