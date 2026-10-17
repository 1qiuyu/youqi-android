package org.fossify.calendar.youqi

import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.RandomAccessFile
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.cert.Certificate
import javax.net.ssl.HttpsURLConnection

/** Runs only on the disposable emulator; all HTTPS responses are local fixtures. */
@RunWith(AndroidJUnit4::class)
class YouqiSpeechTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val prefs get() = context.getSharedPreferences("youqi-speech-private", 0)
    private val fixtureKey = "TEST_ONLY_SPEECH_KEY"
    private val files = mutableListOf<File>()
    @Before fun prepare() { assumeTrue(Build.MODEL.contains("sdk", ignoreCase = true) || Build.FINGERPRINT.contains("generic")); prefs.edit().clear().commit() }
    @After fun cleanup() { if (Build.MODEL.contains("sdk", ignoreCase = true) || Build.FINGERPRINT.contains("generic")) prefs.edit().clear().commit(); files.forEach { it.delete() } }
    private class Response(url: URL, private val status: Int = 200, private val body: String = """{"text":"明天晚上七点开会"}""") : HttpsURLConnection(url) {
        val sent = ByteArrayOutputStream(); var closed = false
        override fun connect() {} ; override fun disconnect() { closed = true }; override fun usingProxy() = false
        override fun getCipherSuite() = "TEST"; override fun getLocalCertificates(): Array<Certificate>? = null
        override fun getServerCertificates(): Array<Certificate> = emptyArray()
        override fun getResponseCode() = status
        override fun getInputStream() = ByteArrayInputStream(body.toByteArray(Charsets.UTF_8))
        override fun getErrorStream() = ByteArrayInputStream(body.toByteArray(Charsets.UTF_8))
        override fun getOutputStream() = sent
    }
    private fun draft(endpoint: String = "https://speech.test/custom/v1/audio/transcriptions") = JSONObject()
        .put("endpoint", endpoint).put("model", "vendor/custom-asr").put("key", fixtureKey).put("language", "zh")
    private fun wav(): File {
        val pcm = ByteArray(32_000)
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray()).putInt(36 + pcm.size).put("WAVEfmt ".toByteArray()).putInt(16)
            .putShort(1.toShort()).putShort(1.toShort()).putInt(16_000).putInt(32_000).putShort(2.toShort()).putShort(16.toShort())
            .put("data".toByteArray()).putInt(pcm.size)
        return File.createTempFile("speech-fixture-", ".wav", context.cacheDir).also { it.writeBytes(header.array() + pcm); files.add(it) }
    }
    @Test fun multipartUsesSeparateEncryptedCredentialsAndReturnsText() {
        lateinit var connection: Response
        val chatBefore = MiniMaxService(context).config().toString()
        val service = SpeechService(context) { url -> Response(url).also { connection = it } }
        service.saveConfig(draft().toString())
        val clip = wav(); val result = service.transcribe(clip, "audio/wav")
        assertEquals("明天晚上七点开会", result.getString("text"))
        assertEquals("https://speech.test/custom/v1/audio/transcriptions", connection.url.toString())
        assertEquals("POST", connection.requestMethod); assertEquals("Bearer $fixtureKey", connection.getRequestProperty("Authorization"))
        assertFalse(connection.instanceFollowRedirects); assertTrue(connection.closed)
        val body = connection.sent.toString("UTF-8")
        assertTrue(body.contains("name=\"model\"\r\n\r\nvendor/custom-asr"))
        assertTrue(body.contains("name=\"language\"\r\n\r\nzh"))
        assertTrue(body.contains("filename=\"audio.wav\"")); assertTrue(body.contains("RIFF"))
        assertFalse(body.contains(clip.name)); assertFalse(body.contains(fixtureKey))
        assertNotEquals(fixtureKey, prefs.getString("key", ""))
        assertTrue(service.config().getBoolean("hasKey")); assertFalse(service.config().toString().contains(fixtureKey))
        assertEquals(chatBefore, MiniMaxService(context).config().toString())
        assertFalse(YouqiStore(context).backup().contains(fixtureKey))
    }
    @Test fun sameHostDraftModelsWorkWithoutSavingAndSavedKeyCanBeRetainedOrRemoved() {
        lateinit var connection: Response
        val service = SpeechService(context) { url -> Response(url, 200, """{"data":[{"id":"asr-a"},{"id":"asr-a"},{"id":"vendor/custom"}]}""").also { connection = it } }
        val listed = service.listModels(draft().toString())
        assertEquals(2, listed.getJSONArray("models").length()); assertFalse(service.config().getBoolean("hasKey"))
        assertEquals("https://speech.test/custom/v1/models", connection.url.toString())
        service.saveConfig(draft().toString())
        service.saveConfig(draft().put("key", "").put("language", "").toString())
        assertTrue(service.config().getBoolean("hasKey"))
        service.listModels(draft().put("key", "").toString()); assertEquals("Bearer $fixtureKey", connection.getRequestProperty("Authorization"))
        service.saveConfig(draft().put("key", "").put("removeKey", true).toString()); assertFalse(service.config().getBoolean("hasKey"))
    }
    @Test fun invalidUrlsAndChangedHostsNeverSendSavedKeys() {
        var requests = 0
        val service = SpeechService(context) { url -> requests++; Response(url) }
        for (url in listOf("http://speech.test/api", "https://key@speech.test/api", "https://speech.test/api?key=x", "https://speech.test/api#x")) {
            assertTrue(runCatching { service.saveConfig(draft(url).toString()) }.isFailure)
        }
        service.saveConfig(draft().toString())
        val changed = draft("https://another.test/v1/audio/transcriptions").put("key", "")
        assertTrue(runCatching { service.listModels(changed.toString()) }.isFailure)
        assertTrue(runCatching { service.saveConfig(changed.toString()) }.isFailure)
        assertEquals(0, requests)
        service.saveConfig(changed.put("removeKey", true).toString()); assertFalse(service.config().getBoolean("hasKey"))
    }
    @Test fun errorsAreRedactedAndAudioStaysAvailableForRetry() {
        val clip = wav()
        val service = SpeechService(context) { url -> Response(url, 401, JSONObject().put("error", JSONObject().put("message", "bad key $fixtureKey Bearer leaked-test-token")).toString()) }
        service.saveConfig(draft().toString())
        val message = runCatching { service.transcribe(clip, "audio/wav") }.exceptionOrNull()!!.message!!
        assertTrue(message.contains("HTTP 401")); assertFalse(message.contains(fixtureKey)); assertFalse(message.contains("leaked-test-token")); assertTrue(clip.exists())
    }
    @Test fun emptyOrIncompatibleResponsesAndLargeAudioAreRejected() {
        val clip = wav()
        for (body in listOf("{}", "{\"text\":\"\"}", "<html>not JSON</html>")) {
            val service = SpeechService(context) { url -> Response(url, 200, body) }
            service.saveConfig(draft().toString()); assertTrue(runCatching { service.transcribe(clip, "audio/wav") }.isFailure)
        }
        var requests = 0; val service = SpeechService(context) { url -> requests++; Response(url) }; service.saveConfig(draft().toString())
        RandomAccessFile(clip, "rw").use { it.setLength(24_000_001) }
        assertTrue(runCatching { service.transcribe(clip, "audio/wav") }.isFailure); assertEquals(0, requests)
    }
    @Test fun importedAudioHasRealMetadataAndInvalidReplacementDoesNotLosePreviousClip() {
        val source = wav()
        val audio = SpeechAudio(context)
        try {
            val clip = source.inputStream().use { audio.importStream(it, "已选录音.wav", "audio/wav") }
            assertTrue(clip.durationMs >= 900); assertTrue(clip.file.exists())
            assertEquals("已选录音.wav", clip.json().getString("name")); assertFalse(clip.json().has("file"))
            assertEquals(clip.token, audio.clip(clip.token).token)
            assertTrue(runCatching { audio.clip("../../not-a-token") }.isFailure)
            assertTrue(runCatching { audio.importStream(ByteArrayInputStream("not audio".toByteArray()), "invalid.wav", "audio/wav") }.isFailure)
            assertEquals(clip.token, audio.clip(clip.token).token); assertTrue(clip.file.exists())
            audio.discard(); assertFalse(clip.file.exists()); assertTrue(runCatching { audio.clip(clip.token) }.isFailure)
        } finally { audio.close() }
    }

}
