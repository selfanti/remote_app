package com.remoteclaude.push

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.remoteclaude.MainActivity
import com.remoteclaude.R

class ConnectionService : Service() {
    companion object {
        const val CHANNEL_ID = "remote_claude_connection"
        const val NOTIFICATION_ID = 1
        const val ACTION_PERMISSION = "com.remoteclaude.PERMISSION"
        const val EXTRA_PERMISSION_ID = "permission_id"
        const val EXTRA_APPROVED = "approved"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PERMISSION -> {
                val permId = intent.getStringExtra(EXTRA_PERMISSION_ID) ?: return START_STICKY
                val approved = intent.getBooleanExtra(EXTRA_APPROVED, false)
                // Permission responses are handled via RelayService
            }
        }

        val notification = createNotification("RemoteClaude 已连接")
        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "RemoteClaude 连接",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "保持与 Claude Code 的连接"
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun createNotification(text: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("RemoteClaude")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    fun showPermissionNotification(permId: String, tool: String, detail: String) {
        val manager = getSystemService(NotificationManager::class.java)

        // Approve action
        val approveIntent = Intent(this, ConnectionService::class.java).apply {
            action = ACTION_PERMISSION
            putExtra(EXTRA_PERMISSION_ID, permId)
            putExtra(EXTRA_APPROVED, true)
        }
        val approvePending = PendingIntent.getService(
            this, permId.hashCode(), approveIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Reject action
        val rejectIntent = Intent(this, ConnectionService::class.java).apply {
            action = ACTION_PERMISSION
            putExtra(EXTRA_PERMISSION_ID, permId)
            putExtra(EXTRA_APPROVED, false)
        }
        val rejectPending = PendingIntent.getService(
            this, (permId.hashCode() + 1), rejectIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("权限请求: $tool")
            .setContentText(detail.take(50))
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .addAction(0, "拒绝", rejectPending)
            .addAction(0, "批准", approvePending)
            .build()

        manager.notify(permId.hashCode(), notification)
    }
}
