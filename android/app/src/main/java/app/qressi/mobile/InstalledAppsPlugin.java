package app.qressi.mobile;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.text.Collator;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "InstalledApps")
public class InstalledAppsPlugin extends Plugin {
    @PluginMethod
    public void icon(final PluginCall call) {
        final String packageName = call.getString("packageName");
        if (packageName == null || packageName.isEmpty() || packageName.length() > 255) {
            call.reject("Не указано приложение");
            return;
        }
        Bitmap bitmap = null;
        try {
            // Draw Drawable rather than casting to BitmapDrawable: launchers
            // can expose adaptive, vector, and bitmap icons.
            final Drawable icon = getContext().getPackageManager().getApplicationIcon(packageName).mutate();
            bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
            icon.setBounds(0, 0, bitmap.getWidth(), bitmap.getHeight());
            icon.draw(new Canvas(bitmap));
            try (final ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)) throw new IllegalStateException("Не удалось подготовить иконку");
                final JSObject result = new JSObject();
                result.put("dataUrl", "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
                call.resolve(result);
            }
        } catch (final Exception error) {
            call.reject("Не удалось загрузить иконку приложения", error);
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }

    @PluginMethod
    public void list(final PluginCall call) {
        try {
            final PackageManager manager = getContext().getPackageManager();
            final Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_LAUNCHER);
            final List<ResolveInfo> activities = new ArrayList<>(manager.queryIntentActivities(intent, 0));
            final Collator collator = Collator.getInstance();
            activities.sort((a, b) -> collator.compare(a.loadLabel(manager).toString(), b.loadLabel(manager).toString()));
            final JSArray apps = new JSArray();
            final Set<String> seen = new HashSet<>();
            for (final ResolveInfo activity : activities) {
                final String packageName = activity.activityInfo.packageName;
                if (!seen.add(packageName)) continue;
                final JSObject app = new JSObject();
                app.put("name", activity.loadLabel(manager).toString());
                app.put("packageName", packageName);
                apps.put(app);
            }
            final JSObject result = new JSObject();
            result.put("apps", apps);
            call.resolve(result);
        } catch (final Exception error) {
            call.reject("Не удалось получить список приложений", error);
        }
    }
}
