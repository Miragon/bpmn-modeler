package io.miragon.intellij.bpmn

import com.google.gson.JsonObject

/** One row of the element ID review; [checked] is null for a row that keeps its ID either way. */
internal data class ElementIdReviewRow(
    val id: String,
    val label: String,
    val description: String,
    val tooltip: String,
    val checked: Boolean?,
    val revealId: String,
)

/** A group of rows; [checked] is null for a group whose rows have no checkbox. */
internal data class ElementIdReviewGroup(
    val id: String,
    val label: String,
    val checked: Boolean?,
    val collapsed: Boolean,
    val rows: List<ElementIdReviewRow>,
)

/** What the Element IDs tool window shows, as the core builds it: every text comes from the core. */
internal data class ElementIdReviewView(
    val title: String,
    val message: String,
    val groups: List<ElementIdReviewGroup>,
    val renameCount: Int,
) {
    companion object {
        /** Reads `elementIdReview/show`'s view; a field the frame lacks reads as empty. */
        fun from(view: JsonObject): ElementIdReviewView =
            ElementIdReviewView(
                title = view.text("title"),
                message = view.text("message"),
                groups = view.objects("groups").map(::groupOf),
                renameCount = view.get("renameCount")?.takeIf { !it.isJsonNull }?.asInt ?: 0,
            )

        private fun groupOf(group: JsonObject) =
            ElementIdReviewGroup(
                id = group.text("id"),
                label = group.text("label"),
                checked = group.flag("checked"),
                collapsed = group.flag("collapsed") ?: false,
                rows = group.objects("rows").map(::rowOf),
            )

        private fun rowOf(row: JsonObject) =
            ElementIdReviewRow(
                id = row.text("id"),
                label = row.text("label"),
                description = row.text("description"),
                tooltip = row.text("tooltip"),
                checked = row.flag("checked"),
                revealId = row.text("revealId"),
            )

        private fun JsonObject.text(key: String): String = get(key)?.takeIf { !it.isJsonNull }?.asString.orEmpty()

        private fun JsonObject.flag(key: String): Boolean? = get(key)?.takeIf { !it.isJsonNull }?.asBoolean

        private fun JsonObject.objects(key: String): List<JsonObject> =
            get(key)?.takeIf { it.isJsonArray }?.asJsonArray?.filter { it.isJsonObject }?.map { it.asJsonObject }.orEmpty()
    }
}

/** What the Element IDs tool window hands back to the core. */
internal interface ElementIdReviewActions {
    fun setChecked(ids: List<String>, checked: Boolean)

    fun apply()

    fun discard()

    fun reveal(elementId: String)
}
