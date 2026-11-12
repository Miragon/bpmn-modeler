import { FormEngineSelection } from "../domain/formEngine";

export interface FormTextEdits {
    withEngine(content: string, metadata: FormEngineSelection): string | undefined;
}
