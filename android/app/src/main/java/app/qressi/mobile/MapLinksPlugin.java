package app.qressi.mobile;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MapLinks")
public class MapLinksPlugin extends Plugin {
    @PluginMethod
    public void open(final PluginCall call) {
        final String value = call.getString("uri");
        if (value == null || value.length() > 4096 || !value.startsWith("geo:") || value.matches("(?s).*[\\x00-\\x1f].*")) {
            call.reject("Некорректная ссылка на местоположение");
            return;
        }
        final Uri uri = Uri.parse(value);
        final Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        // No package or provider-specific URL: Android uses the user's
        // default map app, or its normal resolver when no default is chosen.
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                call.resolve();
            } catch (final ActivityNotFoundException error) {
                call.reject("На устройстве нет приложения для открытия карты. Координаты можно скопировать.", error);
            } catch (final RuntimeException error) {
                call.reject("Не удалось открыть карту", error);
            }
        });
    }
}
