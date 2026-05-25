package com.remoteclaude

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.remoteclaude.crypto.E2EEncryption
import com.remoteclaude.network.RelayService
import com.remoteclaude.network.WebSocketClient
import com.remoteclaude.ui.theme.RemoteClaudeTheme
import com.remoteclaude.ui.session.PairingScreen
import com.remoteclaude.ui.session.TerminalScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            RemoteClaudeTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var sessionId by rememberSaveable { mutableStateOf<String?>(null) }
                    var relayUrl by rememberSaveable { mutableStateOf("ws://10.0.2.2:8080") }
                    val relayService = remember { RelayService(WebSocketClient(), E2EEncryption()) }

                    if (sessionId == null) {
                        PairingScreen(
                            relayService = relayService,
                            defaultRelayUrl = relayUrl,
                            onPaired = { url, sid ->
                                relayUrl = url
                                sessionId = sid
                            }
                        )
                    } else {
                        TerminalScreen(
                            relayService = relayService,
                            sessionId = sessionId!!,
                            onDisconnected = { sessionId = null }
                        )
                    }
                }
            }
        }
    }
}
