// =============================================================================
// RemoteClaude Shared Protocol
// 中继服务器、CLI 包装器、Android App 共用的消息协议定义
// =============================================================================

// --- 信封层消息类型（中继服务器可见）---
export type EnvelopeType =
  | "session.create"
  | "session.join"
  | "session.leave"
  | "session.destroy"
  | "pair.request"
  | "pair.code"
  | "pair.submit"
  | "pair.confirmed"
  | "pair.rejected"
  | "encrypted"
  | "ping"
  | "pong"
  | "error"
  | "client.list"
  | "client.joined"
  | "client.left";

// --- 加密后的内部载荷类型（只有 CLI 和 App 能看到）---
export type InnerType =
  | "terminal.output"
  | "terminal.input"
  | "terminal.resize"
  | "permission.request"
  | "permission.response"
  | "voice.transcript"
  | "status"
  | "history.chunk"
  | "history.request";

// --- 线路消息（WebSocket 传输格式）---
export interface WireMessage {
  type: EnvelopeType;
  sessionId?: string;
  payload?: unknown;
  timestamp: number;
}

// --- 会话创建 ---
export interface SessionCreatePayload {
  cliPublicKey: string; // base64 编码的 NaCl 公钥
  cols: number;
  rows: number;
}

// --- 会话加入 ---
export interface SessionJoinPayload {
  appPublicKey: string; // base64 编码的 NaCl 公钥
}

// --- 配对请求 ---
export interface PairRequestPayload {
  cliPublicKey: string;
  cols: number;
  rows: number;
}

// --- 配对码 ---
export interface PairCodePayload {
  code: string; // 6位配对码
  sessionId: string;
  expiresIn: number; // 秒
}

// --- 提交配对码 ---
export interface PairSubmitPayload {
  code: string;
  appPublicKey: string;
}

// --- 配对确认 ---
export interface PairConfirmedPayload {
  peerPublicKey: string; // 对端的公钥
  sessionId: string;
}

// --- 加密消息 ---
export interface EncryptedPayload {
  ciphertext: string; // base64(nonce || encrypted)
}

// --- 错误 ---
export interface ErrorPayload {
  code: string;
  message: string;
}

// --- 客户端列表 ---
export interface ClientListPayload {
  clients: Array<{ id: string; type: "cli" | "app" }>;
}

// --- 客户端加入/离开 ---
export interface ClientChangePayload {
  clientId: string;
  clientType: "cli" | "app";
}

// =============================================================================
// 加密后的内部载荷结构
// =============================================================================

export interface InnerPayload {
  type: InnerType;
  data: unknown;
  timestamp: number;
}

// --- 终端输出 ---
export interface TerminalOutputData {
  output: string; // base64 编码的 ANSI 数据
}

// --- 终端输入 ---
export interface TerminalInputData {
  input: string; // 用户输入的文本
}

// --- 终端尺寸变化 ---
export interface TerminalResizeData {
  cols: number;
  rows: number;
}

// --- 权限请求 ---
export interface PermissionRequestData {
  id: string; // 权限请求唯一 ID
  tool: string; // 工具名称，如 "Bash", "Write"
  detail: string; // 权限详情，如要执行的命令
  prompt: string; // 原始提示文本
}

// --- 权限响应 ---
export interface PermissionResponseData {
  id: string;
  approved: boolean;
  input?: string; // 用户输入的额外文本（如选择选项）
}

// --- 语音转文字 ---
export interface VoiceTranscriptData {
  text: string;
  isFinal: boolean;
}

// --- 状态更新 ---
export interface StatusData {
  status: "active" | "idle" | "waiting_permission" | "disconnected";
  detail?: string;
}

// --- 历史记录块 ---
export interface HistoryChunkData {
  sessionId: string;
  entries: Array<{
    timestamp: number;
    direction: "in" | "out";
    data: string; // base64
  }>;
  isLast: boolean;
}

// --- 历史记录请求 ---
export interface HistoryRequestData {
  sessionId: string;
  afterTimestamp?: number;
  limit?: number;
}

// =============================================================================
// 辅助函数
// =============================================================================

export function createMessage(
  type: EnvelopeType,
  payload?: unknown,
  sessionId?: string
): WireMessage {
  return {
    type,
    payload,
    sessionId,
    timestamp: Date.now(),
  };
}

export function createInnerMessage(
  type: InnerType,
  data: unknown
): InnerPayload {
  return {
    type,
    data,
    timestamp: Date.now(),
  };
}
