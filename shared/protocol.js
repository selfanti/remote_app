"use strict";
// =============================================================================
// RemoteClaude Shared Protocol
// 中继服务器、CLI 包装器、Android App 共用的消息协议定义
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessage = createMessage;
exports.createInnerMessage = createInnerMessage;
// =============================================================================
// 辅助函数
// =============================================================================
function createMessage(type, payload, sessionId) {
    return {
        type,
        payload,
        sessionId,
        timestamp: Date.now(),
    };
}
function createInnerMessage(type, data) {
    return {
        type,
        data,
        timestamp: Date.now(),
    };
}
