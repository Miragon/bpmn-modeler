import ModelingBehaviorModule from "bpmn-js/lib/features/modeling/behavior";
import TokenSimulationModule from "bpmn-js-token-simulation";
import SimulatorBehaviorModule from "bpmn-js-token-simulation/lib/simulator/behaviors";
import AnimationBehaviorModule from "bpmn-js-token-simulation/lib/animation/behaviors";

/**
 * Token simulation provides three simulator behaviours under bpmn-js modeling behaviour names,
 * so bpmn-js's interceptors for them never run. Depending on token simulation, this module loads
 * after it, gives bpmn-js its names back and builds the simulator's behaviours under names
 * upstream does not use: the simulator finds a behaviour by the element type it registers for,
 * not by its DI name.
 */
export const TokenSimulationBehaviorNamesModule = {
    __depends__: [TokenSimulationModule],
    __init__: [
        "simulatorBoundaryEventBehavior",
        "simulatorEventBasedGatewayBehavior",
        "simulatorMessageFlowBehavior",
    ],
    simulatorBoundaryEventBehavior: SimulatorBehaviorModule.boundaryEventBehavior,
    simulatorEventBasedGatewayBehavior: SimulatorBehaviorModule.eventBasedGatewayBehavior,
    // The animated behaviour; the simulator's plain one would stop message flow animations.
    simulatorMessageFlowBehavior: AnimationBehaviorModule.messageFlowBehavior,
    boundaryEventBehavior: ModelingBehaviorModule.boundaryEventBehavior,
    eventBasedGatewayBehavior: ModelingBehaviorModule.eventBasedGatewayBehavior,
    messageFlowBehavior: ModelingBehaviorModule.messageFlowBehavior,
};
