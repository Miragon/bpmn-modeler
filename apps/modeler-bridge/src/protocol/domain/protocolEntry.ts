/** Which peer initiates the call. Requests are only ever Core→Host (see the contract test). */
export type Direction = "hostToCore" | "coreToHost";

/** Whether a reply is expected. */
export type Kind = "notification" | "request";

/**
 * How long the core waits for the host's reply to a request:
 * - `prompt`: the host asks the user, who takes as long as they need.
 * - `syncedWrite`: the core keeps its own state in step with the reply (a
 *   bridge mirror it updates on acceptance, a fetched cache it drops on
 *   failure), so giving up on a write the host still applies would leave that
 *   state out of step with the host.
 * - `hostWork`: fails after `HOST_WORK_REPLY_DEADLINE_MS`, so a reply the
 *   host never sends cannot hold the caller's editor queue.
 * - `hostShow`: fails after `HOST_SHOW_REPLY_DEADLINE_MS`; the host shows
 *   one of its views, and the caller offers another surface once it gives up.
 */
export type ReplyWait = "prompt" | "syncedWrite" | "hostWork" | "hostShow";

interface ProtocolEntryShape {
    readonly method: string;
    readonly direction: Direction;
    readonly paramsFixture: object;
}

/** One RPC method with a representative param (and, for requests, result) fixture. */
export type ProtocolEntry =
    | (ProtocolEntryShape & { readonly kind: "notification" })
    | (ProtocolEntryShape & {
          readonly kind: "request";
          readonly replyWait: ReplyWait;
          readonly resultFixture?: object;
      });
