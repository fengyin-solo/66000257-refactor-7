# solo-6600025: CAN 总线数据帧解析与诊断仪

## 技术栈
- Frontend: Vue 3 + TypeScript + Vite + Pinia + Tailwind CSS + ECharts
- Backend: Java 17 + Spring Boot 3.2.0

## 核心特性
1. **DBC 文件解析**：解析 DBC 格式信号定义，提取 CAN 信号参数
2. **OBD-II 标准 PID 支持**：EngineRPM、VehicleSpeed、CoolantTemp 等标准诊断
3. **实时帧捕获**：模拟 CAN 帧实时采集，支持过滤与搜索
4. **ECharts 时序曲线**：多信号实时趋势对比图
5. **总线负载率分析**：总线利用率统计
6. **CSV 导出**：帧数据导出为 CSV 格式

## 共用信号定义（单一事实源）
造模拟值、解析报文（位提取 + factor/offset）、越界/量程判断、单位与颜色，
前后端不再各写一份，统一收敛到：

- `shared/signals.json` — 唯一承载定义的文件：信号位布局、factor/offset、
  量程、DBC 单位与页面展示单位（如 CoolantTemp: `degC` / `°C`）、图表颜色、
  模拟值区间，以及消息列表。
- `shared/catalog.ts`、`shared/signal-codec.ts` — 前端直接引用的 TS 参考实现；
  后端 `com.canbus.signal.SignalDefs` / `SignalCodec` 与其逐函数镜像，
  构建时 Maven 把同一份 `shared/signals.json` 复制进 classpath。

默认 DBC 文本由该定义生成（与历史内置文本一致），因此刷新页面后
加载到的定义、解码结果、量程/单位/颜色表现与刷新前完全相同。

**新增一类信号**：只在 `shared/signals.json` 的 `signals` 中加一项，
并在需要承载它的 `messages[].signalNames` 中引用该名字即可，
前后端模拟、编码、解码、越界判断与展示全部自动生效，无需改代码。

