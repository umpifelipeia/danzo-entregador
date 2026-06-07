package com.danzo.entregador;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Ponte JS -> nativo para push (FCM): obter token e pedir permissao de
 * notificacao (POST_NOTIFICATIONS, Android 13+).
 */
@CapacitorPlugin(
        name = "PushDanzo",
        permissions = {
                @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
        }
)
public class PushPlugin extends Plugin {

    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful() || task.getResult() == null) {
                        call.reject("Falha ao obter token FCM");
                        return;
                    }
                    JSObject ret = new JSObject();
                    ret.put("token", task.getResult());
                    call.resolve(ret);
                });
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
        requestPermissionForAlias("notifications", call, "permCallback");
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", temPermissao());
        call.resolve(ret);
    }

    private boolean temPermissao() {
        if (Build.VERSION.SDK_INT < 33) return true; // antes do Android 13 nao precisa
        return getPermissionState("notifications") == PermissionState.GRANTED;
    }
}
