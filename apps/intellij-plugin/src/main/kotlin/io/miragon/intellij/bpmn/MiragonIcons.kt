package io.miragon.intellij.bpmn

import com.intellij.openapi.util.IconLoader

/**
 * Shared icon handles for the Miragon actions. The BPMN modeler icon tags every
 * modeler action in the Tools menu and Search Everywhere, giving the plugin one
 * recognisable visual identity across every entry point; the DMN icon marks the
 * one action that creates a DMN file.
 *
 * [IconLoader.getIcon] auto-resolves the `_dark` variant (`bpmn_dark.svg`) under
 * a dark IDE theme, so both files must ship — the light one carries a blue accent
 * that keeps contrast on white menus, the dark one the brand green.
 */
object MiragonIcons {
    @JvmField
    val Bpmn = IconLoader.getIcon("/icons/bpmn.svg", MiragonIcons::class.java)

    @JvmField
    val Dmn = IconLoader.getIcon("/icons/dmn.svg", MiragonIcons::class.java)
}
