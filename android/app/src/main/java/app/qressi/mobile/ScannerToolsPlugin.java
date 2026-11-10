package app.qressi.mobile;

import android.content.Context;
import android.graphics.Outline;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.ViewTreeObserver;
import android.webkit.WebView;

import androidx.coordinatorlayout.widget.CoordinatorLayout;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScannerTools")
public class ScannerToolsPlugin extends Plugin {
    private View boundedPreview;
    private ViewGroup previewParent;
    private ViewTreeObserver.OnPreDrawListener previewGuard;

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            previewParent = (ViewGroup) getBridge().getWebView().getParent();
            previewGuard = () -> {
                for (int i = 0; i < previewParent.getChildCount(); i++) {
                    final View child = previewParent.getChildAt(i);
                    // ML Kit initially adds a full-screen view. Keep it hidden
                    // until setPreviewBounds has placed it in the inline window.
                    if (child != boundedPreview && child.getClass().getName().equals("androidx.camera.view.PreviewView")) {
                        child.setVisibility(View.INVISIBLE);
                    }
                }
                return true;
            };
            previewParent.getViewTreeObserver().addOnPreDrawListener(previewGuard);
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (previewParent != null && previewGuard != null && previewParent.getViewTreeObserver().isAlive()) {
            previewParent.getViewTreeObserver().removeOnPreDrawListener(previewGuard);
        }
        boundedPreview = null;
        previewGuard = null;
        previewParent = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void setPreviewBounds(final PluginCall call) {
        final Double left = call.getDouble("left");
        final Double top = call.getDouble("top");
        final Double width = call.getDouble("width");
        final Double height = call.getDouble("height");
        final Double viewportWidth = call.getDouble("viewportWidth");
        if (left == null || top == null || width == null || height == null || viewportWidth == null ||
            !Double.isFinite(left) || !Double.isFinite(top) || !Double.isFinite(width) ||
            !Double.isFinite(height) || !Double.isFinite(viewportWidth) || width <= 0 || height <= 0 || viewportWidth <= 0) {
            call.reject("Некорректный размер окна камеры");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                final WebView webView = getBridge().getWebView();
                final ViewGroup parent = (ViewGroup) webView.getParent();
                for (int i = 0; i < parent.getChildCount(); i++) {
                    final View child = parent.getChildAt(i);
                    // The ML Kit plugin owns the camera and its PreviewView.
                    if (!child.getClass().getName().equals("androidx.camera.view.PreviewView")) continue;
                    final double scale = webView.getWidth() / viewportWidth;
                    // addView converts the plugin's initial parameters to the
                    // parent's type. Preserve that type: replacing it with
                    // FrameLayout.LayoutParams crashes CoordinatorLayout on
                    // the next measure/layout pass, outside this callback.
                    final ViewGroup.LayoutParams params = child.getLayoutParams();
                    if (!(params instanceof ViewGroup.MarginLayoutParams)) {
                        call.reject("Контейнер не поддерживает размещение окна камеры");
                        return;
                    }
                    params.width = Math.max(1, (int) Math.round(width * scale));
                    params.height = Math.max(1, (int) Math.round(height * scale));
                    final ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) params;
                    margins.leftMargin = webView.getLeft() + (int) Math.round(left * scale);
                    margins.topMargin = webView.getTop() + (int) Math.round(top * scale);
                    margins.rightMargin = 0;
                    margins.bottomMargin = 0;
                    if (params instanceof CoordinatorLayout.LayoutParams) {
                        ((CoordinatorLayout.LayoutParams) params).gravity = Gravity.TOP | Gravity.LEFT;
                    }
                    child.setLayoutParams(params);
                    child.setOutlineProvider(new ViewOutlineProvider() {
                        @Override
                        public void getOutline(final View view, final Outline outline) {
                            outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), (float) (16 * scale));
                        }
                    });
                    child.setClipToOutline(true);
                    boundedPreview = child;
                    child.setVisibility(View.VISIBLE);
                    call.resolve();
                    return;
                }
                call.reject("Окно камеры ещё не создано");
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
