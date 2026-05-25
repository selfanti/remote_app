package com.remoteclaude.ui.terminal

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.remoteclaude.terminal.StyledLine
import com.remoteclaude.terminal.StyledSpan
import com.remoteclaude.terminal.TextStyle

private val BG_COLOR = Color(0xFF0D1117)
private val FG_COLOR = Color(0xFFE6EDF3)

private val ANSI_COLORS = mapOf(
    0 to Color(0xFF000000),   // Black
    1 to Color(0xFFDA3633),   // Red
    2 to Color(0xFF3FB950),   // Green
    3 to Color(0xFFD29922),   // Yellow
    4 to Color(0xFF58A6FF),   // Blue
    5 to Color(0xFFBC8CFF),   // Magenta
    6 to Color(0xFF39C5CF),   // Cyan
    7 to Color(0xFFB1BAC4),   // White
    8 to Color(0xFF484F58),   // Bright Black
    9 to Color(0xFFFF7B72),   // Bright Red
    10 to Color(0xFF56D364),  // Bright Green
    11 to Color(0xFFE3B341),  // Bright Yellow
    12 to Color(0xFF79C0FF),  // Bright Blue
    13 to Color(0xFFD2A8FF),  // Bright Magenta
    14 to Color(0xFF56D4DD),  // Bright Cyan
    15 to Color(0xFFFFFFFF),  // Bright White
)

@Composable
fun AnsiTerminalView(
    lines: List<StyledLine>,
    modifier: Modifier = Modifier
) {
    val textMeasurer = rememberTextMeasurer()

    Canvas(modifier = modifier.fillMaxSize()) {
        val charWidth = 7.5f * density
        val charHeight = 14f * density
        val lineSpacing = 4f * density

        drawRect(BG_COLOR)

        var yOffset = 0f
        for (line in lines) {
            var xOffset = 0f
            for (span in line.spans) {
                val textColor = resolveColor(span.style.foregroundColor, FG_COLOR)
                val bgColor = resolveColor(span.style.backgroundColor, null)

                if (bgColor != null) {
                    val width = span.text.length * charWidth
                    drawRect(
                        bgColor,
                        topLeft = Offset(xOffset, yOffset),
                        size = Size(width, charHeight)
                    )
                }

                val fontWeight = if (span.style.bold) FontWeight.Bold else FontWeight.Normal
                val fontStyle = if (span.style.italic) FontStyle.Italic else FontStyle.Normal

                drawText(
                    textMeasurer,
                    text = span.text,
                    topLeft = Offset(xOffset, yOffset),
                    style = TextStyle(
                        color = textColor,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        fontWeight = fontWeight,
                        fontStyle = fontStyle,
                    )
                )

                xOffset += span.text.length * charWidth

                if (span.style.underline) {
                    drawLine(
                        textColor,
                        start = Offset(0f, yOffset + charHeight),
                        end = Offset(xOffset, yOffset + charHeight),
                        strokeWidth = 1f * density
                    )
                }
            }
            yOffset += charHeight + lineSpacing
        }
    }
}

private fun resolveColor(colorIndex: Int, default: Color?): Color? {
    if (colorIndex < 0 || colorIndex == 0x1FFFFFFF) return default
    // Standard ANSI 16 colors + 256 color extension
    return when {
        colorIndex < 16 -> ANSI_COLORS[colorIndex] ?: default
        colorIndex in 16..231 -> {
            // 216 color cube
            val idx = colorIndex - 16
            val r = ((idx / 36) * 51)
            val g = (((idx % 36) / 6) * 51)
            val b = ((idx % 6) * 51)
            Color(r, g, b)
        }
        colorIndex in 232..255 -> {
            // Grayscale
            val gray = 8 + (colorIndex - 232) * 10
            Color(gray, gray, gray)
        }
        else -> default
    }
}
