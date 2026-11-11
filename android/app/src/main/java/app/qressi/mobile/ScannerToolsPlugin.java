package app.qressi.mobile;

import android.content.Context;
import android.graphics.Outline;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.ViewTreeObserver;
import android.webkit.WebView;

import androidx.camera.view.PreviewView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScannerTools")
public class ScannerToolsPlugin extends Plugin {
    private WebView webView;
    private PreviewView preview;
    private ViewGroup previewParent;
    private boolean previewPositioned;
    private int previewX;
    private int previewY;
    private float previewRadius;
    private final ViewTreeObserver.OnPreDrawListener positionPreview = () -> {
        if (preview != null && previewPositioned) {
            // Position after layout so parent padding and window insets do not
            // get added again to the WebView-relative coordinates.
            preview.setX(webView.getX() + previewX);
            preview.setY(webView.getY() + previewY);
        }
        return true;
    };

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            webView = getBridge().getWebView();
            previewParent = (ViewGroup) webView.getParent();
            previewParent.setOnHierarchyChangeListener(new ViewGroup.OnHierarchyChangeListener() {
                @Override
                public void onChildViewAdded(final View parent, final View child) {
                    if (!(child instanceof PreviewView cameraPreview)) return;
                    // ML Kit adds the view before binding CameraX. Configure
                    // clipping and composition before it requests a surface.
                    preview = cameraPreview;
                    previewPositioned = false;
                    preview.setVisibility(View.INVISIBLE);
                    preview.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
                    preview.setOutlineProvider(new ViewOutlineProvider() {
                        @Override
                        public void getOutline(final View view, final Outline outline) {
                            outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), previewRadius);
                        }
                    });
                    preview.setClipToOutline(true);
                }

                @Override
                public void onChildViewRemoved(final View parent, final View child) {
                    if (child == preview) {
                        preview = null;
                        previewPositioned = false;
                    }
                }
            });
            previewParent.getViewTreeObserver().addOnPreDrawListener(positionPreview);
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (previewParent != null) {
            previewParent.setOnHierarchyChangeListener(null);
            if (previewParent.getViewTreeObserver().isAlive()) {
                previewParent.getViewTreeObserver().removeOnPreDrawListener(positionPreview);
            }
        }
        preview = null;
        webView = null;
        previewParent = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void setPreviewBounds(final PluginCall call) {
        final Double left = call.getDouble("left");
        final Double top = call.getDouble("top");
        final Double width = call.getDouble("width");
        final Double height = call.getDouble("height");
        final Double scale = call.getDouble("scale");
        if (left == null || top == null || width == null || height == null || scale == null ||
            !Double.isFinite(left) || !Double.isFinite(top) || !Double.isFinite(width) ||
            !Double.isFinite(height) || !Double.isFinite(scale) || width <= 0 || height <= 0 || scale <= 0) {
            call.reject("Некорректный размер окна камеры");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                if (preview == null) {
                    call.reject("Окно камеры ещё не создано");
                    return;
                }
                previewX = (int) Math.round(left * scale);
                previewY = (int) Math.round(top * scale);
                final int pixelWidth = Math.max(1, (int) (Math.round((left + width) * scale) - previewX));
                final int pixelHeight = Math.max(1, (int) (Math.round((top + height) * scale) - previewY));
                final ViewGroup.LayoutParams params = preview.getLayoutParams();
                if (params.width != pixelWidth || params.height != pixelHeight) {
                    params.width = pixelWidth;
                    params.height = pixelHeight;
                    preview.setLayoutParams(params);
                }
                previewRadius = (float) (16 * scale);
                preview.invalidateOutline();
                previewPositioned = true;
                positionPreview.onPreDraw();
                preview.setVisibility(View.VISIBLE);
                call.resolve();
            } catch (final RuntimeException error) {
                call.reject("Не удалось настроить окно камеры", error);
            }
        });
    }

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void vibrate(final PluginCall call) {
        final Vibrator vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(45, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(45);
            }
        }
        call.resolve();
    }
}
