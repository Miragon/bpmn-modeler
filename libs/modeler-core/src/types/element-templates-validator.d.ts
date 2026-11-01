/** The two validators the element template specs check new templates against. */
declare module "@bpmn-io/element-templates-validator" {
    interface ValidationResult {
        valid: boolean;
        errors: unknown[] | null;
    }

    export function validate(template: unknown): ValidationResult;
    export function validateZeebe(template: unknown): ValidationResult;
}
