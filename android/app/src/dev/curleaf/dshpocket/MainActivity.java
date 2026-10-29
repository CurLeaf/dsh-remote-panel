package dev.curleaf.dshpocket;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 极简 WebView 壳：只做一件事——把手机上的 DSH 当独立 App 打开。
 *
 * 为什么不走 PWA 安装：Android 的 WebAPK 打包依赖 Google Play 服务，
 * 且打包服务器要能从公网访问源站；内网 IP 两条都不满足，所以自己包一层。
 *
 * 启动地址是 /remote-panel/app/go.html：那一页由插件在每次启动时重写，
 * 里面带着当前进程的令牌，会先种门禁 Cookie 再跳到带令牌的首页。
 */
public class MainActivity extends Activity {
	private static final String START = "https://10.140.140.223:8710/remote-panel/app/go.html";
	private WebView web;

	@Override
	protected void onCreate(Bundle state) {
		super.onCreate(state);
		web = new WebView(this);
		WebSettings settings = web.getSettings();
		settings.setJavaScriptEnabled(true);
		settings.setDomStorageEnabled(true);
		settings.setDatabaseEnabled(true);
		settings.setMediaPlaybackRequiresUserGesture(false);
		settings.setAllowFileAccess(false);
		settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
		CookieManager.getInstance().setAcceptCookie(true);
		CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
		web.setWebViewClient(new WebViewClient());
		setContentView(web);
		hideSystemBars();
		web.loadUrl(START);
	}

	@Override
	public void onWindowFocusChanged(boolean focused) {
		super.onWindowFocusChanged(focused);
		if (focused) hideSystemBars();
	}

	@Override
	public void onBackPressed() {
		if (web != null && web.canGoBack()) {
			web.goBack();
			return;
		}
		super.onBackPressed();
	}

	@Override
	protected void onDestroy() {
		if (web != null) {
			web.destroy();
			web = null;
		}
		super.onDestroy();
	}

	private void hideSystemBars() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
			WindowInsetsController controller = getWindow().getInsetsController();
			if (controller != null) {
				controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
				controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
			}
			return;
		}
		getWindow().getDecorView().setSystemUiVisibility(
			View.SYSTEM_UI_FLAG_FULLSCREEN
				| View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
				| View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
				| View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
	}
}
