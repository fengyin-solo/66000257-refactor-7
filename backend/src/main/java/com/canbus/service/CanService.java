package com.canbus.service;

import com.canbus.model.CanFrame;
import com.canbus.signal.CanSignalEngine;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CanService {

    private static final int[] MESSAGE_IDS = {0x7DF, 0x7E8, 0x7E9, 0x7EA, 0x7EB};
    private static final int DLC = 8;

    private static final Pattern BO_PATTERN =
            Pattern.compile("^BO_\\s+(\\d+)\\s+(\\w+)\\s*:\\s*(\\d+)\\s+(\\w+)");
    private static final Pattern SG_PATTERN = Pattern.compile(
            "^SG_\\s+(\\w+)\\s*:\\s*(\\d+)\\|(\\d+)@([01])([+-])\\s*\\(([^,]+),([^)]+)\\)\\s*\\[([^|]+)\\|([^\\]]+)\\]\\s*\"([^\"]*)\"");

    private final CanSignalEngine engine = CanSignalEngine.getInstance();
    private final Random random = new Random();
    private int frameCounter = 0;

    /**
     * Generate 20 mock OBD-II CAN frames with realistic values.
     * 物理值区间、位布局、取整方式全部来自共享定义 can-signals.json。
     */
    public List<CanFrame> generateMockFrames() {
        List<CanFrame> frames = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            frames.add(generateSingleFrame());
        }
        return frames;
    }

    private CanFrame generateSingleFrame() {
        int arbId = MESSAGE_IDS[random.nextInt(MESSAGE_IDS.length)];

        // 与前端共用同一引擎；后端历史写法物理值保留两位小数
        CanSignalEngine.MockPayload payload = engine.generateMockPayload(
                DLC, random::nextDouble, v -> Math.round(v * 100.0) / 100.0);

        Map<String, Double> decoded = new LinkedHashMap<>(payload.getDecoded());

        String direction = random.nextDouble() > 0.3 ? "RX" : "TX";

        return new CanFrame(
                "frame-" + (++frameCounter),
                System.currentTimeMillis(),
                arbId,
                DLC,
                payload.getData(),
                decoded,
                direction
        );
    }

    /**
     * Parse DBC text and return message definitions.
     * 返回结构与历史接口一致（messages + messageCount），解析规则与前端 parseDbc 对齐。
     */
    public Map<String, Object> parseDbc(String text) {
        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> messages = new ArrayList<>();

        Map<String, Object> currentMsg = null;
        List<Map<String, Object>> signals = null;

        for (String rawLine : text.split("\n")) {
            String line = rawLine.trim();

            Matcher boMatcher = BO_PATTERN.matcher(line);
            if (boMatcher.find()) {
                currentMsg = new LinkedHashMap<>();
                currentMsg.put("id", Integer.parseInt(boMatcher.group(1)));
                currentMsg.put("name", boMatcher.group(2));
                currentMsg.put("dlc", Integer.parseInt(boMatcher.group(3)));
                currentMsg.put("sender", boMatcher.group(4));
                signals = new ArrayList<>();
                currentMsg.put("signals", signals);
                messages.add(currentMsg);
                continue;
            }

            Matcher sgMatcher = SG_PATTERN.matcher(line);
            if (sgMatcher.find() && signals != null) {
                Map<String, Object> sig = new LinkedHashMap<>();
                sig.put("name", sgMatcher.group(1));
                sig.put("startBit", Integer.parseInt(sgMatcher.group(2)));
                sig.put("bitLength", Integer.parseInt(sgMatcher.group(3)));
                sig.put("factor", Double.parseDouble(sgMatcher.group(6)));
                sig.put("offset", Double.parseDouble(sgMatcher.group(7)));
                sig.put("minValue", Double.parseDouble(sgMatcher.group(8)));
                sig.put("maxValue", Double.parseDouble(sgMatcher.group(9)));
                sig.put("unit", sgMatcher.group(10));
                signals.add(sig);
                continue;
            }

            if (line.isEmpty()) {
                currentMsg = null;
                signals = null;
            }
        }

        result.put("messages", messages);
        result.put("messageCount", messages.size());
        return result;
    }

    /**
     * Decode a frame using the shared signal definitions.
     * 造帧结果原样携带解码值；无解码值（外部帧）时按共享定义解析数据域。
     */
    public Map<String, Double> decodeFrame(CanFrame frame) {
        if (frame.getDecoded() != null) {
            return frame.getDecoded();
        }
        return engine.decodeFrameBytes(frame.getArbitrationId(), frame.getData());
    }

    /**
     * Get bus statistics
     */
    public Map<String, Object> getStats(int totalFrames) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalFrames", totalFrames);
        stats.put("rxCount", (int) (totalFrames * 0.7));
        stats.put("txCount", (int) (totalFrames * 0.3));
        stats.put("errorCount", 0);
        stats.put("busLoad", 15 + random.nextDouble() * 30);
        stats.put("lastUpdate", System.currentTimeMillis());
        return stats;
    }
}
