package com.remoteclaude.network

import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.*
import timber.log.Timber
import java.util.concurrent.TimeUnit

@Serializable
data class WireMessage(
    val type: String,
    val sessionId: String? = null,
    val payload: kotlinx.serialization.json.JsonElement? = null,
    val timestamp: Long
)

class WebSocketClient {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    private var webSocket: WebSocket? = null

    fun connect(url: String): Flow<WireMessage> = callbackFlow {
        val request = Request.Builder().url(url).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Timber.d("WebSocket connected")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val msg = json.decodeFromString<WireMessage>(text)
                    trySend(msg)
                } catch (e: Exception) {
                    Timber.e(e, "Failed to parse message")
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Timber.d("WebSocket closed: $code $reason")
                close()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Timber.e(t, "WebSocket failure")
                close(t)
            }
        })

        awaitClose {
            webSocket?.close(1000, "Client disconnecting")
            webSocket = null
        }
    }.flowOn(Dispatchers.IO)

    fun send(msg: WireMessage) {
        val text = json.encodeToString(WireMessage.serializer(), msg)
        webSocket?.send(text)
    }

    fun disconnect() {
        webSocket?.close(1000, "Client disconnecting")
        webSocket = null
    }
}
