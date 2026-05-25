package com.remoteclaude

import android.app.Application
import timber.log.Timber

class RemoteClaudeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Timber.plant(Timber.DebugTree())
    }
}
