function canonicalDecimal(value: string): string | undefined {
    const match = /^(-?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i.exec(value);
    if (!match) return undefined;

    const [, sign, mantissa, exponent = "0"] = match;
    const [integer, fraction = ""] = mantissa.split(".");
    const digits = (integer + fraction).replace(/^0+/, "");
    if (digits === "") return "0";

    const significant = digits.replace(/0+$/, "");
    const scale =
        BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length);
    return `${sign}${significant}e${scale}`;
}

export function normalizeValidationBounds(
    validation: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...validation };
    for (const bound of ["min", "max"] as const) {
        const value = normalized[bound];
        if (typeof value === "string") {
            const number = Number(value);
            // form-js compares the decimal value of the serialized number, not its binary expansion.
            if (
                Number.isFinite(number) &&
                canonicalDecimal(value) === canonicalDecimal(String(number))
            ) {
                normalized[bound] = number;
            }
        }
    }
    for (const bound of ["minLength", "maxLength"] as const) {
        if (typeof normalized[bound] === "number") {
            normalized[bound] = String(normalized[bound]);
        }
    }
    return normalized;
}
