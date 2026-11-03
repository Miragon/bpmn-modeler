/**
 * Immutable representation of an HTTP response.
 */
export interface HttpResponse {
    readonly status: number;
    readonly body: string;
}

/**
 * A request that never got a response. The URL is deliberately left out of the
 * message: it may embed `.env` values, and fetch's own errors echo it verbatim.
 */
export class HttpTransportError extends Error {
    constructor(
        readonly host: string,
        readonly reason: string,
    ) {
        super(`Request to ${host} failed: ${reason}`);
        this.name = "HttpTransportError";
    }
}

export function hostOf(url: string): string | undefined {
    try {
        return new URL(url).host || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Host[:port] for breadcrumbs — never the path, query, or userinfo. `URL.host`
 * excludes any `user:pass@` prefix, so a credentialled URL can't leak into logs.
 */
export function loggableHost(url: string): string {
    return hostOf(url) ?? "unknown-host";
}
