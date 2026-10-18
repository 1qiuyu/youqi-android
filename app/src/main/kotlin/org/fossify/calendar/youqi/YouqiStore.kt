package org.fossify.calendar.youqi

import android.content.Context
import android.graphics.Color
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import org.fossify.calendar.databases.EventsDatabase
import org.fossify.calendar.extensions.eventsHelper
import org.fossify.calendar.helpers.DAY
import org.fossify.calendar.helpers.FLAG_ALL_DAY
import org.fossify.calendar.helpers.FLAG_TASK_COMPLETED
import org.fossify.calendar.helpers.Formatter
import org.fossify.calendar.helpers.IcsImporter
import org.fossify.calendar.helpers.LOCAL_CALENDAR_ID
import org.fossify.calendar.helpers.MONTH
import org.fossify.calendar.helpers.REMINDER_OFF
import org.fossify.calendar.helpers.REPEAT_LAST_DAY
import org.fossify.calendar.helpers.REPEAT_ORDER_WEEKDAY
import org.fossify.calendar.helpers.REPEAT_ORDER_WEEKDAY_USE_LAST
import org.fossify.calendar.helpers.REPEAT_SAME_DAY
import org.fossify.calendar.helpers.TYPE_EVENT
import org.fossify.calendar.helpers.TYPE_TASK
import org.fossify.calendar.helpers.WEEK
import org.fossify.calendar.helpers.YEAR
import org.fossify.calendar.models.Event
import org.fossify.calendar.models.Task
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.Normalizer
import java.util.Locale
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.absoluteValue

/**
 * Bridges the 有期 interface to Fossify's Room database, Event/Task models and recurrence engine.
 *
 * The interface speaks a structured repeat object; this class translates it into the numeric
 * `repeatInterval` / `repeatRule` / `repeatLimit` triple the upstream engine expands.
 */
class YouqiStore(private val activity: Context) {
    private val database get() = EventsDatabase.getInstance(activity)
    private val dao get() = database.EventsDao()
    private val tasks get() = database.TasksDao()
    private val gson = Gson()
    private val zone get() = ZoneId.systemDefault()
    private val format = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
    private val colors = listOf("#8C75C4", "#69A9CE", "#83AF98", "#D9AA6C", "#CE8BA5", "#74AFB0", "#9791C9", "#CC8D92", "#A6B474", "#7EA5BE", "#CF9A7B", "#BB94C1", "#8EAC9A", "#C4AC6C")
    private val localSource = "youqi-local-v1"

    private fun iso(ts: Long) = Instant.ofEpochSecond(ts).atZone(zone).format(format)
    private fun seconds(value: String): Long = LocalDateTime.parse(value, format).atZone(zone).toEpochSecond()
    private fun date(ts: Long) = Instant.ofEpochSecond(ts).atZone(zone).toLocalDate().toString()

    private fun metadata(event: Event): JSONObject? = runCatching {
        if (event.source != localSource) return@runCatching null
        val objectValue = JSONObject(event.description)
        if (objectValue.optInt("youqiSchema") == 1) objectValue.getJSONObject("data") else null
    }.getOrNull()

    /* ------------------------------------------------------------------ 重复规则映射 */

    /** Joda day-of-week (Monday=1 .. Sunday=7) to JavaScript getDay() (Sunday=0 .. Saturday=6). */
    private fun toJsDay(jodaDay: Int) = if (jodaDay == 7) 0 else jodaDay

    /** Bit used by the upstream weekly rule for a JavaScript weekday. */
    private fun weekBit(jsDay: Int) = if (jsDay == 0) 1 shl 6 else 1 shl (jsDay - 1)

    /**
     * Anchors the series on a date that actually matches the requested rule, so the first
     * occurrence lands where the user expects. The upstream engine derives "Nth weekday"
     * from the event's own start date, so an unanchored date would silently drift.
     */
    private fun anchorDateTime(requested: LocalDateTime, repeat: JSONObject?): LocalDateTime {
        if (repeat == null) return requested
        val freq = repeat.optString("freq", "weekly")
        val interval = repeat.optInt("interval", 1).coerceAtLeast(1)
        return when {
            freq == "weekly" -> {
                val days = weekdaysOf(repeat).ifEmpty { listOf(requested.dayOfWeek.value % 7) }
                var candidate = requested
                // Walk forward at most a week to the first requested weekday.
                for (step in 0..7) {
                    val probe = requested.plusDays(step.toLong())
                    if (probe.dayOfWeek.value % 7 in days) { candidate = probe; break }
                }
                candidate
            }
            freq == "monthly" && interval % 1 == 0 && repeat.optString("monthlyMode", "date") == "last" ->
                requested.withDayOfMonth(YearMonth.from(requested).lengthOfMonth())
            freq == "monthly" && repeat.optString("monthlyMode", "date") == "weekday" -> {
                val nth = repeat.optInt("nth", 1).coerceIn(1, 5)
                val weekday = repeat.optInt("weekday", requested.dayOfWeek.value % 7).coerceIn(0, 6)
                nthWeekdayOfMonth(requested, nth, weekday)
            }
            else -> requested
        }
    }

    /** The Nth given weekday of the month containing [from]; rolls to the next month if it already passed. */
    private fun nthWeekdayOfMonth(from: LocalDateTime, nth: Int, weekday: Int): LocalDateTime {
        fun resolve(month: YearMonth): LocalDate? {
            val first = month.atDay(1)
            val offset = (weekday - first.dayOfWeek.value % 7 + 7) % 7
            val day = 1 + offset + (nth - 1) * 7
            return if (day <= month.lengthOfMonth()) month.atDay(day) else null
        }
        val sameMonth = resolve(YearMonth.from(from))
        if (sameMonth != null && !sameMonth.isBefore(from.toLocalDate())) return sameMonth.atTime(from.toLocalTime())
        val next = resolve(YearMonth.from(from).plusMonths(1)) ?: from.toLocalDate()
        return next.atTime(from.toLocalTime())
    }

    private fun JSONArray?.orZero() = this?.length() ?: 0

    /** Reads the structured repeat's weekday list, dropping anything outside Sunday=0..Saturday=6. */
    private fun weekdaysOf(repeat: JSONObject): List<Int> {
        val array = repeat.optJSONArray("weekdays") ?: return emptyList()
        return (0 until array.length()).mapNotNull { index ->
            array.optInt(index, -1).takeIf { it in 0..6 }
        }.distinct()
    }

    /** Builds the three numeric fields the upstream recurrence engine reads. */
    private fun nativeRepeat(repeat: JSONObject?, anchorTS: Long, allDay: Boolean): Triple<Int, Int, Long> {
        if (repeat == null || repeat.optString("freq", "none") == "none") return Triple(0, 0, 0L)
        val interval = repeat.optInt("interval", 1).coerceIn(1, 99)
        val anchor = Instant.ofEpochSecond(anchorTS).atZone(zone)
        return when (repeat.optString("freq", "weekly")) {
            "daily" -> {
                // The engine dispatches on the numeric interval, so a daily step that happens to
                // be a whole number of weeks is re-read as a weekly rule. Weekly rules additionally
                // require a weekday bitmask, otherwise the event never matches and disappears.
                if (interval % 7 == 0) Triple(DAY * interval, weekBit(toJsDay(anchor.dayOfWeek.value)), 0L)
                else Triple(DAY * interval, 0, 0L)
            }

            "weekly" -> {
                val days = weekdaysOf(repeat).ifEmpty { listOf(toJsDay(anchor.dayOfWeek.value)) }
                val rule = days.fold(0) { acc, day -> acc or weekBit(day) }
                Triple(WEEK * interval, rule, 0L)
            }

            "monthly" -> {
                val rule = when (repeat.optString("monthlyMode", "date")) {
                    "last" -> REPEAT_LAST_DAY
                    "weekday" -> REPEAT_ORDER_WEEKDAY
                    else -> REPEAT_SAME_DAY
                }
                Triple(MONTH * interval, rule, 0L)
            }

            "yearly" -> Triple(YEAR * interval, REPEAT_SAME_DAY, 0L)

            else -> Triple(0, 0, 0L)
        }
    }

    /** Last moment of the end date, which is what `getEventsRepeatingTillDateOrForever` compares against. */
    private fun repeatLimitOf(until: String?): Long {
        if (until == null || !until.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) return 0L
        return runCatching {
            LocalDate.parse(until).plusDays(1).atStartOfDay(zone).toEpochSecond() - 1
        }.getOrDefault(0L)
    }

    /** Reverses the numeric fields into the interface's structured repeat, for imported events. */
    private fun describeRepeat(event: Event): JSONObject? {
        val interval = event.repeatInterval
        if (interval == 0) return null
        val dateTime = Formatter.getDateTimeFromTS(event.startTS)
        return JSONObject().apply {
            when {
                interval % YEAR == 0 -> {
                    put("freq", "yearly"); put("interval", interval / YEAR)
                }
                interval % MONTH == 0 -> {
                    put("freq", "monthly")
                    put("interval", interval / MONTH)
                    when (event.repeatRule) {
                        REPEAT_LAST_DAY -> put("monthlyMode", "last")
                        REPEAT_ORDER_WEEKDAY, REPEAT_ORDER_WEEKDAY_USE_LAST -> {
                            put("monthlyMode", "weekday")
                            put("nth", (dateTime.dayOfMonth - 1) / 7 + 1)
                            put("weekday", toJsDay(dateTime.dayOfWeek))
                        }
                        else -> put("monthlyMode", "date")
                    }
                }
                interval % WEEK == 0 -> {
                    put("freq", "weekly")
                    put("interval", interval / WEEK)
                    val days = (1..7).filter { event.repeatRule and (1 shl (it - 1)) != 0 }.map { toJsDay(it) }
                    put("weekdays", JSONArray(if (days.isEmpty()) listOf(toJsDay(dateTime.dayOfWeek)) else days))
                }
                interval % DAY == 0 -> {
                    put("freq", "daily"); put("interval", interval / DAY)
                }
                else -> {
                    put("freq", "daily"); put("interval", 1)
                }
            }
            put("monthlyMode", optString("monthlyMode", "date"))
            put("nth", optInt("nth", 1))
            put("weekday", optInt("weekday", toJsDay(dateTime.dayOfWeek)))
            if (optJSONArray("weekdays") == null) put("weekdays", JSONArray())
        }
    }

    /* ---------------------------------------------------------------------- 读 */

    private fun courseKey(title: String) = Normalizer.normalize(title, Normalizer.Form.NFKC)
        .replace(Regex("\\s+"), "").lowercase(Locale.ROOT)

    private fun courseColors(events: Collection<Event>): Map<String, Int> = events
        .filter { it.type != TYPE_TASK && it.flags and FLAG_ALL_DAY == 0 }
        .groupBy { courseKey(it.title) }
        .mapValues { (key, rows) ->
            rows.sortedBy { it.id }.firstNotNullOfOrNull {
                metadata(it)?.optInt("color", -1)?.takeIf { color -> color in colors.indices }
            } ?: (key.hashCode().toLong().absoluteValue % colors.size).toInt()
        }

    private fun uiEvent(event: Event, original: Event = event, coursePalette: Map<String, Int> = emptyMap()): JSONObject {
        val meta = metadata(original)
        val allDay = event.flags and FLAG_ALL_DAY != 0
        val due = when {
            event.type == TYPE_TASK -> event.startTS
            allDay -> Instant.ofEpochSecond(event.endTS).atZone(zone).toLocalDate().atTime(23, 59).atZone(zone).toEpochSecond()
            else -> event.endTS
        }
        val key = date(due)
        val completed = meta?.optJSONArray("completedDates") ?: JSONArray()
        val skipped = meta?.optJSONArray("skippedDates") ?: JSONArray()
        val courseColor = if (event.type != TYPE_TASK && !allDay) coursePalette[courseKey(original.title)] else null
        val colorIndex = courseColor ?: meta?.optInt("color", -1)?.takeIf { it in colors.indices }
            ?: ((original.importId.ifEmpty { original.id.toString() }.hashCode().toLong().absoluteValue % colors.size).toInt())
        val id = meta?.optString("id")?.takeIf { it.isNotBlank() } ?: "native-${original.id}"
        val source = meta?.optString("source") ?: original.description.ifBlank { "课表文件导入" }

        val structured = meta?.optJSONObject("repeat")
        val described = describeRepeat(original)
        val repeat = structured ?: described
        val imported = structured == null && described != null
        val until = meta?.optString("until")?.takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) }
            ?: if (original.repeatLimit > 0) date(original.repeatLimit) else null
        val done = (0 until completed.length()).any { completed.optString(it) == key } ||
            (event.type == TYPE_TASK && event.flags and FLAG_TASK_COMPLETED != 0)

        return JSONObject().apply {
            put("id", id)
            put("nativeId", original.id)
            put("title", event.title)
            put("due", iso(due))
            put("start", if (event.type == TYPE_TASK || allDay) JSONObject.NULL else iso(event.startTS))
            put("allDay", allDay)
            put("color", colorIndex)
            put("location", event.location)
            put("note", meta?.optString("note", "") ?: "")
            put("source", source)
            put("repeat", repeat ?: JSONObject.NULL)
            // Null keeps existing records on automatic visibility; booleans are user choices.
            put("showOnHome", (meta?.opt("showOnHome") as? Boolean) ?: JSONObject.NULL)
            put("showInTasks", (meta?.opt("showInTasks") as? Boolean) ?: JSONObject.NULL)
            // Urgent is UI metadata so it survives Room round-trips without changing
            // Fossify's Event schema. The web UI uses it only for local prioritization.
            put("urgent", meta?.optBoolean("urgent", false) ?: false)
            // Events imported from an ICS file may carry rules this interface cannot express.
            // Marking them lets a re-save restore the original numeric fields untouched.
            put("nativeRepeat", imported)
            if (imported) {
                put("nativeRepeatInterval", original.repeatInterval)
                put("nativeRepeatRule", original.repeatRule)
                put("nativeRepeatLimit", original.repeatLimit)
            }
            put("until", until ?: JSONObject.NULL)
            put("completedDates", completed)
            put("skippedDates", skipped)
            put("occurrenceDate", key)
            put("done", done)
        }
    }

    @Synchronized
    fun load(): String {
        val events = dao.getAllEvents()
        val palette = courseColors(events)
        return JSONArray().apply { events.forEach { put(uiEvent(it, it, palette)) } }.toString()
    }

    @Synchronized
    fun occurrences(from: String, to: String): String {
        val start = seconds(from)
        val end = seconds(to)
        require(end >= start && end - start <= 93L * 86400) { "查询日期范围过大" }
        val originals = dao.getAllEvents().associateBy { it.id }
        val palette = courseColors(originals.values)
        val results = JSONArray()
        activity.eventsHelper.getEventsSync(start, end, applyTypeFilter = false) { events ->
            events.distinctBy { "${it.id}@${it.startTS}" }
                .sortedBy { if (it.type == TYPE_TASK) it.startTS else it.endTS }
                .forEach { event ->
                    val original = originals[event.id] ?: event
                    val ui = uiEvent(event, original, palette)
                    val skip = ui.getJSONArray("skippedDates")
                    val skipped = (0 until skip.length()).any { skip.optString(it) == ui.getString("occurrenceDate") }
                    if (!skipped) results.put(ui)
                }
        }
        return results.toString()
    }

    /* ---------------------------------------------------------------------- 写 */

    @Synchronized
    fun save(content: String) {
        require(content.length <= 8_000_000) { "日程数据过大" }
        val array = JSONArray(content)
        require(array.length() <= 5000) { "日程数量超过上限" }
        val old = dao.getAllEvents()
        val byUiId = old.associateBy { metadata(it)?.optString("id") ?: "native-${it.id}" }
        val seen = HashSet<String>()

        // Validate the whole batch before opening the transaction.
        for (i in 0 until array.length()) {
            val item = array.getJSONObject(i)
            val id = item.getString("id")
            require(id.matches(Regex("[\\w-]{1,150}")) && seen.add(id)) { "日程标识无效或重复" }
            require(item.optString("title").isNotBlank() && item.getString("title").length <= 240) { "请填写有效的事项名称" }
            val due = seconds(item.getString("due"))
            require(due in 1..7_258_118_400L) { "日程日期超出范围" }
            val start = item.optString("start").takeUnless { it.isBlank() || it == "null" }
            require(start == null || seconds(start) < due) { "开始时间必须早于截止时间" }
            require(item.optString("source").length <= 40_000) { "原文过长" }
        }

        database.runInTransaction {
            val kept = HashSet<Long>()
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                val uiId = item.getString("id")
                val existing = byUiId[uiId]
                val event = existing?.copy() ?: Event(id = null)

                val allDay = item.optBoolean("allDay")
                val startRaw = item.optString("start").takeUnless { it.isBlank() || it == "null" }
                val dueTS = seconds(item.getString("due"))
                val dueDate = Instant.ofEpochSecond(dueTS).atZone(zone).toLocalDate()
                val dueDay = dueDate.toString()

                event.title = item.getString("title").trim()
                event.location = item.optString("location").take(500)
                event.calendarId = LOCAL_CALENDAR_ID
                event.source = localSource
                event.reminder1Minutes = REMINDER_OFF
                event.reminder2Minutes = REMINDER_OFF
                event.reminder3Minutes = REMINDER_OFF
                event.color = Color.parseColor(colors[item.optInt("color").coerceIn(colors.indices)])
                event.type = if (startRaw == null && !allDay) TYPE_TASK else TYPE_EVENT
                event.importId = existing?.importId?.ifBlank { null } ?: "youqi-$uiId"

                if (allDay) {
                    event.flags = event.flags or FLAG_ALL_DAY
                    event.flags = event.flags and FLAG_TASK_COMPLETED.inv()
                    event.startTS = Formatter.getDayStartTS(dueDay.replace("-", ""))
                    event.endTS = Formatter.getDayEndTS(dueDay.replace("-", ""))
                } else {
                    event.flags = event.flags and FLAG_ALL_DAY.inv() and FLAG_TASK_COMPLETED.inv()
                    event.startTS = startRaw?.let(::seconds) ?: dueTS
                    event.endTS = dueTS
                }

                // Repeat: honour the interface's structured rule, but leave imported complex
                // rules alone when the user has not touched them.
                val repeat = item.optJSONObject("repeat")
                val keepImported = item.optBoolean("nativeRepeat") && existing != null &&
                    existing.repeatInterval != 0 && repeat != null
                if (keepImported) {
                    event.repeatInterval = existing!!.repeatInterval
                    event.repeatRule = existing.repeatRule
                    event.repeatLimit = existing.repeatLimit
                } else if (repeat == null || repeat.optString("freq") == "none") {
                    event.repeatInterval = 0
                    event.repeatRule = 0
                    event.repeatLimit = 0
                } else {
                    val anchor = anchorDateTime(
                        Instant.ofEpochSecond(event.startTS).atZone(zone).toLocalDateTime(),
                        repeat
                    )
                    if (!allDay) {
                        val shifted = anchor.atZone(zone).toEpochSecond()
                        val duration = event.endTS - event.startTS
                        event.startTS = shifted
                        event.endTS = shifted + duration
                    }
                    val (interval, rule, limit) = nativeRepeat(repeat, event.startTS, allDay)
                    event.repeatInterval = interval
                    event.repeatRule = rule
                    event.repeatLimit = limit.takeIf { it != 0L } ?: repeatLimitOf(item.optString("until").takeUnless { it == "null" })
                }

                // Skipped occurrences become day-code exceptions on the series.
                val skipped = item.optJSONArray("skippedDates") ?: JSONArray()
                val time = Instant.ofEpochSecond(event.startTS).atZone(zone).toLocalTime()
                event.repetitionExceptions = (0 until skipped.length()).mapNotNull { index ->
                    runCatching {
                        Formatter.getDayCodeFromTS(LocalDate.parse(skipped.getString(index)).atTime(time).atZone(zone).toEpochSecond())
                    }.getOrNull()
                }

                val clean = JSONObject(item.toString()).apply {
                    remove("done"); remove("occurrenceDate"); remove("nativeId")
                    remove("nativeRepeatInterval"); remove("nativeRepeatRule"); remove("nativeRepeatLimit")
                }
                event.description = JSONObject().put("youqiSchema", 1).put("data", clean).toString()
                event.lastUpdated = Instant.now().epochSecond

                val id = dao.insertOrUpdate(event)
                kept.add(id)
                tasks.deleteTaskFutureOccurrences(id, 0)

                val completed = item.optJSONArray("completedDates") ?: JSONArray()
                for (j in 0 until completed.length()) {
                    runCatching {
                        val completionTime = LocalDate.parse(completed.getString(j)).atTime(time).atZone(zone).toEpochSecond()
                        tasks.insertOrUpdate(Task(id = null, task_id = id, startTS = completionTime, flags = FLAG_TASK_COMPLETED))
                    }
                }
            }
            val removed = old.mapNotNull { it.id }.filterNot { it in kept }
            if (removed.isNotEmpty()) dao.deleteEvents(removed)
        }
    }

    /* ------------------------------------------------------------- 导入与备份 */

    @Synchronized
    fun importIcs(file: File): JSONObject {
        val before = dao.getAllEvents().size
        val status = IcsImporter(activity).importEvents(
            file.absolutePath, LOCAL_CALENDAR_ID, 0, true,
            arrayListOf(REMINDER_OFF, REMINDER_OFF, REMINDER_OFF), false
        )
        return JSONObject()
            .put("status", status.name)
            .put("added", (dao.getAllEvents().size - before).coerceAtLeast(0))
            .put("events", JSONArray(load()))
    }

    @Synchronized
    fun backup(): String = JSONObject().apply {
        put("format", "youqi-android")
        put("version", 2)
        put("exportedAt", Instant.now().toString())
        put("timezone", zone.id)
        put("events", JSONArray(load()))
        put("fossifyEvents", JSONArray(gson.toJson(dao.getAllEvents())))
        put("taskInstances", JSONArray(gson.toJson(tasks.getAllInstances())))
        // API credentials and appearance settings are deliberately excluded.
    }.toString(2)

    fun inspectBackup(content: String): Int {
        require(content.length <= 20_000_000) { "备份文件过大" }
        val root = JSONObject(content)
        require(root.optInt("version") in 1..2 && root.optString("format") in listOf("youqi-android", "youqi-prototype")) {
            "这不是支持的有期备份"
        }
        val events = root.getJSONArray("events")
        require(events.length() <= 5000) { "备份条目过多" }
        return events.length()
    }

    @Synchronized
    fun restore(content: String) {
        inspectBackup(content)
        val root = JSONObject(content)
        if (root.optString("format") == "youqi-prototype" || root.optInt("version") == 1) {
            // Version 1 stored only the interface's own event list; rebuild native records from it.
            save(root.getJSONArray("events").toString())
            return
        }
        val eventType = object : TypeToken<List<Event>>() {}.type
        val taskType = object : TypeToken<List<Task>>() {}.type
        val events: List<Event> = gson.fromJson(root.getJSONArray("fossifyEvents").toString(), eventType)
        val instances: List<Task> = gson.fromJson(root.getJSONArray("taskInstances").toString(), taskType)
        require(events.size <= 5000 && instances.size <= 100_000) { "备份条目过多" }
        require(events.map { it.id }.toSet().size == events.size &&
            events.all { it.id != null && it.id!! > 0 && it.title.length <= 240 && it.startTS in 1..7_258_118_400L && it.endTS >= it.startTS }) {
            "备份中的日程数据不完整"
        }
        val ids = events.mapNotNull { it.id }.toSet()
        require(instances.all { it.task_id in ids && it.startTS > 0 }) { "备份的完成记录无法匹配日程" }
        database.runInTransaction {
            val existing = dao.getEventIds()
            if (existing.isNotEmpty()) dao.deleteEvents(existing)
            events.forEach { dao.insertOrUpdate(it) }
            instances.forEach { tasks.insertOrUpdate(it) }
        }
    }
}
