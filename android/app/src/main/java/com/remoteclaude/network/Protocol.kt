package com.remoteclaude.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class WireMessage(
    val type: String,
    val sessionId: String? = null,
    val payload: JsonElement? = null,
    val timestamp: Long
)
