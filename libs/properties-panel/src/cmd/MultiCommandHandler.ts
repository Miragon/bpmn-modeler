/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Verbatim: bundles several commands into one command-stack step so a
 * multi-property edit reverts atomically.
 */
import { forEach } from "min-dash";

export default class MultiCommandHandler {
    static $inject = ["commandStack"];

    private _commandStack: any;

    constructor(commandStack: any) {
        this._commandStack = commandStack;
    }

    preExecute(context: any): void {
        const commandStack = this._commandStack;

        forEach(context, function (command: any) {
            commandStack.execute(command.cmd, command.context);
        });
    }
}
