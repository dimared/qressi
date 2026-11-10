package app.qressi.mobile;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(final Bundle savedInstanceState) {
        registerPlugin(EditorScreenPlugin.class);
        registerPlugin(FileExportPlugin.class);
        registerPlugin(InstalledAppsPlugin.class);
        registerPlugin(MapLinksPlugin.class);
        registerPlugin(ScannerToolsPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView().getParent() instanceof View) {
            // The bounded camera sits behind the transparent WebView. A solid
            // native canvas removes the need for a full-screen CSS cutout.
            ((View) getBridge().getWebView().getParent()).setBackgroundColor(0xff202020);
        }
    }

    @Override
    protected void onNewIntent(final Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.hasExtra("tab") && getBridge() != null) {
            final PluginHandle plugin = getBridge().getPlugin("EditorScreen");
            if (plugin != null) ((EditorScreenPlugin) plugin.getInstance()).returned(intent.getStringExtra("tab"));
        }
    }
}
