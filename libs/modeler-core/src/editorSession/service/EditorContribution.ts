import { MessageOfType, ProtocolCommandType } from "@miragon/bpmn-modeler-shared";

import { EditorSessionParticipant } from "../domain/EditorSessionParticipant";
import { MessageHandler } from "./WebviewMessageRouter";

export type CommandHandlers<TType extends ProtocolCommandType> = {
    readonly [T in TType]: MessageHandler<MessageOfType<T>>;
};

/**
 * What a feature adds to an editor another feature owns: a handler for each
 * command it serves, and its session participant. The editor's feature places
 * both in its table and its participant order, so neither imports the other.
 */
export interface EditorContribution<TType extends ProtocolCommandType> {
    readonly commandHandlers: CommandHandlers<TType>;
    readonly participant: EditorSessionParticipant;
}
