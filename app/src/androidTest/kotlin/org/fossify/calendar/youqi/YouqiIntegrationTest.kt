package org.fossify.calendar.youqi

import android.graphics.Bitmap
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.fossify.calendar.databases.EventsDatabase
import org.fossify.calendar.helpers.REMINDER_OFF
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class YouqiIntegrationTest {
    private lateinit var scenario: ActivityScenario<YouqiActivity>
    private lateinit var activity: YouqiActivity
    private lateinit var store: YouqiStore

    @Before fun prepare() {
        scenario = ActivityScenario.launch(YouqiActivity::class.java)
        scenario.onActivity { activity = it }
        store = YouqiStore(activity)
        store.save("[]")
        awaitUi("document.querySelector('.home-title') !== null")
        evaluate("document.querySelector('[data-tab=\"calendar\"]').click(); true")
        awaitUi("document.querySelector('.app-header') !== null")
        evaluate("window.YouqiApp.refreshData(); true")
        val root = InstrumentationRegistry.getInstrumentation().uiAutomation.rootInActiveWindow
        assertTrue("An inherited dialog must not cover Youqi", root == null || root.findAccessibilityNodeInfosByText("fake version").isEmpty())
    }

    @After fun cleanup() {
        store.save("[]")
        activity.getSharedPreferences("youqi-minimax-private", 0).edit().clear().commit()
        scenario.close()
    }

    private fun item(id: String, due: String, start: String? = null, repeat: Boolean = false) = JSONObject().apply {
        put("id", id); put("title", "测试事项-$id"); put("due", due)
        put("start", start ?: JSONObject.NULL); put("repeat", repeat); put("color", 3)
        put("location", "六教6A413"); put("source", "测试通知原文")
        put("completedDates", JSONArray()); put("skippedDates", JSONArray())
    }

    @Test fun storageRecurrenceImportAndBackupRoundTrip() {
        val weekly = item("weekly", "2026-10-21T23:59", repeat = true)
            .put("completedDates", JSONArray().put("2026-10-21"))
            .put("skippedDates", JSONArray().put("2026-10-28"))
        val meeting = item("meeting", "2026-10-22T21:00", "2026-10-22T19:20")
        store.save(JSONArray().put(weekly).put(meeting).toString())
        val first = JSONArray(store.occurrences("2026-10-19T00:00", "2026-10-25T23:59"))
        assertEquals(2, first.length())
        assertTrue(first.getJSONObject(0).getBoolean("done"))
        assertEquals("2026-10-21T23:59", first.getJSONObject(0).getString("due"))
        assertEquals(0, JSONArray(store.occurrences("2026-10-26T00:00", "2026-11-01T23:59")).length())
        val following = JSONArray(store.occurrences("2026-11-02T00:00", "2026-11-08T23:59"))
        assertEquals(1, following.length())
        assertFalse(following.getJSONObject(0).getBoolean("done"))
        assertEquals(3, following.getJSONObject(0).getInt("color"))

        val backup = store.backup()
        assertFalse(backup.contains("apiKey"))
        store.save("[]")
        store.restore(backup)
        assertEquals(2, JSONArray(store.load()).length())
        assertTrue(JSONArray(store.occurrences("2026-10-19T00:00", "2026-10-25T23:59")).getJSONObject(0).getBoolean("done"))

        try {
            store.save(JSONArray().put(weekly).put(item("invalid", "invalid")).toString())
            fail("Invalid date should not be saved")
        } catch (_: Exception) { }
        assertEquals(2, JSONArray(store.load()).length())

        val file = File(activity.cacheDir, "test-courses.ics")
        file.writeText("""
            BEGIN:VCALENDAR
            VERSION:2.0
            PRODID:-//Youqi Test//ZH
            BEGIN:VEVENT
            UID:youqi-integration-course
            DTSTART:20261019T100000
            DTEND:20261019T113500
            RRULE:FREQ=WEEKLY;UNTIL=20261228T235959
            SUMMARY:测试课程
            LOCATION:六教6A413
            END:VEVENT
            END:VCALENDAR
        """.trimIndent().replace("\n", "\r\n") + "\r\n")
        val imported = store.importIcs(file)
        assertEquals("IMPORT_OK", imported.getString("status"))
        assertEquals(1, imported.getInt("added"))
        assertEquals(3, JSONArray(store.load()).length())
        assertEquals(0, store.importIcs(file).getInt("added"))
        val native = EventsDatabase.getInstance(activity).EventsDao().getAllEvents().first { it.title == "测试课程" }
        assertEquals(REMINDER_OFF, native.reminder1Minutes)
        file.delete()
    }

    @Test fun credentialsAreEncryptedAndExcludedFromBackup() {
        val service = MiniMaxService(activity)
        val secret = "TEST_ONLY_DO_NOT_USE_AS_REAL_KEY"
        service.saveConfig(JSONObject().put("region", "cn").put("model", "test-model").put("key", secret).toString())
        assertTrue(service.config().getBoolean("hasKey"))
        assertFalse(service.config().toString().contains(secret))
        val stored = activity.getSharedPreferences("youqi-minimax-private", 0).getString("key", "")
        assertNotEquals(secret, stored)
        assertTrue(stored!!.contains(":"))
        assertFalse(store.backup().contains(secret))
        service.saveConfig(JSONObject().put("region", "cn").put("model", "test-model").put("removeKey", true).toString())
        assertFalse(service.config().getBoolean("hasKey"))
    }

    @Test fun realWebViewManualEntryAndIndependentCompletion() {
        evaluate("document.querySelector('[data-action=\"open-add\"]').click(); true")
        evaluate("document.querySelector('[data-input=\"manual\"]').click(); true")
        evaluate("document.getElementById('title-0').value='安卓测试作业'; document.getElementById('due-0').value='2026-10-23T23:59'; document.querySelector('[name=\"repeat-0\"]').checked=true; document.getElementById('previewForm').requestSubmit(); true")
        awaitUi("document.getElementById('overlay').hidden")
        val saved = JSONArray(store.load())
        assertEquals(1, saved.length())
        assertEquals("安卓测试作业", saved.getJSONObject(0).getString("title"))
        assertEquals("2026-10-23T23:59", saved.getJSONObject(0).getString("due"))
        assertTrue(saved.getJSONObject(0).getBoolean("repeat"))
        evaluate("document.querySelector('[data-tab=\"tasks\"]').click(); document.querySelector('[data-action=\"complete\"]').click(); true")
        assertEquals("2026-10-23", JSONArray(store.load()).getJSONObject(0).getJSONArray("completedDates").getString(0))
        val next = JSONArray(store.occurrences("2026-10-26T00:00", "2026-11-01T23:59"))
        assertEquals(1, next.length()); assertFalse(next.getJSONObject(0).getBoolean("done"))
        evaluate("document.querySelector('[data-tab=\"settings\"]').click(); document.querySelector('[data-action=\"api-info\"]').click(); true")
        awaitUi("document.getElementById('apiConfigForm') !== null")
        assertEquals("true", evaluate("document.getElementById('api-model').tagName === 'SELECT' && document.getElementById('api-model').disabled && document.getElementById('api-base-url').value === 'https://api.minimax.cn/v1'"))
        capture("api-config.png")
        evaluate("window.YouqiApp.handleBack(); document.querySelector('[data-action=\"load-sample\"]').click(); document.querySelector('[data-action=\"confirm-sample\"]').click(); document.querySelector('[data-tab=\"calendar\"]').click(); document.querySelector('[data-action=\"today\"]').click(); true")
        awaitUi("document.querySelectorAll('.calendar-event').length >= 10")
        capture("calendar.png")
    }

    private fun webView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) webView(view.getChildAt(i))?.let { return it }
        return null
    }

    private fun evaluate(script: String): String {
        val result = AtomicReference<String>()
        val latch = CountDownLatch(1)
        scenario.onActivity {
            webView(it.window.decorView)!!.evaluateJavascript(script) { value -> result.set(value); latch.countDown() }
        }
        assertTrue("WebView script did not finish", latch.await(15, TimeUnit.SECONDS))
        return result.get()
    }

    private fun awaitUi(condition: String) {
        val deadline = System.currentTimeMillis() + 15_000
        while (System.currentTimeMillis() < deadline) {
            if (evaluate(condition) == "true") return
            Thread.sleep(100)
        }
        fail("UI condition not reached: $condition")
    }

    private fun capture(name: String) {
        awaitUi("!document.getElementById('toast').classList.contains('visible')")
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        Thread.sleep(300)
        val folder = File(activity.filesDir, "youqi-qa").apply { mkdirs() }
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(folder, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        val descriptor = InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("screencap -p /data/local/tmp/youqi-$name")
        android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptor).use { it.readBytes() }
    }
}
