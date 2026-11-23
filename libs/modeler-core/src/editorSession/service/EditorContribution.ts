import { ProtocolCommand } from "@miragon/bpmn-modeler-shared";

import { EditorSessionParticipant } from "../domain/EditorSessionParticipant";
import { MessageHandler } from "./WebviewMessageRouter";

export type CommandHandlers<TCommand extends ProtocolCommand> = {
    readonly [Type in TCommand["type"]]: MessageHandler<Extract<TCommand, { type: Type }>>;
};

/**
 * What a feature adds to an editor another feature owns: a handler for each
 * command it serves, and its session participant. The editor's feature places
 * both in its table and its participant order, so neither imports the other.
 */
export interface EditorContribution<TCommand extends ProtocolCommand> {
    readonly commandHandlers: CommandHandlers<TCommand>;
    readonly participant: EditorSessionParticipant;
}
