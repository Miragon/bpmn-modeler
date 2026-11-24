import type { PopupMenuAnnotationOverrides } from "../../popupMenuAnnotations/adapter/in/popupMenuAnnotationsModule";

const JAVA_IMPLEMENTATION_KEYWORDS = ["Java delegate", "External task"];
const JOB_WORKER_KEYWORDS = ["Job worker"];

export const C7_POPUP_MENU_ANNOTATIONS: PopupMenuAnnotationOverrides = {
    descriptions: {
        "service-task":
            "Automated work carried out by a Java delegate, expression, or external task",
    },
    additionalKeywords: {
        "service-task": JAVA_IMPLEMENTATION_KEYWORDS,
        "send-task": JAVA_IMPLEMENTATION_KEYWORDS,
        "message-intermediate-throw": JAVA_IMPLEMENTATION_KEYWORDS,
        "message-end": JAVA_IMPLEMENTATION_KEYWORDS,
    },
};

export const C8_POPUP_MENU_ANNOTATIONS: PopupMenuAnnotationOverrides = {
    descriptions: {
        "service-task": "Automated work carried out by a job worker or connector",
    },
    additionalKeywords: {
        "service-task": JOB_WORKER_KEYWORDS,
        "script-task": JOB_WORKER_KEYWORDS,
        "send-task": JOB_WORKER_KEYWORDS,
        "message-intermediate-throw": JOB_WORKER_KEYWORDS,
        "message-end": JOB_WORKER_KEYWORDS,
    },
};
