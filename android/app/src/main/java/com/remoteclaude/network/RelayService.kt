package com.remoteclaude.network

import com.remoteclaude.crypto.E2EEncryption
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import timber.log.Timber

@Serializable
data class InnerPayload(
    val type: String,
    val data: JsonElement? = null,
    val timestamp: Long
)

sealed class RelayEvent {
    data class PairCodeReceived(val code: String, val sessionId: String) : RelayEvent()
    data class PairConfirmed(val peerPublicKey: String, val sessionId: String) : RelayEvent()
    data class PairRejected(val reason: String) : RelayEvent()
    data class TerminalOutput(val data: String) : RelayEvent()
    data class PermissionRequest(val id: String, val tool: String, val detail: String, val prompt: String) : RelayEvent()
    data class StatusUpdate(val status: String) : RelayEvent()
    data class Error(val code: String, val message: String) : RelayEvent()
    data object Disconnected : RelayEvent()
}

class RelayService(
    private val wsClient: WebSocketClient,
    private val crypto: E2EEncryption
) {
    private val json = Json { ignoreUnknownKeys = true }

    private val _events = MutableStateFlow<RelayEvent?>(null)
    val events: StateFlow<RelayEvent?> = _events

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected

    fun connect(url: String) {
        val normalizedUrl = normalizeRelayUrl(url)
        CoroutineScope(Dispatchers.IO).launch {
            wsClient.connect(normalizedUrl)
                .catch { e ->
                    Timber.e(e, "Relay connection failed")
                    _events.value = RelayEvent.Error("CONNECTION_FAILED", e.message ?: "Connection failed")
                    _isConnected.value = false
                }
                .collect { msg ->
                    handleMessage(msg)
                }
            _events.value = RelayEvent.Disconnected
            _isConnected.value = false
        }
        _isConnected.value = true
    }

    fun submitPairCode(code: String) {
        wsClient.send(
            WireMessage(
                type = "pair.submit",
                payload = buildJsonObject {
                    put("code", JsonPrimitive(code))
                    put("appPublicKey", JsonPrimitive(crypto.publicKeyBase64))
                },
                timestamp = System.currentTimeMillis()
            )
        )
    }

    fun sendTerminalInput(input: String) {
        sendEncrypted("terminal.input", buildJsonObject {
            put("input", JsonPrimitive(input))
        })
    }

    fun sendTerminalResize(cols: Int, rows: Int) {
        sendEncrypted("terminal.resize", buildJsonObject {
            put("cols", JsonPrimitive(cols))
            put("rows", JsonPrimitive(rows))
        })
    }

    fun sendPermissionResponse(id: String, approved: Boolean, input: String? = null) {
        sendEncrypted("permission.response", buildJsonObject {
            put("id", JsonPrimitive(id))
            put("approved", JsonPrimitive(approved))
            if (input != null) put("input", JsonPrimitive(input))
        })
    }

    fun sendVoiceTranscript(text: String) {
        sendEncrypted("voice.transcript", buildJsonObject {
            put("text", JsonPrimitive(text))
            put("isFinal", JsonPrimitive(true))
        })
    }

    private fun sendEncrypted(type: String, data: JsonElement) {
        val inner = InnerPayload(
            type = type,
            data = data,
            timestamp = System.currentTimeMillis()
        )
        val plaintext = json.encodeToString(InnerPayload.serializer(), inner)
        val ciphertext = crypto.encrypt(plaintext)

        wsClient.send(
            WireMessage(
                type = "encrypted",
                payload = buildJsonObject {
                    put("ciphertext", JsonPrimitive(ciphertext))
                },
                timestamp = System.currentTimeMillis()
            )
        )
    }

    private fun handleMessage(msg: WireMessage) {
        when (msg.type) {
            "pair.code" -> {
                val payload = msg.payload?.jsonObject ?: return
                val code = payload["code"]?.jsonPrimitive?.content ?: return
                val sessionId = payload["sessionId"]?.jsonPrimitive?.content ?: return
                _events.value = RelayEvent.PairCodeReceived(code, sessionId)
            }

            "pair.confirmed" -> {
                val payload = msg.payload?.jsonObject ?: return
                val peerKey = payload["peerPublicKey"]?.jsonPrimitive?.content ?: return
                val sessionId = payload["sessionId"]?.jsonPrimitive?.content ?: return
                crypto.setPeerPublicKey(peerKey)
                _events.value = RelayEvent.PairConfirmed(peerKey, sessionId)
            }

            "pair.rejected" -> {
                val reason = msg.payload?.jsonObject?.get("message")?.jsonPrimitive?.content ?: "Unknown"
                _events.value = RelayEvent.PairRejected(reason)
            }

            "encrypted" -> {
                handleEncrypted(msg)
            }

            "error" -> {
                val payload = msg.payload?.jsonObject
                val code = payload?.get("code")?.jsonPrimitive?.content ?: "UNKNOWN"
                val message = payload?.get("message")?.jsonPrimitive?.content ?: "Unknown error"
                _events.value = RelayEvent.Error(code, message)
            }

            "pong" -> { /* heartbeat */ }

            "session.destroy" -> {
                _events.value = RelayEvent.Disconnected
            }
        }
    }

    private fun handleEncrypted(msg: WireMessage) {
        try {
            val ciphertext = msg.payload?.jsonObject?.get("ciphertext")?.jsonPrimitive?.content ?: return
            val plaintext = crypto.decrypt(ciphertext)
            val inner = json.decodeFromString<InnerPayload>(plaintext)

            when (inner.type) {
                "terminal.output" -> {
                    val data = inner.data?.jsonObject ?: return
                    val output = data["output"]?.jsonPrimitive?.content ?: return
                    _events.value = RelayEvent.TerminalOutput(output)
                }

                "permission.request" -> {
                    val data = inner.data?.jsonObject ?: return
                    _events.value = RelayEvent.PermissionRequest(
                        id = data["id"]?.jsonPrimitive?.content ?: return,
                        tool = data["tool"]?.jsonPrimitive?.content ?: "unknown",
                        detail = data["detail"]?.jsonPrimitive?.content ?: "",
                        prompt = data["prompt"]?.jsonPrimitive?.content ?: ""
                    )
                }

                "status" -> {
                    val status = inner.data?.jsonObject?.get("status")?.jsonPrimitive?.content ?: return
                    _events.value = RelayEvent.StatusUpdate(status)
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to handle encrypted message")
        }
    }

    fun disconnect() {
        wsClient.disconnect()
    }

    companion object {
        fun normalizeRelayUrl(url: String): String {
            val trimmed = url.trim()
            return when {
                trimmed.startsWith("ws://") || trimmed.startsWith("wss://") -> trimmed
                trimmed.startsWith("https://") -> "wss://" + trimmed.removePrefix("https://")
                trimmed.startsWith("http://") -> "ws://" + trimmed.removePrefix("http://")
                else -> "ws://$trimmed"
            }
        }
    }
}
