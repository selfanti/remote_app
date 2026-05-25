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

### 1. 部署中继服务器

需要一台有公网 IP 的服务器（阿里云/腾讯云轻量应用服务器即可，最低配 1 核 1G）。

```bash
cd server
npm install
npm run build

# 直接运行
PORT=8080 node dist/index.js

# 或 Docker
docker compose up -d
```

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

### 2. 电脑上安装 CLI

```bash
cd cli
npm install
npm run build

# 配置服务器地址（只需一次）
node dist/bin/remote-claude.js config --server wss://your-server.com

# 启动（替代 claude 命令）
node dist/bin/remote-claude.js
```

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

### 3. 安装手机 App

用 Android Studio 打开 `android/` 目录，连接手机构建安装。

打开 App 后：
1. 输入服务器地址（如 `ws://your-server.com:8080`）
2. 输入 CLI 显示的 6 位配对码
3. 连接成功后即可看到 Claude Code 的终端输出

在电脑上按任意键可夺回本地控制权。

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

# Android
# 用 Android Studio 打开 android/ 目录
```

## License

MIT
