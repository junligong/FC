# FC共享组件

这里集中维护四个日常任务与未来WorkBuddy都会使用的稳定接口：

- `config/project.json`：任务ID、顺序、启用状态、每日输出和固定汇总地址。
- `lib/runtime.mjs`：项目根目录、Asia/Shanghai日期、路径和原子写入。
- `lib/report-assets.mjs`：X 原图地址、稳定文件名和单文件报告图片内嵌。
- `presentation/`：合并阶段统一主题与足球日报布局适配。

业务任务只引用这些文件，不复制实现。WorkBuddy后续可从共享配置发现报告，或直接读取
`reports/daily/D/`与`reports/research/`中的稳定产物。

DuMate 与未来 WorkBuddy 均读取 `config/project.json`，不要为不同执行器复制第二套路径、
主题或业务数据库；执行器差异只应留在各自的启动配置中。
