package com.canbus.signal;

/**
 * 信号定义（前后端共用唯一定义 shared/signals.json 中的一项）。
 *
 * <p>承载位布局、factor/offset、量程、单位（DBC 原始单位与页面展示单位）、
 * 图表颜色与模拟值区间。页面与后端对同一份定义给出相同结果。
 */
public record SignalDef(
        String name,
        int startBit,
        int bitLength,
        double factor,
        double offset,
        double minValue,
        double maxValue,
        String unit,
        String displayUnit,
        String color,
        String chartColor,
        MockSpec mock
) {

    /** 生成一个模拟物理值，规则与前端 signal-codec.ts mockValue 镜像。 */
    public double mockValue(java.util.Random random) {
        double value = mock.min() + random.nextDouble() * (mock.max() - mock.min());
        return mock.integer() ? Math.floor(value) : value;
    }

    public boolean isOutOfRange(double value) {
        return value < minValue || value > maxValue;
    }

    /** 量程百分比，越界钳制在 0–100；与前端 rangePercent 镜像。 */
    public double rangePercent(double value) {
        if (maxValue == minValue) {
            return 0;
        }
        double percent = ((value - minValue) / (maxValue - minValue)) * 100.0;
        return Math.max(0, Math.min(100, percent));
    }
}
