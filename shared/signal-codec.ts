/**
 * 信号编解码、模拟值与越界判断（前后端共用的唯一算法实现说明）。
 *
 * 本文件是该算法的 TypeScript 参考实现；后端 Java 实现在
 * com.canbus.signal.SignalCodec，与这里逐函数镜像，保证同一份定义
 * 在页面本地与系统后端产出相同结果。
 *
 * 约定：
 * - Intel（小端、@1）位布局：每个字节内部 LSB 在前，起始位 = 起始字节 * 8；
 * - 物理值 = 原始值 * factor + offset；
 * - 模拟值落在各信号 mock 区间内（integer 时取整），一定在量程内。
 */
import { catalog, getMessage, signalsOf, type MessageDef, type SignalDef } from './catalog';

/** 位布局所需的最小信号结构（DBC 文本解析出的信号也满足）。 */
interface BitLayout {
  startBit: number;
  bitLength: number;
}

/** 生成一个信号的模拟物理值。 */
export function mockValue(signal: SignalDef, random: () => number = Math.random): number {
  const value = signal.mock.min + random() * (signal.mock.max - signal.mock.min);
  return signal.mock.integer ? Math.floor(value) : value;
}

/** 按唯一定义随机挑一条消息（与收拢前一致：按消息出现顺序均匀选取）。 */
export function pickMessage(random: () => number = Math.random): MessageDef {
  return catalog.messages[Math.floor(random() * catalog.messages.length)];
}

/** 物理值 -> 原始整数值。 */
export function encodeRaw(signal: { factor: number; offset: number }, physical: number): number {
  return Math.round((physical - signal.offset) / signal.factor);
}

/** 原始整数 -> 物理值。 */
export function decodeRaw(signal: { factor: number; offset: number }, raw: number): number {
  return raw * signal.factor + signal.offset;
}

/** 把一个信号的原始值按 Intel 位布局写入字节数组。 */
export function writeBits(bytes: number[], signal: BitLayout, raw: number): void {
  for (let i = 0; i < signal.bitLength; i++) {
    const bitIndex = signal.startBit + i;
    if (bitIndex < bytes.length * 8) {
      const byteIndex = bitIndex >> 3;
      const bitInByte = bitIndex & 7;
      bytes[byteIndex] = (bytes[byteIndex] & ~(1 << bitInByte)) | (((raw >> i) & 1) << bitInByte);
    }
  }
}

/** 从字节数组中按 Intel 位布局取出一个信号的原始值。 */
export function readBits(bytes: number[], signal: BitLayout): number {
  let raw = 0;
  for (let i = 0; i < signal.bitLength; i++) {
    const bitIndex = signal.startBit + i;
    if (bitIndex < bytes.length * 8) {
      raw |= ((bytes[bitIndex >> 3] >> (bitIndex & 7)) & 1) << i;
    }
  }
  return raw;
}

/** 十六进制字符串（形如 "0A 1B"）-> 字节数组。 */
export function parseHex(data: string): number[] {
  const hex = data.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

function toHexByte(value: number): string {
  return (value & 0xff).toString(16).padStart(2, '0').toUpperCase();
}

/** 字节数组 -> 大写、空格分隔的十六进制字符串。 */
export function formatHex(bytes: number[]): string {
  return bytes.map(toHexByte).join(' ');
}

export interface MockFramePayload {
  arbitrationId: number;
  dlc: number;
  data: string;
  decoded: Record<string, number>;
}

/**
 * 造一帧模拟数据：按唯一定义生成物理值、编码进 8 字节，并立即用同一套
 * 定义解码回填 decoded（页面与后端走完全相同的路径）。
 */
export function generateMockPayload(
  message: MessageDef = pickMessage(),
  random: () => number = Math.random
): MockFramePayload {
  const signals = signalsOf(message);
  const bytes = new Array(catalog.frameLength).fill(0);

  for (const signal of signals) {
    writeBits(bytes, signal, encodeRaw(signal, mockValue(signal, random)));
  }

  return {
    arbitrationId: message.id,
    dlc: catalog.frameLength,
    data: formatHex(bytes),
    decoded: decodeMessageBytes(bytes, message)
  };
}

/** 可解码的信号结构（唯一定义与 DBC 文本解析结果都满足）。 */
export interface DecodableSignal {
  name: string;
  startBit: number;
  bitLength: number;
  factor: number;
  offset: number;
}

/** 按信号列表解码原始字节，返回 信号名 -> 物理值（保留定义给出的全精度）。 */
export function decodeBytes(
  bytes: number[],
  signals: ReadonlyArray<DecodableSignal>
): Record<string, number> {
  const decoded: Record<string, number> = {};
  for (const signal of signals) {
    decoded[signal.name] = decodeRaw(signal, readBits(bytes, signal));
  }
  return decoded;
}

/** 按唯一定义中的消息解码原始字节。 */
export function decodeMessageBytes(bytes: number[], message: MessageDef): Record<string, number> {
  return decodeBytes(bytes, signalsOf(message));
}

/** 按报文 ID 解码十六进制数据串；没有该消息定义时返回 null。 */
export function decodeDataHex(arbitrationId: number, data: string): Record<string, number> | null {
  const message = getMessage(arbitrationId);
  if (!message) return null;
  return decodeMessageBytes(parseHex(data), message);
}

/** 越界判断：值严格落在定义的量程闭区间之外即为越界；未知信号不判越界。 */
export function isOutOfRange(signal: { minValue: number; maxValue: number }, value: number): boolean {
  return value < signal.minValue || value > signal.maxValue;
}

/**
 * 量程百分比（用于详情条宽度）：把值映射到 [min,max] 对应 [0,100]，
 * 越界部分钳制在 0–100，与收拢前展示表现一致。
 */
export function rangePercent(
  signal: { minValue: number; maxValue: number },
  value: number
): number {
  if (signal.maxValue === signal.minValue) return 0;
  const percent = ((value - signal.minValue) / (signal.maxValue - signal.minValue)) * 100;
  return Math.max(0, Math.min(100, percent));
}
