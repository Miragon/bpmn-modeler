import { describe, expect, it, vi } from "vitest";

import { createSessionContext } from "../../../../__fixtures__/editorSessionContext";
import { FormValuesParticipant } from "./FormValuesParticipant";

const EDITOR_ID = "file:///work/order.form";

describe("FormValuesParticipant", () => {
    it("opens a values session on resolve and retires it only on teardown", () => {
        const formValues = {
            registerSession: vi.fn(),
            disposeSession: vi.fn().mockResolvedValue(undefined),
        };
        const { context, captured } = createSessionContext(EDITOR_ID);

        new FormValuesParticipant(formValues as never).onResolve(context);

        expect(formValues.registerSession).toHaveBeenCalledWith(EDITOR_ID);
        expect(formValues.disposeSession).not.toHaveBeenCalled();

        captured.dispose?.();

        expect(formValues.disposeSession).toHaveBeenCalledWith(EDITOR_ID);
    });
});
