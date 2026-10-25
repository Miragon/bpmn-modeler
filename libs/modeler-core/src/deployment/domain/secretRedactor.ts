const MASK = "***";

/**
 * Masks the secrets a request carried in what its server answered: a gateway in
 * front of the engine may echo the request URL, headers or body back in an
 * error response.
 */
export class SecretRedactor {
    private constructor(private readonly secrets: ReadonlySet<string>) {}

    static none(): SecretRedactor {
        return new SecretRedactor(new Set());
    }

    /**
     * Blank values are skipped: masking them would garble every message. A
     * padded value counts trimmed too, as URLs are trimmed before they are sent.
     */
    static of(...secrets: (string | undefined)[]): SecretRedactor {
        const masked = new Set<string>();
        for (const secret of secrets) {
            if (secret !== undefined && secret.trim() !== "") {
                [...echoedForms(secret), ...echoedForms(secret.trim())].forEach((form) =>
                    masked.add(form),
                );
            }
        }
        return new SecretRedactor(masked);
    }

    /** Userinfo and query values; scheme, host and path stay readable. */
    static forUrl(url: string): SecretRedactor {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return SecretRedactor.none();
        }
        const rawQuery = parsed.search.slice(1);
        return SecretRedactor.of(
            decodedOrRaw(parsed.username),
            decodedOrRaw(parsed.password),
            rawQuery,
            ...[...parsed.searchParams.values()],
            ...rawQuery.split("&").map((pair) => pair.slice(pair.indexOf("=") + 1)),
        );
    }

    /** Each value whole and without its scheme (`Basic `, `Bearer `). */
    static forAuthHeaders(headers: Record<string, string>): SecretRedactor {
        return SecretRedactor.of(
            ...Object.values(headers).flatMap((value) => [
                value,
                value.slice(value.indexOf(" ") + 1),
            ]),
        );
    }

    and(other: SecretRedactor): SecretRedactor {
        return new SecretRedactor(new Set([...this.secrets, ...other.secrets]));
    }

    /**
     * Longest first, so a secret containing another is masked whole. Percent
     * escapes match in either case: some servers re-encode with lowercase hex.
     */
    redact(text: string): string {
        if (this.secrets.size === 0) {
            return text;
        }
        const alternatives = [...this.secrets]
            .sort((a, b) => b.length - a.length)
            .map(caseInsensitiveEscapesPattern);
        return text.replace(new RegExp(alternatives.join("|"), "g"), MASK);
    }
}

/**
 * As sent and as a server may quote it back: form encoding also escapes
 * `~!'()`, which `encodeURIComponent` keeps; a URL path escapes far less; a URL
 * quoted inside another URL is encoded twice.
 */
function echoedForms(secret: string): string[] {
    const percentEncoded = encodeURIComponent(secret);
    return [
        secret,
        percentEncoded,
        percentEncoded.replace(/%20/g, "+"),
        encodeURIComponent(percentEncoded),
        new URLSearchParams([["", secret]]).toString().slice(1),
        pathEncoded(secret),
        JSON.stringify(secret).slice(1, -1),
    ];
}

function pathEncoded(secret: string): string {
    const url = new URL("http://host/");
    url.pathname = `/${secret}`;
    return url.pathname.slice(1);
}

function caseInsensitiveEscapesPattern(secret: string): string {
    return secret
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(
            /%([0-9A-Fa-f])([0-9A-Fa-f])/g,
            (_escape, high: string, low: string) =>
                `%${caseInsensitive(high)}${caseInsensitive(low)}`,
        );
}

function caseInsensitive(hexDigit: string): string {
    return /[0-9]/.test(hexDigit)
        ? hexDigit
        : `[${hexDigit.toLowerCase()}${hexDigit.toUpperCase()}]`;
}

function decodedOrRaw(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
