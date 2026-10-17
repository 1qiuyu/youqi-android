package org.fossify.calendar.youqi

import android.content.Context
import android.media.MediaMetadataRetriever
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Audio stays in the private cache, never in JavaScript or calendar backups. */
class SpeechAudio(private val context: Context) {
    data class Clip(val token: String, val file: File, val name: String, val mime: String, val durationMs: Long) {
        fun json() = JSONObject().put("token", token).put("name", name).put("durationMs", durationMs).put("bytes", file.length())
    }
    private val folder = File(context.cacheDir, "speech-clips").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null
    private var pending: Clip? = null
    @Volatile private var closed = false
    @Synchronized fun isRecording() = recorder != null
    @Suppress("DEPRECATION")
    @Synchronized fun start(onLimit: () -> Unit) {
        check(!closed) { "录音页面已关闭" }
        check(recorder == null) { "已经在录音" }
        val file = File.createTempFile("recording-", ".m4a", folder)
        val next = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
        try {
            next.setAudioSource(MediaRecorder.AudioSource.MIC)
            next.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            next.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            next.setAudioChannels(1); next.setAudioSamplingRate(44_100); next.setAudioEncodingBitRate(64_000)
            next.setOutputFile(file.absolutePath); next.setMaxDuration(300_000); next.setMaxFileSize(24_000_000)
            next.setOnInfoListener { _, what, _ -> if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED || what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) onLimit() }
            next.prepare(); next.start()
            pending?.file?.delete(); pending = null
            recordingFile = file; recorder = next
        } catch (error: Exception) { next.release(); file.delete(); throw IllegalStateException("无法开始录音，请检查麦克风权限或是否被其他应用占用", error) }
    }
    @Synchronized fun stop(): Clip {
        val current = recorder ?: error("当前没有录音")
        val file = recordingFile ?: error("录音文件不可用")
        recorder = null; recordingFile = null
        try { current.stop() } catch (_: Exception) { file.delete(); error("录音太短，请至少说一句话后再停止") } finally { current.release() }
        return try {
            inspect(file, "录音.m4a", "audio/mp4").also { pending = it }
        } catch (error: Exception) { file.delete(); throw error }
    }
    @Synchronized fun cancelRecording() {
        val current = recorder; recorder = null
        runCatching { current?.stop() }; current?.release()
        recordingFile?.delete(); recordingFile = null
    }
    @Synchronized fun clip(token: String): Clip = pending?.takeIf { it.token == token && it.file.isFile } ?: error("音频已过期，请重新录音或选择文件")
    @Synchronized fun discard() { cancelRecording(); pending?.file?.delete(); pending = null }
    fun close() { closed = true; discard() }
    fun importAudio(uri: Uri): Clip {
        check(!closed) { "录音页面已关闭" }
        check(!isRecording()) { "请先停止录音" }
        val resolver = context.contentResolver
        val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: "音频文件"
        val suppliedMime = resolver.getType(uri).orEmpty()
        return resolver.openInputStream(uri)?.use { importStream(it, name, suppliedMime) } ?: error("无法读取所选音频")
    }
    internal fun importStream(input: java.io.InputStream, name: String, suppliedMime: String): Clip {
        check(!closed && !isRecording()) { "请先停止录音" }
        val mimeExt = mapOf("audio/mpeg" to "mp3", "audio/mp4" to "m4a", "audio/x-m4a" to "m4a", "audio/wav" to "wav", "audio/x-wav" to "wav", "audio/flac" to "flac", "audio/ogg" to "ogg", "application/ogg" to "ogg", "audio/webm" to "webm", "video/webm" to "webm", "video/mp4" to "mp4")
        val ext = name.substringAfterLast('.', "").lowercase().takeIf { it in setOf("m4a", "mp3", "wav", "flac", "ogg", "webm", "mp4", "mpeg", "mpga") }
            ?: mimeExt[suppliedMime] ?: error("暂不支持此音频格式，请选择M4A、MP3、WAV、FLAC、OGG或WEBM")
        val file = File.createTempFile("import-", ".$ext", folder)
        try {
            file.outputStream().use { out ->
                val buffer = ByteArray(8192); var total = 0L
                while (true) { check(!closed && !Thread.currentThread().isInterrupted) { "音频读取已取消" }; val count = input.read(buffer); if (count < 0) break; total += count; require(total <= 24_000_000) { "音频超过24 MB，请先截短" }; out.write(buffer, 0, count) }
            }
            val clip = inspect(file, name.take(120), suppliedMime)
            synchronized(this) {
                check(!closed && recorder == null) { "音频读取已取消" }
                pending?.file?.delete(); pending = clip
            }
            return clip
        } catch (error: Exception) { file.delete(); throw error }
    }
    private fun inspect(file: File, name: String, suppliedMime: String): Clip {
        require(file.length() > 0) { "音频文件为空" }
        val metadata = MediaMetadataRetriever()
        try {
            metadata.setDataSource(file.absolutePath)
            require(metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes") { "文件没有可读取的音轨，请换一个音频文件" }
            val duration = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            require(duration >= 300) { "音频太短，请至少录制一秒" }
            val detected = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE) ?: suppliedMime
            val mime = when (detected) { "audio/x-wav" -> "audio/wav"; "audio/x-flac" -> "audio/flac"; "audio/x-m4a" -> "audio/mp4"; else -> detected }
            return Clip(UUID.randomUUID().toString(), file, name, mime, duration)
        } catch (error: Exception) { throw IllegalStateException(error.message ?: "无法读取这个音频，请换一种格式", error) } finally { metadata.release() }
    }
}
