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

## 信号定义的单一来源
信号的位布局（startBit/bitLength/factor/offset）、量程（min/max）、单位、
模拟值区间与取整方式统一定义在 `shared/can-signals.json`，前端
（`frontend/src/shared/signal-engine.ts`）与后端
（`backend/src/main/java/com/canbus/signal/CanSignalEngine.java`）
是严格同构的引擎，造模拟值、编码/解析报文、越界判定都只读取这份定义。
新增一类信号只需修改该 JSON：前端 Vite 直接打包该文件，后端通过 Maven
将 `../shared` 作为 classpath 资源引入。两端算法的等价性由
`frontend/scripts/parity-check.ts` 校验。
