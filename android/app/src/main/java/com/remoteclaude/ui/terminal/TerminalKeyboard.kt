package com.remoteclaude.ui.terminal

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import com.remoteclaude.network.RelayService

@Composable
fun TerminalInputBar(
    relayService: RelayService,
    modifier: Modifier = Modifier
) {
    var inputText by remember { mutableStateOf(TextFieldValue("")) }
    var showSpecialKeys by remember { mutableStateOf(false) }
    var ctrlActive by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxWidth()) {
        // Special keys row
        if (showSpecialKeys) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                SpecialKey("ESC", "")
                SpecialKey("TAB", "\t")
                SpecialKey("↑", "[A")
                SpecialKey("↓", "[B")
                SpecialKey("←", "[D")
                SpecialKey("→", "[C")
                SpecialKey("HOME", "[H")
                SpecialKey("END", "[F")
                SpecialKey("PGUP", "[5~")
                SpecialKey("PGDN", "[6~")

                // Ctrl modifier toggle
                FilterChip(
                    selected = ctrlActive,
                    onClick = { ctrlActive = !ctrlActive },
                    label = { Text("CTRL") }
                )

                // Ctrl + letter shortcuts
                if (ctrlActive) {
                    for (c in listOf('C', 'D', 'L', 'Z', 'A', 'E')) {
                        SpecialKey("^$c", (c.code - 64).toChar().toString()) {
                            ctrlActive = false
                        }
                    }
                }
            }
        }

        // Main input row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp)
                .imePadding(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Toggle special keys
            IconButton(
                onClick = { showSpecialKeys = !showSpecialKeys },
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    Icons.Default.Keyboard,
                    contentDescription = "Special keys",
                    modifier = Modifier.size(20.dp)
                )
            }

            OutlinedTextField(
                value = inputText,
                onValueChange = { inputText = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("输入命令...") },
                singleLine = true,
                textStyle = LocalTextStyle.current.copy(
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
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

@Composable
private fun RowScope.SpecialKey(
    label: String,
    sequence: String,
    onClick: (() -> Unit)? = null
) {
    // We need access to relayService, so we'll handle this differently
    // For now, store the sequence and send on click
    var sendAction by remember { mutableStateOf<(() -> Unit)?>(null) }

    OutlinedButton(
        onClick = {
            onClick?.invoke()
        },
        modifier = Modifier.height(32.dp),
        contentPadding = PaddingValues(horizontal = 8.dp)
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
fun SpecialKeysRow(
    relayService: RelayService,
    modifier: Modifier = Modifier
) {
    var ctrlActive by remember { mutableStateOf(false) }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        SpecialKeyBtn("ESC") { relayService.sendTerminalInput("") }
        SpecialKeyBtn("TAB") { relayService.sendTerminalInput("\t") }
        SpecialKeyBtn("↑") { relayService.sendTerminalInput("[A") }
        SpecialKeyBtn("↓") { relayService.sendTerminalInput("[B") }
        SpecialKeyBtn("←") { relayService.sendTerminalInput("[D") }
        SpecialKeyBtn("→") { relayService.sendTerminalInput("[C") }
        SpecialKeyBtn("HOME") { relayService.sendTerminalInput("[H") }
        SpecialKeyBtn("END") { relayService.sendTerminalInput("[F") }

        FilterChip(
            selected = ctrlActive,
            onClick = { ctrlActive = !ctrlActive },
            label = { Text("CTRL", style = MaterialTheme.typography.labelSmall) }
        )

        if (ctrlActive) {
            for (c in listOf('C', 'D', 'L', 'Z', 'A', 'E', 'W', 'K', 'U', 'R')) {
                val seq = (c.code - 64).toChar().toString()
                SpecialKeyBtn("^$c") {
                    relayService.sendTerminalInput(seq)
                    ctrlActive = false
                }
            }
        }
    }
}

@Composable
private fun SpecialKeyBtn(label: String, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier.height(32.dp),
        contentPadding = PaddingValues(horizontal = 8.dp)
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}
