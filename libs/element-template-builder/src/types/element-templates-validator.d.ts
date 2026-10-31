declare module "@bpmn-io/element-templates-validator" {
    export interface ValidationPosition {
        line: number;
        column: number;
        pos: number;
    }

    export interface ValidationError {
        keyword: string;
        /** JSON pointer into the validated template, e.g. `/properties/3/binding/type`. */
        instancePath: string;
        params: Record<string, unknown>;
        message: string;
        dataPointer?: {
            key?: ValidationPosition;
            keyEnd?: ValidationPosition;
            value: ValidationPosition;
            valueEnd: ValidationPosition;
        };
    }

    export interface ValidationResult {
        valid: boolean;
        object: unknown;
        errors: ValidationError[];
        warnings?: ValidationError[];
    }

    /** Camunda 7 templates. */
    export function validate(template: string | object): ValidationResult;
    /** Camunda 8 templates. */
    export function validateZeebe(template: string | object): ValidationResult;
}
