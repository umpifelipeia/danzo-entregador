package com.danzo.entregador;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte JS -> nativo para a bolinha flutuante.
 * Metodos: checkPermission, requestPermission, show, hide.
 */
@CapacitorPlugin(name = "FloatingBubble")
public class FloatingBubblePlugin extends Plugin {

    private boolean temPermissao() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(getContext());
        }
        return true;
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", temPermissao());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (temPermissao()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject ret = new JSObject();
        ret.put("granted", false);
        ret.put("opened", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (!temPermissao()) {
            call.reject("Sem permissao de sobreposicao");
            return;
        }
        Intent intent = new Intent(getContext(), FloatingBubbleService.class);
        intent.setAction(FloatingBubbleService.ACTION_SHOW);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        Intent intent = new Intent(getContext(), FloatingBubbleService.class);
        intent.setAction(FloatingBubbleService.ACTION_HIDE);
        getContext().startService(intent);
        call.resolve();
    }
}
