package com.danzo.entregador;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Auto-atualizacao do app (sem Play Store): baixa o APK novo do GitHub
 * Releases e abre o instalador do Android. A assinatura precisa ser a mesma
 * (keystore de release) para o sistema aceitar como atualizacao.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    /** Versao instalada (pro JS comparar com a ultima release publicada). */
    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo pi = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            JSObject ret = new JSObject();
            ret.put("versionName", pi.versionName);
            ret.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? pi.getLongVersionCode() : pi.versionCode);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Falha ao ler versão: " + e.getMessage());
        }
    }

    /** Baixa o APK da URL e abre o instalador do sistema. */
    @PluginMethod
    public void baixarEInstalar(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Campo 'url' é obrigatório");
            return;
        }

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                File apk = new File(getContext().getCacheDir(), "danzo-update.apk");
                if (apk.exists()) apk.delete();

                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                conn.connect();

                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }

                Uri uri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        apk);

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().startActivity(intent);

                call.resolve();
            } catch (Exception e) {
                call.reject("Falha ao baixar/instalar: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }
}
