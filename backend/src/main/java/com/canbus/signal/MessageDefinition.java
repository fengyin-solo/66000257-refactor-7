package com.canbus.signal;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class MessageDefinition {

    private int id;
    private String name;
    private int dlc;
    private String sender;
    private String receiver;
    private List<String> signals;

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public int getDlc() { return dlc; }
    public void setDlc(int dlc) { this.dlc = dlc; }

    public String getSender() { return sender; }
    public void setSender(String sender) { this.sender = sender; }

    public String getReceiver() { return receiver; }
    public void setReceiver(String receiver) { this.receiver = receiver; }

    public List<String> getSignals() { return signals; }
    public void setSignals(List<String> signals) { this.signals = signals; }
}
