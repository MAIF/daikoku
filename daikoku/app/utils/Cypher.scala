package fr.maif.otoroshi.daikoku.cypher

import javax.crypto.{Cipher, SecretKeyFactory}
import javax.crypto.spec.{PBEKeySpec, SecretKeySpec}
object Cypher {
  def encrypt(secret: String, token: String): String = {
    val secretKey = getKey(secret)
    val cipher: Cipher = Cipher.getInstance("AES")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey)
    val bytes = cipher.doFinal(token.getBytes)
    val cipheredValidationToken = {
      java.util.Base64.getUrlEncoder.encodeToString(bytes)
    }
    cipheredValidationToken
  }

  def getKey(secret: String): SecretKeySpec = {
    val salt = new Array[Byte](16)
    val spec = new PBEKeySpec(secret.toCharArray, salt, 65536, 256) // AES-256
    val f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA1")
    val key = f.generateSecret(spec).getEncoded
    new SecretKeySpec(key, "AES")
  }

  def decrypt( secret: String, encryptedString: String): String = {
    val secretKey = getKey(secret)
    val tokenBytes = java.util.Base64.getUrlDecoder.decode(encryptedString)
    val cipher: Cipher = Cipher.getInstance("AES")
    cipher.init(Cipher.DECRYPT_MODE, secretKey)
    new String(cipher.doFinal(tokenBytes))
  }

}
