import type { CanFrame, DbcMessage, DbcSignal } from '../types';
import { decodeBytes, parseHex } from '../../../shared/signal-codec';
import { generateDefaultDbc } from '../../../shared/catalog';

/**
 * 解析用户提供的 DBC 文本，提取消息与信号定义。
 * 默认 DBC（含量程/单位/位布局等全部信号知识）由 shared/catalog 从
 * 唯一定义 shared/signals.json 生成，不再在前端各写一份。
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
      const signal: DbcSignal = {
        name: sigMatch[1],
        startBit: parseInt(sigMatch[2]),
        bitLength: parseInt(sigMatch[3]),
        factor: parseFloat(sigMatch[6]),
        offset: parseFloat(sigMatch[7]),
        minValue: parseFloat(sigMatch[8]),
        maxValue: parseFloat(sigMatch[9]),
        unit: sigMatch[10],
        messageId: currentMessage.id
      };
      currentMessage.signals.push(signal);
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
 * 位提取与 factor/offset 换算直接走前后端共用的 signal-codec，
 * 页面本地不再维护第二套解析实现。
 */
export function decodeCanFrame(
  frame: CanFrame,
  message: DbcMessage
): Record<string, number> {
  return decodeBytes(parseHex(frame.data), message.signals);
}

/**
 * Default mock DBC content generated from the single shared signal catalog.
 */
export const DEFAULT_DBC_CONTENT = generateDefaultDbc();
