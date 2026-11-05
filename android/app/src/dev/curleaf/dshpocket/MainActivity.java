package dev.curleaf.dshpocket;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsAnimation;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.widget.TextView;
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
	private static final String SERVER = "https://home.43-155-239-141.sslip.io";
	private static final String SERVER_HOST = "home.43-155-239-141.sslip.io";
	/** 门禁口令：启动时带 ?k= 过门禁，中继侧自动跳转换取 DSH 会话。 */
	private static final String ACCESS_KEY = "K7mQ2vT9pLxR4nW8sZbY3cHd";
	private static final String START = SERVER + "/?k=" + ACCESS_KEY;
	/** 启动时查一次新版本；比自己新就提示更新（失败静默，不打扰打开 DSH） */
	private static final String VERSION_URL = SERVER + "/version.json";
	private static final String APK_URL = SERVER + "/app.apk?k=" + ACCESS_KEY;
	/** 发现新版本时出现的轻提示（不弹窗）；点击后才进入更新确认 */
	private TextView updateChip;
	private String pendingVersionName;
	private String pendingNotes;
	/** 主文档连续失败几次后放弃自动重试，改成带「重试」按钮的失败页 */
	private static final int MAX_RETRIES = 2;
	/** 页面底色（DSH 深色主题的 --dsh-boot-bg），加载期间不闪白 */
	private static final int BG = 0xFF151517;
	private WebView web;
	private FrameLayout root;
	private TextView splash;
	private int retries = 0;
	private boolean failed = false;
	private boolean errorPage = false;
	/** 401 自动重走一次 /pair 链路，防止无限循环 */
	private boolean gateRetried = false;
	/** 键盘是否处于弹出状态：用来避免 safe-bottom 与 IME 内边距叠加 */
	private boolean keyboardShown = false;

	@Override
	protected void onCreate(Bundle state) {
		super.onCreate(state);
		// 通知 + 前台保活：页面在后台也能把「等你批准 / 跑完了」推成系统通知
		PocketNotify.ensureChannels(this);
		PocketNotify.requestNotificationPermission(this, 9001);
		PocketNotify.startKeepAlive(this);
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
		web.setBackgroundColor(BG);
		WebSettings settings = web.getSettings();
		settings.setJavaScriptEnabled(true);
		settings.setDomStorageEnabled(true);
		settings.setDatabaseEnabled(true);
		settings.setMediaPlaybackRequiresUserGesture(false);
		settings.setAllowFileAccess(false);
		settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
		web.addJavascriptInterface(new Object() {
			@android.webkit.JavascriptInterface
			public void notify(String title, String body) {
				runOnUiThread(() -> PocketNotify.post(MainActivity.this, title, body));
			}

			@android.webkit.JavascriptInterface
			public void keepAlive() {
				runOnUiThread(() -> PocketNotify.startKeepAlive(MainActivity.this));
			}

			@android.webkit.JavascriptInterface
			public boolean canNotify() {
				return PocketNotify.hasNotificationPermission(MainActivity.this);
			}
		}, "DSHPocket");
		CookieManager.getInstance().setAcceptCookie(true);
		CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
		web.setWebViewClient(new WebViewClient() {
			@Override
			public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
				super.onPageStarted(view, url, favicon);
				failed = false;
				// 只有真正的 http(s) 导航才离开失败页；loadData 的 about:blank 不算
				if (url != null && url.startsWith("http")) errorPage = false;
			}

			@Override
			public void onPageCommitVisible(WebView view, String url) {
				super.onPageCommitVisible(view, url);
				// 首帧可见就先写一次，减少「加载完才下移」的跳动
				pushSafeArea();
				hideSplash();
			}

			@Override
			public void onPageFinished(WebView view, String url) {
				super.onPageFinished(view, url);
				pushSafeArea();
				// 失败页 / 刚失败的那一页不清零，否则自动重试会变成死循环
				if (errorPage || failed) return;
				retries = 0;
				gateRetried = false;
			}

			@Override
			public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
				// 证书已改为 Let's Encrypt 公共 CA，系统信任即可，**不再对本站放行**。
				// 保留无条件 proceed 等于绕过所有证书校验，那是内部 CA 时代的权宜之计。
				String url = error.getUrl() == null ? "" : error.getUrl();
				String host = "";
				try {
					host = new java.net.URI(url).getHost();
				} catch (Exception ignored) {
					// 解析不了就当外站处理
				}
				handler.cancel();
				showError("证书校验失败：" + host + "\n" + url
					+ "\n\n如果手机时间不对，请先校正时间再试。");
			}

			@Override
			public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
				if (request == null || !request.isForMainFrame()) return;
				failed = true;
				String detail = "网络不可达：" + error.getDescription();
				if (retries < MAX_RETRIES) {
					retries += 1;
					retryLater(1200L * retries, detail);
					return;
				}
				retries = 0;
				showRetryPage("DSH 暂时连不上", detail);
			}

			@Override
			public void onReceivedHttpError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceResponse response) {
				if (request == null || !request.isForMainFrame()) return;
				int status = response == null ? 0 : response.getStatusCode();
				// 401/403 = 门禁或 DSH 会话失效；5xx = 服务还没起来。其余 4xx 是页面自己的事
				if (status != 401 && status != 403 && status < 500) return;
				failed = true;
				String detail = "HTTP " + status;
				// 门禁 / 会话过期不必让用户点：静默重走一次 /pair（只一次，失败才落到错误页）
				if ((status == 401 || status == 403) && !gateRetried) {
					gateRetried = true;
					retryLater(150L, detail + " -> re-pair");
					return;
				}
				if (status >= 500 && retries < MAX_RETRIES) {
					retries += 1;
					retryLater(1200L * retries, detail);
					return;
				}
				retries = 0;
				showRetryPage(status == 401 || status == 403 ? "登录已过期" : "服务暂时不可用", detail);
			}
		});
		root = new FrameLayout(this);
		root.setBackgroundColor(BG);
		root.addView(web, new FrameLayout.LayoutParams(
			FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
		// 首帧之前盖一层同色占位：WebView 冷启动到页面出现之间本来是纯白
		splash = new TextView(this);
		splash.setText("正在连接…");
		splash.setTextColor(0xFF8B8F96);
		splash.setTextSize(15);
		splash.setGravity(Gravity.CENTER);
		root.addView(splash, new FrameLayout.LayoutParams(
			FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
		setContentView(root);
		installImeInsets();
		hideSystemBars();
		web.loadUrl(START);
		// 页面先出来，版本检查放后台；**只做静默检查，不弹任何窗**
		web.postDelayed(new Runnable() {
			@Override public void run() { checkUpdateSilently(); }
		}, 2500L);
	}

	@Override
	public void onWindowFocusChanged(boolean focused) {
		super.onWindowFocusChanged(focused);
		if (focused) {
			hideSystemBars();
			pushSafeArea();
			syncImeFromWindow();
		}
	}

	/**
	 * 软键盘：decorFitsSystemWindows=false 时系统不再替我们缩小窗口，
	 * adjustResize 等于失效，键盘会直接盖住输入条。这里自己消费 IME insets，
	 * 把它变成 WebView 的底部内边距——效果等价于 adjustResize，但保留全屏。
	 */
	private void installImeInsets() {
		if (Build.VERSION.SDK_INT < 30) return; // 低版本走系统 adjustResize
		getWindow().getDecorView().setOnApplyWindowInsetsListener((v, insets) -> {
			applyImeBottom(insets.getInsets(WindowInsets.Type.ime()).bottom);
			return insets;
		});
		// 键盘弹出/收起有动画，只在 onApply 里跳变会闪；按帧跟随
		getWindow().getDecorView().setWindowInsetsAnimationCallback(
			new WindowInsetsAnimation.Callback(WindowInsetsAnimation.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
				@Override
				public WindowInsets onProgress(WindowInsets insets, java.util.List<WindowInsetsAnimation> running) {
					applyImeBottom(insets.getInsets(WindowInsets.Type.ime()).bottom);
					return insets;
				}
			});
	}

	/** 兜底：某些 ROM 不派发 onApply，聚焦变化时从窗口 insets 再读一次 */
	private void syncImeFromWindow() {
		if (Build.VERSION.SDK_INT < 30 || web == null) return;
		WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
		if (insets != null) applyImeBottom(insets.getInsets(WindowInsets.Type.ime()).bottom);
	}

	private void applyImeBottom(int bottomPx) {
		if (web == null) return;
		int value = Math.max(0, bottomPx);
		boolean shown = value > 0;
		if (shown != keyboardShown) {
			keyboardShown = shown;
			if (shown) {
				// 键盘自带底部空间，页面再留 safe-bottom 就会空出一条 48px 的缝
				web.evaluateJavascript(
					"document.documentElement.style.setProperty('--dsh-safe-bottom','0px')", null);
			} else {
				pushSafeArea();
			}
		}
		if (web.getPaddingBottom() == value) return;
		web.setPadding(web.getPaddingLeft(), web.getPaddingTop(), web.getPaddingRight(), value);
	}

	private void hideSplash() {
		if (splash != null && splash.getVisibility() != View.GONE) splash.setVisibility(View.GONE);
	}

	/**
	 * 把真实的「切角 / 状态栏」高度写进 CSS 变量 --dsh-safe-top。
	 *
	 * 页面上那块留白就是页面自己的底色，看起来只是普通内边距，不会露出「刘海条」。
	 * 之所以不从 JS 读 env(safe-area-inset-top)：WebView 里它经常是 0，读不到就必须靠原生侧补。
	 */
	private void pushSafeArea() {
		if (web == null) return;
		// getInsets() 返回的是物理像素，CSS 里的 px 是 dp（viewport 缩放后），必须除以 density，
		// 否则 2~3 倍屏上留白会变成两三倍高。
		float density = getResources().getDisplayMetrics().density;
		if (density <= 0f) density = 1f;
		int topPx = 0;
		if (Build.VERSION.SDK_INT >= 30) {
			WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
			if (insets != null) {
				android.graphics.Insets merged =
					insets.getInsets(WindowInsets.Type.displayCutout() | WindowInsets.Type.statusBars());
				topPx = merged.top;
			}
		} else {
			int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
			if (id > 0) topPx = getResources().getDimensionPixelSize(id);
		}
		// 上限 48px：再大就不像「切角高度」了，宁可少留也别把版面顶坏
		int top = Math.max(0, Math.min(48, Math.round(topPx / density)));
		int bottomPx = 0;
		if (Build.VERSION.SDK_INT >= 30) {
			WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
			if (insets != null) {
				android.graphics.Insets merged =
					insets.getInsets(WindowInsets.Type.displayCutout() | WindowInsets.Type.navigationBars());
				bottomPx = merged.bottom;
			}
		}
		int bottom = Math.max(0, Math.min(48, Math.round(bottomPx / density)));
		final String js =
			"document.documentElement.style.setProperty('--dsh-safe-top', '" + top + "px');" +
			"document.documentElement.style.setProperty('--dsh-safe-bottom', '" + bottom + "px')";
		web.post(() -> {
			if (web != null) web.evaluateJavascript(js, null);
		});
	}

	/**
	 * 静默检查更新：发现新版本只在界面左下角挂一个可点的小条 + 一条低优先级通知，
	 * 绝不主动弹窗。是否更新完全由用户点那一下决定。
	 */
	private void checkUpdateSilently() {
		Updater.checkAsync(this, VERSION_URL, APK_URL, new Updater.OnUpdate() {
			@Override public void found(String versionName, String notes, String apkUrl) {
				pendingVersionName = versionName;
				pendingNotes = notes;
				showUpdateChip("有新版本 " + versionName + " · 点此更新");
				notifyOncePerVersion(versionName);
			}
		});
	}

	/** 每次启动都会查到新版本，但通知只在「这个版本号第一次见到」时发一次 */
	private void notifyOncePerVersion(String versionName) {
		try {
			String seen = getPreferences(MODE_PRIVATE).getString("notified_update", "");
			if (versionName.equals(seen)) return;
			getPreferences(MODE_PRIVATE).edit().putString("notified_update", versionName).apply();
			PocketNotify.postUpdate(this, "DSH 有新版本 " + versionName, "点一下回到 App，在左下角选择是否更新");
		} catch (Throwable ignored) { }
	}

	private void showUpdateChip(String text) {
		if (updateChip != null) { updateChip.setText(text); updateChip.setVisibility(View.VISIBLE); return; }
		float d = getResources().getDisplayMetrics().density;
		updateChip = new TextView(this);
		updateChip.setText(text);
		updateChip.setTextSize(12.5f);
		updateChip.setTextColor(0xFF4ADE80);
		updateChip.setPadding((int)(14*d), (int)(9*d), (int)(14*d), (int)(9*d));
		updateChip.setGravity(Gravity.CENTER);
		updateChip.setClickable(true);
		updateChip.setOnClickListener(v -> {
			if (pendingVersionName == null) { checkUpdateSilently(); return; }
			Updater.showDialog(MainActivity.this, pendingVersionName, pendingNotes, APK_URL);
		});
		// 圆角深色底 + 细边，和页面配色一致
		android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
		bg.setColor(0xF21D1D21);
		bg.setCornerRadius(999f);
		bg.setStroke((int)(1*d), 0xFF33333A);
		updateChip.setBackground(bg);
		updateChip.setElevation(6f * d);

		FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
			FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
			Gravity.BOTTOM | Gravity.START);
		// 抬到输入框上方，避免和 DSH 底部编辑区打架
		lp.setMargins((int)(14*d), 0, 0, (int)(132*d));
		root.addView(updateChip, lp);
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

	/** 等一会儿再走一遍完整启动链路（/pair → 登录页 → 首页）。 */
	private void retryLater(long delayMs, String reason) {
		android.util.Log.w("dsh-pocket", "retry in " + delayMs + "ms: " + reason);
		web.postDelayed(() -> {
			if (web != null) web.loadUrl(START);
		}, delayMs);
	}

	/**
	 * 失败页：标题 + 原因 + 一个真正可点的「重试」。
	 * 之前是 WebView 默认错误页，只有一个静态文字，用户只能杀进程重开。
	 */
	private void showRetryPage(String title, String detail) {
		if (web == null) return;
		hideSplash();
		errorPage = true;
		String html = "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'>"
			+ "<body style='margin:0;background:#000;color:#e6e6e6;font:15px/1.6 system-ui,sans-serif;"
			+ "min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:28px;box-sizing:border-box'>"
			+ "<div style='max-width:320px'>"
			+ "<div style='font-size:18px;font-weight:600;margin-bottom:10px'>" + escape(title) + "</div>"
			+ "<div style='color:#8b8f96;font-size:13px;white-space:pre-wrap;word-break:break-word'>" + escape(detail) + "</div>"
			+ "<a href='" + escape(START) + "' style='display:inline-block;margin-top:24px;padding:12px 30px;"
			+ "border-radius:999px;background:#4d7dfe;color:#fff;font-size:15px;text-decoration:none'>重试</a>"
			+ "</div></body>";
		web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
	}

	private static String escape(String value) {
		if (value == null) return "";
		return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
	}

	/** 出问题时不要留白屏：把错误显示在页面上，方便自查。 */
	private void showError(String message) {
		if (web == null) return;
		hideSplash();
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
