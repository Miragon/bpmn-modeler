import { InvalidCredentialDestinationError } from "../../shared/domain/errors";

/**
 * The origins (`scheme://host[:port]`) a request hands credentials to. Path,
 * query and userinfo don't change who receives them; the scheme does, since
 * a switch to `http:` exposes them on the wire.
 */
export class CredentialDestinations {
    private constructor(readonly origins: readonly string[]) {}

    static none(): CredentialDestinations {
        return new CredentialDestinations([]);
    }

    /**
     * @throws {InvalidCredentialDestinationError} for a URL without a host: what
     *   such a URL reaches can't be checked, so nothing may be sent to it.
     */
    static of(...urls: string[]): CredentialDestinations {
        return CredentialDestinations.fromOrigins(
            urls.map((url) => {
                const origin = originOf(url);
                if (origin === undefined) {
                    throw new InvalidCredentialDestinationError();
                }
                return origin;
            }),
        );
    }

    /**
     * The origins knowable without a request: unparseable URLs are skipped, and
     * so is a host templated with `{processDefinitionKey}`, which only a request
     * fills in.
     */
    static ofKnown(...urls: string[]): CredentialDestinations {
        return CredentialDestinations.fromOrigins(
            urls
                .map(originOf)
                .filter((origin): origin is string => origin !== undefined && !/[{}]/.test(origin)),
        );
    }

    static fromOrigins(origins: readonly string[]): CredentialDestinations {
        return new CredentialDestinations([...new Set(origins)].sort());
    }

    isEmpty(): boolean {
        return this.origins.length === 0;
    }

    without(other: CredentialDestinations): CredentialDestinations {
        return new CredentialDestinations(
            this.origins.filter((origin) => !other.origins.includes(origin)),
        );
    }

    union(other: CredentialDestinations): CredentialDestinations {
        return CredentialDestinations.fromOrigins([...this.origins, ...other.origins]);
    }

    toString(): string {
        return this.origins.join(", ");
    }
}

function originOf(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        return parsed.host === "" ? undefined : `${parsed.protocol}//${parsed.host}`;
    } catch {
        return undefined;
    }
}
