package com.remoteclaude.ui.session

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remoteclaude.crypto.E2EEncryption
import com.remoteclaude.network.RelayEvent
import com.remoteclaude.network.RelayService
import com.remoteclaude.network.WebSocketClient

@Composable
fun PairingScreen(
    defaultRelayUrl: String,
    onPaired: (relayUrl: String, sessionId: String) -> Unit
) {
    var relayUrl by remember { mutableStateOf(defaultRelayUrl) }
    var pairCode by remember { mutableStateOf("") }
    var isConnecting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showSettings by remember { mutableStateOf(false) }

    val relayService = remember { RelayService(WebSocketClient(), E2EEncryption()) }

    LaunchedEffect(relayService) {
        relayService.events.collect { event ->
            when (event) {
                is RelayEvent.PairConfirmed -> {
                    onPaired(relayUrl, event.sessionId)
                }
                is RelayEvent.PairRejected -> {
                    errorMessage = "配对失败: ${event.reason}"
                    isConnecting = false
                }
                is RelayEvent.Error -> {
                    errorMessage = "${event.code}: ${event.message}"
                    isConnecting = false
                }
                is RelayEvent.Disconnected -> {
                    errorMessage = "连接断开"
                    isConnecting = false
                }
                else -> {}
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Link,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.primary
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "RemoteClaude",
            style = MaterialTheme.typography.titleLarge,
            fontSize = 28.sp
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "输入配对码连接到你的 Claude Code",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(32.dp))

        // Server URL
        if (showSettings) {
            OutlinedTextField(
                value = relayUrl,
                onValueChange = { relayUrl = it },
                label = { Text("服务器地址") },
                placeholder = { Text("ws://your-server:8080") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            Spacer(modifier = Modifier.height(16.dp))
        }

        // Pair code input
        OutlinedTextField(
            value = pairCode,
            onValueChange = {
                if (it.length <= 6) pairCode = it
            },
            label = { Text("配对码") },
            placeholder = { Text("123456") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = TextStyle(
                textAlign = TextAlign.Center,
                fontSize = 24.sp,
                letterSpacing = 8.sp
            ),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Error message
        errorMessage?.let { error ->
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        // Connect button
        Button(
            onClick = {
                if (pairCode.length == 6) {
                    isConnecting = true
                    errorMessage = null
                    relayService.connect(relayUrl)
                    relayService.submitPairCode(pairCode)
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            enabled = pairCode.length == 6 && !isConnecting
        ) {
            if (isConnecting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = MaterialTheme.colorScheme.onPrimary
                )
            } else {
                Text("连接")
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Settings toggle
        TextButton(onClick = { showSettings = !showSettings }) {
            Icon(
                Icons.Default.Settings,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text("服务器设置")
        }
    }
}
