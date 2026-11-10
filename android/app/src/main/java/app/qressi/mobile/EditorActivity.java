package app.qressi.mobile;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.PluginHandle;

public class EditorActivity extends BridgeActivity {
    private boolean created;
    @Override
    public void onCreate(final Bundle savedInstanceState) {
        config = new CapConfig.Builder(this)
            .setStartPath("/?screen=editor")
            .setBackgroundColor("#202020")
            .create();
        registerPlugin(EditorScreenPlugin.class);
        registerPlugin(FileExportPlugin.class);
        registerPlugin(InstalledAppsPlugin.class);
        registerPlugin(MapLinksPlugin.class);
        super.onCreate(savedInstanceState);
        // This WebView never hosts the camera. Its emulator workaround cannot
        // change the scanner's acceleration, transparency, or view hierarchy.
        if (getBridge() != null && (Build.HARDWARE.equals("ranchu") || Build.HARDWARE.equals("goldfish"))) {
            getBridge().getWebView().setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }
        created = true;
        Log.i("QRessiScreens", "Editor created");
    }

    @Override
    protected void onNewIntent(final Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (created && getBridge() != null) {
            final PluginHandle plugin = getBridge().getPlugin("EditorScreen");
            if (plugin != null) ((EditorScreenPlugin) plugin.getInstance()).reopened();
            Log.i("QRessiScreens", "Editor reused");
        }
    }
}
