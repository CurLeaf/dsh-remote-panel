#!/bin/bash
# 手动打一个 WebView 壳 APK（不依赖 Gradle）
# 用法：./build.sh [server_url]    默认取脚本里的 SERVER
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-$HOME/android-sdk}"
# 自动挑本机最高的 build-tools / platform：手打 APK 不该被版本号钉死
BT="$SDK/build-tools/$(ls "$SDK/build-tools" 2>/dev/null | sort -V | tail -1)"
AJAR="$SDK/platforms/android-$(ls "$SDK/platforms" 2>/dev/null | sed 's/android-//' | sort -n | tail -1)/android.jar"
APP=app
OUT=out
SERVER="${1:-https://10.140.140.223:8710}"
KEY="${2:-K7mQ2vT9pLxR4nW8sZbY3cHd}"

[ -x "$BT/aapt2" ] || { echo "缺少 build-tools：$BT" >&2; exit 1; }
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

# 启动地址随构建注入
sed -e "s#https://10.140.140.223:8710#${SERVER}#" -e "s#K7mQ2vT9pLxR4nW8sZbY3cHd#${KEY}#" \
  "$APP/src/dev/curleaf/dshpocket/MainActivity.java" > "$OUT/MainActivity.java"

"$BT/aapt2" compile --dir "$APP/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$AJAR" \
  --manifest "$APP/AndroidManifest.xml" \
  --java "$OUT/gen" "$OUT/res.zip"

javac -encoding UTF-8 -source 17 -target 17 -nowarn \
  -classpath "$AJAR" -d "$OUT/classes" \
  "$OUT/MainActivity.java" \
  "$APP/src/dev/curleaf/dshpocket/Updater.java" \
  "$APP/src/dev/curleaf/dshpocket/PocketNotify.java" \
  "$APP/src/dev/curleaf/dshpocket/KeepAliveService.java" \
  "$OUT/gen/dev/curleaf/dshpocket/R.java"

"$BT/d8" --release --lib "$AJAR" --min-api 24 \
  --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

zip -q -j "$OUT/base.apk" "$OUT/dex/classes.dex"
[ -f "$SDK/debug.keystore" ] || keytool -genkeypair -keystore "$SDK/debug.keystore" -storepass android \
  -keypass android -alias androiddebugkey -dname "CN=DSH Pocket" -keyalg RSA -keysize 2048 -validity 10000 >/dev/null 2>&1

"$BT/zipalign" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$SDK/debug.keystore" --ks-pass pass:android --key-pass pass:android \
  --out "dsh-pocket.apk" "$OUT/aligned.apk"
echo "APK: $(pwd)/dsh-pocket.apk ($(du -h dsh-pocket.apk | cut -f1))"

# 顺带生成自更新用的版本清单，供中继侧 /version.json 直接读
VC=$(grep -oP 'versionCode="\K[0-9]+' "$APP/AndroidManifest.xml")
VN=$(grep -oP 'versionName="\K[^"]+' "$APP/AndroidManifest.xml")
SHA=$(sha256sum dsh-pocket.apk | cut -d" " -f1)
SIZE=$(stat -c %s dsh-pocket.apk)
ASSETS="${ASSETS_DIR:-$HOME/WorkSpace/dsh-tunnel/assets}"
mkdir -p "$ASSETS"
cp dsh-pocket.apk "$ASSETS/app.apk"
cat > "$ASSETS/version.json" <<JSON
{"versionCode":$VC,"versionName":"$VN","apk":"/app.apk","size":$SIZE,"sha256":"$SHA","notes":"修复：证书校验收紧为系统 CA；新增：启动自动检查更新"}
JSON
echo "version.json: versionCode=$VC versionName=$VN size=$SIZE"
echo "已同步到 $ASSETS/{app.apk,version.json}"
