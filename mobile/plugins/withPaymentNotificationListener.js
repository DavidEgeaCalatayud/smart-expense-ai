const { withAndroidManifest, withDangerousMod, withMainApplication } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const kotlinAmountPattern = String.raw`(?:€|\bEUR\b|\bUSD\b|\x24|\bGBP\b|£)\s*\d|\d[\d., ]*\s*(?:€|\bEUR\b|\bUSD\b|\x24|\bGBP\b|£)`;
const kotlinSensitivePattern = String.raw`\bc[oó]digo\b.{0,40}\b\d{4,8}\b|\b\d{4,8}\b.{0,40}\b(?:c[oó]digo|otp|verificaci[oó]n)\b|c[oó]digo(?: de)? (?:acceso|verificaci[oó]n|seguridad)|\botp\b|verification code|one[- ]time password|contrase(?:ñ|n)a|password|\bpin\b|clave(?: de)? (?:firma|seguridad|acceso)`;

module.exports = function withPaymentNotificationListener(config) {
  const packageName = config.android?.package;
  if (!packageName || !/^[a-zA-Z0-9_.]+$/.test(packageName)) {
    throw new Error('Payment notification listener requires a valid Android package');
  }

  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('Payment notification listener requires the generated Kotlin MainApplication');
    }
    let source = mod.modResults.contents;
    if (source.includes('PaymentNotificationPackage()')) return mod;

    const applyNeedle = 'PackageList(this).packages.apply {';
    if (source.includes(applyNeedle)) {
      source = source.replace(applyNeedle, `${applyNeedle}\n              add(PaymentNotificationPackage())`);
    } else if (source.includes('PackageList(this).packages')) {
      source = source.replace(
        'PackageList(this).packages',
        'PackageList(this).packages.apply { add(PaymentNotificationPackage()) }',
      );
    } else {
      throw new Error('Unable to register PaymentNotificationPackage in MainApplication');
    }
    mod.modResults.contents = source;
    return mod;
  });

  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error('Payment notification listener requires an Android application');
    application.service ??= [];

    if (!application.service.some((item) => item.$?.['android:name'] === '.PaymentNotificationListenerService')) {
      application.service.push({
        $: {
          'android:name': '.PaymentNotificationListenerService',
          'android:label': 'Smart Expense AI payment detection',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.service.notification.NotificationListenerService' } }],
        }],
      });
    }

    if (!application.service.some((item) => item.$?.['android:name'] === '.PaymentDetectionHeadlessService')) {
      application.service.push({
        $: {
          'android:name': '.PaymentDetectionHeadlessService',
          'android:exported': 'false',
        },
      });
    }
    return mod;
  });

  return withDangerousMod(config, ['android', async (mod) => {
    const root = path.join(mod.modRequest.platformProjectRoot, 'app/src/main');
    const javaRoot = `java/${packageName.replaceAll('.', '/')}`;
    const write = async (name, content) => {
      const target = path.join(root, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content);
    };

    await write(`${javaRoot}/PaymentNotificationStore.kt`, `package ${packageName}

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object PaymentNotificationStore {
    private const val PREFS = "smart_expense_payment_notifications_v1"
    private const val KEY_ENABLED = "capture_enabled"
    private const val KEY_QUEUE = "candidate_queue"
    private const val MAX_CANDIDATES = 100

    fun isCaptureEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

    fun setCaptureEnabled(context: Context, enabled: Boolean) {
        val editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_ENABLED, enabled)
        if (!enabled) editor.remove(KEY_QUEUE)
        editor.apply()
    }

    @Synchronized
    fun append(context: Context, candidate: JSONObject) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val current = runCatching { JSONArray(prefs.getString(KEY_QUEUE, "[]") ?: "[]") }
            .getOrElse { JSONArray() }
        val key = candidate.optString("notificationKey")
        for (index in 0 until current.length()) {
            if (current.optJSONObject(index)?.optString("notificationKey") == key) return
        }
        current.put(candidate)
        val trimmed = JSONArray()
        val start = (current.length() - MAX_CANDIDATES).coerceAtLeast(0)
        for (index in start until current.length()) trimmed.put(current.get(index))
        prefs.edit().putString(KEY_QUEUE, trimmed.toString()).apply()
    }

    @Synchronized
    fun pending(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_QUEUE, "[]") ?: "[]"

    @Synchronized
    fun acknowledge(context: Context, notificationKey: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val current = runCatching { JSONArray(prefs.getString(KEY_QUEUE, "[]") ?: "[]") }
            .getOrElse { JSONArray() }
        val remaining = JSONArray()
        for (index in 0 until current.length()) {
            val value = current.optJSONObject(index) ?: continue
            if (value.optString("notificationKey") != notificationKey) remaining.put(value)
        }
        prefs.edit().putString(KEY_QUEUE, remaining.toString()).apply()
    }
}
`);

    await write(`${javaRoot}/PaymentNotificationListenerService.kt`, `package ${packageName}

import android.app.Notification
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.HeadlessJsTaskService
import org.json.JSONObject
import java.util.Locale

class PaymentNotificationListenerService : NotificationListenerService() {
    private val amountPattern = Regex("""${kotlinAmountPattern}""", RegexOption.IGNORE_CASE)
    private val paymentPattern = Regex("pago|pagado|compra|tarjeta|wallet|bizum|transfer|cargo|reembolso|devoluci|refund|purchase|paid|payment|card|received|sent|retenci|preautoriz|authori", RegexOption.IGNORE_CASE)
    private val sensitivePattern = Regex("""${kotlinSensitivePattern}""", RegexOption.IGNORE_CASE)
    private val knownWalletPackages = setOf("com.google.android.apps.walletnfcrel")
    private val privateConversationCategories = setOf(
        Notification.CATEGORY_MESSAGE,
        Notification.CATEGORY_EMAIL,
        Notification.CATEGORY_SOCIAL,
    )

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!PaymentNotificationStore.isCaptureEnabled(this)) return
        if (sbn.packageName == packageName) return

        val notification = sbn.notification ?: return
        // Do not ingest human conversations just because someone writes "te pago 20 €".
        // Financial apps normally use status/service categories; Wallet is explicitly known.
        if (
            !knownWalletPackages.contains(sbn.packageName)
            && notification.category != null
            && privateConversationCategories.contains(notification.category)
        ) return
        val extras = notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty().take(300)
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty().take(600)
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty().take(900)
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            ?.joinToString(" ") { it.toString() }
            .orEmpty()
            .take(900)
        val combined = listOf(title, text, bigText, lines).filter { it.isNotBlank() }.joinToString(" ")
        val isKnownWallet = knownWalletPackages.contains(sbn.packageName)
        if (combined.isBlank() || !amountPattern.containsMatchIn(combined)) return
        if (!isKnownWallet && !paymentPattern.containsMatchIn(combined)) return
        if (sensitivePattern.containsMatchIn(combined)) return

        val sourceLabel = runCatching {
            val info = packageManager.getApplicationInfo(sbn.packageName, 0)
            packageManager.getApplicationLabel(info).toString()
        }.getOrDefault(sbn.packageName)

        // Android may update one notification in-place while keeping StatusBarNotification.key.
        // Include a content revision so "pending" -> "completed" is delivered again, while an
        // identical repost still collapses to the same candidate key.
        val revision = Integer.toHexString(combined.hashCode())
        val notificationKey = "${'$'}{sbn.key.take(270)}#rev=${'$'}revision"
        val candidate = JSONObject().apply {
            put("sourcePackage", sbn.packageName)
            put("sourceLabel", sourceLabel.take(120))
            put("notificationKey", notificationKey)
            put("notificationId", sbn.id)
            put("occurredAt", sbn.postTime)
            put("title", title)
            put("text", if (bigText.isNotBlank()) bigText else if (lines.isNotBlank()) lines else text)
            put("category", notification.category ?: "")
            put("capturedAt", System.currentTimeMillis())
            put("locale", Locale.getDefault().toLanguageTag())
        }
        PaymentNotificationStore.append(this, candidate)

        val intent = Intent(this, PaymentDetectionHeadlessService::class.java).apply {
            putExtra("candidate_json", candidate.toString())
        }
        runCatching {
            startService(intent)
            HeadlessJsTaskService.acquireWakeLockNow(this)
        }
    }
}
`);

    await write(`${javaRoot}/PaymentDetectionHeadlessService.kt`, `package ${packageName}

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class PaymentDetectionHeadlessService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val candidate = intent?.getStringExtra("candidate_json") ?: return null
        val data = Arguments.createMap().apply { putString("candidateJson", candidate) }
        return HeadlessJsTaskConfig(
            "SmartExpensePaymentDetection",
            data,
            30_000L,
            true,
        )
    }
}
`);

    await write(`${javaRoot}/PaymentNotificationModule.kt`, `package ${packageName}

import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PaymentNotificationModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "PaymentNotification"

    @ReactMethod
    fun isNotificationAccessGranted(promise: Promise) {
        promise.resolve(NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName))
    }

    @ReactMethod
    fun openNotificationAccessSettings(promise: Promise) {
        runCatching {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        }.onSuccess { promise.resolve(true) }
            .onFailure { promise.reject("notification_settings", it) }
    }

    @ReactMethod
    fun setCaptureEnabled(enabled: Boolean, promise: Promise) {
        PaymentNotificationStore.setCaptureEnabled(context, enabled)
        promise.resolve(enabled)
    }

    @ReactMethod
    fun isCaptureEnabled(promise: Promise) {
        promise.resolve(PaymentNotificationStore.isCaptureEnabled(context))
    }

    @ReactMethod
    fun getPendingCandidates(promise: Promise) {
        promise.resolve(PaymentNotificationStore.pending(context))
    }

    @ReactMethod
    fun acknowledgeCandidate(notificationKey: String, promise: Promise) {
        PaymentNotificationStore.acknowledge(context, notificationKey)
        promise.resolve(true)
    }
}
`);

    await write(`${javaRoot}/PaymentNotificationPackage.kt`, `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class PaymentNotificationPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(PaymentNotificationModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
`);

    return mod;
  }]);
};
