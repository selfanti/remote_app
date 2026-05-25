package com.remoteclaude.terminal

import android.util.Base64
import com.termux.terminal.TerminalBuffer
import com.termux.terminal.TerminalEmulator
import com.termux.terminal.TerminalOutput
import com.termux.terminal.TerminalSession
import com.termux.terminal.TerminalSession.SessionChangedCallback

/**
 * Bridge between WebSocket data and Termux TerminalSession.
 * Receives base64-encoded ANSI data from the relay, feeds it into
 * a Termux TerminalEmulator, and provides the styled output for rendering.
 */
class TerminalClient(
    private val cols: Int = 80,
    private val rows: Int = 24
) : SessionChangedCallback {

    interface TerminalCallback {
        fun onTerminalChanged()
        fun onSessionTitleChanged(title: String)
    }

    var callback: TerminalCallback? = null

    // In-memory terminal session that processes ANSI sequences
    private val session: TerminalSession = TerminalSession(
        "/bin/sh",  // dummy shell - we override input
        null,
        emptyArray(),
        rows,
        cols,
        0,
        this
    )

    private val lines = mutableListOf<TerminalLine>()
    private var _title = "RemoteClaude"
    val title: String get() = _title

    /**
     * Feed base64-encoded ANSI data into the terminal emulator.
     */
    fun feed(data: String) {
        val decoded = Base64.decode(data, Base64.DEFAULT)
        session.write(decoded, 0, decoded.size)
    }

    /**
     * Get the styled terminal content as a list of styled lines.
     */
    fun getStyledLines(): List<StyledLine> {
        val result = mutableListOf<StyledLine>()
        val terminal = session.emulator

        // Read active screen content
        val rows = terminal.rows
        val cols = terminal.columns

        for (row in 0 until rows) {
            val styledSpans = mutableListOf<StyledSpan>()
            val sb = StringBuilder()
            var lastStyle: TextStyle? = null
            var lineStart = 0

            for (col in 0 until cols) {
                val charIndex = row * cols + col
                val codePoint = terminal.screen[charIndex]
                val style = getStyleAt(terminal, row, col)

                if (style != lastStyle) {
                    if (sb.isNotEmpty() && lastStyle != null) {
                        styledSpans.add(StyledSpan(sb.toString(), lastStyle))
                        sb.clear()
                    }
                    lastStyle = style
                }

                if (codePoint != 0) {
                    sb.appendCodePoint(codePoint)
                } else {
                    sb.append(' ')
                }
            }

            if (sb.isNotEmpty() && lastStyle != null) {
                styledSpans.add(StyledSpan(sb.toString().trimEnd(), lastStyle))
            }

            if (styledSpans.isNotEmpty()) {
                result.add(StyledLine(styledSpans))
            }
        }

        return result
    }

    private fun getStyleAt(terminal: TerminalEmulator, row: Int, col: Int): TextStyle {
        // Default style - Termux terminal handles styling internally
        // We extract basic color info
        return TextStyle(foregroundColor = -1, backgroundColor = -1, bold = false)
    }

    // SessionChangedCallback implementation
    override fun onTextChanged(changedSession: TerminalSession) {
        callback?.onTerminalChanged()
    }

    override fun onTitleChanged(changedSession: TerminalSession) {
        _title = changedSession.title
        callback?.onSessionTitleChanged(_title)
    }

    override fun onSessionFinished(finishedSession: TerminalSession) {}
    override fun onClipboardText(session: TerminalSession, text: String) {}
    override fun onBell(session: TerminalSession) {}
    override fun onColorsChanged(session: TerminalSession) {}
    override fun onTerminalCursorStateChange(state: Boolean) {}

    fun resize(newCols: Int, newRows: Int) {
        session.updateSize(newCols, newRows)
    }
}

data class StyledLine(val spans: List<StyledSpan>)
data class StyledSpan(val text: String, val style: TextStyle)
data class TextStyle(
    val foregroundColor: Int,
    val backgroundColor: Int,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val underline: Boolean = false
)
