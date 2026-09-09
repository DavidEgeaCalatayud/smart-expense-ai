const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withQuickAddWidget(config) {
  const packageName = config.android.package;
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!/^[a-zA-Z0-9_.]+$/.test(packageName) || !/^[a-zA-Z0-9-]+$/.test(scheme)) throw new Error('Invalid quick add package or scheme');
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application[0];
    application.receiver ??= [];
    if (!application.receiver.some((item) => item.$['android:name'] === '.QuickAddWidget')) {
      application.receiver.push({ $: { 'android:name': '.QuickAddWidget', 'android:exported': 'false', 'android:label': '@string/quick_add_widget_name' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
        'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/quick_add_widget_info' } }],
      });
    }
    const main = application.activity.find((item) => item.$['android:name'] === '.MainActivity');
    if (!main) throw new Error('Quick add requires MainActivity');
    main['meta-data'] ??= [];
    if (!main['meta-data'].some((item) => item.$['android:name'] === 'android.app.shortcuts')) {
      main['meta-data'].push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/quick_add_shortcuts' } });
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const root = path.join(mod.modRequest.platformProjectRoot, 'app/src/main');
    const write = async (name, content) => { const target = path.join(root, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content); };
    await write(`java/${packageName.replaceAll('.', '/')}/QuickAddWidget.kt`, `package ${packageName}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/** No account data is written to the launcher. Authentication and app lock protect both actions. */
class QuickAddWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            val views = RemoteViews(context.packageName, R.layout.quick_add_widget)
            listOf("expense" to R.id.quick_add_expense, "income" to R.id.quick_add_income).forEachIndexed { index, (type, viewId) ->
                val intent = Intent(context, MainActivity::class.java).apply {
                    action = Intent.ACTION_VIEW
                    data = Uri.parse("${scheme}://transactions?quickAdd=$type")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val pending = PendingIntent.getActivity(context, id * 2 + index, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(viewId, pending)
            }
            manager.updateAppWidget(id, views)
        }
    }
}
`);
    await write('res/xml/quick_add_widget_info.xml', `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="200dp" android:minHeight="100dp" android:targetCellWidth="3" android:targetCellHeight="2"
    android:updatePeriodMillis="0" android:initialLayout="@layout/quick_add_widget"
    android:previewLayout="@layout/quick_add_widget" android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" android:description="@string/quick_add_widget_description" />
`);
    await write('res/layout/quick_add_widget.xml', `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="match_parent"
    android:orientation="vertical" android:padding="16dp" android:background="@drawable/quick_add_background" android:gravity="center_vertical">
    <TextView android:layout_width="match_parent" android:layout_height="wrap_content" android:text="@string/quick_add_widget_name" android:textColor="#FFFFFF" android:textStyle="bold" android:textSize="16sp" android:paddingBottom="8dp" />
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal">
        <Button android:id="@+id/quick_add_expense" android:layout_width="0dp" android:layout_weight="1" android:layout_height="48dp" android:text="@string/quick_add_expense" android:textAllCaps="false" android:textColor="#125C47" android:backgroundTint="#E1F4E9" />
        <Button android:id="@+id/quick_add_income" android:layout_width="0dp" android:layout_weight="1" android:layout_height="48dp" android:layout_marginStart="8dp" android:text="@string/quick_add_income" android:textAllCaps="false" android:textColor="#125C47" android:backgroundTint="#E1F4E9" />
    </LinearLayout>
</LinearLayout>
`);
    await write('res/drawable/quick_add_background.xml', `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="#125C47" /><corners android:radius="24dp" /></shape>
`);
    await write('res/values/quick_add_strings.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="quick_add_widget_name">Smart Expense AI</string>
    <string name="quick_add_widget_description">Quickly add an expense or income. Your app lock still applies.</string>
    <string name="quick_add_expense">+ Expense</string>
    <string name="quick_add_income">+ Income</string>
    <string name="quick_add_expense_shortcut">Add expense</string>
    <string name="quick_add_income_shortcut">Add income</string>
</resources>
`);
    await write('res/xml/quick_add_shortcuts.xml', `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut android:shortcutId="add-expense" android:enabled="true" android:icon="@drawable/quick_add_expense_icon" android:shortcutShortLabel="@string/quick_add_expense_shortcut">
        <intent android:action="android.intent.action.VIEW" android:targetPackage="${packageName}" android:targetClass="${packageName}.MainActivity" android:data="${scheme}://transactions?quickAdd=expense" />
    </shortcut>
    <shortcut android:shortcutId="add-income" android:enabled="true" android:icon="@drawable/quick_add_income_icon" android:shortcutShortLabel="@string/quick_add_income_shortcut">
        <intent android:action="android.intent.action.VIEW" android:targetPackage="${packageName}" android:targetClass="${packageName}.MainActivity" android:data="${scheme}://transactions?quickAdd=income" />
    </shortcut>
</shortcuts>
`);
    for (const [kind, arrow] of [['expense', 'M12,4L12,20M5,13L12,20L19,13'], ['income', 'M12,20L12,4M5,11L12,4L19,11']]) {
      await write(`res/drawable/quick_add_${kind}_icon.xml`, `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="48dp" android:height="48dp" android:viewportWidth="24" android:viewportHeight="24"><path android:strokeColor="#125C47" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="${arrow}" /></vector>\n`);
    }
    return mod;
  }]);
};
