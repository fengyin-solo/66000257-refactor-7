package com.canbus.signal;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class SignalDefinition {

    private String name;
    private int startBit;
    private int bitLength;
    private double factor;
    private double offset;
    private double minValue;
    private double maxValue;
    private String unit;
    private MockRange mock;
    /** 物理值转原始值时的取整方式：round | truncate */
    private String encodeRound;

    public static class MockRange {
        private double min;
        private double max;

        public double getMin() { return min; }
        public void setMin(double min) { this.min = min; }

        public double getMax() { return max; }
        public void setMax(double max) { this.max = max; }
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public int getStartBit() { return startBit; }
    public void setStartBit(int startBit) { this.startBit = startBit; }

    public int getBitLength() { return bitLength; }
    public void setBitLength(int bitLength) { this.bitLength = bitLength; }

    public double getFactor() { return factor; }
    public void setFactor(double factor) { this.factor = factor; }

    public double getOffset() { return offset; }
    public void setOffset(double offset) { this.offset = offset; }

    public double getMinValue() { return minValue; }
    public void setMinValue(double minValue) { this.minValue = minValue; }

    public double getMaxValue() { return maxValue; }
    public void setMaxValue(double maxValue) { this.maxValue = maxValue; }

    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }

    public MockRange getMock() { return mock; }
    public void setMock(MockRange mock) { this.mock = mock; }

    public String getEncodeRound() { return encodeRound; }
    public void setEncodeRound(String encodeRound) { this.encodeRound = encodeRound; }
}
