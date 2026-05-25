# RemoteClaude

从 Android 手机远程控制 Claude Code，无需 VPN 直连。

在国内使用 [Happy Coder](https://github.com/slopus/happy) 需要 VPN，因为其中继服务器在海外。RemoteClaude 将中继服务器部署在你自己的国内云服务器上，手机和电脑直连即可。所有通信**端到端加密**，服务器只能看到密文。

## 架构

```
 Android App ←─── E2EE 密文 ───→ 中继服务器 ←─── E2EE 密文 ───→ CLI 包装器
  (Kotlin)            wss://         (Node.js)         wss://        (Node.js)
                                                                               │
                                                                          node-pty
                                                                               │
                                                                         Claude Code
```

**核心隐私保证：** CLI 和 App 各自持有 NaCl 密钥对，配对时交换公钥，所有终端 I/O 用 `crypto_box`（X25519 + XSalsa20-Poly1305）加密。中继服务器只转发密文信封，即使服务器被入侵也无法读取你的会话内容。

## 功能

- 实时终端输出（ANSI 256 色、转义序列渲染）
- 键盘输入（特殊键：Ctrl、Tab、方向键、ESC 等）
- 权限请求审批（Claude Code 弹出权限时手机上直接批准/拒绝）
- 语音输入（Android 语音转文字）
- 推送通知（权限等待提醒，通知栏直接操作）
- 多会话管理
- 自动重连 + 离线消息缓存

## 快速开始

### 使用前确认

使用 RemoteClaude 时有三个进程参与：

| 进程 | 运行位置 | 作用 |
|------|----------|------|
| 中继服务器 | 云服务器、WSL2 或 Windows | 转发 CLI 和手机 App 的加密消息 |
| CLI 包装器 `remote-claude` | 你运行 Claude Code 的电脑环境 | 启动真正的 `claude` 子进程并显示配对码 |
| Android App | 手机 | 输入服务器地址和配对码，远程控制终端 |

如果你平时在 WSL2 里使用 Claude Code，推荐所有电脑端进程都跑在 WSL2：中继服务器、内网穿透、`remote-claude` 都在 WSL2 中启动。这样穿透工具的 `127.0.0.1:8080` 就会指向 WSL2 里的中继服务器。

`remote-claude` 是单独命令，不会覆盖系统里的 `claude`。平时直接运行 `claude` 仍然是默认 Claude Code；只有显式运行 `remote-claude` 时才会启用手机远程控制。

### 1. 启动中继服务器

方式 A：WSL2 + 支持 HTTPS/WSS 的内网穿透

```bash
cd server
npm install
npm run build

HOST=127.0.0.1 PORT=8080 npm start
```

然后启动你的内网穿透工具，确认它显示类似：

```text
内网地址: 127.0.0.1:8080
浏览器访问: https://your-tunnel-domain
```

手机 App 和 CLI 都应填写外部 WSS 地址，例如：

```text
wss://your-tunnel-domain
```

不要在手机里填写 `127.0.0.1:8080`，因为手机上的 `127.0.0.1` 指的是手机自己。如果穿透工具只提供 `http://` 或裸 TCP 端口，先在穿透服务或反向代理中启用 HTTPS/WSS，再连接 App。

方式 B：直接部署到云服务器

需要一台有公网 IP 的服务器（阿里云/腾讯云轻量应用服务器即可，最低配 1 核 1G）。

```bash
cd server
npm install
npm run build

# 如果公网直接访问 8080
HOST=0.0.0.0 PORT=8080 npm start
```

方式 C：Windows PowerShell

```powershell
cd server
npm install
npm run build

$env:HOST="127.0.0.1"
$env:PORT=8080
npm start
```

方式 D：Docker

```bash
cd server
docker compose up -d
```

Windows 上如果只在本机测试，可额外设置 `$env:HOST="127.0.0.1"`；如果要让手机或其他设备连接，保持默认 `0.0.0.0`，并确认防火墙允许 Node.js 监听该端口。`npm install` 时出现 `npm warn cleanup EACCES` 通常是旧的 `node_modules` 文件被终端、编辑器或杀毒软件占用；关闭相关进程后删除 `node_modules`，再用 `npm ci` 重新安装即可。`prebuild-install` 的 deprecated 提示来自 `better-sqlite3` 的依赖链，构建能通过时不是启动失败的直接原因。

如果启动时报 `Port 8080 is already in use`，先找出占用进程：

```bash
lsof -iTCP:8080 -sTCP:LISTEN -n -P
```

确认不是正在使用的服务后再停止对应 PID。

生产环境建议加 Nginx 反向代理 + Let's Encrypt TLS：

```nginx
server {
    listen 443 ssl;
    server_name your-server.com;

    ssl_certificate     /etc/letsencrypt/live/your-server.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-server.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 2. 安装 CLI 包装器

```bash
cd cli
npm install
npm run build
npm link

# 配置服务器地址（只需一次）
remote-claude config --server wss://your-tunnel-domain

# 在任意项目目录启动远程控制版 Claude Code
cd /path/to/your/project
remote-claude
```

服务器地址推荐使用 `wss://`。`ws://` 是明文 WebSocket，Android 默认会拦截非白名单明文流量，并且公网使用有中间人风险。

启动后会显示 6 位配对码：

```
RemoteClaude CLI
Connected!

 ─── RemoteClaude 配对 ───

  在手机 App 中输入配对码:

    839271

  配对码 5 分钟后过期

  等待手机连接...
```

### 3. 安装并配对手机 App

**方式 A：下载预构建 APK（推荐）**

推送到 GitHub 后，Actions 会自动构建 APK。进入仓库的 **Actions → Build Android APK → Artifacts** 下载 `remote-claude-debug`。Artifact 中的 APK 文件名会带版本号，例如 `RemoteClaude-v0.1.0-1-debug.apk`，便于区分手机上安装的是哪一版。

**方式 B：Android Studio 本地构建**

用 Android Studio 打开 `android/` 目录，连接手机直接运行。

打开 App 后：
1. 输入服务器地址（如 `wss://your-tunnel-domain` 或 `wss://your-server.com`）
2. 输入 CLI 显示的 6 位配对码
3. 连接成功后即可看到 Claude Code 的终端输出

App 会在配对成功后把服务器地址保存到手机本地。下次打开 App 时，如果服务器地址没有变化，只需要输入新的 6 位配对码即可。

在电脑上按任意键可夺回本地控制权。

### 日常使用流程

每次使用时按这个顺序启动：

1. 启动中继服务器：`HOST=127.0.0.1 PORT=8080 npm start`
2. 启动支持 HTTPS/WSS 的内网穿透，并确认它转发到 `127.0.0.1:8080`
3. 在目标项目目录运行 `remote-claude`
4. 手机 App 填写外部 `wss://...` 地址和当前显示的 6 位配对码

如果配对码过期或 CLI 退出，需要重新运行 `remote-claude` 获取新的配对码。

## 常见问题

### App 点击连接后显示连接断开

先看中继服务器日志。如果手机 App 真的连到了服务器，server 终端会出现 `Connected:` 日志。

如果 server 只看到 CLI 连接和 `Pair code generated`，没有新的 App 连接，通常是手机里的服务器地址没有打到中继服务器：

- 内网穿透必须正在运行。
- 穿透工具的内网地址应是 `127.0.0.1:8080`。
- 手机应填写外部地址，例如 `wss://your-tunnel-domain`。
- 不要填写 `127.0.0.1:8080`。
- 如果服务商只给 `http://域名` 或远程连接 `域名:端口`，先确认它是否支持 WSS；不支持时需要换支持 HTTPS/WSS 的穿透方式或加一层 Nginx/Cloudflare TLS 代理。

### App 连接按钮一直转

通常表示 App 正在等待 WebSocket 连接或配对确认。按下面顺序检查：

1. CLI 端是否还在显示当前配对码等待手机连接。
2. 6 位配对码是否是最新的，配对码 5 分钟过期且只能使用一次。
3. server 日志是否出现 App 的 `Connected:`。
4. 如果 server 没有 App 连接日志，优先检查穿透地址和手机网络。

### Server 提示 8080 端口被占用

```bash
lsof -iTCP:8080 -sTCP:LISTEN -n -P
```

确认占用进程不需要后再停止它：

```bash
kill <PID>
```

### `remote-claude` 应该在哪里运行

在你希望 Claude Code 操作的项目目录运行：

```bash
cd /path/to/your/project
remote-claude
```

`remote-claude` 会在当前目录启动真正的 `claude` 子进程。普通 `claude` 命令不会被替换。

## 项目结构

```
remote_app/
├── server/                  # 中继服务器
│   ├── src/
│   │   ├── index.ts         # WebSocket 服务器入口
│   │   ├── session.ts       # 会话管理
│   │   ├── router.ts        # 消息路由（只转发密文）
│   │   ├── pairing.ts       # 配对码生成与验证
│   │   └── db.ts            # SQLite 持久化
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── cli/                     # CLI 包装器
│   ├── bin/
│   │   └── remote-claude.ts # CLI 入口
│   └── src/
│       ├── index.ts         # 主逻辑
│       ├── pty.ts           # PTY 管理，启动 claude 子进程
│       ├── transport.ts     # WebSocket + 自动重连 + 离线队列
│       ├── crypto.ts        # NaCl E2E 加密
│       └── permission.ts    # 权限提示检测
│
├── android/                 # Android App
│   └── app/src/main/java/com/remoteclaude/
│       ├── crypto/          # NaCl 加解密 (Lazysodium)
│       ├── network/         # WebSocket 客户端 + 中继服务
│       ├── terminal/        # Termux ANSI 终端模拟器
│       ├── push/            # 前台服务 + 通知
│       ├── voice/           # 语音输入
│       └── ui/              # Compose UI
│
└── shared/
    └── protocol.ts          # 共享消息协议定义
```

## 端到端加密流程

```
1. CLI 首次运行 → 生成 X25519 密钥对 → 保存到 ~/.remote-claude/keys.json
2. App 首次安装 → 生成密钥对 → 保存到 Android Keystore
3. CLI 启动 → 向服务器请求配对码 → 显示 6 位码
4. App 输入配对码 → 服务器交换双方公钥
5. 双方用 peerPublicKey + selfSecretKey 计算共享密钥
6. 所有后续消息: 明文 → NaCl crypto_box → base64(nonce || ciphertext)
7. 服务器只能看到密文，无法解密
```

## WebSocket 协议

服务器可见的信封层（明文路由信息 + 密文载荷）：

| 类型 | 方向 | 说明 |
|------|------|------|
| `pair.request` | CLI → Server | 请求配对码 |
| `pair.code` | Server → CLI | 返回 6 位配对码 |
| `pair.submit` | App → Server | 提交配对码 + 公钥 |
| `pair.confirmed` | Server → 双方 | 配对成功，交换公钥 |
| `encrypted` | 双向 | 加密消息（终端 I/O、权限、语音等） |
| `ping/pong` | 双向 | 心跳保活 |

加密后的内部载荷类型（服务器不可见）：

| 类型 | 说明 |
|------|------|
| `terminal.output` | ANSI 终端输出 |
| `terminal.input` | 键盘输入 |
| `terminal.resize` | 终端尺寸变化 |
| `permission.request` | Claude Code 权限请求 |
| `permission.response` | 用户批准/拒绝 |
| `voice.transcript` | 语音转文字 |
| `status` | 状态更新（active/idle/waiting_permission） |

## 安全

- 端到端加密：NaCl `crypto_box`（X25519 + XSalsa20-Poly1305）
- 传输层：TLS（wss://）
- 配对码：一次性使用，5 分钟过期
- 密钥存储：CLI 用文件权限 0600 保护，App 用 Android Keystore
- 每条消息独立 nonce，防重放攻击
- 中继服务器零知识：只看密文，永远无法解密

## 技术栈

| 组件 | 技术 |
|------|------|
| 中继服务器 | Node.js, TypeScript, ws, better-sqlite3 |
| CLI 包装器 | Node.js, TypeScript, node-pty, tweetnacl |
| Android App | Kotlin, Jetpack Compose, OkHttp, Lazysodium, Termux terminal-emulator |
| 加密 | NaCl/libsodium（crypto_box） |
| 协议 | WebSocket + JSON 信封 |

## 开发

```bash
# 服务器
cd server && npm install && npm run dev

# CLI
cd cli && npm install && npm run dev

# Android 本地构建
cd android
./gradlew assembleDebug
```

### WSL2 Android SDK

如果你希望在 WSL2 中本地构建 Android App，可以安装 Android command-line tools 到用户目录，例如 `/home/tao/android-sdk`，并在 `android/local.properties` 中写入：

```properties
sdk.dir=/home/tao/android-sdk
```

本项目需要：

```bash
sdkmanager --install "platform-tools" "platforms;android-35" "build-tools;35.0.0"
sdkmanager --licenses
```

如果网络需要代理，先启用你的 shell 代理配置，例如 `proxy`，或导出 `all_proxy/http_proxy/https_proxy` 后再运行 `./gradlew assembleDebug`。`local.properties` 是本机路径配置，不应提交到 Git。

## License

MIT
