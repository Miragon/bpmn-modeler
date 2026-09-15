export declare const CONSUMER_FIXTURES: Record<string, string>;

export interface CheckConsumerTypesOptions {
    consumerDir: string;
    fixtures?: Record<string, string>;
}

export function checkConsumerTypes(options: CheckConsumerTypesOptions): {
    checkedFixtures: number;
};
