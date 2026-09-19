package com.canbus.signal;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 唯一定义 shared/signals.json 的后端访问入口。
 *
 * <p>该文件与前端 import 的是工作区中同一个文件（由 Maven 构建时复制到
 * classpath，见 pom.xml resources 配置），因此页面本地与系统后端对同一份
 * 定义给出相同结果。新增一类信号只改 shared/signals.json。
 */
@Component
public class SignalDefs {

    private SignalCatalog catalog;
    private Map<String, SignalDef> byName = new LinkedHashMap<>();
    private Map<Integer, MessageDef> byId = new LinkedHashMap<>();

    @PostConstruct
    void load() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        try (InputStream in = new ClassPathResource("signals.json").getInputStream()) {
            catalog = mapper.readValue(in, SignalCatalog.class);
        }
        for (SignalDef signal : catalog.signals()) {
            byName.put(signal.name(), signal);
        }
        for (MessageDef message : catalog.messages()) {
            byId.put(message.id(), message);
        }
    }

    public SignalCatalog catalog() {
        return catalog;
    }

    public List<MessageDef> messages() {
        return catalog.messages();
    }

    public Optional<SignalDef> findByName(String name) {
        return Optional.ofNullable(byName.get(name));
    }

    public Optional<MessageDef> findMessage(int id) {
        return Optional.ofNullable(byId.get(id));
    }

    /** 展开一条消息引用的全部信号定义（保留定义顺序）。 */
    public List<SignalDef> signalsOf(MessageDef message) {
        return message.signalNames().stream()
                .filter(byName::containsKey)
                .map(byName::get)
                .toList();
    }
}
