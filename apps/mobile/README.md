# 移动端包内预览

Android 与纯血鸿蒙调试工程共用一份包内工作台。启动后进入画布库，支持试用手机和平板布局、画布与资产页。预览使用测试作品，数据保存在当前 App 的 WebView 存储中。正式移动版将使用 SQLite、应用私有媒体目录和原生模型传输。

预览版通过原生 HTTPS 拉取模型列表、执行 JSON 模型请求、查询视频任务、刷新提示词库并下载插件索引、插件包和远程素材。渠道、提示词和插件源使用最终 HTTPS 地址。支持响应状态与取消，鸿蒙 API 20 起可逐块返回响应数据，较早版本使用 SDK 的整响应接口。

移动预览的本地素材仍保存在 WebView。生成时可使用纯提示词，或使用模型协议可直接读取的公开 HTTPS 参考链接。需要上传本地素材或内嵌编码的调用方式，等待私有媒体存储和 `storageKey` 流式上传接入。

新增资源下载时沿用 `requestNetwork`，新增模型协议时走已有模型脚本的 `utils.http`、`utils.request` 或 `utils.stream`。两端共享原生请求描述与响应语义，下载仅允许无凭据 GET，模型只接受已有模型协议的请求头。网页通过固定应用来源获取响应，模型密钥和请求内容作为控制消息发送，模型参考素材原件不经过 JSBridge。

从画布节点下载图片、视频或音频时，鸿蒙由 ArkWeb 下载到应用缓存，再用系统选择器保存。Android 把目前保存在 WebView 里的文件逐块写入「下载／无限画布」，每块写完再继续传输，全部写完才显示文件。

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
