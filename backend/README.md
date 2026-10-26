# 在线结构计算后台

生产站点使用同一 GitHub 仓库的 Netlify Functions，无需连接访客电脑。

- `api` 接收有限元与计算书请求，返回独立任务编号；查询、结果和下载保存在 Netlify Blobs。
- `compute-background` 使用 Python、NumPy 2.2.6 与 CalculiX 2.23。支持原分层壳和 C3D8I 实体；不调用 SAP，也不按示例结果插值。
- `report-background` 使用现有原生 OOXML 写入器生成可编辑 Word，公式、表格和不满足项红字保留。
- `pdf-background` 以相同计算书数据和结果图片生成 PDF，嵌入中文字体。PDF 与 Word 分别排版，分页可能不同。
- 任务及文件下载有效期24小时，`cleanup` 每日清理过期任务。项目 JSON 的本地保存与导出不受此期限影响。

`tools/sync-cloud-backend.py <工作台目录>` 同步已验证核心的源代码副本；只把求解程序路径改为环境变量，不修改材料、荷载、单元或后处理定义。原工作台及工程原件不改动。`cloud_worker.py` 是云端入口。

Netlify 构建从 conda-forge 准备 Linux 运行环境，并执行 `tools/verify-cloud-runtime.py`：原值1示例的位移和各层峰值必须与已验证快照相符，否则构建失败，原发布保持运行。运行环境和后台代码不进入静态发布目录。

上线验证已覆盖：原值1模型实际网页重算；加速度改2后 EQ_Y 位移翻倍；264单元三维实体的求解与反力平衡；13章完整计算书的 Word、PDF 实际下载、中文、结果图和红字检查。在线单元上限为2000个分层壳平面单元或5000个实体单元，超限拒绝任务并要求调整网格，不自动修改输入。
