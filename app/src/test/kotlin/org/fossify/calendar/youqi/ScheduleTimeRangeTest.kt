package org.fossify.calendar.youqi

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class ScheduleTimeRangeTest {
    private val day = LocalDate.of(2026, 10, 19)
    private fun assertSpan(text: String, start: String, end: String) {
        val result = ScheduleTimeRange.find(text)?.on(day)
        assertEquals(start to end, result)
    }

    @Test fun explicitMorningRange() {
        for (text in listOf("明天9:30-12:00开会", "明天９：３０～１２：００开会", "上午九点半到十二点开会", "9:30 至 12:00")) {
            assertSpan(text, "2026-10-19T09:30", "2026-10-19T12:00")
        }
    }
    @Test fun spokenMinutesAndPeriods() {
        assertSpan("下午两点一刻到三点三刻", "2026-10-19T14:15", "2026-10-19T15:45")
        assertSpan("上午十点二十分到下午一点", "2026-10-19T10:20", "2026-10-19T13:00")
    }
    @Test fun overnight() {
        assertSpan("晚上十一点到凌晨一点", "2026-10-19T23:00", "2026-10-20T01:00")
        assertSpan("23:00-24:00", "2026-10-19T23:00", "2026-10-20T00:00")
    }
    @Test fun leaveAmbiguousOrMissingRangesAlone() {
        for (text in listOf("明天12:00截止", "9:30-12:00或者14:00-16:00", "不是9:30-12:00", "29:00-30:00", "9:30-9:30", "九点半开会")) {
            assertNull(text, ScheduleTimeRange.find(text))
        }
    }
}
