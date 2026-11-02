package dev.curleaf.dshpocket;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

/**
 * 前台服务：让进程在后台活下来，WebView 的 SSE / 轮询才能及时把「等你批准 / 跑完了」
 * 变成系统通知。没有它，页面一进后台就会被系统挂起，提醒只能等下次打开。
 */
public class KeepAliveService extends Service {
	@Override
	public int onStartCommand(Intent intent, int flags, int startId) {
		startForeground(PocketNotify.keepAliveId(), PocketNotify.keepAliveNotification(this));
		return START_STICKY;
	}

	@Override
	public IBinder onBind(Intent intent) {
		return null;
	}
}
