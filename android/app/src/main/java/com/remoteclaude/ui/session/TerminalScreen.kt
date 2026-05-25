package com.remoteclaude.ui.session

import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remoteclaude.crypto.E2EEncryption
import com.remoteclaude.network.RelayEvent
import com.remoteclaude.network.RelayService
import com.remoteclaude.network.WebSocketClient
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerminalScreen(
    relayUrl: String,
    sessionId: String,
    onDisconnected: () -> Unit
) {
    val relayService = remember { RelayService(WebSocketClient(), E2EEncryption()) }
    var terminalOutput by remember { mutableStateOf("") }
    var inputText by remember { mutableStateOf(TextFieldValue("")) }
    var status by remember { mutableStateOf("connecting") }
    var permissionRequest by remember { mutableStateOf<RelayEvent.PermissionRequest?>(null) }
    val scrollState = rememberScrollState()

    // Connect to relay and collect events
    LaunchedEffect(relayUrl) {
        relayService.connect(relayUrl)
    }

    LaunchedEffect(relayService) {
        relayService.events.collect { event ->
            when (event) {
                is RelayEvent.TerminalOutput -> {
                    val decoded = Base64.decode(event.data, Base64.DEFAULT)
                    val text = String(decoded, Charsets.UTF_8)
                    terminalOutput += text
                    // Auto-scroll to bottom
                    delay(50)
                    scrollState.scrollTo(scrollState.maxValue)
                }
                is RelayEvent.PermissionRequest -> {
                    permissionRequest = event
                }
                is RelayEvent.StatusUpdate -> {
                    status = event.status
                }
                is RelayEvent.Disconnected -> {
                    onDisconnected()
                }
                is RelayEvent.Error -> {
                    terminalOutput += "\n[Error] ${event.message}\n"
                }
                else -> {}
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Top bar with status
        TopAppBar(
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val statusColor = when (status) {
                        "active" -> Color(0xFF4CAF50)
                        "waiting_permission" -> Color(0xFFFFC107)
                        else -> Color.Gray
                    }
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(statusColor, MaterialTheme.shapes.extraSmall)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Session ${sessionId.take(8)}...",
                        style = MaterialTheme.typography.titleSmall
                    )
                }
            },
            actions = {
                IconButton(onClick = {
                    relayService.disconnect()
                    onDisconnected()
                }) {
                    Icon(Icons.Default.Close, contentDescription = "Disconnect")
                }
            }
        )

        // Permission card (shown when permission is requested)
        permissionRequest?.let { perm ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        "权限请求: ${perm.tool}",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        perm.detail.take(200),
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        OutlinedButton(
                            onClick = {
                                relayService.sendPermissionResponse(perm.id, false)
                                permissionRequest = null
                            }
                        ) {
                            Text("拒绝")
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                relayService.sendPermissionResponse(perm.id, true)
                                permissionRequest = null
                            }
                        ) {
                            Text("批准")
                        }
                    }
                }
            }
        }

        // Terminal output
        Box(
            modifier = Modifier
                .weight(1f)
                .background(Color(0xFF0D1117))
                .padding(8.dp)
                .verticalScroll(scrollState)
                .horizontalScroll(rememberScrollState())
        ) {
            Text(
                text = terminalOutput,
                color = Color(0xFFE6EDF3),
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                softWrap = false
            )
        }

        // Input bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp)
                .imePadding(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = inputText,
                onValueChange = { inputText = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("输入命令...") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Text,
                    imeAction = androidx.compose.ui.text.input.ImeAction.Send
                ),
                keyboardActions = KeyboardActions(
                    onSend = {
                        if (inputText.text.isNotEmpty()) {
                            relayService.sendTerminalInput(inputText.text + "\n")
                            inputText = TextFieldValue("")
                        }
                    }
                )
            )

            IconButton(
                onClick = {
                    if (inputText.text.isNotEmpty()) {
                        relayService.sendTerminalInput(inputText.text + "\n")
                        inputText = TextFieldValue("")
                    }
                }
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    contentDescription = "Send",
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}
