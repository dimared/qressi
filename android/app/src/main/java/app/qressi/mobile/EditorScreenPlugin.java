package app.qressi.mobile;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "EditorScreen")
public class EditorScreenPlugin extends Plugin {
    // Ephemeral form state stays in-process, like React state. Images and QR
    // payloads are not passed through Android's size-limited Intent extras.
    private static volatile JSObject launchEntry;
    private static volatile JSObject draft;
    private volatile PluginCall pendingOpen;

    @PluginMethod
    public void open(final PluginCall call) {
        if (pendingOpen != null || getActivity() instanceof EditorActivity) {
            call.reject("Редактор уже открыт");
            return;
        }
        pendingOpen = call;
        launchEntry = call.getObject("entry");
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(getContext(), EditorActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_NO_ANIMATION));
                getActivity().overridePendingTransition(0, 0);
            } catch (final RuntimeException error) {
                pendingOpen = null;
                call.reject("Не удалось открыть редактор", error);
            }
        });
    }

    @PluginMethod
    public void launchData(final PluginCall call) {
        final JSObject result = new JSObject();
        if (getActivity() instanceof EditorActivity) {
            result.put("entry", launchEntry);
            result.put("draft", draft);
        } else {
            result.put("tab", "history".equals(getActivity().getIntent().getStringExtra("tab")) ? "history" : "scan");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void close(final PluginCall call) {
        if (!(getActivity() instanceof EditorActivity)) {
            call.reject("Редактор не открыт");
            return;
        }
        final String tab = "history".equals(call.getString("tab")) ? "history" : "scan";
        draft = call.getObject("draft");
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(getContext(), MainActivity.class)
                    .putExtra("tab", tab)
                    .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_NO_ANIMATION));
                getActivity().overridePendingTransition(0, 0);
                call.resolve();
            } catch (final RuntimeException error) {
                call.reject("Не удалось вернуться из редактора", error);
            }
        });
    }

    void returned(final String tab) {
        final PluginCall call = pendingOpen;
        pendingOpen = null;
        launchEntry = null;
        if (call == null) return;
        final JSObject response = new JSObject();
        response.put("tab", "history".equals(tab) ? "history" : "scan");
        call.resolve(response);
    }

    void reopened() {
        final JSObject data = new JSObject();
        data.put("entry", launchEntry);
        notifyListeners("opened", data);
    }

    @Override
    protected void handleOnDestroy() {
        pendingOpen = null;
        super.handleOnDestroy();
    }
}
