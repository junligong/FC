# FC共享组件

这里集中维护四个内容任务、汇总发布任务与 WorkBuddy 共用的稳定接口：

- `config/project.json`：任务ID、顺序、启用状态、每日输出和固定汇总地址。
- `lib/runtime.mjs`：项目根目录、Asia/Shanghai日期、路径和原子写入。
- `lib/report-assets.mjs`：X 原图地址、稳定文件名和单文件报告图片内嵌。
- `presentation/`：合并阶段统一主题与足球日报布局适配。

业务任务只引用这些文件，不复制实现。WorkBuddy后续可从共享配置发现报告，或直接读取
`reports/daily/D/`与`reports/research/`中的稳定产物。

WorkBuddy 统一读取 `config/project.json`，不要为执行器复制第二套路径、主题或业务数据库；
旧 DuMate 兼容层不得继续扩散到共享实现。
