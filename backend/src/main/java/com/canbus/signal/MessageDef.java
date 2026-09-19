package com.canbus.signal;

import java.util.List;

/**
 * 消息定义（shared/signals.json 中 messages 的一项）。
 * 信号通过 signalNames 引用顶层信号定义，新增信号只改 JSON 一处。
 */
public record MessageDef(
        int id,
        String name,
        int dlc,
        String sender,
        List<String> signalNames
) {
}
