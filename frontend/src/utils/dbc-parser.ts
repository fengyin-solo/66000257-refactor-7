import type { CanFrame, DbcMessage } from '../types';
import { decodeFrameBytes, toDefaultDbc } from '../shared/signal-engine';

/**
 * Parse DBC text content and extract messages and signals.
 *
 * 位级解码统一由 shared/signal-engine.ts 承担，这里只负责 DBC 文本格式解析。
 */
export function parseDbc(text: string): Map<number, DbcMessage> {
  const messages = new Map<number, DbcMessage>();
  const lines = text.split('\n');
  let currentMessage: DbcMessage | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match BO_ line: BO_ <id> <name>: <dlc> <sender>
    const msgMatch = trimmed.match(/^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\w+)/);
    if (msgMatch) {
      currentMessage = {
        id: parseInt(msgMatch[1]),
        name: msgMatch[2],
        dlc: parseInt(msgMatch[3]),
        sender: msgMatch[4],
        signals: []
      };
      messages.set(currentMessage.id, currentMessage);
      continue;
    }

    // Match SG_ line: SG_ <name> : <start>|<len>@<byte_order><sign> (<factor>,<offset>) [<min>|<max>] "<unit>" <receivers>
    const sigMatch = trimmed.match(
      /^SG_\s+(\w+)\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"/
    );
    if (sigMatch && currentMessage) {
      currentMessage.signals.push({
        name: sigMatch[1],
        startBit: parseInt(sigMatch[2]),
        bitLength: parseInt(sigMatch[3]),
        factor: parseFloat(sigMatch[6]),
        offset: parseFloat(sigMatch[7]),
        minValue: parseFloat(sigMatch[8]),
        maxValue: parseFloat(sigMatch[9]),
        unit: sigMatch[10],
        messageId: currentMessage.id
      });
      continue;
    }

    // Empty line ends current message block
    if (trimmed === '') {
      currentMessage = null;
    }
  }

  return messages;
}

/**
 * Decode a CAN frame using DBC message definitions.
 * 解码实现委托给与后端同构的信号引擎。
 */
export function decodeCanFrame(
  frame: CanFrame,
  message: DbcMessage
): Record<string, number> {
  return decodeFrameBytes(frame, message);
}

/**
 * Default mock DBC content,由共享定义 (can-signals.json) 生成
 */
export const DEFAULT_DBC_CONTENT = toDefaultDbc();
