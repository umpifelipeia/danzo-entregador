package com.danzo.entregador;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Recebe os pushes FCM (mensagens data-only de alta prioridade) e:
 *  - toca o som de "novo pedido" via canal de notificacao dedicado;
 *  - mostra notificacao com full-screen intent (abre o app na tela bloqueada);
 *  - se tiver permissao de sobreposicao, traz o app para frente direto.
 */
public class DanzoMessagingService extends FirebaseMessagingService {

    // v2: o canal antigo "danzo_pedidos" podia ter sido criado SEM som numa versão
    // anterior, e canais de notificação NÃO mudam depois de criados. Trocar o id
    // força a criação de um canal novo com som garantido (vibra mas não tocava).
    public static final String CHANNEL_ID = "danzo_pedidos_v2";
    public static final String CHANNEL_ID_LEGADO = "danzo_pedidos";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String titulo = data.get("titulo");
        String corpo = data.get("corpo");
        if (titulo == null) titulo = "Novo pedido";
        if (corpo == null) corpo = "Voce tem um novo pedido para entrega.";

        criarCanal();

        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        }

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(this, 0, launch, piFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(titulo)
                .setContentText(corpo)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setSound(somUri())
                .setContentIntent(pi)
                .setFullScreenIntent(pi, true);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify((int) (System.currentTimeMillis() % 100000), builder.build());

        // Se tiver permissao de sobreposicao, abre o app direto (mesmo desbloqueado).
        try {
            boolean podeSobrepor = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
            if (launch != null && podeSobrepor) {
                startActivity(launch);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onNewToken(String token) {
        // O app busca o token atual via getToken() ao abrir; nada a fazer aqui.
    }

    private Uri somUri() {
        return Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.novo_pedido);
    }

    private void criarCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        // Remove o canal antigo (que podia estar sem som) — o novo id garante o som.
        try { nm.deleteNotificationChannel(CHANNEL_ID_LEGADO); } catch (Exception ignored) {}
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel canal = new NotificationChannel(
                CHANNEL_ID, "Novos pedidos", NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Alertas de novos pedidos para entrega");
        canal.enableVibration(true);
        canal.setVibrationPattern(new long[]{0, 400, 200, 400});

        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        canal.setSound(somUri(), attrs);

        nm.createNotificationChannel(canal);
    }
}
