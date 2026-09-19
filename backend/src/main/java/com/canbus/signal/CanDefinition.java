package com.canbus.signal;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * shared/can-signals.json 的 Java 映射。
 * 与前端 SignalDefinition / MessageDefinition / CanDefinition 一一对应。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class CanDefinition {

    private List<SignalDefinition> signals;
    private List<MessageDefinition> messages;

    public List<SignalDefinition> getSignals() { return signals; }
    public void setSignals(List<SignalDefinition> signals) { this.signals = signals; }

    public List<MessageDefinition> getMessages() { return messages; }
    public void setMessages(List<MessageDefinition> messages) { this.messages = messages; }
}
