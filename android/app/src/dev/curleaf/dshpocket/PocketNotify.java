package dev.curleaf.dshpocket;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * 通知与前台保活：WebView 里的页面通过 window.DSHPocket 调用。
 *
 * 两条通道：
 *   alerts    —— 「有任务等你批准 / 跑完了」这类要人看的通知
 *   keepalive —— 前台服务常驻的那条「DSH 保持连接」（低优先级、不可滑走）
 *
 * 不用 AndroidX：手打 APK 不拉依赖，全部走平台 API。
 */
public final class PocketNotify {
	public static final String CHANNEL_ALERTS = "dsh-pocket-alerts";
	public static final String CHANNEL_KEEPALIVE = "dsh-pocket-keepalive";
	private static final int KEEPALIVE_ID = 7001;
	private static final int ALERT_ID = 7002;

	private PocketNotify() {}

	/** 建通道；重复调用安全。 */
	public static void ensureChannels(Context context) {
		if (Build.VERSION.SDK_INT < 26) return;
		NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
		if (manager == null) return;
		NotificationChannel alerts = new NotificationChannel(CHANNEL_ALERTS, "任务提醒", NotificationManager.IMPORTANCE_HIGH);
		alerts.setDescription("有任务等你批准、或跑完了");
		manager.createNotificationChannel(alerts);
		NotificationChannel keep = new NotificationChannel(CHANNEL_KEEPALIVE, "保持连接", NotificationManager.IMPORTANCE_LOW);
		keep.setDescription("让 DSH 在后台保持连接，才能及时收到提醒");
		manager.createNotificationChannel(keep);
	}

	/** 普通通知：点一下回到 App。 */
	public static void post(Context context, String title, String body) {
		ensureChannels(context);
		NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
		if (manager == null) return;
		Intent open = new Intent(context, MainActivity.class);
		open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
		PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
		Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL_ALERTS) : new Notification.Builder(context);
		builder.setSmallIcon(android.R.drawable.stat_notify_more)
			.setContentTitle(title == null ? "DSH" : title)
			.setContentText(body == null ? "" : body)
			.setAutoCancel(true)
			.setContentIntent(tap);
		manager.notify(ALERT_ID, builder.build());
	}

	/** 拉起前台服务（保活 + 常驻通知）。 */
	public static void startKeepAlive(Context context) {
		Intent intent = new Intent(context, KeepAliveService.class);
		if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
		else context.startService(intent);
	}

	/** 前台服务的常驻通知本体。 */
	public static Notification keepAliveNotification(Context context) {
		ensureChannels(context);
		Intent open = new Intent(context, MainActivity.class);
		open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
		PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
		Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL_KEEPALIVE) : new Notification.Builder(context);
		return builder.setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
			.setContentTitle("DSH 保持连接")
			.setContentText("后台保持会话，任务完成或需要你确认时第一时间提醒")
			.setOngoing(true)
			.setContentIntent(tap)
			.build();
	}

	public static int keepAliveId() {
		return KEEPALIVE_ID;
	}

	/** Android 13+ 需要用户授权才能弹通知；返回是否已经拿到。 */
	public static boolean hasNotificationPermission(Activity activity) {
		if (Build.VERSION.SDK_INT < 33) return true;
		return activity.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED;
	}

	public static void requestNotificationPermission(Activity activity, int requestCode) {
		if (Build.VERSION.SDK_INT < 33 || hasNotificationPermission(activity)) return;
		activity.requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, requestCode);
	}
}
