package org.fossify.calendar.youqi

import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

/** Conservative correction for one explicitly stated time span, never a guessed date. */
object ScheduleTimeRange {
    const val FIELD_RULES = "due是结束或截止时间，start是实际开始时间。明确时段必须同时填写两者。9:30-12:00、九点半到十二点均为start=09:30、due=12:00，绝不能将12:00作为开始。只有截止时间时start=null。时间、日期不确定先询问，不得猜测。"
    data class Span(val start: LocalTime, val end: LocalTime, val nextDay: Boolean = false) {
        fun on(day: LocalDate): Pair<String, String> {
            val format = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
            return day.atTime(start).format(format) to day.plusDays(if (nextDay) 1 else 0).atTime(end).format(format)
        }
    }
    private const val NUMBER = "[零〇一二两三四五六七八九十0-9]{1,3}"
    private const val CLOCK = "(?:[0-2]?[0-9][:：][0-5][0-9]|$NUMBER(?:点|时)(?:半|一刻|三刻|(?:$NUMBER)分?)?)"
    private val range = Regex("(?<![0-9:：])(?<start>$CLOCK)\\s*(?:-|—|–|~|～|到|至)\\s*(?<period>凌晨|早上|上午|中午|下午|晚上)?\\s*(?<end>$CLOCK)(?![0-9:：])")

    private fun number(raw: String): Int? {
        raw.toIntOrNull()?.let { return it }
        val digits = mapOf('零' to 0, '〇' to 0, '一' to 1, '二' to 2, '两' to 2, '三' to 3,
            '四' to 4, '五' to 5, '六' to 6, '七' to 7, '八' to 8, '九' to 9)
        if (raw == "十") return 10
        if (raw.contains('十')) {
            val parts = raw.split('十')
            if (parts.size != 2) return null
            val tens = if (parts[0].isEmpty()) 1 else parts[0].singleOrNull()?.let { digits[it] } ?: return null
            val units = if (parts[1].isEmpty()) 0 else parts[1].singleOrNull()?.let { digits[it] } ?: return null
            return tens * 10 + units
        }
        return raw.singleOrNull()?.let { digits[it] }
    }
    private fun clock(raw: String, period: String): Pair<LocalTime, Boolean>? {
        val parts = raw.replace('：', ':').split(Regex("[:点时]"), limit = 2)
        if (parts.size != 2) return null
        var hour = number(parts[0]) ?: return null
        val minute = when (parts[1]) { "" -> 0; "半" -> 30; "一刻" -> 15; "三刻" -> 45
            else -> number(parts[1].removeSuffix("分")) ?: return null }
        if (period in listOf("下午", "晚上") && hour in 1..11) hour += 12
        if (period == "中午" && hour in 1..5) hour += 12
        if (period in listOf("凌晨", "晚上") && hour == 12) hour = if (period == "晚上") 24 else 0
        if (hour == 24 && minute == 0) return LocalTime.MIDNIGHT to true
        if (hour !in 0..23 || minute !in 0..59) return null
        return LocalTime.of(hour, minute) to false
    }
    fun find(text: String): Span? {
        val normalized = text.map { if (it in '０'..'９') ('0'.code + it.code - '０'.code).toChar() else it }.joinToString("")
        val found = range.findAll(normalized).toList()
        if (found.size != 1 || Regex("或者|还是|不要|并非|不是").containsMatchIn(normalized)) return null
        val match = found.single()
        val period = Regex("凌晨|早上|上午|中午|下午|晚上").findAll(normalized.take(match.range.first).takeLast(12)).lastOrNull()?.value.orEmpty()
        val start = clock(match.groups["start"]!!.value, period) ?: return null
        val endPeriod = match.groups["period"]?.value?.ifEmpty { period } ?: period
        val end = clock(match.groups["end"]!!.value, endPeriod) ?: return null
        if (start.second || start.first == end.first) return null
        return Span(start.first, end.first, end.second || end.first < start.first)
    }
}
