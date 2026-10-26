# Composite Calc (composite-calc)

Structural calculation tools for composite materials, stone steel frames, and ceiling steel frames.

## Included Tools

**结构计算模块板V1** (`structural-v1/`) is available from the featured homepage card. It supports browser-side section, continuous-beam, load and member calculations, plus online CalculiX FEM recomputation and Word/PDF exports through Netlify Functions. Example 1 loads the second calculation book with its original acceleration of 1 mm/s². Example 2 reproduces the user-selected 6 mm C-tower Word book (0920) with 18 modules, source comparisons, stability and connection/test-demand modules. The stability module now follows explicit GB/T 50018-2025 section paths and keeps unverified custom-section data pending. DWG conversion remains separate; DXF and contour JSON work directly in the browser. See [`structural-v1/README.md`](structural-v1/README.md) and [`backend/README.md`](backend/README.md).

This repository contains the following calculation modules:

1.  **Composite Material Stress Calculation** (`复合材料应力分配计算3.8.html`)
    - Calculates stress distribution for composite materials.

2.  **Ceiling Steel Frame Conversion Layer Calculation** (`天花钢架转化层计算.html`)
    - Structural verification for ceiling steel conversion layers.

3.  **Stone Steel Frame Calculation** (`石材钢架计算.html`)
    - Calculations for stone cladding steel support systems.

## Usage

1.  Open `首页.html` (Homepage) in your web browser to access the main navigation menu.
2.  Alternatively, you can open any of the `.html` files directly to use a specific tool.

## Requirements

- A modern web browser (Edge, Chrome, Firefox, Safari).

## License

Private / Proprietary

## 原书2020标注稳定性模块

新增独立类型 `member_stability_legacy2020`，与2025模块并列。0920示例默认按原书N=1.2kN、M=0.01kN·m及人工系数复算；也可显式引用荷载、截面和梁。λ及正则化长细比按正确公式计算，原书0.348/0.244保留为历史对照；φ和β不自动查表。N′Ex可选原书人工33.2kN或当前公式复算，采用方式写入报告。分母≤0时判不满足并停止应力比计算。

“2020”是原书标注，不宣称存在GB 50018—2020规范；官方发布信息是GB/T50018—2025替代GB50018—2002。本模块所列公式满足不等于异型截面完整稳定性核定。旧示例2在打开时只增加一次，用户删除后不会再次自动添加。其他既有模块输入、2025版校核及角钢梁不变。Word/PDF包含用途、来源、公式、输入和原书差异，不满足项沿用红色标记。

## 双向连续梁与偏心扭转

新增独立类型 `beam_biaxial`。与原单向梁共用跨段、支点、荷载编辑方式；引用同材料截面完整Ix/Iy/Ixy，安装角转换后在同一4自由度/节点刚度矩阵内联立求解。Y向与X向可分别设置位移支点及弯曲转角约束，X向可选择离散支点或全长连续约束；后者不等于限扭。X向另设均布、集中荷载。旧单向类型继续拒绝未经转换的耦合截面。

均布边界、集中力和约束处划分节点，四次多项式恢复位移；弯矩、剪力、分向位移和同位置合成位移均由解析驻点取极值。全局力、力矩和自由度残差均检查，固转反力矩进入平衡。

可选圣维南扭转：用户输入相对剪心的荷载偏距和零扭转角支点，J为核定值或理想薄壁角钢近似，G=E/[2(1+ν)]。输出扭矩、扭转角和作用线附加位移。此项不含翘曲应力、局部畸变、弯扭屈曲或完整强度验算；弯曲挠度判断不冒充总位移/扭转承载力通过。未知参数为未计算，不以0代替；边界/无需扭转的核定记录在相关输入变动后失效。

示例2增加双向角钢模块并保留原单向0.261653mm作对照。已知条件为仅支点处连接、跨中无连续约束；先取4支点两向平移约束、弯曲转角自由、参考安装角0°，得到Y=0.406744mm、X=0.242929mm、同位置合成=0.473767mm。安装朝向、具体侧向约束与限扭仍须核定，未联动覆盖原锚栓0.2kN等采用值。15项新增解析/边界/扭转/迁移/导出检查，工作台165项、公开版56项通过。
