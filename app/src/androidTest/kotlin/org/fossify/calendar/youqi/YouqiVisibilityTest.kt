package org.fossify.calendar.youqi

import android.content.Context
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class YouqiVisibilityTest {
    private lateinit var store: YouqiStore
    @Before fun prepare() {
        // These database tests are restricted to a disposable emulator.
        assumeTrue(Build.MODEL.contains("sdk", ignoreCase = true) || Build.FINGERPRINT.contains("generic"))
        store = YouqiStore(ApplicationProvider.getApplicationContext<Context>())
        store.save("[]")
    }
    @After fun cleanup() { if (::store.isInitialized) store.save("[]") }
    private fun item(id: String) = JSONObject().apply {
        put("id", id); put("title", "visibility test")
        put("due", "2026-10-22T16:00"); put("start", "2026-10-22T15:00")
        put("repeat", JSONObject.NULL); put("allDay", false); put("color", 1)
        put("completedDates", JSONArray()); put("skippedDates", JSONArray())
    }
    @Test fun visibilitySurvivesSaveOccurrencesAndBackup() {
        val rows = JSONArray().put(item("home-only").put("showOnHome", true).put("showInTasks", false))
            .put(item("tasks-only").put("showOnHome", false).put("showInTasks", true))
            .put(item("legacy"))
        store.save(rows.toString())
        fun verify(content: String) {
            val all = JSONArray(content)
            val byId = (0 until all.length()).associate { all.getJSONObject(it).getString("id") to all.getJSONObject(it) }
            assertTrue(byId.getValue("home-only").getBoolean("showOnHome"))
            assertFalse(byId.getValue("home-only").getBoolean("showInTasks"))
            assertFalse(byId.getValue("tasks-only").getBoolean("showOnHome"))
            assertTrue(byId.getValue("tasks-only").getBoolean("showInTasks"))
            assertTrue(byId.getValue("legacy").isNull("showOnHome"))
            assertTrue(byId.getValue("legacy").isNull("showInTasks"))
        }
        verify(store.load())
        verify(store.occurrences("2026-10-19T00:00", "2026-10-25T23:59"))
        val backup = store.backup()
        store.save("[]"); store.restore(backup); verify(store.load())
        // Saving another field must not discard visibility, including explicit false.
        val updated = JSONArray(store.load())
        updated.getJSONObject(0).put("title", "renamed")
        store.save(updated.toString()); verify(store.load())
    }
    @Test fun independentCourseSessionsShareColorAcrossWeeks() {
        val first = item("course-a").put("title", "电工技术与电子技术（1）").put("color", 2)
        val second = item("course-b").put("title", "电工技术与电子技术(1)").put("color", 8)
            .put("start", "2026-10-29T13:30").put("due", "2026-10-29T15:05")
        val task = item("separate-task").put("title", "电工技术与电子技术(1)").put("start", JSONObject.NULL).put("color", 8)
        store.save(JSONArray().put(first).put(second).put(task).toString())
        val rows = JSONArray(store.load())
        val byId = (0 until rows.length()).associate { rows.getJSONObject(it).getString("id") to rows.getJSONObject(it) }
        assertEquals(byId.getValue("course-a").getInt("color"), byId.getValue("course-b").getInt("color"))
        assertEquals(8, byId.getValue("separate-task").getInt("color"))
        val expanded = JSONArray(store.occurrences("2026-10-19T00:00", "2026-11-01T23:59"))
        val courses = (0 until expanded.length()).map { expanded.getJSONObject(it) }.filter { !it.isNull("start") }
        assertEquals(2, courses.size)
        assertEquals(1, courses.map { it.getInt("color") }.distinct().size)
    }

}
