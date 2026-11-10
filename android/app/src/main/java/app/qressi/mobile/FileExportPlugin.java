package app.qressi.mobile;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {
    private volatile boolean choosingFile = false;

    @PluginMethod
    public void save(final PluginCall call) {
        final String data = call.getString("data");
        final String filename = call.getString("filename");
        final String mimeType = call.getString("mimeType");
        if (data == null || filename == null || filename.isEmpty() || filename.contains("/") ||
            filename.contains("\\") || mimeType == null || mimeType.isEmpty()) {
            call.reject("Не удалось подготовить файл");
            return;
        }
        final boolean gallery = Boolean.TRUE.equals(call.getBoolean("gallery", false));
        if (gallery && !mimeType.equals("image/png")) {
            call.reject("В галерею можно сохранить только PNG");
            return;
        }
        if (gallery && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveToGallery(call, filename, data);
            return;
        }
        // Older Android versions use the system save dialog instead of asking
        // for broad WRITE_EXTERNAL_STORAGE access to the user's gallery.
        if (choosingFile) {
            call.reject("Сначала завершите сохранение предыдущего файла");
            return;
        }
        choosingFile = true;
        final Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        getActivity().runOnUiThread(() -> {
            try {
                startActivityForResult(call, intent, "fileCreated");
            } catch (final Exception error) {
                choosingFile = false;
                call.reject("Не удалось открыть окно сохранения файла", error);
            }
        });
    }

    private void saveToGallery(final PluginCall call, final String filename, final String data) {
        final ContentResolver resolver = getContext().getContentResolver();
        Uri uri = null;
        try {
            final byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            final ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            values.put(MediaStore.Images.Media.DATE_TAKEN, System.currentTimeMillis());
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/QRessi");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("Не удалось создать изображение");
            write(resolver, uri, bytes);
            final ContentValues published = new ContentValues();
            published.put(MediaStore.Images.Media.IS_PENDING, 0);
            if (resolver.update(uri, published, null, null) != 1) throw new IOException("Не удалось завершить сохранение");
            resolveSaved(call, "gallery");
        } catch (final Exception error) {
            if (uri != null) {
                try { resolver.delete(uri, null, null); } catch (final Exception ignored) {}
            }
            call.reject("Не удалось сохранить PNG в галерею. Проверьте свободное место.", error);
        }
    }

    @ActivityCallback
    private void fileCreated(final PluginCall call, final ActivityResult result) {
        choosingFile = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            final JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        final Uri uri = result.getData().getData();
        getBridge().execute(() -> {
            try {
                final String data = call.getString("data");
                if (data == null) throw new IOException("Нет данных для записи");
                write(getContext().getContentResolver(), uri, Base64.decode(data, Base64.DEFAULT));
                resolveSaved(call, "file");
            } catch (final Exception error) {
                // ACTION_CREATE_DOCUMENT creates a new document, never replaces
                // an existing one. Remove only this incomplete new document.
                try { getContext().getContentResolver().delete(uri, null, null); } catch (final Exception ignored) {}
                call.reject("Не удалось записать файл. Проверьте свободное место.", error);
            }
        });
    }

    private void write(final ContentResolver resolver, final Uri uri, final byte[] bytes) throws IOException {
        try (final OutputStream output = resolver.openOutputStream(uri, "w")) {
            if (output == null) throw new IOException("Не удалось открыть файл для записи");
            output.write(bytes);
        }
    }

    private void resolveSaved(final PluginCall call, final String destination) {
        final JSObject response = new JSObject();
        response.put("saved", true);
        response.put("destination", destination);
        call.resolve(response);
    }
}
