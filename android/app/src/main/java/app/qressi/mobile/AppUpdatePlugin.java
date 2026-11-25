package app.qressi.mobile;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String API_URL = "https://api.github.com/repos/dimared/qressi/releases/latest";
    private static final String RELEASE_URL = "https://github.com/dimared/qressi/releases/download/";
    private static final long CHECK_INTERVAL = 24 * 60 * 60 * 1000L;
    private static final long MAX_APK_SIZE = 200 * 1024 * 1024L;
    private static final Pattern VERSION = Pattern.compile("v?(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})");
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean openingInstaller;

    @Override
    public void load() {
        worker.execute(() -> {
            try {
                cleanupApks();
            } catch (final Exception ignored) {
                // Cache cleanup must never prevent the app from opening.
            }
        });
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("qressi-updates", Context.MODE_PRIVATE);
    }

    private DownloadManager downloads() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private void background(final PluginCall call, final String message, final Callable<JSObject> operation) {
        worker.execute(() -> {
            try {
                call.resolve(operation.call());
            } catch (final Exception error) {
                call.reject(message, error);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdown();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void check(final PluginCall call) {
        background(call, "Не удалось проверить обновления. Проверьте подключение к интернету.", () -> {
            JSObject current = state("idle", null);
            if (preferences().getLong("download-id", -1) != -1) {
                current = snapshot();
                if (current.getString("state").equals("downloading")) return current;
            }
            final long now = System.currentTimeMillis();
            final long lastCheck = preferences().getLong("last-check", 0);
            if (!Boolean.TRUE.equals(call.getBoolean("force", false)) && now >= lastCheck && now - lastCheck < CHECK_INTERVAL) {
                return current.getString("state").equals("ready") ? current : state("idle", null);
            }
            final JSONObject release = latestRelease();
            preferences().edit().putLong("last-check", now).apply();
            if (release == null) {
                clearDownload();
                preferences().edit().remove("release").apply();
                return state("idle", null);
            }
            final JSONObject previous = savedRelease();
            final boolean sameApk = previous != null &&
                previous.getString("version").equals(release.getString("version")) &&
                previous.getString("digest").equals(release.getString("digest")) &&
                previous.getLong("size") == release.getLong("size");
            if (!sameApk) clearDownload();
            preferences().edit().putString("release", release.toString()).apply();
            return state(sameApk && current.getString("state").equals("ready") ? "ready" : "available", release);
        });
    }

    @PluginMethod
    public void status(final PluginCall call) {
        background(call, "Не удалось проверить загрузку обновления.", this::snapshot);
    }

    @PluginMethod
    public void download(final PluginCall call) {
        background(call, "Не удалось начать загрузку обновления. Проверьте подключение и свободное место.", () -> {
            final JSONObject release = savedRelease();
            if (release == null) throw new IOException("Обновление недоступно");
            if (preferences().getLong("download-id", -1) != -1) {
                final JSObject current = snapshot();
                if (current.getString("state").equals("downloading") || current.getString("state").equals("ready")) return current;
            }
            clearDownload();
            final File destination = apkFile(release);
            if (destination.exists() && !destination.delete()) throw new IOException("Не удалось удалить старый APK");
            final DownloadManager.Request request = new DownloadManager.Request(Uri.parse(release.getString("url")))
                .setTitle("QRessi " + release.getString("version"))
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS,
                    "updates/QRessi-" + release.getString("version") + ".apk");
            final long id = downloads().enqueue(request);
            preferences().edit().putLong("download-id", id).apply();
            return state("downloading", release).put("progress", 0);
        });
    }

    @PluginMethod
    public void cancel(final PluginCall call) {
        background(call, "Не удалось отменить загрузку.", () -> {
            clearDownload();
            return state("idle", null);
        });
    }

    @PluginMethod
    public void install(final PluginCall call) {
        worker.execute(() -> {
            if (openingInstaller) {
                call.reject("Окно установки уже открывается.");
                return;
            }
            openingInstaller = true;
            try {
                final File apk = verifiedApk();
                getActivity().runOnUiThread(() -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                            final Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getContext().getPackageName()));
                            startActivityForResult(call, permission, "installPermissionReturned");
                            return;
                        }
                        final Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                        final Intent installer = new Intent(Intent.ACTION_VIEW)
                            .setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        getActivity().startActivity(installer);
                        openingInstaller = false;
                        call.resolve();
                    } catch (final Exception error) {
                        openingInstaller = false;
                        call.reject("Не удалось открыть установку. Разрешите QRessi устанавливать обновления.", error);
                    }
                });
            } catch (final Exception error) {
                openingInstaller = false;
                try {
                    clearDownload();
                } catch (final RuntimeException ignored) {
                    preferences().edit().remove("download-id").apply();
                }
                call.reject("Не удалось проверить APK. Скачайте обновление ещё раз.", error);
            }
        });
    }

    @ActivityCallback
    private void installPermissionReturned(final PluginCall call, final ActivityResult result) {
        openingInstaller = false;
        if (call == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Для обновления разрешите QRessi устанавливать приложения.");
            return;
        }
        install(call);
    }

    private JSObject state(final String name, final JSONObject release) throws Exception {
        final JSObject response = new JSObject().put("state", name);
        if (release != null) response.put("version", release.getString("version"));
        return response;
    }

    private void clearDownload() {
        final long id = preferences().getLong("download-id", -1);
        try {
            if (id != -1) downloads().remove(id);
        } finally {
            preferences().edit().remove("download-id").apply();
            try {
                final JSONObject release = savedRelease();
                if (release != null) {
                    final File file = apkFile(release);
                    if (file.isFile()) file.delete();
                }
            } catch (final Exception ignored) {
                // Startup also removes orphaned files from the update folder.
            }
        }
    }

    private void cleanupApks() throws Exception {
        final JSONObject release = savedRelease();
        final boolean keepDownload = release != null && newer(release.getString("version"), installedPackage().versionName);
        if (!keepDownload) {
            clearDownload();
            preferences().edit().remove("release").apply();
        }
        final File external = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (external == null) return;
        final File directory = new File(external, "updates");
        final File[] files = directory.listFiles();
        if (files == null) return;
        final File keep = keepDownload && preferences().getLong("download-id", -1) != -1 ? apkFile(release) : null;
        for (final File file : files) {
            if (file.isFile() && !file.equals(keep)) file.delete();
        }
    }

    private JSObject snapshot() throws Exception {
        final JSONObject release = savedRelease();
        if (release == null || !newer(release.getString("version"), installedPackage().versionName)) {
            clearDownload();
            preferences().edit().remove("release").apply();
            return state("idle", null);
        }
        final long id = preferences().getLong("download-id", -1);
        if (id == -1) return state("available", release);
        try (final Cursor cursor = downloads().query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor != null && cursor.moveToFirst()) {
                final int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status == DownloadManager.STATUS_SUCCESSFUL && apkFile(release).isFile()) return state("ready", release);
                if (status != DownloadManager.STATUS_FAILED && status != DownloadManager.STATUS_SUCCESSFUL) {
                    final long bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    final long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    return state("downloading", release).put("progress", total > 0 ? Math.min(100, bytes * 100 / total) : 0);
                }
            }
        }
        clearDownload();
        return state("available", release).put("error", "Загрузка прервалась. Попробуйте ещё раз.");
    }

    private JSONObject savedRelease() throws Exception {
        final String saved = preferences().getString("release", null);
        return saved == null ? null : new JSONObject(saved);
    }

    private File apkFile(final JSONObject release) throws Exception {
        final File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) throw new IOException("Хранилище недоступно");
        return new File(directory, "updates/QRessi-" + release.getString("version") + ".apk");
    }

    private JSONObject latestRelease() throws Exception {
        final HttpURLConnection connection = (HttpURLConnection) new URL(API_URL).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        connection.setRequestProperty("User-Agent", "QRessi-Android");
        try {
            final int code = connection.getResponseCode();
            if (code == 404) return null;
            if (code != 200) throw new IOException("GitHub HTTP " + code);
            final ByteArrayOutputStream body = new ByteArrayOutputStream();
            try (final InputStream input = connection.getInputStream()) {
                final byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (body.size() + count > 1024 * 1024) throw new IOException("Слишком большой ответ GitHub");
                    body.write(buffer, 0, count);
                }
            }
            final JSONObject result = new JSONObject(body.toString(StandardCharsets.UTF_8.name()));
            final String tag = result.optString("tag_name");
            if (result.optBoolean("draft") || result.optBoolean("prerelease") || !VERSION.matcher(tag).matches()) return null;
            final String version = tag.startsWith("v") ? tag.substring(1) : tag;
            if (!newer(version, installedPackage().versionName)) return null;
            final JSONArray assets = result.getJSONArray("assets");
            for (int index = 0; index < assets.length(); index++) {
                final JSONObject asset = assets.getJSONObject(index);
                final String url = RELEASE_URL + tag + "/QRessi.apk";
                final long size = asset.optLong("size");
                if (!asset.optString("name").equals("QRessi.apk") || !asset.optString("browser_download_url").equals(url) ||
                    !asset.optString("state").equals("uploaded") || size <= 0 || size > MAX_APK_SIZE) continue;
                final String digest = asset.optString("digest", "");
                return new JSONObject().put("version", version).put("url", url).put("size", size)
                    .put("digest", digest.matches("sha256:[a-f0-9]{64}") ? digest.substring(7) : "");
            }
            return null;
        } finally {
            connection.disconnect();
        }
    }

    private boolean newer(final String candidate, final String current) {
        if (current == null || !VERSION.matcher(candidate).matches() || !VERSION.matcher(current).matches()) return false;
        final String[] next = candidate.replaceFirst("^v", "").split("\\.");
        final String[] installed = current.replaceFirst("^v", "").split("\\.");
        for (int index = 0; index < 3; index++) {
            final long a = Long.parseLong(next[index]);
            final long b = Long.parseLong(installed[index]);
            if (a != b) return a > b;
        }
        return false;
    }

    @SuppressWarnings("deprecation")
    private PackageInfo installedPackage() throws Exception {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), signatureFlags());
    }

    @SuppressWarnings("deprecation")
    private int signatureFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    @SuppressWarnings("deprecation")
    private Signature[] signatures(final PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null
            ? info.signingInfo.getApkContentsSigners() : info.signatures;
    }

    @SuppressWarnings("deprecation")
    private File verifiedApk() throws Exception {
        final JSONObject release = savedRelease();
        if (release == null || !snapshot().getString("state").equals("ready")) throw new IOException("APK ещё не загружен");
        final File file = apkFile(release);
        if (file.length() != release.getLong("size")) throw new IOException("Размер APK не совпадает");
        final String expected = release.getString("digest");
        if (!expected.isEmpty()) {
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (final InputStream input = new FileInputStream(file)) {
                final byte[] buffer = new byte[65536];
                int count;
                while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
            }
            final StringBuilder hash = new StringBuilder();
            for (final byte value : digest.digest()) hash.append(String.format("%02x", value & 0xff));
            if (!hash.toString().equals(expected)) throw new IOException("Контрольная сумма APK не совпадает");
        }
        final PackageManager manager = getContext().getPackageManager();
        final PackageInfo archive = manager.getPackageArchiveInfo(file.getAbsolutePath(), signatureFlags());
        final PackageInfo installed = installedPackage();
        if (archive == null || !installed.packageName.equals(archive.packageName) ||
            !release.getString("version").equals(archive.versionName)) throw new IOException("APK другого приложения или версии");
        final long nextCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? archive.getLongVersionCode() : archive.versionCode;
        final long currentCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? installed.getLongVersionCode() : installed.versionCode;
        if (nextCode <= currentCode) throw new IOException("APK не является обновлением");
        final Signature[] nextSigners = signatures(archive);
        final Signature[] currentSigners = signatures(installed);
        if (nextSigners == null || currentSigners == null || nextSigners.length == 0 ||
            !new HashSet<>(Arrays.asList(nextSigners)).equals(new HashSet<>(Arrays.asList(currentSigners)))) {
            throw new IOException("Подпись APK не совпадает");
        }
        return file;
    }
}
