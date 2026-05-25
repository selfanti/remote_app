package com.remoteclaude.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF4FC3F7),
    onPrimary = Color(0xFF003C5D),
    primaryContainer = Color(0xFF004D7A),
    onPrimaryContainer = Color(0xFFCCE5FF),
    secondary = Color(0xFFB0BEC5),
    background = Color(0xFF0D1117),
    surface = Color(0xFF161B22),
    onBackground = Color(0xFFE6EDF3),
    onSurface = Color(0xFFE6EDF3),
    error = Color(0xFFF85149),
)

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF0288D1),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE1F5FE),
    onPrimaryContainer = Color(0xFF01579B),
    secondary = Color(0xFF546E7A),
    background = Color(0xFFF5F5F5),
    surface = Color.White,
    onBackground = Color(0xFF1C1B1F),
    onSurface = Color(0xFF1C1B1F),
    error = Color(0xFFB3261E),
)

@Composable
fun RemoteClaudeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context)
            else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(),
        content = content
    )
}
