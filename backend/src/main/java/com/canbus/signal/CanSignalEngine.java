package com.canbus.signal;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.*;
import java.util.function.DoubleSupplier;
import java.util.function.DoubleUnaryOperator;

/**
 * CAN 信号共用引擎（后端），与前端 src/shared/signal-engine.ts 严格同构：
 * 造模拟值 / 编码 / 解码 / 越界判定都以 classpath:/can-signals.json 为唯一来源。
 * 新增一类信号只改 JSON 定义。
 */
public class CanSignalEngine {

    private static final class Holder {
        private static final CanSignalEngine INSTANCE = new CanSignalEngine();
    }

    public static CanSignalEngine getInstance() {
        return Holder.INSTANCE;
    }

    private final List<SignalDefinition> defaultSignalOrder = new ArrayList<>();
    private final Map<String, SignalDefinition> signalCatalog = new LinkedHashMap<>();
    private final Map<Integer, List<String>> messageSignalOrder = new LinkedHashMap<>();

    private CanSignalEngine() {
        try (InputStream in = CanSignalEngine.class.getResourceAsStream("/can-signals.json")) {
            if (in == null) {
                throw new IllegalStateException("classpath:/can-signals.json 未找到");
            }
            CanDefinition definition = new ObjectMapper().readValue(in, CanDefinition.class);
            for (SignalDefinition signal : definition.getSignals()) {
                signalCatalog.put(signal.getName(), signal);
                defaultSignalOrder.add(signal);
            }
            for (MessageDefinition message : definition.getMessages()) {
                messageSignalOrder.put(message.getId(), new ArrayList<>(message.getSignals()));
            }
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    public SignalDefinition getSignalDefinition(String name) {
        return signalCatalog.get(name);
    }

    /**
     * 判断物理值是否越出信号声明量程（min/max 边界视为合法）
     */
    public boolean isOutOfRange(String signalName, double physicalValue) {
        SignalDefinition def = signalCatalog.get(signalName);
        if (def == null) return false;
        return physicalValue < def.getMinValue() || physicalValue > def.getMaxValue();
    }

    public String getSignalUnit(String name) {
        SignalDefinition def = signalCatalog.get(name);
        return def == null ? "" : def.getUnit();
    }

    /**
     * 量程百分比，钳制在 [0, 100]
     */
    public double getSignalRangePercent(String name, double physicalValue) {
        SignalDefinition def = signalCatalog.get(name);
        if (def == null) return 50;
        double span = def.getMaxValue() - def.getMinValue();
        if (span == 0) return 50;
        double percent = ((physicalValue - def.getMinValue()) / span) * 100;
        return Math.max(0, Math.min(100, percent));
    }

    /**
     * 物理值转无符号原始值，按定义声明的位宽做饱和
     */
    public long encodeRawValue(SignalDefinition def, double physicalValue) {
        double scaled = (physicalValue - def.getOffset()) / def.getFactor();
        long rounded = "truncate".equals(def.getEncodeRound())
                ? (long) scaled
                : Math.round(scaled);
        long mask = def.getBitLength() >= 64 ? -1L : (1L << def.getBitLength()) - 1;
        return Math.max(0, Math.min(mask, rounded)) & mask;
    }

    /**
     * 无符号原始值转物理值
     */
    public double decodeRawValue(SignalDefinition def, long rawValue) {
        return rawValue * def.getFactor() + def.getOffset();
    }

    /**
     * 将各信号的物理值按 Intel（小端、每字节 LSB 在先）布局打包成数据字节
     */
    public int[] encodeDataBytes(Map<String, Double> values, int dlc) {
        int[] dataBytes = new int[dlc];
        for (Map.Entry<String, Double> entry : values.entrySet()) {
            SignalDefinition def = signalCatalog.get(entry.getKey());
            if (def == null) continue;
            long raw = encodeRawValue(def, entry.getValue());
            for (int i = 0; i < def.getBitLength() && raw != 0; i++) {
                int bitIndex = def.getStartBit() + i;
                int byteIndex = bitIndex >> 3;
                int bitInByte = bitIndex & 7;
                if (byteIndex < dlc && (raw & 1) != 0) {
                    dataBytes[byteIndex] |= 1 << bitInByte;
                }
                raw >>>= 1;
            }
        }
        return dataBytes;
    }

    /**
     * 按信号名称顺序，从数据字节解码出物理值
     */
    public Map<String, Double> decodeDataBytes(int[] dataBytes, List<String> signalNames) {
        Map<String, Double> decoded = new LinkedHashMap<>();
        for (String name : signalNames) {
            SignalDefinition def = signalCatalog.get(name);
            if (def == null) continue;
            long rawValue = 0;
            for (int i = 0; i < def.getBitLength(); i++) {
                int bitIndex = def.getStartBit() + i;
                int byteIndex = bitIndex >> 3;
                int bitInByte = bitIndex & 7;
                if (byteIndex < dataBytes.length && ((dataBytes[byteIndex] >> bitInByte) & 1) != 0) {
                    rawValue |= 1L << i;
                }
            }
            decoded.put(name, decodeRawValue(def, rawValue));
        }
        return decoded;
    }

    public List<String> signalNamesForMessage(int arbitrationId) {
        return messageSignalOrder.getOrDefault(arbitrationId,
                defaultSignalOrder.stream().map(SignalDefinition::getName).toList());
    }

    public String hexStringFromBytes(int[] dataBytes) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < dataBytes.length; i++) {
            if (i > 0) sb.append(' ');
            sb.append(String.format("%02X", dataBytes[i] & 0xFF));
        }
        return sb.toString();
    }

    public int[] dataBytesFromHex(String data) {
        String hexStr = data.replaceAll("\\s", "");
        int[] dataBytes = new int[hexStr.length() / 2];
        for (int i = 0; i < dataBytes.length; i++) {
            dataBytes[i] = Integer.parseInt(hexStr.substring(i * 2, i * 2 + 2), 16);
        }
        return dataBytes;
    }

    /**
     * 造一帧模拟报文：采样物理值 -> 按定义编码为字节。
     * quantize 决定物理值的取整粒度（后端历史写法为保留两位小数）。
     */
    public MockPayload generateMockPayload(int dlc, DoubleSupplier random, DoubleUnaryOperator quantize) {
        Map<String, Double> physical = new LinkedHashMap<>();
        Map<String, Double> decoded = new LinkedHashMap<>();

        for (SignalDefinition def : defaultSignalOrder) {
            SignalDefinition.MockRange range = def.getMock();
            double min = range != null ? range.getMin() : def.getMinValue();
            double max = range != null ? range.getMax() : def.getMaxValue();
            double value = quantize.applyAsDouble(min + random.getAsDouble() * (max - min));
            physical.put(def.getName(), value);
            decoded.put(def.getName(), value);
        }

        int[] dataBytes = encodeDataBytes(physical, dlc);
        return new MockPayload(hexStringFromBytes(dataBytes), decoded);
    }

    /**
     * 按报文 ID 对应的信号顺序解码一帧的数据域
     */
    public Map<String, Double> decodeFrameBytes(int arbitrationId, String data) {
        int[] dataBytes = dataBytesFromHex(data);
        return decodeDataBytes(dataBytes, signalNamesForMessage(arbitrationId));
    }

    /**
     * 造帧结果：data 为 Hex 字符串，decoded 为按信号顺序排列的物理值
     */
    public static class MockPayload {
        private final String data;
        private final Map<String, Double> decoded;

        public MockPayload(String data, Map<String, Double> decoded) {
            this.data = data;
            this.decoded = decoded;
        }

        public String getData() { return data; }
        public Map<String, Double> getDecoded() { return decoded; }
    }
}
