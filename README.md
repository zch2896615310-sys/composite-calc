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
