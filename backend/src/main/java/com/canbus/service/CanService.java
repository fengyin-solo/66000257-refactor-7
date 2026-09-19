package com.canbus.service;

import com.canbus.model.CanFrame;
import com.canbus.signal.MessageDef;
import com.canbus.signal.SignalCodec;
import com.canbus.signal.SignalDefs;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class CanService {

    private final SignalDefs signalDefs;
    private final SignalCodec signalCodec;
    private final Random random = new Random();
    private int frameCounter = 0;

    public CanService(SignalDefs signalDefs, SignalCodec signalCodec) {
        this.signalDefs = signalDefs;
        this.signalCodec = signalCodec;
    }

    /**
     * Generate 20 mock OBD-II CAN frames with realistic values.
     * 报文 ID、信号物理值、字节编码与解码读数全部来自前后端共用的
     * 唯一定义 shared/signals.json，本类不再自行写第二遍。
     */
    public List<CanFrame> generateMockFrames() {
        List<CanFrame> frames = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            frames.add(generateSingleFrame());
        }
        return frames;
    }

    private CanFrame generateSingleFrame() {
        MessageDef message = signalCodec.pickMessage(random);
        SignalCodec.MockPayload payload = signalCodec.generateMockPayload(message, random);

        double rxProbability = signalDefs.catalog().rxProbability();
        String direction = random.nextDouble() < rxProbability ? "RX" : "TX";

        return new CanFrame(
                "frame-" + (++frameCounter),
                System.currentTimeMillis(),
                message.id(),
                signalDefs.catalog().frameLength(),
                payload.data(),
                payload.decoded(),
                direction
        );
    }

    /**
     * Parse DBC text and return message definitions.
     */
    public Map<String, Object> parseDbc(String text) {
        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> messages = new ArrayList<>();

        String[] lines = text.split("\n");
        Map<String, Object> currentMsg = null;
        List<Map<String, Object>> signals = null;

        for (String line : lines) {
            String trimmed = line.trim();

            if (trimmed.matches("^BO_\\s+\\d+.*")) {
                String[] parts = trimmed.split("\\s+");
                if (parts.length >= 4) {
                    currentMsg = new LinkedHashMap<>();
                    currentMsg.put("id", Integer.parseInt(parts[1]));
                    String nameDlc = parts[2];
                    String name = nameDlc.endsWith(":") ? nameDlc.substring(0, nameDlc.length() - 1) : nameDlc;
                    currentMsg.put("name", name);
                    currentMsg.put("dlc", Integer.parseInt(parts[3]));
                    currentMsg.put("sender", parts.length > 4 ? parts[4] : "Unknown");
                    signals = new ArrayList<>();
                    currentMsg.put("signals", signals);
                    messages.add(currentMsg);
                }
            } else if (trimmed.matches("^SG_\\s+.*") && signals != null) {
                Map<String, Object> sig = new LinkedHashMap<>();
                String[] parts = trimmed.split("\\s+");
                if (parts.length >= 2) {
                    sig.put("name", parts[1]);
                    signals.add(sig);
                }
            } else if (trimmed.isEmpty()) {
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
     * 位提取与 factor/offset 换算与前端 signal-codec.ts 是同一套算法；
     * 未知报文沿用帧内既有的 decoded 读数，接口返回结构不变。
     */
    public Map<String, Double> decodeFrame(CanFrame frame) {
        Optional<MessageDef> message = signalDefs.findMessage(frame.getArbitrationId());
        if (message.isPresent()) {
            int[] bytes = signalCodec.parseHex(frame.getData());
            return signalCodec.decodeForApi(bytes, message.get());
        }
        return frame.getDecoded() != null ? frame.getDecoded() : new LinkedHashMap<>();
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
