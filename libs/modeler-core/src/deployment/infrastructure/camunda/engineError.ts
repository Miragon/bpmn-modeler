import { SecretRedactor } from "../../domain/secretRedactor";

const MAX_DETAIL_LENGTH = 1000;

/** Camunda 7 and generic (`message`), RFC 7807 / Camunda 8 (`detail`, `title`), OAuth 2 (`error_description`, `error`). */
const MESSAGE_FIELDS = ["message", "detail", "title", "error_description", "error"];

/**
 * The server's own explanation of a failed request, never its raw body: a
 * gateway in front of the engine may echo the request back, and an unknown JSON
 * shape (an echo service's `{"headers": …}`) or an HTML error page is dropped.
 */
export function engineErrorDetail(body: string, redactor: SecretRedactor): string | undefined {
    const message = jsonErrorMessage(body) ?? plainTextMessage(body);
    if (message === undefined) {
        return undefined;
    }
    const singleLine = redactor.redact(message).replace(/\s+/g, " ").trim();
    if (singleLine === "") {
        return undefined;
    }
    return singleLine.length > MAX_DETAIL_LENGTH
        ? `${singleLine.slice(0, MAX_DETAIL_LENGTH)}…`
        : singleLine;
}

function jsonErrorMessage(body: string): string | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return undefined;
    }
    if (typeof parsed !== "object" || parsed === null) {
        return "";
    }
    const fields = parsed as Record<string, unknown>;
    const field = MESSAGE_FIELDS.find((name) => typeof fields[name] === "string");
    return field === undefined ? "" : (fields[field] as string);
}

function plainTextMessage(body: string): string | undefined {
    const text = body.trim();
    return text.startsWith("<") ? undefined : text;
}

/**
 * `requestSecrets` (credentials, `.env` values) plus what reached the wire with
 * them: the auth headers and the URLs' userinfo and query. Every URL a request
 * was built from counts, since a query on the endpoint merges with the route
 * appended to it.
 */
export function requestRedactor(
    requestSecrets: SecretRedactor,
    authHeaders: Record<string, string>,
    ...urls: (string | undefined)[]
): SecretRedactor {
    return urls.reduce(
        (redactor, url) =>
            url === undefined ? redactor : redactor.and(SecretRedactor.forUrl(url)),
        requestSecrets.and(SecretRedactor.forAuthHeaders(authHeaders)),
    );
}
