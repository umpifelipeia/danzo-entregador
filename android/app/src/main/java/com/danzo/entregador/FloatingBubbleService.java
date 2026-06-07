package com.danzo.entregador;

import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

/**
 * Bolinha flutuante (overlay tipo chat-head) do Danzo Entregador.
 * Arrastavel; toque traz o app para frente. Ao arrastar, surge um alvo "X" no
 * rodape — soltar a bolinha sobre ele a fecha (estilo iFood). Fechada, so volta
 * a aparecer quando o app for aberto novamente.
 */
public class FloatingBubbleService extends Service {

    public static final String ACTION_SHOW = "com.danzo.entregador.BUBBLE_SHOW";
    public static final String ACTION_HIDE = "com.danzo.entregador.BUBBLE_HIDE";

    // Mantido em nivel de classe: persiste enquanto o processo viver, mesmo que
    // o servico pare. Resetado ao esconder (app volta ao primeiro plano).
    private static boolean dismissed = false;

    private WindowManager windowManager;
    private View bubbleView;
    private View closeView;
    private WindowManager.LayoutParams params;

    private int size;
    private int closeSize;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_SHOW;
        if (ACTION_HIDE.equals(action)) {
            dismissed = false; // app em primeiro plano: permite mostrar de novo depois
            removeBubble();
            stopSelf();
        } else {
            if (dismissed) { stopSelf(); return START_NOT_STICKY; }
            showBubble();
        }
        return START_STICKY;
    }

    private void showBubble() {
        if (bubbleView != null) return;

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        size = dp(56);
        int iconSize = dp(36);

        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(Color.parseColor("#111111"));
        circle.setStroke(dp(2), Color.parseColor("#FFFFFF"));

        FrameLayout container = new FrameLayout(this);
        container.setBackground(circle);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            container.setElevation(dp(6));
        }

        ImageView icon = new ImageView(this);
        try {
            icon.setImageResource(getApplicationInfo().icon);
        } catch (Exception ignored) {}
        container.addView(icon, new FrameLayout.LayoutParams(iconSize, iconSize, Gravity.CENTER));

        bubbleView = container;

        params = new WindowManager.LayoutParams(
                size, size, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = dp(12);
        params.y = dp(120);

        attachTouch(container);

        try {
            windowManager.addView(bubbleView, params);
        } catch (Exception e) {
            bubbleView = null;
        }
    }

    private void attachTouch(View view) {
        view.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float touchX, touchY;
            private boolean moved;
            private final int slop = dp(8);

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        touchX = event.getRawX();
                        touchY = event.getRawY();
                        moved = false;
                        mostrarAlvoFechar();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (event.getRawX() - touchX);
                        int dy = (int) (event.getRawY() - touchY);
                        if (Math.abs(dx) > slop || Math.abs(dy) > slop) moved = true;
                        params.x = initialX + dx;
                        params.y = initialY + dy;
                        if (windowManager != null && bubbleView != null) {
                            windowManager.updateViewLayout(bubbleView, params);
                        }
                        destacarAlvo(sobreAlvoFechar());
                        return true;
                    case MotionEvent.ACTION_UP:
                        boolean fechar = moved && sobreAlvoFechar();
                        esconderAlvoFechar();
                        if (fechar) {
                            fecharBolha();
                        } else if (!moved) {
                            openApp();
                        }
                        return true;
                }
                return false;
            }
        });
    }

    private void fecharBolha() {
        dismissed = true;
        removeBubble();
        stopSelf();
    }

    private void mostrarAlvoFechar() {
        if (closeView != null) return;
        closeSize = dp(64);

        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.parseColor("#CC222222"));

        TextView x = new TextView(this);
        x.setText("✕"); // ✕
        x.setTextColor(Color.WHITE);
        x.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        x.setGravity(Gravity.CENTER);
        x.setBackground(bg);

        closeView = x;

        WindowManager.LayoutParams cp = new WindowManager.LayoutParams(
                closeSize, closeSize, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT);
        cp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        cp.y = dp(48);

        try {
            windowManager.addView(closeView, cp);
        } catch (Exception e) {
            closeView = null;
        }
    }

    private void esconderAlvoFechar() {
        if (closeView != null && windowManager != null) {
            try { windowManager.removeView(closeView); } catch (Exception ignored) {}
        }
        closeView = null;
    }

    private void destacarAlvo(boolean perto) {
        if (closeView == null) return;
        closeView.setScaleX(perto ? 1.3f : 1f);
        closeView.setScaleY(perto ? 1.3f : 1f);
    }

    // A bolinha esta sobre o alvo de fechar?
    private boolean sobreAlvoFechar() {
        if (params == null) return false;
        DisplayMetrics m = getResources().getDisplayMetrics();
        int bubbleCx = params.x + size / 2;
        int bubbleCy = params.y + size / 2;
        int alvoCx = m.widthPixels / 2;
        int alvoCy = m.heightPixels - dp(48) - closeSize / 2;
        double dist = Math.hypot(bubbleCx - alvoCx, bubbleCy - alvoCy);
        return dist < dp(75);
    }

    private void openApp() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(launch);
        }
    }

    private int overlayType() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
    }

    private void removeBubble() {
        if (bubbleView != null && windowManager != null) {
            try { windowManager.removeView(bubbleView); } catch (Exception ignored) {}
        }
        bubbleView = null;
    }

    @Override
    public void onDestroy() {
        esconderAlvoFechar();
        removeBubble();
        super.onDestroy();
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }
}
