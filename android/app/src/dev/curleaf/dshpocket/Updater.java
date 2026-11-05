package dev.curleaf.dshpocket;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 自更新：启动时向 /version.json 要版本号，比自己新就弹窗，
 * 用户确认后用系统的 DownloadManager 下载，下载完直接拉起安装器。
 *
 * 为什么用 DownloadManager 而不是自己写文件：它会写进系统「下载」目录并给出
 * 一个 content:// URI，安装器可直接读；自己写文件在 API 24+ 会因为 file:// 暴露被拦。
 *
 * 失败路径一律降级为「打开浏览器下载」，不把用户卡在死路上。
 */
final class Updater {
	private static final int CHECK_TIMEOUT_MS = 8000;

	private Updater() {}

	/** 后台线程查版本，回到主线程弹窗。主线程外抛的异常一律吞掉：更新失败不该影响打开 DSH。 */
	interface OnUpdate {
		/** 发现新版本时回调（主线程）。只做提示，绝不自动弹窗。 */
		void found(String versionName, String notes, String apkUrl);
	}

	static void checkAsync(final Activity act, final String versionUrl, final String apkUrl, final OnUpdate cb) {
		new Thread(new Runnable() {
			@Override public void run() {
				final JSONObject info;
				try { info = fetch(versionUrl); } catch (final Throwable t) { return; }
				final int remote = info.optInt("versionCode", 0);
				final int local = localVersionCode(act);
				if (remote <= local) return;
				final String name = info.optString("versionName", String.valueOf(remote));
				final JSONObject f = info;
				new Handler(Looper.getMainLooper()).post(new Runnable() {
					@Override public void run() {
						try { cb.found(name, f.optString("notes", ""), apkUrl); } catch (Throwable ignored) { /* 提示失败不影响主流程 */ }
					}
				});
			}
		}, "dsh-update-check").start();
	}

	private static JSONObject fetch(String url) throws Exception {
		HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
		c.setConnectTimeout(CHECK_TIMEOUT_MS);
		c.setReadTimeout(CHECK_TIMEOUT_MS);
		c.setRequestProperty("Accept", "application/json");
		try {
			if (c.getResponseCode() != 200) throw new IllegalStateException("HTTP " + c.getResponseCode());
			BufferedInputStream in = new BufferedInputStream(c.getInputStream());
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			byte[] buf = new byte[4096];
			int n;
			while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
			in.close();
			return new JSONObject(out.toString("UTF-8"));
		} finally {
			c.disconnect();
		}
	}

	private static int localVersionCode(Activity act) {
		try {
			android.content.pm.PackageInfo pi =
				act.getPackageManager().getPackageInfo(act.getPackageName(), 0);
			// getLongVersionCode 是 API 28 才有的；低版本直接读 versionCode，
			// 否则在旧机上会抛 NoSuchMethodError，被 catch 成 0 → 永远认为有新版本。
			if (Build.VERSION.SDK_INT >= 28) return (int) pi.getLongVersionCode();
			return pi.versionCode;
		} catch (Throwable t) {
			return Integer.MAX_VALUE;   // 读不到就别提示更新，宁可漏更也不要天天弹
		}
	}

	/** 用户主动点击后才调用：这里才弹确认窗。 */
	static void showDialog(final Activity act, String name, String notes, final String apkUrl) {
		String msg = "发现新版本 " + name;
		if (notes != null && notes.length() > 0) msg += "\n\n" + notes;
		msg += "\n\n更新会下载安装包，期间可以继续使用。";
		new AlertDialog.Builder(act)
			.setTitle("有新版本")
			.setMessage(msg)
			.setPositiveButton("更新", (d, w) -> download(act, apkUrl))
			.setNegativeButton("以后", null)
			.show();
	}

	private static void download(final Activity act, String apkUrl) {
		try {
			if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
				// 没给「安装未知应用」授权，先去设置页；回来再点一次即可
				new AlertDialog.Builder(act)
					.setTitle("需要一次授权")
					.setMessage("首次更新需要在系统设置里允许 DSH 安装应用，之后就不会再问。")
					.setPositiveButton("去设置", (d, w) -> {
						try {
							act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
								Uri.parse("package:" + act.getPackageName())));
						} catch (Throwable t) { openBrowser(act, apkUrl); }
					})
					.setNegativeButton("用浏览器下载", (d, w) -> openBrowser(act, apkUrl))
					.show();
				return;
			}

			final DownloadManager dm = (DownloadManager) act.getSystemService(Context.DOWNLOAD_SERVICE);
			DownloadManager.Request req = new DownloadManager.Request(Uri.parse(apkUrl));
			req.setTitle("DSH 更新");
			req.setDescription("下载完成后会自动打开安装器");
			req.setMimeType("application/vnd.android.package-archive");
			req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
			req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "dsh-pocket.apk");
			final long id = dm.enqueue(req);

			// 用轮询而不是动态广播：API 33+ 对动态注册的导出标志有额外要求，
			// 轮询既没有兼容问题，也不依赖接收器何时被回收。
			final Handler ui = new Handler(Looper.getMainLooper());
			final long startedAt = System.currentTimeMillis();
			ui.post(new Runnable() {
				@Override public void run() {
					if (System.currentTimeMillis() - startedAt > 10 * 60 * 1000L) return;  // 10 分钟未完成就放弃
					try {
						DownloadManager.Query q = new DownloadManager.Query().setFilterById(id);
						android.database.Cursor c = dm.query(q);
						int status = -1;
						if (c != null && c.moveToFirst()) {
							status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
							c.close();
						}
						if (status == DownloadManager.STATUS_SUCCESSFUL) { install(act, dm.getUriForDownloadedFile(id)); return; }
						if (status == DownloadManager.STATUS_FAILED) { openBrowser(act, apkUrl); return; }
					} catch (Throwable ignored) { }
					ui.postDelayed(this, 800L);
				}
			});
		} catch (Throwable t) {
			openBrowser(act, apkUrl);
		}
	}

	private static void install(Activity act, Uri apk) {
		if (apk == null) return;
		Intent i = new Intent(Intent.ACTION_VIEW);
		i.setDataAndType(apk, "application/vnd.android.package-archive");
		i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
		try { act.startActivity(i); } catch (Throwable t) {
			// 个别 ROM 不吃 DownloadManager 的 URI，退回浏览器
			openBrowser(act, apk.toString());
		}
	}

	private static void openBrowser(Activity act, String url) {
		try { act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Throwable ignored) { }
	}
}
