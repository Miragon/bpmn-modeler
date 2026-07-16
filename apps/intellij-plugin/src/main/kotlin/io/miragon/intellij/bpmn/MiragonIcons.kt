package io.miragon.intellij.bpmn

import com.intellij.openapi.util.IconLoader

/**
 * Shared icon handles for the Miragon actions. The komet brand mark tags every
 * modeler action in the Tools menu and Search Everywhere, giving the plugin one
 * recognisable visual identity across every entry point.
 *
 * [IconLoader.getIcon] auto-resolves the `_dark` variant (`komet_dark.svg`) under
 * a dark IDE theme, so both files must ship — the light one uses a darker brand
 * green that keeps contrast on white menus, the dark one the pure brand green.
 */
object MiragonIcons {
    @JvmField
    val Komet = IconLoader.getIcon("/icons/komet.svg", MiragonIcons::class.java)
}
