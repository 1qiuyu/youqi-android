package org.fossify.calendar.youqi

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import org.json.JSONObject

/** One foreground utterance; partial hypotheses replace each other until final results. */
class LiveDictation(private val context: Context, private val emit: (JSONObject) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var token = ""
    private var latest = ""
    private var stopping = false
    private var closed = false
    private var generation = 0
    private var stopTask: Runnable? = null
    private var limitTask: Runnable? = null
    fun active() = recognizer != null

    fun start(session: String) {
        check(Looper.myLooper() == Looper.getMainLooper())
        check(!closed && !active()) { "语音输入正在进行" }
        val onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        check(onDevice || SpeechRecognizer.isRecognitionAvailable(context)) { "系统实时识别不可用" }
        token = session; latest = ""; stopping = false
        val current = ++generation
        val engine = if (onDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
            else SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = engine
        engine.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { }
            override fun onBeginningOfSpeech() { }
            override fun onRmsChanged(rmsdB: Float) { }
            override fun onBufferReceived(buffer: ByteArray?) { }
            override fun onEndOfSpeech() { }
            override fun onEvent(eventType: Int, params: Bundle?) { }
            override fun onPartialResults(partialResults: Bundle?) {
                if (current != generation || !active()) return
                val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (text.isNotBlank()) { latest = text.take(4000); publish(false) }
            }
            override fun onResults(results: Bundle?) {
                if (current != generation || !active()) return
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (text.isNotBlank()) latest = text.take(4000)
                finish(if (latest.isEmpty()) "没有识别到语音，请重试" else "")
            }
            override fun onError(error: Int) {
                if (current != generation || !active()) return
                finish(if (latest.isNotEmpty()) "" else when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "麦克风权限未开启"
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "没有识别到语音，请重试"
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "系统识别正在使用中"
                    else -> "系统实时识别暂不可用"
                })
            }
        })
        try {
            engine.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            })
            if (current == generation && active()) {
                limitTask = Runnable { if (current == generation) stop() }.also { handler.postDelayed(it, 300_000) }
            }
        } catch (error: Exception) { cancel(); throw error }
    }

    private fun publish(final: Boolean, error: String = "") {
        emit(JSONObject().put("session", token).put("text", latest).put("final", final).put("error", error))
    }
    private fun finish(error: String = "") {
        if (!active()) return
        publish(true, error)
        cancel()
    }
    fun stop() {
        if (!active() || stopping) return
        stopping = true
        // Keep receiving the final callback; some vendors require a short flush timeout.
        stopTask = Runnable { finish(if (latest.isEmpty()) "没有识别到语音，请重试" else "") }
            .also { handler.postDelayed(it, 2200) }
        try { recognizer?.stopListening() } catch (_: Exception) { finish() }
    }
    fun cancel() {
        generation++
        stopTask?.let { handler.removeCallbacks(it) }; stopTask = null
        limitTask?.let { handler.removeCallbacks(it) }; limitTask = null
        val engine = recognizer; recognizer = null
        runCatching { engine?.cancel() }; runCatching { engine?.destroy() }
    }
    fun close() { closed = true; cancel() }
}
