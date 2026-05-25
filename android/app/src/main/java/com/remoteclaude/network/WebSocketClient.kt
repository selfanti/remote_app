package com.remoteclaude.network

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.json.Json
import okhttp3.*
import timber.log.Timber
import java.util.concurrent.TimeUnit

class WebSocketClient {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    private var webSocket: WebSocket? = null
    private val offlineQueue = mutableListOf<String>()
    private var isConnected = false
    private var reconnectJob: Job? = null
    private var reconnectAttempts = 0
    private var intentionallyClosed = false

    companion object {
        private const val MAX_RECONNECT = 20
        private const val MAX_OFFLINE_QUEUE = 500
    }

    fun connect(url: String): Flow<WireMessage> = callbackFlow {
        intentionallyClosed = false
        val request = Request.Builder().url(url).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Timber.d("WebSocket connected")
                isConnected = true
                reconnectAttempts = 0
                flushOfflineQueue(webSocket)
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
                isConnected = false
                if (!intentionallyClosed) {
                    scheduleReconnect(url)
                }
                close()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Timber.e(t, "WebSocket failure")
                isConnected = false
                if (!intentionallyClosed) {
                    scheduleReconnect(url)
                }
                close(t)
            }
        })

        awaitClose {
            intentionallyClosed = true
            webSocket?.close(1000, "Client disconnecting")
            webSocket = null
            reconnectJob?.cancel()
        }
    }.flowOn(Dispatchers.IO)

    fun send(msg: WireMessage) {
        val text = json.encodeToString(WireMessage.serializer(), msg)
        val ws = webSocket
        if (ws != null && isConnected) {
            ws.send(text)
        } else {
            synchronized(offlineQueue) {
                if (offlineQueue.size < MAX_OFFLINE_QUEUE) {
                    offlineQueue.add(text)
                }
            }
        }
    }

    fun disconnect() {
        intentionallyClosed = true
        reconnectJob?.cancel()
        webSocket?.close(1000, "Client disconnecting")
        webSocket = null
        isConnected = false
        synchronized(offlineQueue) {
            offlineQueue.clear()
        }
    }

    private fun flushOfflineQueue(ws: WebSocket) {
        synchronized(offlineQueue) {
            while (offlineQueue.isNotEmpty()) {
                val msg = offlineQueue.removeAt(0)
                ws.send(msg)
            }
        }
        Timber.d("Offline queue flushed")
    }

    private fun scheduleReconnect(url: String) {
        if (intentionallyClosed) return
        if (reconnectAttempts >= MAX_RECONNECT) {
            Timber.e("Max reconnect attempts reached")
            return
        }

        val baseDelay = minOf(1000L * (1L shl reconnectAttempts), 30_000L)
        val jitter = (Math.random() * 1000).toLong()
        val delay = baseDelay + jitter
        reconnectAttempts++

        Timber.d("Reconnecting in ${delay}ms (attempt $reconnectAttempts/$MAX_RECONNECT)")

        reconnectJob = CoroutineScope(Dispatchers.IO).launch {
            delay(delay)
            // The Flow collector will handle the reconnection
            connect(url)
        }
    }
}
