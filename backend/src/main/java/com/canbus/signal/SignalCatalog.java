package com.canbus.signal;

import java.util.List;

/**
 * shared/signals.json 的根结构：帧长、RX 概率与信号/消息定义。
 */
public record SignalCatalog(
        int frameLength,
        double rxProbability,
        List<SignalDef> signals,
        List<MessageDef> messages
) {
}
