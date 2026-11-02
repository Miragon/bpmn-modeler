export type FormPreviewResult =
    | { kind: "loaded"; content: string }
    | { kind: "cancelled" }
    | {
          kind: "unavailable";
          reason: "noScope" | "notFound" | "ambiguous" | "unreadable" | "timeout";
      };
