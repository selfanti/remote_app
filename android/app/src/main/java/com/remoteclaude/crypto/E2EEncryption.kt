package com.remoteclaude.crypto

import android.util.Base64
import com.goterl.lazysodium.LazysodiumAndroid
import com.goterl.lazysodium.SodiumAndroid
import com.goterl.lazysodium.interfaces.Box
import com.goterl.lazysodium.interfaces.Sign
import java.security.SecureRandom

/**
 * End-to-end encryption using NaCl crypto_box (X25519 + XSalsa20-Poly1305).
 * The relay server only sees ciphertext - it can NEVER decrypt messages.
 */
class E2EEncryption {
    private val sodium: LazysodiumAndroid = LazysodiumAndroid(SodiumAndroid())
    private var publicKey: ByteArray = ByteArray(Box.SECRETKEYBYTES)
    private var secretKey: ByteArray = ByteArray(Box.SECRETKEYBYTES)
    private var peerPublicKey: ByteArray? = null
    private var nonceCounter: Long = 0

    init {
        generateKeyPair()
    }

    val publicKeyBase64: String
        get() = Base64.encodeToString(publicKey, Base64.NO_WRAP)

    fun setPeerPublicKey(peerPublicKeyBase64: String) {
        peerPublicKey = Base64.decode(peerPublicKeyBase64, Base64.NO_WRAP)
        nonceCounter = 0
    }

    fun encrypt(plaintext: String): String {
        val peer = peerPublicKey ?: throw IllegalStateException("Peer public key not set")

        val nonce = generateNonce()
        val message = plaintext.toByteArray(Charsets.UTF_8)

        val ciphertext = ByteArray(message.size + Box.MACBYTES)
        val result = sodium.cryptoBoxEasy(
            ciphertext, message, message.size.toLong(),
            nonce, peer, secretKey
        )

        if (!result) throw RuntimeException("Encryption failed")

        // Combine nonce + ciphertext
        val combined = ByteArray(nonce.size + ciphertext.size)
        System.arraycopy(nonce, 0, combined, 0, nonce.size)
        System.arraycopy(ciphertext, 0, combined, nonce.size, ciphertext.size)

        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    fun decrypt(combinedBase64: String): String {
        val peer = peerPublicKey ?: throw IllegalStateException("Peer public key not set")

        val combined = Base64.decode(combinedBase64, Base64.NO_WRAP)
        val nonce = combined.copyOfRange(0, Box.NONCEBYTES)
        val ciphertext = combined.copyOfRange(Box.NONCEBYTES, combined.size)

        val decrypted = ByteArray(ciphertext.size - Box.MACBYTES)
        val result = sodium.cryptoBoxOpenEasy(
            decrypted, ciphertext, ciphertext.size.toLong(),
            nonce, peer, secretKey
        )

        if (!result) throw RuntimeException("Decryption failed - invalid ciphertext")

        return String(decrypted, Charsets.UTF_8)
    }

    private fun generateKeyPair() {
        sodium.cryptoBoxKeyPair(publicKey, secretKey)
    }

    private fun generateNonce(): ByteArray {
        val nonce = ByteArray(Box.NONCEBYTES)
        // Random prefix + counter for uniqueness
        SecureRandom().nextBytes(nonce)
        val counter = nonceCounter++
        for (i in 0 until 8) {
            nonce[Box.NONCEBYTES - 1 - i] = ((counter shr (i * 8)) and 0xFF).toByte()
        }
        return nonce
    }
}
