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
	private static final String SERVER = "https://10.140.140.223:8710";
	private static final String SERVER_HOST = "10.140.140.223";
	private static final String START = SERVER + "/remote-panel/app/go.html";
	private WebView web;

	@Override
	protected void onCreate(Bundle state) {
		super.onCreate(state);
		// 铺到刘海下面：WebView 默认会被切在安全区内，顶部留一条黑边
		if (Build.VERSION.SDK_INT >= 28) {
			android.view.WindowManager.LayoutParams attrs = getWindow().getAttributes();
			attrs.layoutInDisplayCutoutMode = android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
			getWindow().setAttributes(attrs);
		}
		if (Build.VERSION.SDK_INT >= 30) {
			getWindow().setDecorFitsSystemWindows(false);
		} else {
			getWindow().getDecorView().setSystemUiVisibility(
				View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
					| View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
					| View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
		}
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
		web.setWebViewClient(new WebViewClient() {
			@Override
			public void onPageCommitVisible(WebView view, String url) {
				super.onPageCommitVisible(view, url);
				// 首帧可见就先写一次，减少「加载完才下移」的跳动
				pushSafeArea();
			}

			@Override
			public void onPageFinished(WebView view, String url) {
				super.onPageFinished(view, url);
				pushSafeArea();
			}

			@Override
			public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
				// 只对「我们自己的站点」放行：证书是 Caddy 内部 CA 签的，
				// 有的 ROM 的 WebView 不认用户凭据里的根证书，硬拦会直接白屏。
				// 注意要比对 URL 里的 host（error.getUrl() 是完整 URL，不能直接 startsWith 主机名）。
				String url = error.getUrl() == null ? "" : error.getUrl();
				String host = "";
				try {
					host = new java.net.URI(url).getHost();
				} catch (Exception ignored) {
					// 解析不了就当外站处理
				}
				if (SERVER_HOST.equals(host)) {
					handler.proceed();
					return;
				}
				handler.cancel();
				showError("证书不受信任：" + host + "\n" + url);
			}

			@Override
			public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
				if (request != null && request.isForMainFrame()) {
					showError("打不开 " + request.getUrl() + "\n" + error.getDescription());
				}
			}
		});
		setContentView(web);
		hideSystemBars();
		web.loadUrl(START);
	}

	@Override
	public void onWindowFocusChanged(boolean focused) {
		super.onWindowFocusChanged(focused);
		if (focused) {
			hideSystemBars();
			pushSafeArea();
		}
	}

	/**
	 * 把真实的「切角 / 状态栏」高度写进 CSS 变量 --dsh-safe-top。
	 *
	 * 页面上那块留白就是页面自己的底色，看起来只是普通内边距，不会露出「刘海条」。
	 * 之所以不从 JS 读 env(safe-area-inset-top)：WebView 里它经常是 0，读不到就必须靠原生侧补。
	 */
	private void pushSafeArea() {
		if (web == null) return;
		int top = 0;
		if (Build.VERSION.SDK_INT >= 30) {
			WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
			if (insets != null) {
				android.graphics.Insets merged =
					insets.getInsets(WindowInsets.Type.displayCutout() | WindowInsets.Type.statusBars());
				top = merged.top;
			}
		} else {
			int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
			if (id > 0) top = getResources().getDimensionPixelSize(id);
		}
		final String js =
			"document.documentElement.style.setProperty('--dsh-safe-top', '" + top + "px')";
		web.post(() -> {
			if (web != null) web.evaluateJavascript(js, null);
		});
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

	/** 出问题时不要留白屏：把错误显示在页面上，方便自查。 */
	private void showError(String message) {
		if (web == null) return;
		String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
			+ "<body style='background:#000;color:#ddd;font:14px system-ui;padding:24px;line-height:1.6'>"
			+ "<h3 style='color:#f2b8b5'>DSH 打不开</h3><pre style='white-space:pre-wrap'>"
			+ message.replace("&", "&amp;").replace("<", "&lt;") + "</pre></body>";
		web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
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
