package io.miragon.intellij.bpmn.bridge

/**
 * The host's answer to one core→host request. Gson writes a result's property
 * names as the reply's keys, so renaming a property changes the wire protocol.
 */
internal interface RpcResult

internal class DocumentWriteResult(
    val changed: Boolean,
    val accepted: Boolean,
    /** Set only when the Document holds other bytes than the core wrote. */
    val normalizedContent: String? = null,
) : RpcResult

internal class DocumentSaveResult(val saved: Boolean) : RpcResult

/** [selected] is null when the user dismissed the chooser. */
internal class PickerShowResult(val selected: List<Int>?) : RpcResult

internal class ConfirmShowResult(val confirmed: Boolean) : RpcResult

internal class ClipboardReadResult(val text: String) : RpcResult

internal class BasicAuthCredentials(val username: String, val password: String) : RpcResult

internal class OAuth2Credentials(val clientId: String, val clientSecret: String) : RpcResult

internal class SecretApprovedDestinations(val origins: List<String>) : RpcResult

internal class TokenStoreGetResult(val token: String) : RpcResult

internal class TokenPromptShowResult(val token: String) : RpcResult
