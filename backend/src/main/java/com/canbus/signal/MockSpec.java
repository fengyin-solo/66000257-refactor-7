package com.canbus.signal;

/**
 * 单信号模拟值区间（对应 shared/signals.json 中各信号的 mock 字段）。
 * 记录组件名与 JSON 字段一一对应，由 Jackson 直接反序列化。
 */
public record MockSpec(double min, double max, boolean integer) {
}
