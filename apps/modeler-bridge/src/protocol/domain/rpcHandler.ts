export type RpcHandler = (params: any) => unknown | Promise<unknown>;

/** The Host→Core methods an inbound adapter serves, keyed by method name. */
export type RpcHandlerTable = Readonly<Record<string, RpcHandler>>;
