package org.fossify.calendar.youqi

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.net.URL
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection

/** Optional, independent OpenAI/Whisper-compatible speech-to-text endpoint. */
class SpeechService(context: Context, private val openConnection: (URL) -> HttpsURLConnection = { it.openConnection() as HttpsURLConnection }) {
    private val prefs = context.getSharedPreferences("youqi-speech-private", Context.MODE_PRIVATE)
    private val alias = "youqi-speech-aes-v1"
    @Volatile private var active: HttpsURLConnection? = null

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }
    private fun secret(): String {
        val stored = prefs.getString("key", "").orEmpty()
        if (stored.isEmpty()) return ""
        return try {
            val parts = stored.split(":", limit = 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
            }
            String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
        } catch (_: Exception) { error("无法读取语音识别密钥，请在设置中重新填写") }
    }
    fun config(): JSONObject = synchronized(this) {
        JSONObject().put("endpoint", prefs.getString("endpoint", ""))
            .put("model", prefs.getString("model", "whisper-1"))
            .put("language", prefs.getString("language", "zh"))
            .put("hasKey", !prefs.getString("key", "").isNullOrBlank())
    }
    private fun endpoint(value: String): String {
        require(value.length <= 2048) { "接口地址过长" }
        val uri = runCatching { URI(value.trim()) }.getOrNull()
        require(uri != null && uri.scheme.equals("https", true) && !uri.host.isNullOrBlank() && uri.userInfo == null &&
            uri.rawQuery == null && uri.rawFragment == null && (uri.port == -1 || uri.port in 1..65535)) {
            "请填写完整 HTTPS 转写接口地址，不要包含密钥、查询参数或 #"
        }
        return uri!!.toASCIIString().trimEnd('/')
    }
    @Synchronized fun saveConfig(input: String): JSONObject {
        val data = JSONObject(input)
        val url = endpoint(data.optString("endpoint"))
        val model = data.optString("model").trim()
        val language = data.optString("language", "zh").trim()
        val supplied = data.optString("key").trim()
        require(model.isNotEmpty() && model.length <= 200 && !model.contains('\r') && !model.contains('\n')) { "请填写语音模型名称" }
        require(language.isEmpty() || language.matches(Regex("[a-z]{2,3}"))) { "语言格式不正确" }
        require(supplied.length <= 4096 && !supplied.contains('\r') && !supplied.contains('\n')) { "API Key 格式不正确" }
        checkedSecret(data, url) // Never reuse a stored key on a different host silently.
        val edit = prefs.edit().putString("endpoint", url).putString("model", model).putString("language", language)
        if (data.optBoolean("removeKey")) edit.remove("key") else if (supplied.isNotEmpty()) edit.putString("key", encrypt(supplied))
        require(edit.commit()) { "语音配置保存失败" }
        return config()
    }
    private fun checkedSecret(data: JSONObject, url: String): String {
        val supplied = data.optString("key").trim()
        require(supplied.length <= 4096 && !supplied.contains('\r') && !supplied.contains('\n')) { "API Key 格式不正确" }
        if (data.optBoolean("removeKey")) return ""
        if (supplied.isNotEmpty()) return supplied
        val saved = synchronized(this) { secret() }
        val previous = prefs.getString("endpoint", "").orEmpty()
        if (saved.isNotEmpty() && previous.isNotEmpty()) {
            val oldUri = URI(previous); val nextUri = URI(url)
            require(oldUri.host.equals(nextUri.host, true) && oldUri.port == nextUri.port) {
                "语音接口主机已更换，请重新填写 Key，或勾选删除已有 Key"
            }
        }
        return saved
    }
    fun cancel() { active?.disconnect() }
    private fun redact(value: String, secret: String): String = value.take(2000)
        .let { if (secret.isEmpty()) it else it.replace(secret, "[已隐藏]") }
        .replace(Regex("(?i)Bearer\\s+[^\\s\"<>]+"), "Bearer [已隐藏]")
        .replace(Regex("\\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]+)"), "[已隐藏]").take(300)

    /** Limits responses and never follows redirects with an authorization header. */
    private fun response(connection: HttpsURLConnection, secret: String): JSONObject {
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val bytes = stream?.use { input ->
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val count = input.read(buffer); if (count < 0) break
                require(output.size() + count <= 512_000) { "语音服务返回内容过大" }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: ByteArray(0)
        require(bytes.size <= 512_000) { "语音服务返回内容过大" }
        val text = String(bytes, Charsets.UTF_8)
        val parsed = runCatching { JSONObject(text) }.getOrNull()
        if (code !in 200..299) {
            val detail = parsed?.optJSONObject("error")?.optString("message")
                ?: parsed?.optString("message")?.takeIf { it.isNotBlank() }
                ?: "请检查接口、模型和密钥，确认该服务支持音频转写"
            error("HTTP $code：${redact(detail, secret)}")
        }
        if (parsed == null) error("服务没有返回 JSON，请使用支持返回 text 字段的转写接口")
        if (parsed.has("error")) error(redact(parsed.optJSONObject("error")?.optString("message") ?: "语音服务返回错误", secret))
        return parsed
    }
    private fun prepare(url: String, secret: String, method: String): HttpsURLConnection = openConnection(URL(url)).apply {
        connectTimeout = 30_000; readTimeout = 180_000; requestMethod = method; instanceFollowRedirects = false
        setRequestProperty("Accept", "application/json")
        if (secret.isNotEmpty()) setRequestProperty("Authorization", "Bearer $secret")
    }
    fun listModels(input: String): JSONObject {
        val data = JSONObject(input)
        val url = endpoint(data.optString("endpoint"))
        require(url.endsWith("/audio/transcriptions")) { "此自定义路径无法推断模型列表地址，可直接填写服务商提供的模型名" }
        val secret = checkedSecret(data, url)
        val connection = prepare(url.removeSuffix("/audio/transcriptions") + "/models", secret, "GET")
        try {
            val dataArray = response(connection, secret).optJSONArray("data") ?: error("服务没有返回模型列表，可直接填写模型名")
            val models = (0 until minOf(dataArray.length(), 2000)).mapNotNull { dataArray.optJSONObject(it)?.optString("id")?.trim()?.takeIf { id -> id.isNotEmpty() && id.length <= 200 } }.distinct()
            require(models.isNotEmpty()) { "模型列表为空，可直接填写语音模型名" }
            return JSONObject().put("models", JSONArray(models))
        } finally { connection.disconnect() }
    }
    fun transcribe(file: File, mime: String): JSONObject {
        require(file.isFile && file.length() in 1..24_000_000) { "请选择不超过24 MB的音频" }
        val (config, secret) = synchronized(this) { config() to secret() }
        val url = endpoint(config.getString("endpoint"))
        val model = config.getString("model")
        require(model.isNotBlank()) { "请先配置语音识别模型" }
        val boundary = "Youqi-${UUID.randomUUID()}"
        val ext = file.extension.lowercase().takeIf { it in setOf("m4a", "mp3", "wav", "ogg", "flac", "webm", "mp4", "mpeg", "mpga") } ?: "m4a"
        val contentType = mime.takeIf { it in setOf("audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/webm", "video/mp4", "video/webm") } ?: "application/octet-stream"
        fun field(name: String, value: String) = "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n"
        val prefix = buildString {
            append(field("model", model)); append(field("response_format", "json"))
            val language = config.optString("language"); if (language.isNotEmpty()) append(field("language", language))
            append("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.$ext\"\r\nContent-Type: $contentType\r\n\r\n")
        }.toByteArray(Charsets.UTF_8)
        val suffix = "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8)
        val connection = prepare(url, secret, "POST")
        active = connection
        try {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            connection.setFixedLengthStreamingMode(prefix.size + file.length() + suffix.size)
            connection.outputStream.use { output ->
                output.write(prefix); file.inputStream().use { it.copyTo(output) }; output.write(suffix)
            }
            val result = response(connection, secret)
            require(result.has("text") && result.opt("text") is String) { "服务未返回 text 文字字段，请检查转写接口的兼容格式" }
            val text = result.getString("text").trim()
            require(text.length <= 20_000) { "识别文字超过2万字，请截短音频后重试" }
            require(text.isNotEmpty()) { "没有识别到语音，可以重新录音或检查音量" }
            return JSONObject().put("text", text)
        } catch (error: Exception) {
            throw IllegalStateException(redact(error.message ?: "语音识别未完成，请重试", secret))
        } finally { if (active === connection) active = null; connection.disconnect() }
    }
}
