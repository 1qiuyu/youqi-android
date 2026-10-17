package org.fossify.calendar.youqi

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.URL
import java.security.cert.Certificate
import javax.net.ssl.HttpsURLConnection

/** All HTTP responses are fixtures. No credentials or notices leave the emulator. */
@RunWith(AndroidJUnit4::class)
class YouqiApiTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val prefs get() = context.getSharedPreferences("youqi-minimax-private", 0)
    private val secret = "TEST_ONLY_NOT_A_REAL_KEY"

    @Before fun prepare() { prefs.edit().clear().commit() }
    @After fun cleanup() { prefs.edit().clear().commit() }

    private class Response(url: URL, private val status: Int, private val body: String) : HttpsURLConnection(url) {
        val sent = ByteArrayOutputStream()
        var closed = false
        override fun connect() {}
        override fun disconnect() { closed = true }
        override fun usingProxy() = false
        override fun getCipherSuite() = "TEST"
        override fun getLocalCertificates(): Array<Certificate>? = null
        override fun getServerCertificates(): Array<Certificate> = emptyArray()
        override fun getResponseCode() = status
        override fun getInputStream() = ByteArrayInputStream(body.toByteArray())
        override fun getErrorStream() = ByteArrayInputStream(body.toByteArray())
        override fun getOutputStream() = sent
    }

    private fun draft(base: String = "https://example.test/custom/v1/") = JSONObject()
        .put("region", "custom").put("baseUrl", base).put("key", secret)

    @Test fun fetchModelsUsesCustomAddressWithoutSavingDraft() {
        lateinit var connection: Response
        val service = MiniMaxService(context) { url -> Response(url, 200,
            """{"data":[{"id":"vendor/model-a"},{"id":"MiniMax-M2.7"},{"id":"vendor/model-a"},{"other":"ignored"}]}""").also { connection = it } }
        val result = service.listModels(draft().toString())
        assertEquals("https://example.test/custom/v1/models", connection.url.toString())
        assertEquals("GET", connection.requestMethod)
        assertEquals("Bearer $secret", connection.getRequestProperty("Authorization"))
        assertFalse(connection.instanceFollowRedirects)
        assertEquals(0, connection.sent.size())
        assertTrue(connection.closed)
        assertEquals(2, result.getJSONArray("models").length())
        assertEquals("vendor/model-a", result.getJSONArray("models").getString(0))
        assertFalse(service.config().getBoolean("hasKey"))
    }

    @Test fun customSelectedModelAndEncryptedKeyAreUsedForChat() {
        lateinit var connection: Response
        val service = MiniMaxService(context) { url -> Response(url, 200,
            """{"choices":[{"message":{"content":"OK"}}]}""").also { connection = it } }
        service.saveConfig(draft("https://example.test/custom/v1/chat/completions/").put("model", "vendor/arbitrary-model").toString())
        assertEquals("https://example.test/custom/v1", service.config().getString("baseUrl"))
        assertNotEquals(secret, prefs.getString("key", ""))
        service.testConnection()
        assertEquals("https://example.test/custom/v1/chat/completions", connection.url.toString())
        assertEquals("POST", connection.requestMethod)
        assertEquals("vendor/arbitrary-model", JSONObject(connection.sent.toString("UTF-8")).getString("model"))
        assertTrue(service.config().getBoolean("tested"))
        service.saveConfig(draft("https://different.test/v1").put("model", "vendor/arbitrary-model").toString())
        assertFalse(service.config().getBoolean("tested"))
    }

    @Test fun detailedErrorsAreReportedAndKeyIsRedacted() {
        val service = MiniMaxService(context) { url -> Response(url, 400,
            JSONObject().put("error", JSONObject().put("code", "invalid_model").put("message", "model rejected; key=$secret")).toString()) }
        val error = runCatching { service.listModels(draft().toString()) }.exceptionOrNull()!!
        assertTrue(error.message!!.contains("HTTP 400"))
        assertTrue(error.message!!.contains("invalid_model"))
        assertFalse(error.message!!.contains(secret))
        val missing = MiniMaxService(context) { url -> Response(url, 404, "<html>Not found</html>") }
        assertTrue(runCatching { missing.listModels(draft().toString()) }.exceptionOrNull()!!.message!!.contains("不提供模型列表"))
        val apiError = MiniMaxService(context) { url -> Response(url, 200, """{"base_resp":{"status_code":2013,"status_msg":"invalid model"}}""") }
        assertTrue(runCatching { apiError.listModels(draft().toString()) }.exceptionOrNull()!!.message!!.contains("2013"))
    }

    @Test fun invalidUrlsAreRejectedBeforeSendingKeyAndEmptyListsFailClearly() {
        var requests = 0
        val service = MiniMaxService(context) { url -> requests++; Response(url, 200, """{"data":[]}""") }
        listOf("http://example.test/v1", "https://key@example.test/v1", "https://example.test/v1?key=x", "https://example.test/v1#secret").forEach { url ->
            assertTrue(runCatching { service.listModels(draft(url).toString()) }.isFailure)
        }
        assertEquals(0, requests)
        assertTrue(runCatching { service.listModels(draft().toString()) }.exceptionOrNull()!!.message!!.contains("空模型列表"))
    }

    @Test fun oldConfigKeepsModelKeyAndReceivesCorrectDefaultAddress() {
        val service = MiniMaxService(context)
        service.saveConfig(JSONObject().put("region", "io").put("model", "saved-model").put("key", secret).toString())
        prefs.edit().remove("baseUrl").commit() // Version 0.1.0 had no Base URL preference.
        assertEquals("https://api.minimax.io/v1", service.config().getString("baseUrl"))
        assertEquals("saved-model", service.config().getString("model"))
        assertTrue(service.config().getBoolean("hasKey"))
        lateinit var connection: Response
        val reused = MiniMaxService(context) { url -> Response(url, 200, """{"data":[{"id":"saved-model"}]}""").also { connection = it } }
        reused.listModels(JSONObject().put("region", "io").toString())
        assertEquals("Bearer $secret", connection.getRequestProperty("Authorization"))
        assertEquals("https://api.minimax.io/v1/models", connection.url.toString())
    }
}
