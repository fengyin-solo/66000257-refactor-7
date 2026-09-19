package com.canbus.signal;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;

/**
 * 模拟值生成与报文编解码的后端实现，与前端 shared/signal-codec.ts 逐函数镜像：
 * <ul>
 *   <li>Intel（小端）位布局：起始位 = 起始字节 * 8，每字节内 LSB 在前；</li>
 *   <li>物理值 = 原始值 * factor + offset；</li>
 *   <li>按唯一定义造模拟值并编码进字节，再用同一套定义解码回填。</li>
 * </ul>
 * 因为读取的是同一份 signals.json，前后端对任意帧得到相同解码结果。
 */
@Component
public class SignalCodec {

    private final SignalDefs defs;

    public SignalCodec(SignalDefs defs) {
        this.defs = defs;
    }

    /** 物理值 -> 原始整数。 */
    public int encodeRaw(SignalDef signal, double physical) {
        return (int) Math.round((physical - signal.offset()) / signal.factor());
    }

    /** 原始整数 -> 物理值（全精度）。 */
    public double decodeRaw(SignalDef signal, int raw) {
        return raw * signal.factor() + signal.offset();
    }

    /** 把一个信号的原始值按 Intel 位布局写入字节数组。 */
    public void writeBits(int[] bytes, SignalDef signal, int raw) {
        for (int i = 0; i < signal.bitLength(); i++) {
            int bitIndex = signal.startBit() + i;
            if (bitIndex < bytes.length * 8) {
                int byteIndex = bitIndex >> 3;
                int bitInByte = bitIndex & 7;
                bytes[byteIndex] = (bytes[byteIndex] & ~(1 << bitInByte))
                        | (((raw >> i) & 1) << bitInByte);
            }
        }
    }

    /** 从字节数组按 Intel 位布局取出一个信号的原始值。 */
    public int readBits(int[] bytes, SignalDef signal) {
        int raw = 0;
        for (int i = 0; i < signal.bitLength(); i++) {
            int bitIndex = signal.startBit() + i;
            if (bitIndex < bytes.length * 8) {
                raw |= ((bytes[bitIndex >> 3] >> (bitIndex & 7)) & 1) << i;
            }
        }
        return raw;
    }

    /** 十六进制字符串（形如 "0A 1B"）-> 字节数组。 */
    public int[] parseHex(String data) {
        String hex = data.replaceAll("\\s", "");
        int[] bytes = new int[hex.length() / 2];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    /** 字节数组 -> 大写、空格分隔的十六进制字符串。 */
    public String formatHex(int[] bytes) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < bytes.length; i++) {
            if (i > 0) {
                builder.append(' ');
            }
            builder.append(String.format("%02X", bytes[i] & 0xFF));
        }
        return builder.toString();
    }

    /** 按消息定义解码字节，保留定义给出的全精度。 */
    public Map<String, Double> decodeBytes(int[] bytes, MessageDef message) {
        Map<String, Double> decoded = new LinkedHashMap<>();
        for (SignalDef signal : defs.signalsOf(message)) {
            decoded.put(signal.name(), decodeRaw(signal, readBits(bytes, signal)));
        }
        return decoded;
    }

    /** 报文接口读数写法：四舍五入保留两位小数（与收拢前后端一致）。 */
    public Map<String, Double> decodeForApi(int[] bytes, MessageDef message) {
        Map<String, Double> decoded = new LinkedHashMap<>();
        for (Map.Entry<String, Double> entry : decodeBytes(bytes, message).entrySet()) {
            decoded.put(entry.getKey(), Math.round(entry.getValue() * 100.0) / 100.0);
        }
        return decoded;
    }

    /**
     * 造一帧模拟数据：物理值生成、字节编码、解码回填全部来自唯一定义。
     * 返回 [hex 数据串, 解码读数]，arbId/dlc 由调用方按消息写入 CanFrame。
     */
    public MockPayload generateMockPayload(MessageDef message, Random random) {
        int[] bytes = new int[defs.catalog().frameLength()];

        for (SignalDef signal : defs.signalsOf(message)) {
            writeBits(bytes, signal, encodeRaw(signal, signal.mockValue(random)));
        }

        return new MockPayload(formatHex(bytes), decodeForApi(bytes, message));
    }

    /** 按定义均匀随机挑选一条消息（与前端 pickMessage 镜像）。 */
    public MessageDef pickMessage(Random random) {
        var messages = defs.messages();
        return messages.get(random.nextInt(messages.size()));
    }

    public record MockPayload(String data, Map<String, Double> decoded) {
    }
}
