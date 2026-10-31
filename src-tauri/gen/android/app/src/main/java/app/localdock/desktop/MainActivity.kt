package app.localdock.desktop

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

class LocalDockAndroidBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun downloadDirect(
    url: String,
    filename: String,
    size: Long,
    deviceToken: String,
    ownerKey: String
  ) {
    activity.downloadDirectNative(url, filename, size, deviceToken, ownerKey)
  }

  @JavascriptInterface
  fun saveBlob(base64Data: String, filename: String, mimeType: String) {
    activity.saveBlobNative(base64Data, filename, mimeType)
  }
}

class MainActivity : TauriActivity() {
  private var multicastLock: WifiManager.MulticastLock? = null
  private val downloadExecutor = Executors.newFixedThreadPool(4)
  private val notifCounter = AtomicInteger(1000)
  private var customView: View? = null
  private var customViewCallback: WebChromeClient.CustomViewCallback? = null
  private var fullscreenContainer: FrameLayout? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Keep screen awake while using LocalDock (prevents video/download sleep blackout)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    createNotificationChannel()
    acquireMulticastLock()
    requestPermissionsPipeline()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)

    webView.settings.apply {
      mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
      allowFileAccess = true
      allowContentAccess = true
      domStorageEnabled = true
      javaScriptEnabled = true
      mediaPlaybackRequiresUserGesture = false
    }

    // Set WebChromeClient to safely handle HTML5 video fullscreen and custom views without black screen
    webView.webChromeClient = object : WebChromeClient() {
      override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
        if (customView != null) {
          callback?.onCustomViewHidden()
          return
        }
        customView = view
        customViewCallback = callback

        if (fullscreenContainer == null) {
          fullscreenContainer = FrameLayout(this@MainActivity).apply {
            layoutParams = FrameLayout.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT,
              ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(android.graphics.Color.BLACK)
          }
          (window.decorView as? ViewGroup)?.addView(fullscreenContainer)
        }

        fullscreenContainer?.addView(view)
        fullscreenContainer?.visibility = View.VISIBLE
        webView.visibility = View.GONE
      }

      override fun onHideCustomView() {
        if (customView == null) return
        fullscreenContainer?.removeView(customView)
        fullscreenContainer?.visibility = View.GONE
        webView.visibility = View.VISIBLE
        customViewCallback?.onCustomViewHidden()
        customView = null
        customViewCallback = null
      }
    }

    // Inject Native Android Bridge to handle file downloads directly to phone storage
    webView.addJavascriptInterface(LocalDockAndroidBridge(this), "LocalDockAndroid")

    // Handle any fallback URL downloads through our native engine
    webView.setDownloadListener { url, _, contentDisposition, mimetype, _ ->
      val filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
      val cookies = CookieManager.getInstance().getCookie(url) ?: ""
      downloadDirectNative(url, filename, -1L, "", "")
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "LocalDock Downloads",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "LocalDock file downloads and transfer status"
      }
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      nm?.createNotificationChannel(channel)
    }
  }

  private fun guessMimeType(filename: String, fallback: String = "*/*"): String {
    val dot = filename.lastIndexOf('.')
    if (dot < 0) return fallback
    val ext = filename.substring(dot + 1).lowercase()
    return when (ext) {
      "apk" -> "application/vnd.android.package-archive"
      "zip" -> "application/zip"
      "pdf" -> "application/pdf"
      "mp4" -> "video/mp4"
      "mkv" -> "video/x-matroska"
      "webm" -> "video/webm"
      "mp3" -> "audio/mpeg"
      "wav" -> "audio/wav"
      "ogg" -> "audio/ogg"
      "jpg", "jpeg" -> "image/jpeg"
      "png" -> "image/png"
      "gif" -> "image/gif"
      "webp" -> "image/webp"
      "txt" -> "text/plain"
      "json" -> "application/json"
      else -> fallback
    }
  }

  /**
   * Universal downloader that writes directly to the user's Downloads folder
   * on Android 10+ (API 29+) via MediaStore (no permissions required by Scoped Storage),
   * with legacy fallback for Android 9 and app-specific external storage fallback.
   */
  fun downloadDirectNative(
    urlStr: String,
    rawFilename: String,
    expectedSize: Long,
    deviceToken: String,
    ownerKey: String
  ) {
    downloadExecutor.execute {
      val notifId = notifCounter.incrementAndGet()
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      val cleanName = rawFilename.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
      val displayName = if (cleanName.isEmpty()) "file" else cleanName
      val mimeType = guessMimeType(displayName)

      runOnUiThread {
        Toast.makeText(applicationContext, "بدأ تنزيل: $displayName", Toast.LENGTH_SHORT).show()
      }

      val notifBuilder = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setContentTitle("جاري تحميل $displayName")
        .setContentText("0%")
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setOngoing(true)
        .setProgress(100, 0, false)

      nm?.notify(notifId, notifBuilder.build())

      var outUri: Uri? = null
      var localLegacyFile: File? = null

      try {
        val url = URL(urlStr)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 15000
        conn.readTimeout = 60000
        conn.instanceFollowRedirects = true
        conn.setRequestProperty("User-Agent", "LocalDock-Android")
        if (deviceToken.isNotEmpty()) {
          conn.setRequestProperty("X-LocalDock-Device", deviceToken)
        }
        if (ownerKey.isNotEmpty()) {
          conn.setRequestProperty("X-LocalDock-Owner", ownerKey)
        }
        val cookies = CookieManager.getInstance().getCookie(urlStr)
        if (!cookies.isNullOrEmpty()) {
          conn.setRequestProperty("Cookie", cookies)
        }

        val respCode = conn.responseCode
        if (respCode !in 200..299) {
          throw Exception("HTTP $respCode: ${conn.responseMessage}")
        }

        val totalBytes = if (expectedSize > 0) expectedSize else conn.contentLengthLong

        var outputStream: OutputStream? = null

        // 1. Preferred modern path: MediaStore.Downloads (Android 10+ / API 29+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val resolver = applicationContext.contentResolver
          val contentValues = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, displayName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.Downloads.IS_PENDING, 1)
          }
          outUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
          if (outUri != null) {
            outputStream = resolver.openOutputStream(outUri)
          }
        }

        // 2. Legacy path for Android <= 9 or fallback if MediaStore returned null
        if (outputStream == null) {
          val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
          if (!downloadsDir.exists()) downloadsDir.mkdirs()
          val destFile = File(downloadsDir, displayName)
          localLegacyFile = destFile
          outputStream = FileOutputStream(destFile)
          outUri = FileProvider.getUriForFile(
            this@MainActivity,
            "${applicationContext.packageName}.fileprovider",
            destFile
          )
        }

        conn.inputStream.use { input ->
          outputStream.use { output ->
            val buffer = ByteArray(64 * 1024)
            var read: Int
            var transferred = 0L
            var lastUpdate = System.currentTimeMillis()

            while (input.read(buffer).also { read = it } != -1) {
              output.write(buffer, 0, read)
              transferred += read

              val now = System.currentTimeMillis()
              if (now - lastUpdate > 800) {
                lastUpdate = now
                if (totalBytes > 0) {
                  val percent = ((transferred * 100) / totalBytes).toInt().coerceIn(0, 100)
                  notifBuilder.setProgress(100, percent, false).setContentText("$percent%")
                } else {
                  notifBuilder.setProgress(0, 0, true)
                }
                nm?.notify(notifId, notifBuilder.build())
              }
            }
            output.flush()
          }
        }

        // Finalize MediaStore pending flag
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && outUri != null) {
          val resolver = applicationContext.contentResolver
          val contentValues = ContentValues().apply {
            put(MediaStore.Downloads.IS_PENDING, 0)
          }
          resolver.update(outUri, contentValues, null, null)
        }

        // Trigger MediaScanner for legacy files
        if (localLegacyFile != null && localLegacyFile.exists()) {
          MediaScannerConnection.scanFile(
            applicationContext,
            arrayOf(localLegacyFile.absolutePath),
            null,
            null
          )
        }

        // Prepare opening intent
        val openIntent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(outUri, mimeType)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val pendingOpen = PendingIntent.getActivity(
          this@MainActivity,
          notifId,
          openIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val successNotif = NotificationCompat.Builder(this, CHANNEL_ID)
          .setSmallIcon(android.R.drawable.stat_sys_download_done)
          .setContentTitle("اكتمل التنزيل بنجاح")
          .setContentText("تم حفظ $displayName في مجلد Downloads")
          .setContentIntent(pendingOpen)
          .setAutoCancel(true)
          .setOngoing(false)
          .setProgress(0, 0, false)
          .build()

        nm?.notify(notifId, successNotif)

        runOnUiThread {
          Toast.makeText(
            applicationContext,
            "تم حفظ $displayName في مجلد التنزيلات بنجاح",
            Toast.LENGTH_LONG
          ).show()
        }
      } catch (e: Exception) {
        val failNotif = NotificationCompat.Builder(this, CHANNEL_ID)
          .setSmallIcon(android.R.drawable.stat_notify_error)
          .setContentTitle("فشل تنزيل: $displayName")
          .setContentText(e.message ?: "حدث خطأ أثناء التنزيل")
          .setAutoCancel(true)
          .setOngoing(false)
          .build()
        nm?.notify(notifId, failNotif)

        runOnUiThread {
          Toast.makeText(
            applicationContext,
            "فشل تنزيل $displayName: ${e.message}",
            Toast.LENGTH_LONG
          ).show()
        }
      }
    }
  }

  fun saveBlobNative(base64Data: String, rawFilename: String, mimeType: String) {
    downloadExecutor.execute {
      val cleanName = rawFilename.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
      val displayName = if (cleanName.isEmpty()) "file" else cleanName
      val finalMime = if (mimeType.isNotEmpty()) mimeType else guessMimeType(displayName)

      try {
        val bytes = Base64.decode(base64Data, Base64.DEFAULT)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val resolver = applicationContext.contentResolver
          val contentValues = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, displayName)
            put(MediaStore.Downloads.MIME_TYPE, finalMime)
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.Downloads.IS_PENDING, 1)
          }
          val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
          if (uri != null) {
            resolver.openOutputStream(uri)?.use { out ->
              out.write(bytes)
              out.flush()
            }
            contentValues.clear()
            contentValues.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, contentValues, null, null)
          }
        } else {
          val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
          if (!downloadsDir.exists()) downloadsDir.mkdirs()
          val destFile = File(downloadsDir, displayName)
          FileOutputStream(destFile).use { out ->
            out.write(bytes)
            out.flush()
          }
          MediaScannerConnection.scanFile(
            applicationContext,
            arrayOf(destFile.absolutePath),
            null,
            null
          )
        }

        runOnUiThread {
          Toast.makeText(
            applicationContext,
            "تم حفظ $displayName في مجلد التنزيلات",
            Toast.LENGTH_LONG
          ).show()
        }
      } catch (e: Exception) {
        runOnUiThread {
          Toast.makeText(
            applicationContext,
            "فشل حفظ $displayName: ${e.message}",
            Toast.LENGTH_LONG
          ).show()
        }
      }
    }
  }

  private fun acquireMulticastLock() {
    try {
      val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      multicastLock = wifi?.createMulticastLock("LocalDockMdnsLock")?.apply {
        setReferenceCounted(true)
        acquire()
      }
    } catch (_: Exception) {}
  }

  private fun requestPermissionsPipeline() {
    val needed = mutableListOf<String>()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      needed.add(Manifest.permission.READ_MEDIA_IMAGES)
      needed.add(Manifest.permission.READ_MEDIA_VIDEO)
      needed.add(Manifest.permission.READ_MEDIA_AUDIO)
      needed.add(Manifest.permission.POST_NOTIFICATIONS)
    } else {
      needed.add(Manifest.permission.READ_EXTERNAL_STORAGE)
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
        needed.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
      }
    }

    needed.add(Manifest.permission.CAMERA)

    val toRequest = needed.filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }

    if (toRequest.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, toRequest.toTypedArray(), PERMISSION_REQUEST_CODE)
    } else {
      checkAllFilesAccess()
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == PERMISSION_REQUEST_CODE) {
      checkAllFilesAccess()
    }
  }

  private fun checkAllFilesAccess() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      if (!Environment.isExternalStorageManager()) {
        try {
          val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
            data = Uri.parse("package:$packageName")
          }
          startActivity(intent)
        } catch (_: Exception) {
          try {
            val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
            startActivity(intent)
          } catch (_: Exception) {}
        }
      }
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      if (multicastLock?.isHeld == true) {
        multicastLock?.release()
      }
    } catch (_: Exception) {}
    try {
      downloadExecutor.shutdown()
    } catch (_: Exception) {}
  }

  companion object {
    private const val PERMISSION_REQUEST_CODE = 2001
    private const val CHANNEL_ID = "localdock_downloads"
  }
}
