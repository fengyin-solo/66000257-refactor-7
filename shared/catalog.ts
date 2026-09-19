/**
 * 信号定义目录（前后端共用的唯一定义来源）。
 *
 * 运行期所有信号知识（位布局、factor/offset、量程、单位、展示单位、颜色、
 * 模拟值范围、消息列表）都来自 shared/signals.json；前端直接读取本文件，
 * 后端通过 classpath:/signals.json 读取同一份文件。
 * 新增一类信号只需要改 shared/signals.json，不需要改任何代码。
 */
import definition from './signals.json';

export interface MockRange {
  min: number;
  max: number;
  integer: boolean;
}

export interface SignalDef {
  name: string;
  startBit: number;
  bitLength: number;
  factor: number;
  offset: number;
  minValue: number;
  maxValue: number;
  unit: string;
  displayUnit: string;
  color: string;
  chartColor: string;
  mock: MockRange;
}

export interface MessageDef {
  id: number;
  name: string;
  dlc: number;
  sender: string;
  signalNames: string[];
}

export interface SignalCatalog {
  frameLength: number;
  rxProbability: number;
  signals: SignalDef[];
  messages: MessageDef[];
}

export const catalog: SignalCatalog = definition as SignalCatalog;

const signalByName = new Map<string, SignalDef>(
  catalog.signals.map(signal => [signal.name, signal])
);

export function getSignal(name: string): SignalDef | undefined {
  return signalByName.get(name);
}

export function getMessage(id: number): MessageDef | undefined {
  return catalog.messages.find(message => message.id === id);
}

export function signalsOf(message: MessageDef): SignalDef[] {
  return message.signalNames
    .map(name => signalByName.get(name))
    .filter((signal): signal is SignalDef => signal !== undefined);
}

/** 去掉 DBC 数值尾部多余的 0（0.250 -> 0.25，0.000 -> 0）。 */
function dbcNumber(value: number): string {
  const text = value.toFixed(3);
  return text.replace(/\.?0+$/, '');
}

/**
 * 由唯一定义生成默认 DBC 文本。
 * 字节序/符号固定为 Intel 无符号 (@1+)，接收方固定为 Dashboard，
 * 与收拢前前端内置的默认 DBC 保持逐字节一致。
 */
export function generateDefaultDbc(): string {
  const lines: string[] = [
    'VERSION ""',
    '',
    'NS_ :',
    '',
    'BS_:',
    '',
    'BU_: ECU Dashboard',
    ''
  ];

  for (const message of catalog.messages) {
    lines.push(`BO_ ${message.id} ${message.name}: ${message.dlc} ${message.sender}`);
    for (const signal of signalsOf(message)) {
      lines.push(
        ` SG_ ${signal.name} : ${signal.startBit}|${signal.bitLength}@1+ ` +
        `(${dbcNumber(signal.factor)},${dbcNumber(signal.offset)}) ` +
        `[${dbcNumber(signal.minValue)}|${dbcNumber(signal.maxValue)}] ` +
        `"${signal.unit}" Dashboard`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
