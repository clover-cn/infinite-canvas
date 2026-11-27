# 移动端包内预览

Android 与纯血鸿蒙调试工程共用一份包内工作台。启动后进入画布库，支持试用手机和平板布局、画布与资产页。预览使用测试作品，数据保存在当前 App 的 WebView 存储中。正式移动版将使用 SQLite、应用私有媒体目录和原生模型传输。

从仓库根目录准备两端共用的资源。

```powershell
pnpm install --frozen-lockfile
pnpm build:mobile:web
```

改动工作台后重新运行 `pnpm build:mobile:web`。Android 工程直接读取 `apps/web/dist-mobile`，鸿蒙资源同步到模块的 `resources/rawfile/workbench`。

## Android

用 Android Studio 打开 `apps/mobile/android`。使用 JDK 17、Android SDK 35 和 Gradle 8.11.1。也可以用本机的 Gradle 从仓库根目录执行。

```powershell
gradle -p apps/mobile/android :app:assembleDebug
```

调试 APK 输出到 `apps/mobile/android/app/build/outputs/apk/debug/`。

## 纯血鸿蒙

用包含 HarmonyOS 26 SDK 的 DevEco Studio 打开 `apps/mobile/harmony`。选择 `default` 产品和 `entry` 模块，构建调试 HAP。真机安装使用 DevEco Studio 的调试签名，签名材料由开发者在本机配置。

```powershell
hvigorw --mode module -p product=default -p module=entry@default -p buildMode=debug assembleHap
```

在鸿蒙工程目录运行上述命令。构建产物位于 `entry/build/default/outputs/default/`。
