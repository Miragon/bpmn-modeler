import { AuthConfig } from "./deployment";
import { wholeEnvRefOf } from "./envRef";

/**
 * A target's whole-value `${env:…}` credentials. A reference is not a secret,
 * so it is shared through the targets file, which is its only authority — a
 * copy in the secret store is ignored on read.
 */
export class CredentialRefs {
    private constructor(
        readonly username?: string,
        readonly password?: string,
        readonly clientId?: string,
        readonly clientSecret?: string,
    ) {}

    static none(): CredentialRefs {
        return new CredentialRefs();
    }

    static basic(username: string | undefined, password: string | undefined): CredentialRefs {
        return new CredentialRefs(username, password);
    }

    static oauth2(clientId: string | undefined, clientSecret: string | undefined): CredentialRefs {
        return new CredentialRefs(undefined, undefined, clientId, clientSecret);
    }

    static of(auth: AuthConfig): CredentialRefs {
        if (auth.type === "basic") {
            return CredentialRefs.basic(wholeEnvRefOf(auth.username), wholeEnvRefOf(auth.password));
        }
        if (auth.type === "oauth2") {
            return CredentialRefs.oauth2(
                wholeEnvRefOf(auth.clientId),
                wholeEnvRefOf(auth.clientSecret),
            );
        }
        return CredentialRefs.none();
    }

    /**
     * A request may differ from its saved target only in store-backed literals:
     * deploy persists credentials to the secret store only, so an edited, added
     * or removed ref would otherwise never reach the shared file.
     */
    admits(auth: AuthConfig): boolean {
        return this.equals(CredentialRefs.of(auth));
    }

    isEmpty(): boolean {
        return this.entries().length === 0;
    }

    writeTo(auth: Record<string, unknown>): void {
        for (const [field, value] of this.entries()) {
            auth[field] = value;
        }
    }

    private equals(other: CredentialRefs): boolean {
        return (
            this.username === other.username &&
            this.password === other.password &&
            this.clientId === other.clientId &&
            this.clientSecret === other.clientSecret
        );
    }

    private entries(): [string, string][] {
        return Object.entries({
            username: this.username,
            password: this.password,
            clientId: this.clientId,
            clientSecret: this.clientSecret,
        }).filter((entry): entry is [string, string] => entry[1] !== undefined);
    }
}
