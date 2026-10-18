package org.fossify.calendar.youqi

import android.Manifest
import android.content.pm.PackageManager
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatDelegate
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.SocketTimeoutException
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Hosts the offline 有期 interface in a WebView.
 * Kotlin owns the database, appearance settings, background image and HTTPS calls;
 * the interface itself is plain HTML/CSS/JS bundled in assets.
 */
class YouqiActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private val store by lazy { YouqiStore(this) }
    private val miniMax by lazy { MiniMaxService(this) }
    private val speech by lazy { SpeechService(this) }
    private var voiceAudio: SpeechAudio? = null
    @Synchronized private fun audio() = voiceAudio ?: SpeechAudio(this).also { voiceAudio = it }
    private var pendingMicRequest: String? = null
    private var pendingLiveSession: String? = null
    private var liveDictation: LiveDictation? = null
    private fun live() = liveDictation ?: LiveDictation(this) { send("speech-live", it) }.also { liveDictation = it }
    private val speechGeneration = java.util.concurrent.atomic.AtomicInteger()
    private val filesExecutor = Executors.newSingleThreadExecutor()
    private val networkExecutor = Executors.newSingleThreadExecutor()
    private var ready = false
    private var pickerRequest = ""
    private var pickerKind = ""
    private var pendingRestore: Pair<String, String>? = null
    private var sharedText: String? = null
    private var incomingUri: Uri? = null
    private var pendingImage: Pair<String, ByteArray>? = null
    private val origin = "https://appassets.androidplatform.net"

    private val prefs by lazy { getSharedPreferences("youqi-settings", MODE_PRIVATE) }

    private val backgroundFile get() = File(filesDir, "background.img")

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        // The interface implements light/dark itself; keeping AppCompat in night-no mode
        // prevents activity recreation (and a full WebView reload) on system theme changes.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val dark = initialDark()
        root = FrameLayout(this).apply { setBackgroundColor(if (dark) Color.BLACK else Color.WHITE) }
        applySystemBars(dark)

        web = WebView(this).apply {
            setBackgroundColor(if (dark) Color.rgb(0x12, 0x11, 0x16) else Color.rgb(0xF7, 0xF5, 0xFB))
            overScrollMode = WebView.OVER_SCROLL_NEVER
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = false
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                setSupportMultipleWindows(false)
                javaScriptCanOpenWindowsAutomatically = false
                setSupportZoom(false)
                textZoom = 100
            }
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    return request.url.scheme != "https" || request.url.host != "appassets.androidplatform.net"
                }

                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                    if (request.url.scheme != "https" || request.url.host != "appassets.androidplatform.net") return denied()
                    val path = request.url.path.orEmpty()
                    if (!path.startsWith("/youqi/") || path.contains("..")) return denied()
                    if (path == "/youqi/background") return serveBackground()
                    val asset = path.removePrefix("/")
                    val mime = when {
                        asset.endsWith(".html") -> "text/html"
                        asset.endsWith(".css") -> "text/css"
                        asset.endsWith(".js") -> "application/javascript"
                        asset.endsWith(".svg") -> "image/svg+xml"
                        asset.endsWith(".png") -> "image/png"
                        else -> "text/plain"
                    }
                    return try {
                        WebResourceResponse(mime, "UTF-8", 200, "OK", mapOf("Cache-Control" to "no-store"), assets.open(asset))
                    } catch (_: Exception) { denied() }
                }

                override fun onPageFinished(view: WebView, url: String) {
                    if (url != "$origin/youqi/index.html") return
                    ready = true
                    deliverPendingInput()
                }
            }
            addJavascriptInterface(Bridge(), "YouqiAndroid")
        }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)
        ViewCompat.requestApplyInsets(root)
        WebView.setWebContentsDebuggingEnabled(org.fossify.calendar.BuildConfig.DEBUG)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.YouqiApp ? window.YouqiApp.handleBack() : false") { handled ->
                    if (handled != "true") finish()
                }
            }
        })
        readIntent(intent)
        web.loadUrl("$origin/youqi/index.html")
    }

    /** Resolves the saved appearance setting before the first frame, so dark mode never flashes white. */
    private fun initialDark(): Boolean {
        val systemDark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        return when (prefs.getString("theme", "auto")) {
            "dark" -> true
            "light" -> false
            else -> systemDark
        }
    }

    private fun applySystemBars(dark: Boolean) = WindowCompat.getInsetsController(window, window.decorView).apply {
        isAppearanceLightStatusBars = !dark
        isAppearanceLightNavigationBars = !dark
    }

    private fun denied() = WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))

    private fun serveBackground(): WebResourceResponse {
        val file = backgroundFile
        if (!file.exists()) return denied()
        val mime = prefs.getString("bgMime", "image/jpeg") ?: "image/jpeg"
        return try {
            WebResourceResponse(mime, "binary", 200, "OK", mapOf("Cache-Control" to "no-store"), file.inputStream())
        } catch (_: Exception) { denied() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readIntent(intent)
        if (ready) deliverPendingInput()
    }

    private fun readIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND) sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)?.take(20_000)
        if (intent?.action == Intent.ACTION_VIEW && intent.data?.scheme == "content") incomingUri = intent.data
    }

    private fun deliverPendingInput() {
        sharedText?.let {
            send("shared", JSONObject().put("text", it)); sharedText = null
        }
        incomingUri?.let {
            incomingUri = null
            processInput(it, "ics", "incoming")
        }
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized && ready) web.evaluateJavascript("window.YouqiApp && window.YouqiApp.refreshClock()", null)
    }

    private fun send(id: String, data: JSONObject? = null, error: String? = null) {
        val objectValue = JSONObject().put("id", id).put("ok", error == null)
        if (error == null) objectValue.put("data", data ?: JSONObject()) else objectValue.put("error", error.take(300))
        runOnUiThread {
            if (!isFinishing && !isDestroyed && ::web.isInitialized && ready) {
                web.evaluateJavascript("window.YouqiNativeResult && window.YouqiNativeResult($objectValue)", null)
            }
        }
    }

    private fun errorMessage(error: Exception): String = when (error) {
        is SocketTimeoutException -> "连接超时，请检查网络后重试；原文仍保留"
        is java.net.UnknownHostException -> "无法连接 API 服务，请检查网络和 API 地址"
        is javax.net.ssl.SSLException -> "无法建立安全连接，请检查手机时间和网络"
        is OutOfMemoryError -> "图片过大，请先裁剪后再试"
        else -> error.message?.takeIf { it.isNotBlank() }?.take(250) ?: "操作未完成，请重试"
    }

    private fun openPicker(kind: String, requestId: String) = runOnUiThread {
        pickerKind = kind
        pickerRequest = requestId
        val imageKinds = kind == "image" || kind == "background"
        val action = if (kind == "export") Intent.ACTION_CREATE_DOCUMENT else Intent.ACTION_OPEN_DOCUMENT
        val picker = Intent(action).addCategory(Intent.CATEGORY_OPENABLE)
        when {
            kind == "export" -> {
                picker.type = "application/json"
                picker.putExtra(Intent.EXTRA_TITLE, "有期备份-${LocalDate.now()}.json")
            }
            imageKinds -> picker.type = "image/*"
            kind == "audio" -> {
                picker.type = "*/*"
                picker.putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "video/mp4", "video/webm", "application/ogg"))
            }
            kind == "ics" -> {
                picker.type = "*/*"
                picker.putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/calendar", "application/ics", "text/plain", "application/octet-stream"))
            }
            else -> {
                picker.type = "*/*"
                picker.putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "application/octet-stream"))
            }
        }
        try { startActivityForResult(picker, REQUEST_PICKER) }
        catch (_: Exception) { send(requestId, error = "系统文件选择器不可用，请稍后重试") }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_PICKER) return
        val id = pickerRequest
        val kind = pickerKind
        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            send(id, JSONObject().put("cancelled", true)); return
        }
        val uri = data.data!!
        when (kind) {
            "export" -> filesExecutor.execute {
                try {
                    val content = store.backup().toByteArray(Charsets.UTF_8)
                    val stream = contentResolver.openOutputStream(uri, "wt") ?: error("无法写入选择的文件")
                    stream.use { it.write(content) }
                    send(id, JSONObject().put("exported", true))
                } catch (error: Exception) { send(id, error = errorMessage(error)) }
            }
            "audio" -> filesExecutor.execute {
                try { send(id, audio().importAudio(uri).json()) }
                catch (error: Exception) { send(id, error = errorMessage(error)) }
            }
            "image" -> filesExecutor.execute { handleImagePick(uri, id) }
            "background" -> filesExecutor.execute { handleBackgroundPick(uri, id) }
            else -> processInput(uri, kind, id)
        }
    }

    /** Decodes the chosen photo, downsizes it for the model and keeps only a small preview in the interface. */
    private fun handleImagePick(uri: Uri, id: String) {
        try {
            val bytes = readBytes(uri, MAX_IMAGE_BYTES)
            val bitmap = decodeOriented(bytes, MAX_MODEL_EDGE) ?: error("无法读取这张图片，请换一张")
            val full = ByteArrayOutputStream().use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 86, out)
                out.toByteArray()
            }
            val thumbWidth = 128
            val thumbHeight = (bitmap.height.toFloat() / bitmap.width * thumbWidth).toInt().coerceAtLeast(1)
            val thumb = Bitmap.createScaledBitmap(bitmap, thumbWidth, thumbHeight, true)
            val thumbBytes = ByteArrayOutputStream().use { out ->
                thumb.compress(Bitmap.CompressFormat.JPEG, 72, out)
                out.toByteArray()
            }
            if (thumb !== bitmap) thumb.recycle()
            val width = bitmap.width
            val height = bitmap.height
            bitmap.recycle()

            val token = UUID.randomUUID().toString()
            pendingImage = token to full
            send(id, JSONObject()
                .put("token", token)
                .put("thumb", "data:image/jpeg;base64," + Base64.encodeToString(thumbBytes, Base64.NO_WRAP))
                .put("name", uri.lastPathSegment?.substringAfterLast('/') ?: "已选择图片")
                .put("width", width)
                .put("height", height))
        } catch (error: Exception) { send(id, error = errorMessage(error)) }
    }

    private fun handleBackgroundPick(uri: Uri, id: String) {
        try {
            val bytes = readBytes(uri, MAX_IMAGE_BYTES)
            val bitmap = decodeOriented(bytes, MAX_BACKGROUND_EDGE) ?: error("无法读取这张图片，请换一张")
            val target = File(filesDir, "background.tmp")
            java.io.FileOutputStream(target).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
            }
            bitmap.recycle()
            if (!target.renameTo(backgroundFile)) {
                target.copyTo(backgroundFile, overwrite = true)
                target.delete()
            }
            val version = (prefs.getInt("bgVersion", 0) + 1)
            prefs.edit()
                .putString("bgMime", "image/jpeg")
                .putString("hasBackground", "true")
                .putInt("bgVersion", version)
                .apply()
            send(id, JSONObject().put("version", version)
                .put("name", uri.lastPathSegment?.substringAfterLast('/') ?: "自定义图片"))
        } catch (error: Exception) { send(id, error = errorMessage(error)) }
    }

    private fun readBytes(uri: Uri, limit: Int): ByteArray {
        val bytes = contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                require(output.size() + count <= limit) { "图片超过 24 MB，请先裁剪" }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: error("无法读取选择的文件")
        require(bytes.isNotEmpty()) { "文件是空的，请重新选择" }
        return bytes
    }

    /** Applies EXIF rotation and downsamples so the longest edge is at most [maxEdge]. */
    private fun decodeOriented(bytes: ByteArray, maxEdge: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
        val rotation = runCatching {
            when (ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        }.getOrDefault(0f)
        val scaled = if (maxOf(decoded.width, decoded.height) > maxEdge) {
            val ratio = maxEdge.toFloat() / maxOf(decoded.width, decoded.height)
            Bitmap.createScaledBitmap(decoded, (decoded.width * ratio).toInt().coerceAtLeast(1), (decoded.height * ratio).toInt().coerceAtLeast(1), true)
        } else decoded
        if (scaled !== decoded) decoded.recycle()
        if (rotation == 0f) return scaled
        val matrix = Matrix().apply { postRotate(rotation) }
        val rotated = Bitmap.createBitmap(scaled, 0, 0, scaled.width, scaled.height, matrix, true)
        if (rotated !== scaled) scaled.recycle()
        return rotated
    }

    private fun processInput(uri: Uri, kind: String, id: String) {
        filesExecutor.execute {
            try {
                val bytes = contentResolver.openInputStream(uri)?.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        require(output.size() + count <= 20_000_000) { "文件超过 20 MB，请选择较小的文件" }
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                } ?: error("无法读取文件，请重新选择")
                val text = String(bytes, Charsets.UTF_8).removePrefix("﻿")
                if (kind == "ics") {
                    require(text.contains("BEGIN:VCALENDAR")) { "请选择 ThuInfo 导出的 .ics 日历文件" }
                    val temporary = File.createTempFile("youqi-course-", ".ics", cacheDir)
                    try {
                        temporary.writeText(text, Charsets.UTF_8)
                        send(id, store.importIcs(temporary))
                    } finally { temporary.delete() }
                } else {
                    val count = store.inspectBackup(text)
                    val token = UUID.randomUUID().toString()
                    pendingRestore = token to text
                    send(id, JSONObject().put("restoreToken", token).put("count", count))
                }
            } catch (error: Exception) { send(id, error = errorMessage(error)) }
        }
    }

    private fun updateConnection(url: String): HttpURLConnection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 15_000
        readTimeout = 30_000
        instanceFollowRedirects = true
        setRequestProperty("Accept", "application/vnd.github+json")
        setRequestProperty("User-Agent", "Yunduo/${org.fossify.calendar.BuildConfig.VERSION_NAME}")
    }

    private fun versionParts(value: String): List<Int> = value.trim().removePrefix("v").split('.').map {
        it.takeWhile(Char::isDigit).toIntOrNull() ?: 0
    }.let { it + List((3 - it.size).coerceAtLeast(0)) { 0 } }

    private fun compareVersions(left: String, right: String): Int {
        val a = versionParts(left); val b = versionParts(right)
        return (0..2).firstOrNull { a[it] != b[it] }?.let { a[it].compareTo(b[it]) } ?: 0
    }

    private fun checkForUpdate(id: String) {
        networkExecutor.execute {
            try {
                val connection = updateConnection("https://api.github.com/repos/1qiuyu/youqi-android/releases/latest")
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                connection.disconnect()
                val release = JSONObject(body)
                val tag = release.optString("tag_name").takeIf { it.isNotBlank() } ?: error("发布版本缺少版本号")
                val assets = release.optJSONArray("assets") ?: org.json.JSONArray()
                var apkUrl = ""
                var apkName = ""
                for (index in 0 until assets.length()) {
                    val asset = assets.optJSONObject(index) ?: continue
                    val name = asset.optString("name")
                    if (name.endsWith(".apk", ignoreCase = true)) {
                        apkName = name; apkUrl = asset.optString("browser_download_url"); break
                    }
                }
                require(apkUrl.startsWith("https://github.com/") || apkUrl.startsWith("https://objects.githubusercontent.com/")) { "发布中没有可安装的 APK" }
                val current = packageManager.getPackageInfo(packageName, 0).versionName ?: org.fossify.calendar.BuildConfig.VERSION_NAME
                send(id, JSONObject()
                    .put("current", current)
                    .put("latest", tag.removePrefix("v"))
                    .put("available", compareVersions(tag, current) > 0)
                    .put("url", apkUrl)
                    .put("name", apkName)
                    .put("notes", release.optString("body").take(2000)))
            } catch (error: Exception) { send(id, error = errorMessage(error)) }
        }
    }

    private fun downloadUpdate(id: String, rawUrl: String) {
        networkExecutor.execute {
            try {
                val parsed = URL(rawUrl)
                require(parsed.protocol == "https" && (parsed.host == "github.com" || parsed.host.endsWith(".githubusercontent.com"))) { "更新地址不受信任" }
                val connection = updateConnection(rawUrl)
                connection.connect()
                require(connection.responseCode in 200..299) { "下载更新失败（HTTP ${connection.responseCode}）" }
                require(connection.url.host == "github.com" || connection.url.host.endsWith(".githubusercontent.com")) { "更新跳转地址不受信任" }
                val length = connection.contentLengthLong
                require(length <= 120L * 1024 * 1024 || length < 0) { "更新包过大，已停止下载" }
                val temporary = File(cacheDir, "yunduo-update.apk.part")
                val target = File(cacheDir, "yunduo-update.apk")
                connection.inputStream.use { input -> java.io.FileOutputStream(temporary).use { output ->
                    val buffer = ByteArray(32 * 1024); var total = 0L
                    while (true) {
                        val count = input.read(buffer); if (count < 0) break
                        total += count; require(total <= 120L * 1024 * 1024) { "更新包过大，已停止下载" }
                        output.write(buffer, 0, count)
                    }
                } }
                connection.disconnect()
                if (target.exists()) target.delete()
                require(temporary.renameTo(target)) { "更新文件保存失败" }
                installDownloadedApk(id, target)
            } catch (error: Exception) { send(id, error = errorMessage(error)) }
        }
    }

    private fun installDownloadedApk(id: String, file: File) = runOnUiThread {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
                startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                send(id, JSONObject().put("permissionRequired", true))
                return@runOnUiThread
            }
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
            send(id, JSONObject().put("started", true))
        } catch (error: Exception) { send(id, error = "无法打开安装程序：${error.message ?: "请稍后重试"}") }
    }

    private fun beginRecording(id: String) {
        if (isFinishing || isDestroyed) { send(id, error = "页面已关闭，请重新开始"); return }
        try {
            check(liveDictation?.active() != true) { "实时语音输入正在进行" }
            audio().start {
                runOnUiThread {
                    if (voiceAudio?.isRecording() == true) {
                        try { send("speech-stopped", audio().stop().json().put("automatic", true)) }
                        catch (error: Exception) { send("speech-stopped", error = errorMessage(error)) }
                    }
                }
            }
            send(id, JSONObject().put("recording", true).put("maxSeconds", 300))
        } catch (error: Exception) { send(id, error = errorMessage(error)) }
    }

    private fun beginLiveDictation(id: String, session: String) {
        try {
            check(!isFinishing && !isDestroyed) { "页面已关闭，请重新开始" }
            check(voiceAudio?.isRecording() != true) { "录音正在进行" }
            require(session.length in 1..100) { "语音会话无效" }
            live().start(session)
            send(id, JSONObject().put("session", session).put("live", true))
        } catch (error: Exception) { send(id, error = errorMessage(error)) }
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_AUDIO) return
        val id = pendingMicRequest ?: return
        val session = pendingLiveSession
        pendingMicRequest = null
        pendingLiveSession = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            if (session != null) beginLiveDictation(id, session) else beginRecording(id)
        }
        else send(id, error = "麦克风权限未开启，可在系统设置中授权，也可以使用下方导入音频")
    }

    override fun onStop() {
        liveDictation?.stop()
        if (voiceAudio?.isRecording() == true) {
            try { send("speech-stopped", audio().stop().json().put("interrupted", true)) }
            catch (error: Exception) { send("speech-interrupted", error = errorMessage(error)) }
        }
        pendingMicRequest?.let { send(it, error = "录音已取消"); pendingMicRequest = null }
        pendingLiveSession = null
        super.onStop()
    }

    inner class Bridge {
        @JavascriptInterface fun setAppearance(dark: Boolean) = runOnUiThread {
            if (isDestroyed || isFinishing) return@runOnUiThread
            root.setBackgroundColor(if (dark) Color.BLACK else Color.WHITE)
            web.setBackgroundColor(if (dark) Color.rgb(0x12, 0x11, 0x16) else Color.rgb(0xF7, 0xF5, 0xFB))
            applySystemBars(dark)
        }

        @JavascriptInterface fun loadSettings(): String = JSONObject().apply {
            put("theme", prefs.getString("theme", "auto"))
            put("bgOpacity", prefs.getFloat("bgOpacity", 1f).toDouble())
            put("bgBlur", prefs.getInt("bgBlur", 0))
            put("bgScrim", prefs.getFloat("bgScrim", 0f).toDouble())
            put("bgVersion", prefs.getInt("bgVersion", 0))
            put("hasBackground", prefs.getString("hasBackground", "false") == "true" && backgroundFile.exists())
            put("bgName", prefs.getString("bgName", ""))
        }.toString()

        @JavascriptInterface fun saveSettings(content: String): String = try {
            val input = JSONObject(content)
            val edit = prefs.edit()
            input.optString("theme", "auto").takeIf { it in listOf("light", "dark", "auto") }?.let { edit.putString("theme", it) }
            if (input.has("bgOpacity")) edit.putFloat("bgOpacity", input.optDouble("bgOpacity", 1.0).toFloat().coerceIn(0.05f, 1f))
            if (input.has("bgBlur")) edit.putInt("bgBlur", input.optInt("bgBlur", 0).coerceIn(0, 40))
            if (input.has("bgScrim")) edit.putFloat("bgScrim", input.optDouble("bgScrim", 0.0).toFloat().coerceIn(0f, 0.95f))
            if (input.has("hasBackground")) edit.putString("hasBackground", if (input.optBoolean("hasBackground")) "true" else "false")
            if (input.has("bgName")) edit.putString("bgName", input.optString("bgName").take(200))
            edit.commit()
            JSONObject().put("ok", true).toString()
        } catch (error: Exception) {
            JSONObject().put("ok", false).put("error", errorMessage(error)).toString()
        }

        @JavascriptInterface fun loadEvents(): String = try { store.load() } catch (error: Exception) { JSONObject().put("error", errorMessage(error)).toString() }
        @JavascriptInterface fun listOccurrences(from: String, to: String): String = try { store.occurrences(from, to) } catch (error: Exception) { JSONObject().put("error", errorMessage(error)).toString() }
        @JavascriptInterface fun saveEvents(content: String): String = try { store.save(content); JSONObject().put("ok", true).toString() } catch (error: Exception) { JSONObject().put("ok", false).put("error", errorMessage(error)).toString() }
        @JavascriptInterface fun getConfig(): String = miniMax.config().toString()
        @JavascriptInterface fun loadAssistantSettings(): String = prefs.getString("assistant-settings-v1", "{}") ?: "{}"
        @JavascriptInterface fun saveAssistantSettings(content: String): String = try {
            require(content.length <= 5000) { "外观设置过大" }
            val value = JSONObject(content)
            val edit = prefs.edit().putString("assistant-settings-v1", value.toString())
            if (!value.optBoolean("saveHistory")) edit.remove("assistant-history-v1")
            check(edit.commit()) { "助手设置保存失败" }
            JSONObject().put("ok", true).toString()
        } catch (error: Exception) { JSONObject().put("ok", false).put("error", errorMessage(error)).toString() }
        @JavascriptInterface fun loadAssistantHistory(): String {
            val enabled = runCatching { JSONObject(loadAssistantSettings()).optBoolean("saveHistory") }.getOrDefault(false)
            return if (enabled) prefs.getString("assistant-history-v1", "[]") ?: "[]" else "[]"
        }
        @JavascriptInterface fun saveAssistantHistory(content: String): String = try {
            require(content.length <= 150_000) { "聊天记录过长，请开始新对话" }
            val enabled = JSONObject(loadAssistantSettings()).optBoolean("saveHistory")
            val edit = prefs.edit()
            if (enabled) edit.putString("assistant-history-v1", JSONArray(content).toString())
            else edit.remove("assistant-history-v1")
            check(edit.commit()) { "聊天记录保存失败" }
            JSONObject().put("ok", true).toString()
        } catch (error: Exception) { JSONObject().put("ok", false).put("error", errorMessage(error)).toString() }
        @JavascriptInterface fun assistant(id: String, input: String) {
            networkExecutor.execute { try { send(id, miniMax.assistant(input)) } catch (error: Exception) { send(id, error = errorMessage(error)) } }
        }
        @JavascriptInterface fun saveConfig(content: String): String = try { JSONObject().put("ok", true).put("config", miniMax.saveConfig(content)).toString() } catch (error: Exception) { JSONObject().put("ok", false).put("error", errorMessage(error)).toString() }

        @JavascriptInterface fun analyze(id: String, text: String, referenceDate: String) {
            networkExecutor.execute { try { send(id, miniMax.analyze(text, referenceDate)) } catch (error: Exception) { send(id, error = errorMessage(error)) } }
        }

        @JavascriptInterface fun analyzeImage(id: String, token: String, referenceDate: String) {
            networkExecutor.execute {
                try {
                    val image = pendingImage?.takeIf { it.first == token } ?: error("图片已过期，请重新选择")
                    send(id, miniMax.analyzeImage(image.second, referenceDate))
                } catch (error: Exception) { send(id, error = errorMessage(error)) }
            }
        }

        @JavascriptInterface fun testConnection(id: String) {
            networkExecutor.execute { try { send(id, miniMax.testConnection()) } catch (error: Exception) { send(id, error = errorMessage(error)) } }
        }

        @JavascriptInterface fun listModels(id: String, content: String) {
            networkExecutor.execute { try { send(id, miniMax.listModels(content)) } catch (error: Exception) { send(id, error = errorMessage(error)) } }
        }

        @JavascriptInterface fun getSpeechConfig(): String = speech.config().toString()
        @JavascriptInterface fun saveSpeechConfig(content: String): String = try {
            JSONObject().put("ok", true).put("config", speech.saveConfig(content)).toString()
        } catch (error: Exception) { JSONObject().put("ok", false).put("error", errorMessage(error)).toString() }
        @JavascriptInterface fun listSpeechModels(id: String, content: String) {
            networkExecutor.execute { try { send(id, speech.listModels(content)) } catch (error: Exception) { send(id, error = errorMessage(error)) } }
        }
        @JavascriptInterface fun startRecording(id: String) = runOnUiThread {
            if (pendingMicRequest != null || voiceAudio?.isRecording() == true || liveDictation?.active() == true) { send(id, error = "录音已开始或正在等待权限"); return@runOnUiThread }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) beginRecording(id)
            else { pendingMicRequest = id; requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_AUDIO) }
        }
        @JavascriptInterface fun stopRecording(id: String) = runOnUiThread {
            try { send(id, audio().stop().json()) } catch (error: Exception) { send(id, error = errorMessage(error)) }
        }
        @JavascriptInterface fun cancelRecording() = runOnUiThread {
            if (pendingLiveSession == null) pendingMicRequest?.let { send(it, error = "录音已取消"); pendingMicRequest = null }
            voiceAudio?.cancelRecording()
        }
        @JavascriptInterface fun startLiveDictation(id: String, session: String) = runOnUiThread {
            if (pendingMicRequest != null || voiceAudio?.isRecording() == true || liveDictation?.active() == true) {
                send(id, error = "语音输入正在进行"); return@runOnUiThread
            }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) beginLiveDictation(id, session)
            else {
                pendingMicRequest = id; pendingLiveSession = session
                requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_AUDIO)
            }
        }
        @JavascriptInterface fun stopLiveDictation(id: String) = runOnUiThread {
            liveDictation?.stop()
            send(id, JSONObject().put("stopping", true))
        }
        @JavascriptInterface fun cancelLiveDictation() = runOnUiThread {
            if (pendingLiveSession != null) {
                pendingMicRequest?.let { send(it, error = "语音输入已取消") }
                pendingMicRequest = null; pendingLiveSession = null
            }
            liveDictation?.cancel()
        }
        @JavascriptInterface fun pickAudio(id: String) { openPicker("audio", id) }
        @JavascriptInterface fun discardAudio() = runOnUiThread { voiceAudio?.discard() }
        @JavascriptInterface fun cancelTranscription() { speechGeneration.incrementAndGet(); speech.cancel() }
        @JavascriptInterface fun transcribeAudio(id: String, token: String) {
            val generation = speechGeneration.incrementAndGet()
            networkExecutor.execute {
                try {
                    check(generation == speechGeneration.get()) { "语音识别已取消" }
                    val clip = audio().clip(token)
                    val result = speech.transcribe(clip.file, clip.mime)
                    check(generation == speechGeneration.get()) { "语音识别已取消" }
                    send(id, result)
                } catch (error: Exception) { send(id, error = errorMessage(error)) }
            }
        }

        @JavascriptInterface fun pickImage(id: String) { openPicker("image", id) }
        @JavascriptInterface fun pickBackground(id: String) { openPicker("background", id) }
        @JavascriptInterface fun importIcs(id: String) { openPicker("ics", id) }
        @JavascriptInterface fun exportBackup(id: String) { openPicker("export", id) }
        @JavascriptInterface fun importBackup(id: String) { openPicker("backup", id) }

        @JavascriptInterface fun confirmRestore(id: String, token: String) {
            filesExecutor.execute {
                try {
                    val pending = pendingRestore?.takeIf { it.first == token } ?: error("备份预览已过期，请重新选择")
                    store.restore(pending.second); pendingRestore = null
                    send(id, JSONObject().put("events", org.json.JSONArray(store.load())).put("restored", true))
                } catch (error: Exception) { send(id, error = errorMessage(error)) }
            }
        }

        @JavascriptInterface fun readClipboard(): String {
            val manager = getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            return manager.primaryClip?.getItemAt(0)?.coerceToText(this@YouqiActivity)?.toString()?.take(20_000).orEmpty()
        }

        @JavascriptInterface fun checkForUpdate(id: String) = this@YouqiActivity.checkForUpdate(id)
        @JavascriptInterface fun downloadUpdate(id: String, url: String) = this@YouqiActivity.downloadUpdate(id, url)

        @JavascriptInterface fun license(): String = assets.open("youqi/LICENSE.txt").bufferedReader().use { it.readText() }
    }

    override fun onDestroy() {
        ready = false
        pendingImage = null
        voiceAudio?.close()
        liveDictation?.close()
        speech.cancel()
        networkExecutor.shutdownNow()
        filesExecutor.shutdownNow()
        if (::web.isInitialized) {
            web.removeJavascriptInterface("YouqiAndroid")
            web.stopLoading()
            web.destroy()
        }
        super.onDestroy()
    }

    private companion object {
        const val REQUEST_PICKER = 9081
        const val REQUEST_AUDIO = 9082
        const val MAX_IMAGE_BYTES = 24_000_000
        const val MAX_MODEL_EDGE = 1600
        const val MAX_BACKGROUND_EDGE = 2000
    }
}
