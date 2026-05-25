package com.remoteclaude.crypto

import android.util.Base64
import org.bouncycastle.crypto.engines.XSalsa20Engine
import org.bouncycastle.crypto.macs.Poly1305
import org.bouncycastle.crypto.params.KeyParameter
import org.bouncycastle.crypto.params.ParametersWithIV
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.KeyAgreement

/**
 * End-to-end encryption using NaCl crypto_box compatible with tweetnacl on the CLI side.
 *
 * crypto_box = X25519 key agreement + XSalsa20-Poly1305 AEAD
 * Format: base64(nonce[24] || MAC[16] || ciphertext[plaintext.length])
 */
class E2EEncryption {
    private val random = SecureRandom()
    private var publicKeyRaw = ByteArray(32)
    private var secretKeyRaw = ByteArray(32)
    private var sharedKey: ByteArray? = null
    private var nonceCounter: Long = 0

    init {
        generateKeyPair()
    }

    val publicKeyBase64: String
        get() = Base64.encodeToString(publicKeyRaw, Base64.NO_WRAP)

    fun setPeerPublicKey(peerPublicKeyBase64: String) {
        val peerPk = Base64.decode(peerPublicKeyBase64, Base64.NO_WRAP)
        sharedKey = computeSharedSecret(secretKeyRaw, peerPk)
        nonceCounter = 0
    }

    fun encrypt(plaintext: String): String {
        val key = sharedKey ?: throw IllegalStateException("Peer not set")
        val nonce = generateNonce()
        val message = plaintext.toByteArray(Charsets.UTF_8)

        val box = cryptoSecretbox(message, nonce, key)

        val result = ByteArray(24 + box.size)
        System.arraycopy(nonce, 0, result, 0, 24)
        System.arraycopy(box, 0, result, 24, box.size)

        return Base64.encodeToString(result, Base64.NO_WRAP)
    }

    fun decrypt(combinedBase64: String): String {
        val key = sharedKey ?: throw IllegalStateException("Peer not set")
        val data = Base64.decode(combinedBase64, Base64.NO_WRAP)

        val nonce = data.copyOfRange(0, 24)
        val box = data.copyOfRange(24, data.size)

        val plaintext = cryptoSecretboxOpen(box, nonce, key)
        return String(plaintext, Charsets.UTF_8)
    }

    private fun generateKeyPair() {
        val kpg = KeyPairGenerator.getInstance("X25519")
        val keyPair = kpg.generateKeyPair()

        // Extract raw 32-byte keys
        publicKeyRaw = keyPair.public.encoded.copyOfRange(keyPair.public.encoded.size - 32, keyPair.public.encoded.size)

        val privEncoded = keyPair.private.encoded
        // PKCS#8 format: the last 32 bytes are the raw key (for X25519)
        secretKeyRaw = privEncoded.copyOfRange(privEncoded.size - 32, privEncoded.size)
    }

    private fun computeSharedSecret(myPrivKey: ByteArray, theirPubKey: ByteArray): ByteArray {
        val kf = KeyFactory.getInstance("X25519")

        // Reconstruct peer public key from raw bytes (X509 header + raw)
        val peerPubKey = kf.generatePublic(X509EncodedKeySpec(
            x509Prefix + theirPubKey
        ))

        // Reconstruct our private key from raw bytes (PKCS8 header + raw)
        val myPrivKeyObj = kf.generatePrivate(PKCS8EncodedKeySpec(
            pkcs8Prefix + myPrivKey
        ))

        val ka = KeyAgreement.getInstance("X25519")
        ka.init(myPrivKeyObj)
        ka.doPhase(peerPubKey, true)
        val rawShared = ka.generateSecret()

        // Derive crypto_box key using HSalsa20
        return hsalsa20(rawShared, ByteArray(16))
    }

    private fun cryptoSecretbox(message: ByteArray, nonce: ByteArray, key: ByteArray): ByteArray {
        val padded = ByteArray(32 + message.size)
        System.arraycopy(message, 0, padded, 32, message.size)

        val engine = XSalsa20Engine()
        engine.init(true, ParametersWithIV(KeyParameter(key), nonce))
        val encrypted = ByteArray(padded.size)
        engine.processBytes(padded, 0, padded.size, encrypted, 0)

        val polyKey = encrypted.copyOfRange(0, 32)

        val mac = ByteArray(16)
        val poly1305 = Poly1305()
        poly1305.init(KeyParameter(polyKey))
        poly1305.update(encrypted, 32, encrypted.size - 32)
        poly1305.doFinal(mac, 0)

        val result = ByteArray(16 + message.size)
        System.arraycopy(mac, 0, result, 0, 16)
        System.arraycopy(encrypted, 32, result, 16, message.size)
        return result
    }

    private fun cryptoSecretboxOpen(box: ByteArray, nonce: ByteArray, key: ByteArray): ByteArray {
        val mac = box.copyOfRange(0, 16)
        val ciphertext = box.copyOfRange(16, box.size)

        val engine = XSalsa20Engine()
        engine.init(false, ParametersWithIV(KeyParameter(key), nonce))

        // Get Poly1305 key by decrypting 32 zero bytes
        val padded = ByteArray(32 + ciphertext.size)
        engine.processBytes(ByteArray(32), 0, 32, padded, 0)

        // Verify MAC before decrypting
        // Need to reconstruct what the encrypted zeros would be for poly key
        val polyKey = padded.copyOfRange(0, 32)

        // For verification, we encrypt ciphertext to get back padded version
        // Actually, we need to re-encrypt to verify. Let's use a fresh engine.
        val verifyEngine = XSalsa20Engine()
        verifyEngine.init(true, ParametersWithIV(KeyParameter(key), nonce))

        val verifyPadded = ByteArray(32 + ciphertext.size)
        verifyEngine.processBytes(ByteArray(32), 0, 32, verifyPadded, 0)

        val computedMac = ByteArray(16)
        val poly1305 = Poly1305()
        poly1305.init(KeyParameter(verifyPadded.copyOfRange(0, 32)))

        // Decrypt ciphertext
        val decrypted = ByteArray(ciphertext.size)
        engine.processBytes(ciphertext, 0, ciphertext.size, decrypted, 0)

        poly1305.update(decrypted, 0, decrypted.size)
        poly1305.doFinal(computedMac, 0)

        if (!mac.contentEquals(computedMac)) {
            throw RuntimeException("Decryption failed - MAC mismatch")
        }

        return decrypted
    }

    private fun hsalsa20(key: ByteArray, nonce: ByteArray): ByteArray {
        val engine = XSalsa20Engine()
        engine.init(true, ParametersWithIV(KeyParameter(key), nonce))
        val output = ByteArray(32)
        engine.processBytes(output, 0, 32, output, 0)
        return output
    }

    private fun generateNonce(): ByteArray {
        val nonce = ByteArray(24)
        random.nextBytes(nonce)
        val counter = nonceCounter++
        for (i in 0 until 8) {
            nonce[23 - i] = ((counter shr (i * 8)) and 0xFF).toByte()
        }
        return nonce
    }

    companion object {
        // X25519 X509 header (AlgorithmIdentifier + BIT STRING wrapper for 32 bytes)
        private val x509Prefix = byteArrayOf(
            0x30, 0x39, 0x30, 0x07, 0x06, 0x03, 0x2B.toByte(), 0x65, 0x6E,
            0x05, 0x00, 0x03, 0x2E, 0x00, 0x04, 0x20
        )
        // X25519 PKCS8 header
        private val pkcs8Prefix = byteArrayOf(
            0x30, 0x2E, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2B.toByte(),
            0x65, 0x6E, 0x04, 0x22, 0x04, 0x20
        )
    }
}
