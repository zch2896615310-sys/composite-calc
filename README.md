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
