/**
 * CAN 信号共用引擎（前端）
 *
 * 唯一定义载体是 shared/can-signals.json，本文件与后端
 * CanSignalEngine.java 严格同构：造模拟值 / 编码 / 解码 / 越界判定
 * 两边对同一份定义给出相同结果。新增一类信号只改 JSON 定义。
 */
import definitionJson from '../../../shared/can-signals.json';
import type { CanFrame, DbcMessage, DbcSignal } from '../types';

export interface SignalMockRange {
  min: number;
  max: number;
}

export interface SignalDefinition {
  name: string;
  startBit: number;
  bitLength: number;
  factor: number;
  offset: number;
  minValue: number;
  maxValue: number;
  unit: string;
  mock?: SignalMockRange;
  /** 物理值转原始值时的取整方式，与后端枚举保持一致 */
  encodeRound: 'round' | 'truncate';
}

export interface MessageDefinition {
  id: number;
  name: string;
  dlc: number;
  sender: string;
  receiver: string;
  signals: string[];
}

export interface CanDefinition {
  signals: SignalDefinition[];
  messages: MessageDefinition[];
}

export const CAN_DEFINITION = definitionJson as CanDefinition;

const signalCatalog = new Map<string, SignalDefinition>(
  CAN_DEFINITION.signals.map(s => [s.name, s])
);

/** 各报文中的信号顺序定义，未在 JSON 里声明的报文默认使用全量信号 */
const messageSignalOrder = new Map<number, string[]>(
  CAN_DEFINITION.messages.map(m => [m.id, m.signals])
);

const DEFAULT_SIGNAL_ORDER: string[] = CAN_DEFINITION.signals.map(s => s.name);

export function getSignalDefinition(name: string): SignalDefinition | undefined {
  return signalCatalog.get(name);
}

/**
 * 构造与 parseDbc 同构的报文定义表（页面加载默认 DBC 时与刷新前行为一致）
 */
export function buildMessageMap(): Map<number, DbcMessage> {
  const map = new Map<number, DbcMessage>();
  for (const message of CAN_DEFINITION.messages) {
    const signals: DbcSignal[] = [];
    for (const name of message.signals) {
      const def = signalCatalog.get(name);
      if (!def) continue;
      signals.push({
        name: def.name,
        startBit: def.startBit,
        bitLength: def.bitLength,
        factor: def.factor,
        offset: def.offset,
        minValue: def.minValue,
        maxValue: def.maxValue,
        unit: def.unit,
        messageId: message.id
      });
    }
    map.set(message.id, {
      id: message.id,
      name: message.name,
      dlc: message.dlc,
      sender: message.sender,
      signals
    });
  }
  return map;
}

/**
 * 判断物理值是否越出信号声明量程（min/max 边界视为合法）
 */
export function isOutOfRange(signalName: string, physicalValue: number): boolean {
  const def = signalCatalog.get(signalName);
  if (!def) return false;
  return physicalValue < def.minValue || physicalValue > def.maxValue;
}

export function getSignalUnit(name: string): string {
  return signalCatalog.get(name)?.unit ?? '';
}

/**
 * 量程百分比，钳制在 [0, 100]，与详情面板进度条的既有表现一致
 */
export function getSignalRangePercent(name: string, physicalValue: number): number {
  const def = signalCatalog.get(name);
  if (!def) return 50;
  const span = def.maxValue - def.minValue;
  if (span === 0) return 50;
  const percent = ((physicalValue - def.minValue) / span) * 100;
  return Math.max(0, Math.min(100, percent));
}

/**
 * 在信号的模拟区间内采样一个物理值
 */
function samplePhysicalValue(def: SignalDefinition, random: () => number): number {
  const range: SignalMockRange = def.mock ?? { min: def.minValue, max: def.maxValue };
  return range.min + random() * (range.max - range.min);
}

/**
 * 物理值转无符号原始值，按定义声明的位宽做饱和
 */
export function encodeRawValue(def: SignalDefinition, physicalValue: number): number {
  const scaled = (physicalValue - def.offset) / def.factor;
  // 与 Java 端 Math.round(double) 对齐（正数下等价于 Math.floor(x + 0.5)）
  const rounded = def.encodeRound === 'truncate' ? Math.trunc(scaled) : Math.floor(scaled + 0.5);
  const mask = def.bitLength >= 32 ? 0xffffffff : (1 << def.bitLength) - 1;
  return Math.max(0, Math.min(mask, rounded)) & mask;
}

/**
 * 无符号原始值转物理值
 */
export function decodeRawValue(def: SignalDefinition, rawValue: number): number {
  return rawValue * def.factor + def.offset;
}

/**
 * 将各信号的物理值按 Intel（小端、每字节 LSB 在先）布局打包成数据字节
 */
export function encodeDataBytes(values: Map<string, number>, dlc: number): number[] {
  const dataBytes = new Array<number>(dlc).fill(0);
  for (const [name, physicalValue] of values) {
    const def = signalCatalog.get(name);
    if (!def) continue;
    let raw = encodeRawValue(def, physicalValue);
    for (let i = 0; i < def.bitLength && raw !== 0; i++) {
      const bitIndex = def.startBit + i;
      const byteIndex = bitIndex >> 3;
      const bitInByte = bitIndex & 7;
      if (byteIndex < dlc && (raw & 1) !== 0) {
        dataBytes[byteIndex] |= 1 << bitInByte;
      }
      raw = raw >>> 1;
    }
  }
  return dataBytes;
}

/**
 * 按报文信号顺序，从数据字节解码出物理值
 */
export function decodeDataBytes(
  dataBytes: number[],
  signalNames: string[]
): Record<string, number> {
  const decoded: Record<string, number> = {};
  for (const name of signalNames) {
    const def = signalCatalog.get(name);
    if (!def) continue;
    let rawValue = 0;
    for (let i = 0; i < def.bitLength; i++) {
      const bitIndex = def.startBit + i;
      const byteIndex = bitIndex >> 3;
      const bitInByte = bitIndex & 7;
      if (byteIndex < dataBytes.length && ((dataBytes[byteIndex] >> bitInByte) & 1) !== 0) {
        rawValue |= 1 << i;
      }
    }
    decoded[name] = decodeRawValue(def, rawValue);
  }
  return decoded;
}

function hexStringFromBytes(dataBytes: number[]): string {
  return dataBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function dataBytesFromHex(data: string): number[] {
  const hexStr = data.replace(/\s/g, '');
  const dataBytes: number[] = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    dataBytes.push(parseInt(hexStr.substring(i, i + 2), 16));
  }
  return dataBytes;
}

export function signalNamesForMessage(arbitrationId: number): string[] {
  return messageSignalOrder.get(arbitrationId) ?? DEFAULT_SIGNAL_ORDER;
}

/**
 * 造一帧模拟报文：采样物理值 -> 按定义编码为字节 -> 再解码。
 * 字节布局由共享定义决定；quantize 决定物理值的取整粒度
 * （前端历史写法为整数，后端为保留两位小数的 double）。
 */
export function generateMockPayload(
  dlc: number,
  random: () => number,
  quantize: (value: number) => number
): { data: string; decoded: Record<string, number> } {
  const signalNames = DEFAULT_SIGNAL_ORDER;
  const physical = new Map<string, number>();
  const decoded: Record<string, number> = {};

  for (const name of signalNames) {
    const def = signalCatalog.get(name);
    if (!def) continue;
    const value = quantize(samplePhysicalValue(def, random));
    physical.set(name, value);
    decoded[name] = value;
  }

  const dataBytes = encodeDataBytes(physical, dlc);
  return { data: hexStringFromBytes(dataBytes), decoded };
}

/**
 * 用共享定义解析一帧报文（DBC 解析结果或后端帧统一入口）
 */
export function decodeFrameBytes(
  frame: Pick<CanFrame, 'arbitrationId' | 'data' | 'dlc'>,
  message?: DbcMessage
): Record<string, number> {
  const dataBytes = dataBytesFromHex(frame.data);
  if (message) {
    // 用户自行加载的 DBC 可能包含 JSON 中没有的信号，按报文定义做位级解码
    const decoded: Record<string, number> = {};
    for (const signal of message.signals) {
      let rawValue = 0;
      for (let i = 0; i < signal.bitLength; i++) {
        const bitIndex = signal.startBit + i;
        const byteIndex = bitIndex >> 3;
        const bitInByte = bitIndex & 7;
        if (byteIndex < dataBytes.length && ((dataBytes[byteIndex] >> bitInByte) & 1) !== 0) {
          rawValue |= 1 << i;
        }
      }
      decoded[signal.name] = rawValue * signal.factor + signal.offset;
    }
    return decoded;
  }
  return decodeDataBytes(dataBytes, signalNamesForMessage(frame.arbitrationId));
}

/**
 * 由共享定义生成默认 DBC 文本（与历史 DEFAULT_DBC_CONTENT 等价）
 */
export function toDefaultDbc(): string {
  const lines: string[] = ['VERSION ""', '', 'NS_ :', '', 'BS_:', '', 'BU_: ECU Dashboard', ''];
  for (const message of CAN_DEFINITION.messages) {
    lines.push(`BO_ ${message.id} ${message.name}: ${message.dlc} ${message.sender}`);
    for (const name of message.signals) {
      const def = signalCatalog.get(name)!;
      lines.push(
        ` SG_ ${def.name} : ${def.startBit}|${def.bitLength}@1+ (${def.factor},${def.offset}) [${def.minValue}|${def.maxValue}] "${def.unit}" ${message.receiver}`
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
