package com.remoteclaude.ui.session

import android.util.Base64
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remoteclaude.network.RelayEvent
import com.remoteclaude.network.RelayService
import com.remoteclaude.terminal.StyledLine
import com.remoteclaude.terminal.TerminalClient
import com.remoteclaude.ui.terminal.AnsiTerminalView
import com.remoteclaude.ui.terminal.SpecialKeysRow
import com.remoteclaude.ui.terminal.TerminalInputBar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerminalScreen(
    relayService: RelayService,
    sessionId: String,
    onDisconnected: () -> Unit
) {
    val terminalClient = remember { TerminalClient() }
    var terminalLines by remember { mutableStateOf(emptyList<StyledLine>()) }
    var rawOutput by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("connecting") }
    var permissionRequest by remember { mutableStateOf<RelayEvent.PermissionRequest?>(null) }
    var showSpecialKeys by remember { mutableStateOf(false) }

    terminalClient.callback = object : TerminalClient.TerminalCallback {
        override fun onTerminalChanged() {
            terminalLines = terminalClient.getStyledLines()
        }
    }

    LaunchedEffect(relayService) {
        relayService.events.collect { event ->
            when (event) {
                is RelayEvent.TerminalOutput -> {
                    val decoded = Base64.decode(event.data, Base64.DEFAULT)
                    val text = String(decoded, Charsets.UTF_8)
                    terminalClient.feed(text)
                    rawOutput += text
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
                    rawOutput += "\n[Error] ${event.message}\n"
                }
                else -> {}
            }
        }
    }

    LaunchedEffect(status) {
        if (status == "active") {
            relayService.sendTerminalResize(80, 24)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val statusColor = when (status) {
                        "active" -> Color(0xFF4CAF50)
                        "waiting_permission" -> Color(0xFFFFC107)
                        "idle" -> Color(0xFF58A6FF)
                        else -> Color.Gray
                    }
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(statusColor, MaterialTheme.shapes.extraSmall)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Session ${sessionId.take(8)}",
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1
                    )
                }
            },
            actions = {
                IconButton(onClick = { showSpecialKeys = !showSpecialKeys }) {
                    Icon(
                        Icons.Default.Keyboard,
                        contentDescription = "Keyboard",
                        tint = if (showSpecialKeys) MaterialTheme.colorScheme.primary
                               else MaterialTheme.colorScheme.onSurface
                    )
                }
                IconButton(onClick = {
                    relayService.disconnect()
                    onDisconnected()
                }) {
                    Icon(Icons.Default.Close, contentDescription = "Disconnect")
                }
            }
        )

        AnimatedVisibility(visible = permissionRequest != null) {
            permissionRequest?.let { perm ->
                PermissionCard(
                    permission = perm,
                    onApprove = {
                        relayService.sendPermissionResponse(perm.id, true)
                        permissionRequest = null
                    },
                    onReject = {
                        relayService.sendPermissionResponse(perm.id, false)
                        permissionRequest = null
                    }
                )
            }
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .background(Color(0xFF0D1117))
        ) {
            if (terminalLines.isNotEmpty()) {
                AnsiTerminalView(
                    lines = terminalLines,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Box(modifier = Modifier.fillMaxSize().padding(8.dp)) {
                    Text(
                        text = rawOutput,
                        color = Color(0xFFE6EDF3),
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        lineHeight = 18.sp
                    )
                }
            }
        }

        AnimatedVisibility(visible = showSpecialKeys) {
            SpecialKeysRow(relayService = relayService)
        }

        TerminalInputBar(relayService = relayService)
    }
}

@Composable
private fun PermissionCard(
    permission: RelayEvent.PermissionRequest,
    onApprove: () -> Unit,
    onReject: () -> Unit
) {
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
                "权限请求: ${permission.tool}",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                permission.detail.take(300),
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                OutlinedButton(onClick = onReject) { Text("拒绝") }
                Spacer(modifier = Modifier.width(8.dp))
                Button(onClick = onApprove) { Text("批准") }
            }
        }
    }
}
