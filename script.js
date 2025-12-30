const TABLE_B02 = [
    { r: 0.50, mb0: 0.1303 }, { r: 0.55, mb0: 0.1320 },
    { r: 0.60, mb0: 0.1338 }, { r: 0.65, mb0: 0.1360 },
    { r: 0.70, mb0: 0.1383 }, { r: 0.75, mb0: 0.1408 },
    { r: 0.80, mb0: 0.1435 }, { r: 0.85, mb0: 0.1463 },
    { r: 0.90, mb0: 0.1494 }, { r: 0.95, mb0: 0.1526 },
    { r: 1.00, mb0: 0.1559 }
];

class StoneCalculator {
    constructor() {
        this.E_steel = 206000;
        this.E_stone = 50000;
        this.limit_steel_sigma = 215;
        this.limit_steel_tau = 125;
    }

    calculateMb0(a0, b0) {
        let r_raw = Math.min(a0, b0) / Math.max(a0, b0);
        let ratio = Math.max(r_raw, 0.5);

        let lower = TABLE_B02[0];
        let upper = TABLE_B02[TABLE_B02.length - 1];

        for (let i = 0; i < TABLE_B02.length - 1; i++) {
            if (ratio >= TABLE_B02[i].r && ratio <= TABLE_B02[i + 1].r) {
                lower = TABLE_B02[i];
                upper = TABLE_B02[i + 1];
                break;
            }
        }

        const fraction = (ratio - lower.r) / (upper.r - lower.r);
        const val = lower.mb0 + fraction * (upper.mb0 - lower.mb0);

        let step = '';
        if (r_raw < 0.5) {
            step = `Ratio = ${r_raw.toFixed(3)} < 0.5, take 0.5 -> mb0 = ${val}`;
        } else {
            step = `${lower.mb0} + (${ratio.toFixed(3)} - ${lower.r}) / (${upper.r} - ${lower.r}) × (${upper.mb0} - ${lower.mb0})`;
        }

        return { val, step, ratio };
    }

    calculate(inputs) {
        try {
            const {
                amax, density, fgm,
                widthB, heightH, thicknessT, spanA0, spanB0,
                panelType, boltN, boltD, boltH, slotC, slotS, slotN,
                hangerL1, hangerL2, hangerL3,
                hangerA, hangerA0, hangerWx, hangerAe,
                limitShear, limitBend, limitBoltT, limitBoltV,
                beamSpan, beamMx, beamMy, beamDx, beamDy, beamWx, beamWy, beamIx, beamGamma,
                // Weld Inputs
                weldL1, weldL2, weldHf, weldHe, weldNx, weldVy, weldBf, weldFw,
                // Column Inputs
                colProfile, colPitch, colSpan, colM, colArea, colWx, colGamma, colHTotal, colDeflAct,
                anchorN,
                // New Inputs
                location, intensity,
                loadDivVert, loadDivHorz
            } = inputs;

            // Dynamic Limits
            const limit_stone_sigma = fgm / 2.15;
            const limit_shear_stone = fgm / 4.30;

            const res = (val, formula, step, limit, unit, limitStep = '') => {
                const status = limit ? (val <= limit) : null;
                return { val, formula, step, limit, unit, status, limitStep };
            };

            // --- 1. Loads ---
            const t_m = thicknessT / 1000;
            const gk_val = density * t_m;
            const gk = res(gk_val, 't × ρ', `${t_m.toFixed(3)} × ${density}`, null, 'kN/m²');
            const gd_val = 1.3 * gk_val;
            const gd = res(gd_val, '1.3 × Gk', `1.3 × ${gk_val.toFixed(2)}`, null, 'kN/m²');
            const ggk_val = 1.2 * gk_val;
            const ggk = res(ggk_val, '1.2 × Gk', `1.2 × ${gk_val.toFixed(2)}`, null, 'kN/m²');
            const g_val = 1.3 * ggk_val;
            const g = res(g_val, '1.3 × GGK', `1.3 × ${ggk_val.toFixed(2)}`, null, 'kN/m²');
            const betaE = 5.0;
            const qEk_val = betaE * amax * ggk_val;
            const qEk_note = `${location || 'xx'}地区的抗震设防烈度为${intensity || 'xx'}，地震系数αmax取值为${amax}。`;
            const qEk = res(qEk_val, '5.0 × αmax × GGK', `${qEk_note}\n5.0 × ${amax} × ${ggk_val.toFixed(2)}`, null, 'kN/m²');
            const qE_val = 1.4 * qEk_val;
            const qE = res(qE_val, '1.4 × qEk', `1.4 × ${qEk_val.toFixed(2)}`, null, 'kN/m²');

            // --- 2. Stone Panel Check ---
            const mb0_res = this.calculateMb0(spanA0, spanB0);
            const mb0 = { val: mb0_res.val, formula: 'Interpolation', step: mb0_res.step, limit: null, unit: '', limitStep: '' };

            const q_MPa = qE_val * 0.001;
            const calcB0 = Math.max(spanA0, spanB0);
            const sigma_val = (6 * mb0.val * q_MPa * Math.pow(calcB0, 2)) / Math.pow(thicknessT, 2);
            const limitStep_sigma = `Limit fg1 = fgm / 2.15 = ${fgm} / 2.15 = ${limit_stone_sigma.toFixed(3)} MPa`;
            const sigma = res(sigma_val, '6 × mb0 × q × b0² / t²', `6 × ${mb0.val.toFixed(4)} × ${q_MPa.toFixed(4)} × ${calcB0}² / ${thicknessT}²`, limit_stone_sigma, 'MPa', limitStep_sigma);

            let tau_pos_val = 0;
            let tau_neg_val = 0;
            let tau_kerf_val = 0;
            let tau_pos = null;
            let tau_neg = null;
            let tau_kerf = null;

            const beta = 1.25;
            const limitStep_shear = `Limit fg2 = fgm / 4.30 = ${fgm} / 4.30 = ${limit_shear_stone.toFixed(3)} MPa`;

            if (panelType === 'backbolt') {
                const term_pos = (boltD + thicknessT - boltH) * (thicknessT - boltH);
                const force = qE_val * widthB * heightH * beta * 0.001;
                tau_pos_val = force / (boltN * Math.PI * term_pos);
                const step_pos = `(${qE_val.toFixed(2)} × ${widthB} × ${heightH} × ${beta} × 10⁶) / (${boltN} × π × (${boltD}+${thicknessT}-${boltH}) × (${thicknessT}-${boltH}))`;
                tau_pos = res(tau_pos_val, '(qE × a × b × β) / (n × π × (d + t - h) × (t - h))', step_pos, limit_shear_stone, 'MPa', limitStep_shear);

                const term_neg = (boltD + boltH) * boltH;
                tau_neg_val = force / (boltN * Math.PI * term_neg);
                const step_neg = `(${qE_val.toFixed(2)} × ${widthB} × ${heightH} × ${beta} × 10⁶) / (${boltN} × π × (${boltD}+${boltH}) × ${boltH})`;
                tau_neg = res(tau_neg_val, '(qE × a × b × β) / (n × π × (d + h) × h)', step_neg, limit_shear_stone, 'MPa', limitStep_shear);
            } else {
                const force = qE_val * widthB * heightH * beta * 0.001;
                const shearArea = (thicknessT - slotC) * slotS;
                tau_kerf_val = force / (slotN * shearArea);
                const step_kerf = `(${qE_val.toFixed(2)} × ${widthB} × ${heightH} × ${beta} × 10⁶) / (${slotN} × (${thicknessT} - ${slotC}) × ${slotS})`;
                tau_kerf = res(tau_kerf_val, '(qE × a × b × β) / (n × (t - c) × s)', step_kerf, limit_shear_stone, 'MPa', limitStep_shear);
            }

            // --- 3. Hanger Check ---
            // --- 3. Hanger Check ---
            const divVert = loadDivVert || 2; // Default to 2 if undefined/0 (though UI defaults to 2)
            const divHorz = loadDivHorz || 4; // Default to 4

            const area_m2 = (widthB * heightH) / 1000000;
            const area_step_str = `${(widthB / 1000).toFixed(2)} × ${(heightH / 1000).toFixed(2)} = ${area_m2.toFixed(3)}`; // 1.082 display

            const P_horz_val = (qE_val * area_m2) / divHorz;
            const P_horz = res(P_horz_val, `qE × Area / ${divHorz}`,
                `Area = ${area_step_str} m²\n` +
                `P_horz = ${qE_val.toFixed(2)} × ${area_m2.toFixed(3)} / ${divHorz}`,
                null, 'kN');

            const P_vert_val = (gd_val * area_m2) / divVert;
            const P_vert = res(P_vert_val, `Gd × Area / ${divVert}`,
                `Area = ${area_step_str} m²\n` +
                `P_vert = ${gd_val.toFixed(2)} × ${area_m2.toFixed(3)} / ${divVert}`,
                null, 'kN');
            const tau_unweak_val = (P_horz_val * 1000) / hangerA;
            const tau_unweak = res(tau_unweak_val, 'P_horz / A', `${(P_horz_val * 1000).toFixed(2)} / ${hangerA}`, limitShear, 'MPa');
            const M_hanger_val = P_vert_val * hangerL1 + P_horz_val * hangerL2;
            const M_hanger = res(M_hanger_val, 'P_vert × L1 + P_horz × L2', `${P_vert_val.toFixed(2)} × ${hangerL1} + ${P_horz_val.toFixed(2)} × ${hangerL2}`, null, 'kN·m');

            const sigma_hanger_val = (M_hanger_val * 1000000 / hangerWx) + (P_horz_val * 1000 / hangerA0);
            const m_nmm = M_hanger_val * 1000000;
            const p_horz_n = P_horz_val * 1000;
            const step_sigma_hanger = `M = ${M_hanger_val.toFixed(3)} kN·m = ${m_nmm.toFixed(0)} N·mm\n` +
                `P_horz = ${P_horz_val.toFixed(2)} kN = ${p_horz_n.toFixed(0)} N\n` +
                `σ = M/Wx + P/A = ${m_nmm.toFixed(0)} / ${hangerWx} + ${p_horz_n.toFixed(0)} / ${hangerA0}`;
            const sigma_hanger = res(sigma_hanger_val, 'M / Wx + P_horz / A0', step_sigma_hanger, limitBend, 'MPa');

            const tau_weak_val = (P_vert_val * 1000) / hangerA0;
            const p_vert_n = P_vert_val * 1000;
            const step_tau_weak = `P_vert = ${P_vert_val.toFixed(2)} kN = ${p_vert_n.toFixed(0)} N\n` +
                `τ = P_vert / A0 = ${p_vert_n.toFixed(0)} / ${hangerA0}`;
            const tau_weak = res(tau_weak_val, 'P_vert / A0', step_tau_weak, limitShear, 'MPa');
            const N_bolt_val = (P_vert_val * hangerL1 + P_horz_val * hangerL2) / hangerL3;
            const sigma_bolt_val = (N_bolt_val * 1000) / hangerAe;
            const n_bolt_n = N_bolt_val * 1000;
            const step_sigma_bolt = `N1 = (P_vert×L1 + P_horz×L2) / L3\n` +
                `   = (${P_vert_val.toFixed(3)}×${hangerL1} + ${P_horz_val.toFixed(3)}×${hangerL2}) / ${hangerL3}\n` +
                `   = ${N_bolt_val.toFixed(3)} kN = ${n_bolt_n.toFixed(0)} N\n` +
                `σ = N1 / Ae = ${n_bolt_n.toFixed(0)} / ${hangerAe}`;
            const sigma_bolt = res(sigma_bolt_val, 'N1 / Ae', step_sigma_bolt, limitBoltT, 'MPa');

            const V_bolt_val = P_horz_val;
            const tau_bolt_val = (V_bolt_val * 1000) / hangerAe;
            const v_bolt_n = V_bolt_val * 1000;
            const step_tau_bolt = `V = ${V_bolt_val.toFixed(3)} kN = ${v_bolt_n.toFixed(0)} N\n` +
                `τ = V / Ae = ${v_bolt_n.toFixed(0)} / ${hangerAe}`;
            const tau_bolt = res(tau_bolt_val, 'V / Ae', step_tau_bolt, limitBoltV, 'MPa');

            // --- 5. Beam Check ---
            const sigma_beam_val = ((beamMx * 1000000 / beamWx) + (beamMy * 1000000 / beamWy)) / beamGamma;
            const term1 = (beamMx * 1000000 / beamWx).toFixed(2);
            const term2 = (beamMy * 1000000 / beamWy).toFixed(2);
            const step_sigma_beam_1 = `(${beamMx}×10⁶ / ${beamWx} + ${beamMy}×10⁶ / ${beamWy}) / ${beamGamma}`;
            const step_sigma_beam_2 = `(${term1} + ${term2}) / ${beamGamma}`;
            const step_sigma_beam_3 = `= ${sigma_beam_val.toFixed(2)} MPa`;
            const sigma_beam = res(sigma_beam_val, '(Mx / Wx + My / Wy) / γ', step_sigma_beam_1, this.limit_steel_sigma, 'MPa');
            sigma_beam.step1 = step_sigma_beam_1;
            sigma_beam.step2 = step_sigma_beam_2;
            sigma_beam.step3 = step_sigma_beam_3;

            const def_beam_val = Math.sqrt(Math.pow(beamDx, 2) + Math.pow(beamDy, 2));
            const limit_beam_def_val = beamSpan / 250;
            const step_def_beam_1 = `√(${beamDx}² + ${beamDy}²)`;
            const step_def_beam_2 = `= ${def_beam_val.toFixed(2)} mm`;
            const step_def_beam_limit = `Limit = L / 250 = ${beamSpan} / 250 = ${limit_beam_def_val.toFixed(2)} mm`;
            const def_beam = res(def_beam_val, '√(dx² + dy²)', step_def_beam_1, limit_beam_def_val, 'mm', step_def_beam_limit);
            def_beam.step1 = step_def_beam_1;
            def_beam.step2 = step_def_beam_2;

            // --- 6. Weld Check ---
            const weldAh = weldL1 * weldHe;
            const sigma_wh_val = (weldNx * 1000) / weldAh;
            const tau_wh_val = (weldVy * 1000) / weldAh;
            const comb_wh_val = Math.sqrt(Math.pow(sigma_wh_val / weldBf, 2) + Math.pow(tau_wh_val, 2));

            const step_wh_sigma = `σ = Nx / (L1×he) = ${weldNx}×1000 / (${weldL1}×${weldHe}) = ${sigma_wh_val.toFixed(2)} MPa`;
            const step_wh_tau = `τ = Vy / (L1×he) = ${weldVy}×1000 / (${weldL1}×${weldHe}) = ${tau_wh_val.toFixed(2)} MPa`;
            const step_wh_comb = `σ_comb = √( (σ/βf)² + τ² ) = √( (${sigma_wh_val.toFixed(2)}/${weldBf})² + ${tau_wh_val.toFixed(2)}² ) = ${comb_wh_val.toFixed(2)} MPa`;

            const res_weld_h_sigma = res(sigma_wh_val, 'Nx / (L1*he)', step_wh_sigma, null, 'MPa');
            const res_weld_h_tau = res(tau_wh_val, 'Vy / (L1*he)', step_wh_tau, null, 'MPa');
            const res_weld_h_comb = res(comb_wh_val, '√( (σ/βf)² + τ² )', step_wh_comb, weldFw, 'MPa', `Limit: < ${weldFw} MPa`);

            const weldAv = weldL2 * weldHe;
            // Vert Weld: Normal Stress by Vy, Shear by Nx (Swapped per user request)
            const sigma_wv_val = (weldVy * 1000) / weldAv;
            const tau_wv_val = (weldNx * 1000) / weldAv;
            const comb_wv_val = Math.sqrt(Math.pow(sigma_wv_val / weldBf, 2) + Math.pow(tau_wv_val, 2));

            const step_wv_sigma = `σ = Vy / (L2×he) = ${weldVy}×1000 / (${weldL2}×${weldHe}) = ${sigma_wv_val.toFixed(2)} MPa`;
            const step_wv_tau = `τ = Nx / (L2×he) = ${weldNx}×1000 / (${weldL2}×${weldHe}) = ${tau_wv_val.toFixed(2)} MPa`;
            const step_wv_comb = `σ_comb = √( (σ/βf)² + τ² ) = √( (${sigma_wv_val.toFixed(2)}/${weldBf})² + ${tau_wv_val.toFixed(2)}² ) = ${comb_wv_val.toFixed(2)} MPa`;

            const res_weld_v_sigma = res(sigma_wv_val, 'Vy / (L2*he)', step_wv_sigma, null, 'MPa');
            const res_weld_v_tau = res(tau_wv_val, 'Nx / (L2*he)', step_wv_tau, null, 'MPa');
            const res_weld_v_comb = res(comb_wv_val, '√( (σ/βf)² + τ² )', step_wv_comb, weldFw, 'MPa', `Limit: < ${weldFw} MPa`);

            // --- 7. Column Check ---
            // N is now calculated: N = G * B * H
            // G = g_val (kN/m2)
            // B = colPitch (mm) -> m
            // H = colHTotal (m) -> m
            const col_B_m = colPitch / 1000;
            const col_H_m = colHTotal;
            const col_N_calc = g_val * col_B_m * col_H_m;

            const step_col_n_1 = `N = G × B × H`;
            const step_col_n_2 = `其中 B = ${colPitch} mm (立柱分隔宽度)`;
            const step_col_n_3 = `= ${g_val.toFixed(2)} (kN/m²) × ${col_B_m.toFixed(2)} (m) × ${col_H_m.toFixed(2)} (m)`;
            const step_col_n_4 = `= ${col_N_calc.toFixed(2)} kN`;
            const step_col_n_all = `${step_col_n_1}\n${step_col_n_2}\n${step_col_n_3}\n${step_col_n_4}`;

            // Line Load Calculation
            const q_line_val = qE_val * col_B_m;
            const step_q_line = `q_line = qE × B\n` +
                `      = ${qE_val.toFixed(2)} (kN/m²) × ${col_B_m.toFixed(3)} (m)\n` +
                `      = ${q_line_val.toFixed(2)} kN/m`;
            const q_line = res(q_line_val, 'qE × B', step_q_line, null, 'kN/m');

            // Use calculated N for stress check
            const sigma_col_val = (col_N_calc * 1000 / colArea) + (colM * 1000000) / (colGamma * colWx);
            const step_col_sigma = `σ = N/An + M/(γ×Wx)\n  = ${col_N_calc.toFixed(2)}×1000/${colArea} + ${colM}×10⁶/(${colGamma}×${colWx})\n  = ${sigma_col_val.toFixed(2)} MPa`;
            const res_col_sigma = res(sigma_col_val, 'N/A + M/(γ*Wx)', step_col_sigma, 215, 'MPa', 'Limit: < 215 MPa');

            const limit_col_def_val = colSpan / 250;
            const res_col_def = res(colDeflAct, 'Actual Defl', `输入值: ${colDeflAct}`, limit_col_def_val, 'mm', `Limit: L/250 = ${limit_col_def_val.toFixed(2)}`);

            // Override colN result with calculated one
            const res_col_n = res(col_N_calc, 'G * B * H', step_col_n_all, null, 'kN');

            // --- 8. Anchor Check ---
            const total_G = g_val * area_m2;
            const total_H = qE_val * area_m2;
            const V_anchor_res_val = total_G / anchorN;
            const V_anchor = res(V_anchor_res_val, 'G_total / n', `${total_G.toFixed(2)} / ${anchorN}`, 10.0, 'kN');
            const N_anchor_res_val = total_H / anchorN;
            const N_anchor = res(N_anchor_res_val, 'H_total / n', `${total_H.toFixed(2)} / ${anchorN}`, 10.0, 'kN');

            return {
                gk, gd, ggk, g, qEk, qE,
                mb0, sigma,
                tau_pos, tau_neg, tau_kerf,
                P_vert, P_horz, tau_unweak, M_hanger, sigma_hanger, tau_weak, sigma_bolt, tau_bolt,
                sigma_beam, def_beam,
                res_weld_h_sigma, res_weld_h_tau, res_weld_h_comb,
                res_weld_v_sigma, res_weld_v_tau, res_weld_v_comb,
                res_col_n, q_line, res_col_sigma, res_col_def,
                V_anchor, N_anchor
            };
        } catch (e) {
            console.error(e);
            const errEl = document.getElementById('design-note-text');
            if (errEl) errEl.innerHTML = `<span style="color:red; font-weight:bold;">ERROR: ${e.message}</span>`;
            return {};
        }
    }
}

function drawSchematic(width, height, a0, b0, type) {
    const container = document.getElementById('stone-svg-wrapper');
    const title = document.getElementById('schematic-title');
    const padding = 40;
    const maxW = 300 - padding * 2;
    const maxH = 150 - padding * 2;
    const scale = Math.min(maxW / width, maxH / height);
    const w = width * scale;
    const h = height * scale;
    const w0 = a0 * scale;
    const h0 = b0 * scale;
    const cx = 150;
    const cy = 75;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const x0_start = cx - w0 / 2;
    const x0_end = cx + w0 / 2;
    const y0_start = cy - h0 / 2;
    const y0_end = cy + h0 / 2;
    let markers = '';

    if (type === 'backbolt') {
        title.innerText = `BACK BOLT SCHEMATIC (背栓模型) - a=${width}, b=${height}`;
        const r = 3;
        markers += `<circle cx="${x0_start}" cy="${y0_start}" r="${r}" fill="#ef4444" />`;
        markers += `<circle cx="${x0_end}" cy="${y0_start}" r="${r}" fill="#ef4444" />`;
        markers += `<circle cx="${x0_start}" cy="${y0_end}" r="${r}" fill="#ef4444" />`;
        markers += `<circle cx="${x0_end}" cy="${y0_end}" r="${r}" fill="#ef4444" />`;
    } else {
        title.innerText = `KERF/SLOT SCHEMATIC (短槽模型) - a=${width}, b=${height}`;
        const sw = 20; const sh = 4;
        markers += `<rect x="${x0_start - sw / 2}" y="${y - sh / 2}" width="${sw}" height="${sh}" fill="#3b82f6" />`;
        markers += `<rect x="${x0_end - sw / 2}" y="${y - sh / 2}" width="${sw}" height="${sh}" fill="#3b82f6" />`;
        markers += `<rect x="${x0_start - sw / 2}" y="${y + h - sh / 2}" width="${sw}" height="${sh}" fill="#3b82f6" />`;
        markers += `<rect x="${x0_end - sw / 2}" y="${y + h - sh / 2}" width="${sw}" height="${sh}" fill="#3b82f6" />`;
        markers += `<line x1="${x0_start}" y1="${y + 10}" x2="${x0_end}" y2="${y + 10}" stroke="#3b82f6" stroke-width="1" />`;
        markers += `<text x="${cx}" y="${y + 25}" font-size="10" text-anchor="middle" fill="#3b82f6">a0 = ${a0}</text>`;
    }
    const dimColor = "#6b7280";
    const dimSvg = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f3f4f6" stroke="#9ca3af" stroke-width="1"/>
        <rect x="${x0_start}" y="${y0_start}" width="${w0}" height="${h0}" fill="none" stroke="#d1d5db" stroke-dasharray="4 2"/>
        ${markers}
        <text x="${cx}" y="${y + h + 15}" font-size="10" text-anchor="middle" fill="${dimColor}">a = ${width}</text>
        <text x="${x + w + 10}" y="${cy}" font-size="10" text-anchor="middle" fill="${dimColor}" transform="rotate(90, ${x + w + 10}, ${cy})">b = ${height}</text>
    `;
    container.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 300 150">${dimSvg}</svg>`;
}

function drawHangerSchematic(l1, l2, l3) {
    const container = document.getElementById('hanger-schematic-container');
    const w = 300; const h = 250;
    const scale = 2500;
    const x0 = 140; const y0 = 160; const thick = 25; const leg_h = 140; const leg_w = 100;
    const x_load = x0 + thick + l1 * scale;
    const y_center = y0 - thick / 2;
    const y_load_final = y_center - l2 * scale;
    const x_bolt = x0 - (l3 * scale);
    const svg = `
    <svg width="100%" height="100%" viewBox="0 0 ${w} ${h}">
        <defs>
            <marker id="arrow-grey-filled" markerWidth="6" markerHeight="6" refX="0" refY="2" orient="auto"><polygon points="0 0, 6 2, 0 4" fill="#9ca3af" /></marker>
            <marker id="arrow-dim-red" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#ef4444" /></marker>
             <marker id="arrow-dim-grey" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#64748b" /></marker>
        </defs>
        <rect x="${x0 - leg_w - 20}" y="${y0}" width="20" height="100" fill="#cbd5e1" />
        <rect x="${x0 - leg_w - 20}" y="${y0}" width="${leg_w + 40}" height="20" fill="#cbd5e1" />
        <text x="${x0 - leg_w}" y="${y0 + 80}" font-size="12" fill="#94a3b8" font-weight="bold">Beam</text>
        <line x1="${x_bolt}" y1="${y0 - thick}" x2="${x_bolt}" y2="${y0 + 80}" stroke="#475569" stroke-width="2" stroke-dasharray="4 4"/>
        <circle cx="${x_bolt}" cy="${y0 - thick / 2}" r="5" fill="#fff" stroke="#475569" stroke-width="2"/>
        <rect x="${x0}" y="${y0 - leg_h}" width="${thick}" height="${leg_h}" fill="#3b82f6" />
        <rect x="${x0 - leg_w}" y="${y0 - thick}" width="${leg_w}" height="${thick}" fill="#3b82f6" />
        <rect x="${x0}" y="${y0 - thick}" width="${thick}" height="${thick}" fill="#3b82f6" />
        <line x1="${x0 + thick}" y1="${y_center}" x2="${x_load}" y2="${y_center}" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3 3"/>
        <line x1="${x_load}" y1="${y_center}" x2="${x_load}" y2="${y_load_final}" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3 3"/>
        <line x1="${x_load - 20}" y1="${y_load_final}" x2="${x_load}" y2="${y_load_final}" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrow-grey-filled)"/>
        <line x1="${x0 + thick}" y1="${y_load_final - 15}" x2="${x_load}" y2="${y_load_final - 15}" stroke="#ef4444" stroke-width="1.5"/>
        <line x1="${x0 + thick}" y1="${y_load_final - 10}" x2="${x0 + thick}" y2="${y_load_final - 20}" stroke="#ef4444" stroke-width="1.5"/>
        <line x1="${x_load}" y1="${y_load_final - 10}" x2="${x_load}" y2="${y_load_final - 20}" stroke="#ef4444" stroke-width="1.5"/>
        <text x="${(x0 + thick + x_load) / 2}" y="${y_load_final - 25}" font-size="12" fill="#ef4444" font-weight="bold" text-anchor="middle">L1</text>
        <line x1="${x_load + 15}" y1="${y_center}" x2="${x_load + 15}" y2="${y_load_final}" stroke="#ef4444" stroke-width="1.5"/>
        <line x1="${x_load + 10}" y1="${y_center}" x2="${x_load + 20}" y2="${y_center}" stroke="#ef4444" stroke-width="1.5"/>
        <line x1="${x_load + 10}" y1="${y_load_final}" x2="${x_load + 20}" y2="${y_load_final}" stroke="#ef4444" stroke-width="1.5"/>
        <text x="${x_load + 25}" y="${(y_center + y_load_final) / 2}" font-size="12" fill="#ef4444" font-weight="bold" dominant-baseline="middle">L2</text>
        <line x1="${x_bolt}" y1="${y0 + 60}" x2="${x0}" y2="${y0 + 60}" stroke="#64748b" stroke-width="1.5" marker-start="url(#arrow-dim-grey)" marker-end="url(#arrow-dim-grey)"/>
        <line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 + 65}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="2 2"/>
        <text x="${(x_bolt + x0) / 2}" y="${y0 + 75}" font-size="12" fill="#64748b" font-weight="bold" text-anchor="middle">L3</text>
    </svg>`;
    container.innerHTML = svg;
}

const HistoryManager = {
    key: 'stonecalc_history',
    save(data) {
        const titleInput = document.getElementById('inp-project-title');
        const name = titleInput ? titleInput.value : "Untitled Project";

        // Enrich data with Toolbox inputs
        const fullData = {
            ...data,
            toolbox1: typeof ToolboxManager !== 'undefined' ? ToolboxManager.getData() : null,
            toolbox2: typeof ToolboxManager2 !== 'undefined' ? ToolboxManager2.getData() : null,
            toolbox3: typeof ToolboxManager3 !== 'undefined' ? ToolboxManager3.getData() : null
        };

        const history = this.getAll();
        const newItem = { id: Date.now(), name: name, time: new Date().toLocaleString('zh-CN', { hour12: false }), data: fullData };
        history.unshift(newItem);
        localStorage.setItem(this.key, JSON.stringify(history));
        this.render();
    },
    getAll() { return JSON.parse(localStorage.getItem(this.key) || '[]'); },
    delete(id) {
        const history = this.getAll().filter(item => item.id !== id);
        localStorage.setItem(this.key, JSON.stringify(history));
        this.render();
    },
    render() {
        const list = document.getElementById('history-list');
        if (!list) return;
        list.innerHTML = '';
        this.getAll().forEach(item => {
            const el = document.createElement('div');
            el.className = 'history-item';
            el.innerHTML = `<div class="history-name">${item.name}</div><div class="history-time">${item.time}</div><div class="delete-btn" onclick="deleteSnapshot(event, ${item.id})">×</div>`;
            el.onclick = (e) => { if (!e.target.classList.contains('delete-btn')) loadSnapshot(item.id); };
            list.appendChild(el);
        });
    }
};

const ExportManager = {
    async exportWord() {
        const titleInput = document.getElementById('inp-project-title');
        const title = titleInput ? titleInput.value : "Stone Calculation";
        const desc = document.querySelector('.system-desc').value;
        const calcBlock = (title, resObj, label) => {
            if (!resObj) return '';
            const statusColor = resObj.limit ? (resObj.status ? '#10b981' : '#ef4444') : '#374151';
            const statusText = resObj.status ? '满足 (PASS)' : '不满足 (FAIL)';
            const limitText = resObj.limit ? `Limit: < ${resObj.limit.toFixed(2)} ${resObj.unit}` : '';
            const limitStepHtml = resObj.limitStep ? `<div style="margin-top:4px; color:#666;">${resObj.limitStep}</div>` : '';
            return `
            <div style="margin-bottom: 8px; border-bottom: 1px dashed #eee; padding-bottom: 8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                    <div style="font-weight:bold; font-size:14px;">${label}</div>
                    <div style="font-size:12px; color:#666;">${limitText}</div>
                </div>
                <div style="background:#f9fafb; border:1px solid #e5e7eb; padding:5px; border-radius:4px; font-family:Courier New; font-size:12px; color:#374151; margin-bottom:2px;">
                    <div>Formula: ${resObj.formula}</div>
                    <div style="margin-top:2px;">Step: ${resObj.step}</div>
                    ${limitStepHtml}
                </div>
                <div style="text-align:right;">
                    <span style="font-weight:bold; font-size:16px; color:${statusColor};">${resObj.val.toFixed(4)} ${resObj.unit}</span>
                    <span style="font-size:12px; color:${statusColor}; margin-left:10px;">${resObj.limit ? statusText : ''}</span>
                </div>
            </div>`;
        };

        const imgBlock = (base64, label) => {
            return base64 ? `<div style="text-align:center; margin: 20px 0;"><img src="${base64}" width="400" style="max-width:100%; border:1px solid #eee;" /><div style="font-size:12px; color:#666; margin-top:5px;">${label}</div></div>` : '';
        };

        const formatNote = (text) => {
            if (!text) return '';
            return `<div style="background:#eff6ff; padding:8px; border-radius:4px; margin-bottom:10px; color:#1e40af; font-size:12px; border:1px solid #dbeafe;">${text}</div>`;
        };

        // Helper to capture all 5 charts into one vertical image
        const captureCompositeToolboxCharts = async (prefix) => {
            return new Promise((resolve) => {
                const chartIds = [
                    { id: `chart${prefix}-loads`, title: '荷载示意图 Load Schematic', color: '#8b5cf6' },
                    { id: `chart${prefix}-reaction`, title: '支座反力图 Reaction (R)', color: '#3b82f6' },
                    { id: `chart${prefix}-moment`, title: '弯矩图 Moment (ULS)', color: '#ef4444' },
                    { id: `chart${prefix}-shear`, title: '剪力图 Shear (ULS)', color: '#10b981' },
                    { id: `chart${prefix}-deflection`, title: '挠度图 Deflection (SLS)', color: '#f97316' }
                ];

                // 1. Resolve Manager
                let manager;
                if (!prefix) manager = window.ToolboxManager;
                else if (prefix === '2') manager = window.ToolboxManager2;
                else if (prefix === '3') manager = window.ToolboxManager3;

                // Fallback if no manager or data: just capture current state
                if (!manager || !manager.currentResults) {
                    // 1. Collect all valid canvases (Fallback Logic)
                    const canvases = [];
                    let totalHeight = 0;
                    let maxWidth = 800; // Default width 

                    for (let item of chartIds) {
                        const container = document.getElementById(item.id);
                        const canvas = container ? (container.tagName === 'CANVAS' ? container : container.querySelector('canvas')) : null;
                        if (canvas) {
                            canvases.push({ ...item, canvas });
                            totalHeight += canvas.height + 60;
                            maxWidth = Math.max(maxWidth, canvas.width);
                        }
                    }
                    if (canvases.length === 0) return resolve(null);
                    const master = document.createElement('canvas');
                    master.width = maxWidth;
                    master.height = totalHeight + 20;
                    const ctx = master.getContext('2d');
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, master.width, master.height);
                    let currentY = 20;
                    ctx.textBaseline = 'top';
                    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
                    for (let item of canvases) {
                        ctx.fillStyle = item.color;
                        ctx.fillText(item.title, 10, currentY);
                        ctx.drawImage(item.canvas, 0, currentY + 40);
                        currentY += item.canvas.height + 60;
                    }
                    return resolve(master.toDataURL('image/png'));
                }

                // 2. Store Original Dimensions
                const originals = chartIds.map(item => {
                    const canvas = document.getElementById(item.id);
                    if (!canvas) return null;
                    return {
                        id: item.id,
                        w: canvas.width,
                        h: canvas.height,
                        canvas: canvas
                    };
                }).filter(i => i);

                // 3. Resize for Export (High Res, Wide Aspect)
                // Width 1500px, Height 250px gives 6:1 ratio. High res.
                const EXPORT_W = 1500;
                const EXPORT_H = 260;

                originals.forEach(item => {
                    item.canvas.setAttribute('data-export-mode', 'true');
                    item.canvas.width = EXPORT_W;
                    item.canvas.height = EXPORT_H;
                });

                // 4. Redraw (High Res)
                try {
                    manager.drawCharts(manager.currentResults);
                } catch (e) {
                    console.error("Export redraw failed", e);
                }

                // 5. Create Master Canvas
                const master = document.createElement('canvas');
                const HEADER_H = 40;
                const GAP = 20;
                const TOTAL_H = (EXPORT_H + HEADER_H + GAP) * chartIds.length + 20;
                master.width = EXPORT_W;
                master.height = TOTAL_H;
                const mCtx = master.getContext('2d');
                mCtx.fillStyle = 'white';
                mCtx.fillRect(0, 0, master.width, master.height);
                mCtx.textBaseline = 'top';

                let currentY = 20;
                chartIds.forEach(item => {
                    const source = document.getElementById(item.id);
                    if (source) {
                        // Header
                        mCtx.fillStyle = item.color || '#333';
                        mCtx.font = 'bold 28px "Microsoft YaHei", sans-serif'; // Larger font for high res
                        mCtx.fillText(item.title, 10, currentY);

                        // Chart
                        mCtx.drawImage(source, 0, currentY + HEADER_H);
                        currentY += (EXPORT_H + HEADER_H + GAP);
                    }
                });

                // 6. Restore Original Dimensions
                originals.forEach(item => {
                    item.canvas.removeAttribute('data-export-mode');
                    item.canvas.width = item.w;
                    item.canvas.height = item.h;
                });

                // 7. Redraw (Restore UI)
                try {
                    manager.drawCharts(manager.currentResults);
                } catch (e) {
                    console.error("Restore redraw failed", e);
                }

                resolve(master.toDataURL('image/png'));
            });
        };

        // Helpler to get toolbox content
        const getToolboxContent = async (prefix, boxTitle) => {
            // Check if results exist (M_max has a value)
            const mValEl = document.getElementById(`sum${prefix}-m-val`);
            if (!mValEl || mValEl.innerText === '--') return ''; // No data

            // Results
            const getVal = (id) => document.getElementById(id).innerText;
            const mVal = getVal(`sum${prefix}-m-val`);
            const vVal = getVal(`sum${prefix}-v-val`);
            const rVal = getVal(`sum${prefix}-r-val`);
            const defVal = getVal(`sum${prefix}-def-val`);
            const defStatus = document.getElementById(`sum${prefix}-def-status`).innerText;
            const defLimit = document.getElementById(`sum${prefix}-def-limit`).innerText;

            return `
        <div style="page-break-before: always;">
            <h2>${boxTitle}</h2>
            
            <!-- Result Summary -->
            <div style="margin-bottom:20px; padding:15px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                <h3 style="margin-top:0; font-size:14px; color:#475569;">关键计算结果 (Key Results)</h3>
                <table style="width:100%; border-collapse:collapse; font-size:14px;">
                    <tr>
                        <td style="padding:8px; border-bottom:1px solid #eee;">设计弯矩 M_max</td>
                        <td style="padding:8px; border-bottom:1px solid #eee; color:#ef4444; font-weight:bold;">${mVal} kN·m</td>
                    </tr>
                    <tr>
                        <td style="padding:8px; border-bottom:1px solid #eee;">设计剪力 V_max</td>
                        <td style="padding:8px; border-bottom:1px solid #eee; color:#10b981; font-weight:bold;">${vVal} kN</td>
                    </tr>
                    <tr>
                        <td style="padding:8px; border-bottom:1px solid #eee;">最大反力 R_max</td>
                        <td style="padding:8px; border-bottom:1px solid #eee; color:#3b82f6; font-weight:bold;">${rVal} kN</td>
                    </tr>
                    <tr>
                        <td style="padding:8px;">实际挠度 f (SLS)</td>
                        <td style="padding:8px; color:#f97316; font-weight:bold;">
                            ${defVal} mm 
                            <span style="font-size:12px; font-weight:normal; color:#666;">(Limit: ${defLimit})</span>
                            <span style="font-size:12px; margin-left:5px; padding:2px 6px; background:#fff7ed; border-radius:4px; border:1px solid #ffedd5;">${defStatus}</span>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
    `;
        };

        // Capture Images
        const imgStone = await this.captureImage('stone-svg-wrapper');
        const imgHanger = await this.captureImage('hanger-schematic-container');
        const imgAnchor = await this.captureImage('anchor-diagram-container');

        // Capture Toolboxes
        const tb1Content = await getToolboxContent('', '第九节 结构工具箱 1 (Toolbox 1) - 1.3恒荷载');
        const tb2Content = await getToolboxContent('2', '第十节 结构工具箱 2 (Toolbox 2) - 1.4地震荷载');
        const tb3Content = await getToolboxContent('3', '第十一节 结构工具箱 3 (Toolbox 3) - 1.4地震荷载');


        // Capture Hanger Section
        const imgHangerSec = await this.captureImage('hanger-sec-canvas', true);
        const boltDesc = document.getElementById('txt-bolt-desc')?.value || '';
        const descSec5 = document.getElementById('desc-section-5')?.value || '';
        const descSec7 = document.getElementById('desc-section-7')?.value || '';

        // Hanger Section Properties Table
        const s4_h = document.getElementById('inp-sec4-h')?.value;
        const s4_b = document.getElementById('inp-sec4-b')?.value;
        const s4_tw = document.getElementById('inp-sec4-tw')?.value;
        const s4_tf = document.getElementById('inp-sec4-tf')?.value;
        const s4_a = document.getElementById('res-sec4-a')?.innerText;
        const s4_ix = document.getElementById('res-sec4-ix')?.innerText;
        const s4_iy = document.getElementById('res-sec4-iy')?.innerText;
        const s4_rx = document.getElementById('res-sec4-rx')?.innerText;
        const s4_ry = document.getElementById('res-sec4-ry')?.innerText;
        const s4_wx = document.getElementById('res-sec4-wx')?.innerText;
        const s4_wy = document.getElementById('res-sec4-wy')?.innerText;

        const hangerSecTable = `
            <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:13px; margin-bottom:20px;">
                <tr style="background:#f0f9ff; font-weight:bold;">
                    <td colspan="4" style="text-align:center;">截面几何参数 (Section Properties)</td>
                </tr>
                <tr>
                    <td>Height H</td><td>${s4_h} mm</td><td>Width B</td><td>${s4_b} mm</td>
                </tr>
                <tr>
                    <td>Thick Vert tw</td><td>${s4_tw} mm</td><td>Thick Horz tf</td><td>${s4_tf} mm</td>
                </tr>
                <tr>
                    <td>Area A</td><td>${s4_a} mm²</td><td>Inertia Ix</td><td>${s4_ix} mm⁴</td>
                </tr>
                <tr>
                    <td>Inertia Iy</td><td>${s4_iy} mm⁴</td><td>Radius ix</td><td>${s4_rx} mm</td>
                </tr>
                <tr>
                    <td>Radius iy</td><td>${s4_ry} mm</td><td>Wx (Top)</td><td>${s4_wx} mm³</td>
                </tr>
                <tr>
                    <td>Wy (Left)</td><td>${s4_wy} mm³</td><td></td><td></td>
                </tr>
            </table>
        `;


        const designNote = document.getElementById('design-note-text')?.innerText || '';
        let stonePanelContent = '';
        stonePanelContent += formatNote(designNote);
        stonePanelContent += imgBlock(imgStone, '石材面板计算模型 (Stone Panel Model)');

        if (currentPanelType === 'backbolt') {
            stonePanelContent += calcBlock('TauPos', currentResults.tau_pos, '正风压剪应力 τ_pos (Pos. Wind Shear)');
            stonePanelContent += calcBlock('TauNeg', currentResults.tau_neg, '负风压剪应力 τ_neg (Neg. Wind Shear)');
        } else {
            stonePanelContent += calcBlock('TauKerf', currentResults.tau_kerf, '剪应力 τ (Shear Stress)');
        }

        const html = `
        <!DOCTYPE html>
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset="utf-8"><title>${title}</title>
        <style>body{font-family:'SimSun','宋体',serif;line-height:1.2;}h1{text-align:center;color:#2563eb;margin-bottom:30px;font-size:24px;}h2{font-size:16px;border-left:4px solid #2563eb;padding-left:10px;margin-top:30px;background:#f0f9ff;padding:8px;font-weight:bold;}p{font-size:14px;color:#333;margin:5px 0;}</style></head>
        <body>
            <h1>${title}</h1>
            <h2>第一节 石材系统说明 (System Description)</h2>${formatNote(desc)}
            <h2>第二节 荷载分析 (Load Analysis)</h2>
            ${calcBlock('Gk', currentResults.gk, '石材面板自重标准值 Gk')}
            ${calcBlock('Gd', currentResults.gd, '石材面板自重设计值 Gd')}
            ${calcBlock('GGK', currentResults.ggk, '综合重力荷载标准值 GGK')}
            ${calcBlock('G', currentResults.g, '综合重力荷载设计值 G')}
            ${calcBlock('qEk', currentResults.qEk, '地震荷载标准值 qEk')}
            ${calcBlock('qE', currentResults.qE, '地震荷载设计值 qE')}
            <h2>第三节 石材面板计算 (Stone Panel Check)</h2>
            ${stonePanelContent}
            ${calcBlock('mb0', currentResults.mb0, '弯矩系数 mb0 (Bending Moment Coeff)')}
            ${calcBlock('Sigma', currentResults.sigma, '最大弯曲应力 σ (Max Stress)')}
            
            <h2>第四节 挂件及背栓计算 (Hanger & Bolt)</h2>
            ${formatNote(boltDesc)}
            ${imgBlock(imgHangerSec, '截面示意图 (Section Schematic)')}
            ${hangerSecTable}
            ${imgBlock(imgHanger, '挂件节点示意图 (Hanger System)')}
            <h3>4.1 挂件荷载 (Hanger Loads)</h3>
            ${calcBlock('P_vert', currentResults.P_vert, '竖向集中荷载 P_vert')}
            ${calcBlock('P_horz', currentResults.P_horz, '水平集中荷载 P_horz')}

            <h3>4.2 挂件翼缘抗剪 (Hanger Flange Shear)</h3>
            ${calcBlock('Tau_unweak', currentResults.tau_unweak, '挂件翼缘抗剪应力 τ (Flange Shear)')}

            <h3>4.3 挂件综合应力 (Hanger Combined Stress)</h3>
            ${calcBlock('M_hanger', currentResults.M_hanger, '挂件弯矩 M (Bending Moment)')}
            ${calcBlock('Sigma_hanger', currentResults.sigma_hanger, '挂件综合应力 σ (Combined Stress)')}

            <h3>4.4 挂件削弱处抗剪 (Weak Section Shear)</h3>
            ${calcBlock('Tau_weak', currentResults.tau_weak, '削弱处抗剪应力 τ (Shear at Weak Point)')}

            <h3>4.5 连接螺栓计算 (Connecting Bolt)</h3>
            ${formatNote(document.getElementById('txt-conn-bolt-desc')?.value)}
            ${calcBlock('Sigma_bolt', currentResults.sigma_bolt, '螺栓抗拉应力 σ (Bolt Tension)')}
            ${calcBlock('Tau_bolt', currentResults.tau_bolt, '螺栓抗剪应力 τ (Bolt Shear)')}
            <h2>第五节 横梁计算 (Transverse Beam)</h2>
            ${formatNote(descSec5)}
            ${calcBlock('Sigma_beam', currentResults.sigma_beam, '横梁弯曲应力 σ (Bending Stress)')}
            ${calcBlock('Def_beam', currentResults.def_beam, '横梁综合挠度 df (Total Deflection)')}
            <h2>第六节 焊缝计算 (Weld Check)</h2>
            ${calcBlock('Sigma_Weld_H', currentResults.res_weld_h_sigma, '水平焊缝正应力')}
            ${calcBlock('Combined_Weld_H', currentResults.res_weld_h_comb, '水平焊缝综合应力')}
            ${calcBlock('Combined_Weld_V', currentResults.res_weld_v_comb, '竖向焊缝综合应力')}
            <h2>第七节 立柱计算 (Column Check)</h2>
            ${formatNote(descSec7)}
            ${calcBlock('Sigma_Col', currentResults.res_col_sigma, '立柱弯曲+轴压应力')}
            ${calcBlock('Def_Col', currentResults.res_col_def, '立柱挠度')}
            <h2>第八节 后置埋件计算 (Anchor Check)</h2>
            ${imgBlock(imgAnchor, '埋板计算模型 (Anchor Model)')}
            
            ${(() => {
                // Dynamic Anchor Content based on Mode
                if (typeof currentAnchorMode !== 'undefined' && currentAnchorMode === 'diagonal') {
                    return `
                        ${calcBlock('N_single', currentResults.anchor_t_bolt, '单栓拉力 N_single (Single Bolt Tension)')}
                        ${calcBlock('Sigma_slant', currentResults.anchor_sigma_slant, '斜撑应力 σ (Slant Member Stress)')}
                        ${calcBlock('Pull_out', currentResults.anchor_pull_val, '螺栓拉拔值 (Pull-out Value)')}
                    `;
                } else {
                    return `
                        ${calcBlock('F1', currentResults.anchor_f1, '上侧螺栓拉力 F1 (Top Bolt)')}
                        ${calcBlock('F2', currentResults.anchor_f2, '下侧螺栓拉力 F2 (Bottom Bolt)')}
                        ${calcBlock('Pull_out', currentResults.anchor_pull_design, '拉拔设计值 (Pull-out Design)')}
                    `;
                }
            })()}
            
            ${tb1Content}
            ${tb2Content}
            ${tb3Content}
        </body></html>`;

        if (window.htmlDocx) {
            const converted = htmlDocx.asBlob(html);
            saveAs(converted, `${title}_Calculation.docx`);
        } else {
            alert("Export library not loaded.");
        }
    },


    captureImage(containerId, isCanvas) {
        if (isCanvas === undefined) isCanvas = false;
        return new Promise((resolve) => {
            const container = document.getElementById(containerId);
            if (!container) return resolve(null);

            // Handle Canvas directly
            if (isCanvas) {
                // If the container IS the canvas
                const canvas = container.tagName === 'CANVAS' ? container : container.querySelector('canvas');
                if (!canvas) return resolve(null);
                // Create a white background canvas to composite
                const w = canvas.width;
                const h = canvas.height;
                const newCanvas = document.createElement('canvas');
                newCanvas.width = w;
                newCanvas.height = h;
                const ctx = newCanvas.getContext('2d');
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(canvas, 0, 0);
                return resolve(newCanvas.toDataURL('image/png'));
            }

            const svg = container.querySelector('svg');
            if (!svg) return resolve(null);

            try {
                // Serialize SVG
                const s = new XMLSerializer().serializeToString(svg);
                // Base64 Encode (Universal Unicode Support)
                const src = 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(s)));

                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    // Get viewBox or client dimensions
                    const w = svg.viewBox.baseVal.width || svg.clientWidth || 300;
                    const h = svg.viewBox.baseVal.height || svg.clientHeight || 150;

                    // We can stick to a fixed width suitable for word, e.g., 600px width for better quality
                    const targetW = 800;
                    const scale = targetW / w;

                    canvas.width = targetW;
                    canvas.height = h * scale;

                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = 'white'; // White background required like paper
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = (e) => {
                    console.error('Image capture error', e);
                    resolve(null);
                };
                img.src = src;
            } catch (e) {
                console.error("Capture Exception", e);
                resolve(null);
            }
        });
    }
};

const calculator = new StoneCalculator();

const ui = {
    inputs: {
        location: document.getElementById('inp-location'),
        intensity: document.getElementById('inp-intensity'),
        systemDesc: document.getElementById('txt-system-desc'),
        boltDesc: document.getElementById('txt-bolt-desc'),
        connBoltDesc: document.getElementById('txt-conn-bolt-desc'),
        amax: document.getElementById('amax'),
        density: document.getElementById('density'),
        fgm: document.getElementById('fgm'),
        widthB: document.getElementById('width-b'),
        heightH: document.getElementById('height-h'),
        thicknessT: document.getElementById('thickness-t'),
        spanA0: document.getElementById('span-a0'),
        spanB0: document.getElementById('span-b0'),
        boltN: document.getElementById('bolt-n'),
        boltD: document.getElementById('bolt-d'),
        boltH: document.getElementById('bolt-h'),
        slotC: document.getElementById('slot-c'),
        slotS: document.getElementById('slot-s'),
        slotN: document.getElementById('slot-n'),
        hangerL1: document.getElementById('hanger-l1'),
        hangerL2: document.getElementById('hanger-l2'),
        hangerL3: document.getElementById('hanger-l3'),
        hangerA: document.getElementById('hanger-a'),
        hangerA0: document.getElementById('hanger-a0'),
        hangerWx: document.getElementById('hanger-wx'),
        hangerAe: document.getElementById('hanger-ae'),
        limitShear: document.getElementById('limit-shear'),
        limitBend: document.getElementById('limit-bend'),
        limitBoltT: document.getElementById('limit-bolt-t'),
        limitBoltV: document.getElementById('limit-bolt-v'),
        beamSpan: document.getElementById('beam-span'),
        beamMx: document.getElementById('beam-mx'),
        beamMy: document.getElementById('beam-my'),
        beamDx: document.getElementById('beam-dx'),
        beamDy: document.getElementById('beam-dy'),
        beamWx: document.getElementById('beam-wx'),
        beamWy: document.getElementById('beam-wy'),
        beamIx: document.getElementById('beam-ix'),
        beamGamma: document.getElementById('beam-gamma'),
        weldL1: document.getElementById('weld-l1'),
        weldL2: document.getElementById('weld-l2'),
        weldHf: document.getElementById('weld-hf'),
        weldHe: document.getElementById('weld-he'),
        weldNx: document.getElementById('weld-nx'),
        weldVy: document.getElementById('weld-vy'),
        weldBf: document.getElementById('weld-bf'),
        weldFw: document.getElementById('weld-fw'),
        colProfile: document.getElementById('col-profile'),
        colPitch: document.getElementById('col-pitch'),
        colSpan: document.getElementById('col-span'),
        colM: document.getElementById('col-m'),
        colArea: document.getElementById('col-area'),

        colWx: document.getElementById('col-wx'),
        colGamma: document.getElementById('col-gamma'),
        colHTotal: document.getElementById('col-h-total'),
        colDeflAct: document.getElementById('col-defl-act'),
        loadDivVert: document.getElementById('inp-load-div-vert'),
        loadDivHorz: document.getElementById('inp-load-div-horz'),
        // Section 8 Inputs
        anchorF: document.getElementById('inp-anchor-f'),
        anchorG: document.getElementById('inp-anchor-g'),
        anchorL1: document.getElementById('inp-anchor-l1'),
        anchorL2: document.getElementById('inp-anchor-l2'),
        anchorBoltN: document.getElementById('inp-anchor-bolt-n'),
        anchorAngle: document.getElementById('inp-anchor-angle'),
        anchorWeldLen: document.getElementById('inp-anchor-weld-len'),
    },
    outputs: {
        gk: document.getElementById('res-gk'),
        gd: document.getElementById('res-gd'),
        ggk: document.getElementById('res-ggk'),
        g: document.getElementById('res-g'),
        qEk: document.getElementById('res-qek'),
        qE: document.getElementById('res-qe'),
        mb0: document.getElementById('res-mb0'),
        sigma: document.getElementById('res-sigma'),
        tau_pos: document.getElementById('res-tau-pos'),
        tau_neg: document.getElementById('res-tau-neg'),
        tau_kerf: document.getElementById('res-tau-kerf'),
        P_vert: document.getElementById('res-p-vert'),
        P_horz: document.getElementById('res-p-horz'),
        tau_unweak: document.getElementById('res-tau-unweak'),
        M_hanger: document.getElementById('res-m-hanger'),
        sigma_hanger: document.getElementById('res-sigma-hanger'),
        tau_weak: document.getElementById('res-tau-weak'),
        sigma_bolt: document.getElementById('res-sigma-bolt'),
        tau_bolt: document.getElementById('res-tau-bolt'),
        sigma_beam: document.getElementById('res-beam-sigma'),
        def_beam: document.getElementById('res-beam-def'),
        res_weld_h_sigma: document.getElementById('res-weld-h-sigma'),
        res_weld_h_tau: document.getElementById('res-weld-h-tau'),
        res_weld_h_comb: document.getElementById('res-weld-h-comb'),
        limit_weld_h: document.getElementById('limit-weld-h'),
        res_weld_v_sigma: document.getElementById('res-weld-v-sigma'),
        res_weld_v_tau: document.getElementById('res-weld-v-tau'),
        res_weld_v_comb: document.getElementById('res-weld-v-comb'),
        limit_weld_v: document.getElementById('limit-weld-v'),
        res_col_n: document.getElementById('res-col-n'),
        q_line: document.getElementById('res-col-q-line'),
        res_col_sigma: document.getElementById('res-col-sigma'),
        limit_col_sigma: document.getElementById('limit-col-sigma'),
        res_col_def: document.getElementById('res-col-def'),
        limit_col_def: document.getElementById('limit-col-def'),
        anchorNt: document.getElementById('res-anchor-nt'),
        anchorV: document.getElementById('res-anchor-v'),
        anchor_t_bolt: document.getElementById('res-anchor-t-bolt'),
        anchor_sigma_slant: document.getElementById('res-anchor-sigma-slant'),
        anchor_sigma_weld: document.getElementById('res-anchor-sigma-weld'),
        anchor_f1: document.getElementById('res-anchor-f1'),
        anchor_f2: document.getElementById('res-anchor-f2'),
        anchor_pull_design: document.getElementById('res-anchor-pull'),
        anchor_pull_val: document.getElementById('res-anchor-pull-val')
    }
};

let currentResults = {};
let currentPanelType = 'backbolt';

function switchTab(type) {
    currentPanelType = type;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const noteText = document.getElementById('design-note-text');
    const a0 = document.getElementById('span-a0').value;
    const b0 = document.getElementById('span-b0').value;

    if (type === 'backbolt') {
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
        document.getElementById('inputs-backbolt').style.display = 'block';
        document.getElementById('inputs-kerf').style.display = 'none';
        document.getElementById('res-group-backbolt').style.display = 'block';
        document.getElementById('res-group-kerf').style.display = 'none';
        if (noteText) noteText.innerText = `计算说明 (Design Note): 四点支撑计算 (Back Bolt)。计算跨度 a0=${a0}mm, b0=${b0}mm.`;
    } else {
        document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
        document.getElementById('inputs-backbolt').style.display = 'none';
        document.getElementById('inputs-kerf').style.display = 'block';
        document.getElementById('res-group-backbolt').style.display = 'none';
        document.getElementById('res-group-kerf').style.display = 'block';
        if (noteText) noteText.innerText = `计算说明 (Design Note): 短槽支撑计算 (Kerf/Slot)。计算跨度 a0=${a0}mm, b0=${b0}mm.`;
    }
    update();
}

function getInputs() {
    const data = { panelType: currentPanelType, anchorMode: currentAnchorMode };
    for (const key in ui.inputs) {
        if (key === 'colProfile') {
            data[key] = ui.inputs[key].value;
        } else {
            data[key] = isNaN(parseFloat(ui.inputs[key].value)) ? ui.inputs[key].value : parseFloat(ui.inputs[key].value);
        }
    }
    return data;
}

function setInputs(data) {
    if (data.panelType) switchTab(data.panelType);
    for (const key in data) {
        if (ui.inputs[key]) ui.inputs[key].value = data[key];
    }
    update();
}


function renderResultDetails(res) {
    if (!res) return '';
    const formulaHtml = res.formula ? `<div style="margin-bottom:5px; color:#6b7280;">CALCULATION PROCESS</div>
    <div style="font-family:monospace; background:#f9fafb; padding:8px; border-radius:4px; font-size:0.85rem; color:#374151;">
        <div style="border-bottom:1px dashed #e5e7eb; margin-bottom:4px; padding-bottom:4px; color:#2563eb; font-weight:600;">Formula: ${res.formula}</div>
        <div style="color:#4b5563;">${(res.step || '').replace(/\n/g, '<br>')}</div>
    </div>` : '';

    const limitHtml = res.limit ? `<div style="margin-top:8px; font-size:0.85rem; display:flex; gap:10px; align-items:center;">
        <span style="color:#6b7280;">Limit: ${res.limitStep || ('< ' + res.limit)}</span>
        <span style="font-weight:bold; color:${res.status ? '#10b981' : '#ef4444'}">${res.status ? '✓ Satisfied' : '✗ Failed'}</span>
    </div>` : '';

    return formulaHtml + limitHtml;
}

function update() {
    const data = getInputs();
    currentResults = calculator.calculate(data);

    // --- Section 8 Calculation ---
    const anchorF = parseFloat(document.getElementById('inp-anchor-f')?.value || 0);
    const anchorG = parseFloat(document.getElementById('inp-anchor-g')?.value || 0);
    const anchorAngle = parseFloat(document.getElementById('inp-anchor-angle')?.value || 45);
    const anchorWeldLen = parseFloat(document.getElementById('inp-anchor-weld-len')?.value || 146);
    const anchorL1 = parseFloat(document.getElementById('inp-anchor-l1')?.value || 162);
    const anchorL2 = parseFloat(document.getElementById('inp-anchor-l2')?.value || 34.5);
    const anchorBoltN = parseFloat(document.getElementById('inp-anchor-bolt-n')?.value || 2);
    const anchorSlantArea = parseFloat(document.getElementById('inp-anchor-slant-area')?.value || 564);
    const anchorWeldLeg = parseFloat(document.getElementById('inp-anchor-weld-leg')?.value || 5);

    if (typeof currentAnchorMode !== 'undefined') {
        if (currentAnchorMode === 'diagonal') {
            drawAnchorDiagonal(anchorF, anchorG, anchorAngle);
            const rad = anchorAngle * Math.PI / 180;
            const F_slant = anchorG / Math.cos(rad);
            const F_group = anchorF + F_slant * Math.sin(rad);
            const N_single = F_group / anchorBoltN;
            const Sig_slant = (F_slant * 1000) / anchorSlantArea;
            const le = anchorWeldLen - 10;
            const pullOutSteps = `Pull-out = 2 × N_single = 2 × ${N_single.toFixed(2)} = ${(2 * N_single).toFixed(2)} kN`;

            currentResults.anchor_t_bolt = res(N_single,
                `斜撑力 F_slant = G1 / cos${anchorAngle}° = ${anchorG.toFixed(2)} / ${Math.cos(rad).toFixed(2)} = ${F_slant.toFixed(2)} kN\n` +
                `群栓力 F_group = F_h + F_slant×sin${anchorAngle}° = ${anchorF.toFixed(2)} + ${F_slant.toFixed(2)}×${Math.sin(rad).toFixed(2)} = ${F_group.toFixed(2)} kN\n` +
                `单栓力 N_single = F_group / ${anchorBoltN} = ${N_single.toFixed(2)} kN`,
                `N = ${N_single.toFixed(2)} kN`, null, 'kN'
            );
            currentResults.anchor_sigma_slant = res(Sig_slant,
                `公式 σ = N / A = ${F_slant.toFixed(2)}×1000 / ${anchorSlantArea} = ${Sig_slant.toFixed(2)} MPa`,
                `σ = ${Sig_slant.toFixed(2)} MPa`, 215, 'MPa', '< 215 MPa'
            );
            currentResults.anchor_pull_val = res(2 * N_single,
                'Pull-out = 2 × N_single',
                pullOutSteps,
                null, 'kN'
            );

        } else {
            drawAnchorNoDiagonal(anchorF, anchorG, anchorL1, anchorL2);
            const resM = anchorG * anchorL1 + anchorF * anchorL2;
            const F1 = resM / (anchorBoltN * anchorL2);
            const F2 = F1 - (anchorF / (anchorBoltN / 2)); // Assuming n/2

            currentResults.anchor_f1 = res(F1,
                `计算公式 (Formula):\nM = G1×L1 + N1×L2 = ${anchorG}×${anchorL1} + ${anchorF}×${anchorL2} = ${resM.toFixed(2)}\nF1 = M / (n × L2) = ${(resM).toFixed(2)} / (${anchorBoltN} × ${anchorL2})\n= ${F1.toFixed(2)} kN`,
                `F1 = ${F1.toFixed(2)} kN`, null, 'kN'
            );
            currentResults.anchor_f2 = res(F2,
                `计算公式 (Formula):\nF2 = F1 - N1/(n/2)\n= ${F1.toFixed(2)} - ${anchorF.toFixed(2)}/(${(anchorBoltN / 2)})\n= ${F2.toFixed(2)} kN`,
                `F2 = ${F2.toFixed(2)} kN`, null, 'kN'
            );
            currentResults.anchor_pull_design = res(F1 * 2, '', `Load = ${(F1 * 2).toFixed(2)} kN`, null, 'kN');
        }
    }

    // Update Hanger Schematic and Note
    drawSchematic(data.widthB, data.heightH, data.spanA0, data.spanB0, data.panelType);
    drawHangerSchematic(data.hangerL1, data.hangerL2, data.hangerL3);

    const noteL1 = document.getElementById('note-l1');
    const noteL2 = document.getElementById('note-l2');
    const noteL3 = document.getElementById('note-l3');
    if (noteL1) noteL1.innerText = data.hangerL1;
    if (noteL2) noteL2.innerText = data.hangerL2;
    if (noteL3) noteL3.innerText = data.hangerL3;

    const dispSpan = document.getElementById('disp-beam-span');
    if (dispSpan) dispSpan.innerText = `${data.beamSpan} mm`;

    const map = {
        gk: 'gk', gd: 'gd', ggk: 'ggk', g: 'g', qEk: 'qEk', qE: 'qE',
        mb0: 'mb0', sigma: 'sigma',
        tau_pos: 'tau_pos', tau_neg: 'tau_neg', tau_kerf: 'tau_kerf',
        P_vert: 'P_vert', P_horz: 'P_horz', tau_unweak: 'tau_unweak', M_hanger: 'M_hanger', sigma_hanger: 'sigma_hanger', tau_weak: 'tau_weak', sigma_bolt: 'sigma_bolt', tau_bolt: 'tau_bolt',
        sigma_beam: 'sigma_beam', def_beam: 'def_beam',
        res_weld_h_sigma: 'res_weld_h_sigma', res_weld_h_tau: 'res_weld_h_tau', res_weld_h_comb: 'res_weld_h_comb',
        res_weld_v_sigma: 'res_weld_v_sigma', res_weld_v_tau: 'res_weld_v_tau', res_weld_v_comb: 'res_weld_v_comb',
        res_col_n: 'res_col_n', q_line: 'q_line', res_col_sigma: 'res_col_sigma', res_col_def: 'res_col_def',
        N_anchor: 'anchorNt', V_anchor: 'anchorV',
        anchor_t_bolt: 'anchor_t_bolt', anchor_sigma_slant: 'anchor_sigma_slant', anchor_sigma_weld: 'anchor_sigma_weld',
        anchor_f1: 'anchor_f1', anchor_f2: 'anchor_f2', anchor_pull_design: 'anchor_pull_design',
        anchor_pull_val: 'anchor_pull_val'
    };

    const weldNote = document.getElementById('note-weld-loads');
    if (weldNote && data.weldNx) {
        weldNote.innerHTML = `焊缝所受力: 水平力 Nx=<strong>${data.weldNx}</strong>kN，竖直力 Vy=<strong>${data.weldVy}</strong>kN。分别校核水平焊缝与竖向焊缝 (Checking both Horizontal and Vertical Welds).`;
    }

    const colProfEl = document.getElementById('disp-col-profile');
    if (colProfEl) colProfEl.innerText = data.colProfile;
    const colSpanEl = document.getElementById('disp-col-span');
    if (colSpanEl) colSpanEl.innerText = data.colSpan;
    const colPitchEl = document.getElementById('disp-col-pitch');
    if (colPitchEl) colPitchEl.innerText = data.colPitch;
    const weldLimitH = document.getElementById('limit-weld-h');
    if (weldLimitH && currentResults.res_weld_h_comb) weldLimitH.innerText = currentResults.res_weld_h_comb.limitStep;
    const weldLimitV = document.getElementById('limit-weld-v');
    if (weldLimitV && currentResults.res_weld_v_comb) weldLimitV.innerText = currentResults.res_weld_v_comb.limitStep;
    const colLimitSig = document.getElementById('limit-col-sigma');
    if (colLimitSig && currentResults.res_col_sigma) colLimitSig.innerText = currentResults.res_col_sigma.limitStep;
    const colLimitDef = document.getElementById('limit-col-def');
    if (colLimitDef && currentResults.res_col_def) colLimitDef.innerText = currentResults.res_col_def.limitStep;

    const noteText = document.getElementById('design-note-text');
    if (noteText) {
        const typeLabel = (data.panelType === 'backbolt') ? '四点支撑计算 (Back Bolt)' : '短槽支撑计算 (Kerf/Slot)';
        noteText.innerText = `计算说明 (Design Note): ${typeLabel}。计算跨度 a0=${data.spanA0}mm, b0=${data.spanB0}mm.`;
    }

    // UNIFIED RENDERING LOOP

    // --- Section 4: Rect Calculator Update ---
    const sec4_h = parseFloat(document.getElementById('inp-sec4-h')?.value || 100);
    const sec4_b = parseFloat(document.getElementById('inp-sec4-b')?.value || 50);
    const sec4_tw = parseFloat(document.getElementById('inp-sec4-tw')?.value || 5);
    const sec4_tf = parseFloat(document.getElementById('inp-sec4-tf')?.value || 0);

    const s4res = calculateSection4(sec4_h, sec4_b, sec4_tw, sec4_tf);
    drawSection4('hanger-sec-canvas', sec4_h, sec4_b, sec4_tw, sec4_tf);

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setTxt('res-sec4-a', s4res.A.toLocaleString('en-US'));
    setTxt('res-sec4-ix', s4res.Ix.toLocaleString('en-US', { maximumFractionDigits: 0 }));
    setTxt('res-sec4-iy', s4res.Iy.toLocaleString('en-US', { maximumFractionDigits: 0 }));
    setTxt('res-sec4-rx', s4res.rx.toFixed(2));
    setTxt('res-sec4-ry', s4res.ry.toFixed(2));
    setTxt('res-sec4-wx', s4res.wx.toLocaleString('en-US', { maximumFractionDigits: 0 }));
    setTxt('res-sec4-wy', s4res.wy.toLocaleString('en-US', { maximumFractionDigits: 0 }));

    for (const key in map) {
        const el = ui.outputs[map[key]]; // The value display element
        const res = currentResults[key];

        if (el && res) {
            // 1. Update Value
            el.textContent = (key === 'mb0') ? res.val.toFixed(4) : res.val.toFixed(2);

            // 2. Find Parent Card
            const card = el.closest('.res-card, .res-card-full');
            if (card) {
                // 3. Update Icon/Status
                const icon = card.querySelector('.res-icon');
                if (icon) {
                    if (typeof res.status === 'boolean') {
                        if (res.status) {
                            icon.classList.add('check');
                            icon.classList.remove('fail');
                            icon.innerHTML = '&#10003;';
                            icon.style.backgroundColor = '#d1fae5';
                            icon.style.color = '#059669';
                            el.style.color = '#10b981';
                        } else {
                            icon.classList.remove('check');
                            icon.classList.add('fail');
                            icon.innerHTML = '&#10007;';
                            icon.style.backgroundColor = '#fee2e2';
                            icon.style.color = '#dc2626';
                            el.style.color = '#ef4444';
                        }
                    } else {
                        icon.classList.remove('check');
                        icon.classList.remove('fail');
                        icon.textContent = 'i';
                        icon.style.backgroundColor = '';
                        icon.style.color = '';
                        el.style.color = '';
                    }
                }

                // 4. Inject Unified Details HTML
                const body = card.querySelector('.card-body-expanded');
                if (body) {
                    body.innerHTML = renderResultDetails(res);
                }
            }
        }
    }

    // Handle any items not in map but needing update? 
    // The previous loop covered legacy checks. 
    // S2, S3, S4, S6, S7 keys should all be in the map now or covered by the loop above if mapped.
    // Double check specific interactive results that might rely on data-key if not in map
    // The previous code had a specific loop for data-key items for S6/S7. 
    // But if we add them to the map, they are handled. 
    // 'res_weld_h_sigma' etc ARE in the map.
    // Let's ensure 'interactive-result' click handlers still work (they are separate event listeners).

    window.currentResults = currentResults;
}


window.toggleAccordion = (header) => {
    const card = header.closest('.res-card-full') || header.closest('.res-card');
    if (card) {
        const body = card.querySelector('.card-body-expanded');
        if (body) {
            const isHidden = body.style.display === 'none' || body.style.display === '';
            body.style.display = isHidden ? 'block' : 'none';
            const chevron = header.querySelector('.chevron');
            if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    }
};

const popover = document.getElementById('formula-popover');
const popFormula = document.getElementById('pop-formula');
const popStep = document.getElementById('pop-step');
const popLimit = document.getElementById('pop-limit');
const popResult = document.getElementById('pop-result');

document.querySelectorAll('.interactive-result').forEach(card => {
    card.addEventListener('click', (e) => {
        const body = card.querySelector('.card-body-expanded');
        if (body) {
            // Toggle Accordion Mode
            const isHidden = body.style.display === 'none' || body.style.display === '';
            body.style.display = isHidden ? 'block' : 'none';
            // Optional: Rotate chevron if exists
            const chevron = card.querySelector('.chevron');
            if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        } else {
            // Popover Mode (Legacy/Simple)
            const key = card.dataset.key;
            const res = currentResults[key];
            if (!res) return;
            popFormula.textContent = res.formula;
            popStep.textContent = res.step;
            popLimit.textContent = res.limitStep || (res.limit ? `< ${res.limit.toFixed(3)} ${res.unit}` : 'N/A');
            popResult.textContent = res.val.toFixed(4);
            const rect = card.getBoundingClientRect();
            // Adjust partial position
            popover.style.left = `${rect.left}px`;
            popover.style.top = `${rect.bottom + 5}px`;
            popover.classList.remove('hidden');
        }
        e.stopPropagation();
    });
});

document.addEventListener('click', () => {
    popover.classList.add('hidden');
});

document.getElementById('btn-save').addEventListener('click', () => {
    HistoryManager.save(getInputs());
});

document.getElementById('btn-export').addEventListener('click', () => {
    ExportManager.exportWord();
});

window.loadSnapshot = (id) => {
    try {
        const item = HistoryManager.getAll().find(i => i.id === id);
        if (item) {
            const titleInput = document.getElementById('inp-project-title');
            if (titleInput && item.name) titleInput.value = item.name;
            setInputs(item.data);
            if (item.data.toolbox1 && typeof ToolboxManager !== 'undefined') ToolboxManager.setData(item.data.toolbox1);
            if (item.data.toolbox2 && typeof ToolboxManager2 !== 'undefined') ToolboxManager2.setData(item.data.toolbox2);
            if (item.data.toolbox3 && typeof ToolboxManager3 !== 'undefined') ToolboxManager3.setData(item.data.toolbox3);

            // alert(`Loaded Snapshot:\nT1: ${!!item.data.toolbox1}\nT2: ${!!item.data.toolbox2}\nT3: ${!!item.data.toolbox3}`);
        }
    } catch (e) {
        alert("Error loading snapshot: " + e.message);
        console.error(e);
    }
};

window.deleteSnapshot = (e, id) => {
    e.stopPropagation();
    if (confirm('Delete this snapshot?')) HistoryManager.delete(id);
};

window.switchTab = switchTab;
Object.values(ui.inputs).forEach(el => el.addEventListener('input', update));
HistoryManager.render();

function res(val, formula, step, limit, unit, limitStep, status) {
    if (limit !== null && limit !== undefined) {
        if (status === undefined) {
            status = val <= limit;
        }
    } else {
        status = null;
    }
    return { val, formula, step, limit, unit, limitStep, status };
}

// Premature update removed

// --- Section 8 Helpers ---
let currentAnchorMode = 'diagonal';
window.setAnchorMode = (mode) => {
    currentAnchorMode = mode;
    // Toggle Buttons
    const btnDiag = document.getElementById('btn-anchor-mode-diag');
    const btnNod = document.getElementById('btn-anchor-mode-nod');
    if (btnDiag) btnDiag.className = mode === 'diagonal' ? 'anchor-mode-btn active' : 'anchor-mode-btn';
    if (btnNod) btnNod.className = mode === 'nodiagonal' ? 'anchor-mode-btn active' : 'anchor-mode-btn';

    // Toggle Inputs
    document.querySelectorAll('.grp-anchor-diag').forEach(el => el.style.display = mode === 'diagonal' ? 'block' : 'none');
    document.querySelectorAll('.grp-anchor-nod').forEach(el => el.style.display = mode === 'nodiagonal' ? 'block' : 'none');

    // Toggle Results
    const grpDiag = document.getElementById('res-group-diag');
    const grpNod = document.getElementById('res-group-nod');
    if (grpDiag) grpDiag.style.display = mode === 'diagonal' ? 'block' : 'none';
    if (grpNod) grpNod.style.display = mode === 'nodiagonal' ? 'block' : 'none';

    // Note update moved to update() function for dynamic binding

    update();
};

function calculateSection4(h, b, tw, tf) {
    const outerA = h * b;
    const innerH = Math.max(0, h - 2 * tf);
    const innerB = Math.max(0, b - 2 * tw);
    const innerA = innerH * innerB;
    const A = outerA - innerA;

    // Inertia
    const outerIx = (b * Math.pow(h, 3)) / 12;
    const innerIx = (innerB * Math.pow(innerH, 3)) / 12;
    const Ix = outerIx - innerIx;

    const outerIy = (h * Math.pow(b, 3)) / 12;
    const innerIy = (innerH * Math.pow(innerB, 3)) / 12;
    const Iy = outerIy - innerIy;

    // Radius of Gyration
    const rx = Math.sqrt(Ix / A);
    const ry = Math.sqrt(Iy / A);

    // Section Modulus
    const wx = Ix / (h / 2);
    const wy = Iy / (b / 2);

    return { A, Ix, Iy, rx, ry, wx, wy };
}

function drawSection4(canvasId, h, b, tw, tf) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const cvsH = canvas.height;

    // Scale Logic
    const pad = 40;
    const maxW = w - 2 * pad;
    const maxH = cvsH - 2 * pad;
    const scale = Math.min(maxW / b, maxH / h);

    const drawH = h * scale;
    const drawB = b * scale;
    const drawTw = tw * scale;
    const drawTf = tf * scale;

    const cx = w / 2;
    const cy = cvsH / 2;

    ctx.clearRect(0, 0, w, cvsH);

    // Draw Outer
    ctx.fillStyle = '#eff6ff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.rect(cx - drawB / 2, cy - drawH / 2, drawB, drawH);

    // Draw Inner (Hollow)
    const innerH = Math.max(0, drawH - 2 * drawTf);
    const innerB = Math.max(0, drawB - 2 * drawTw);

    // If hollow
    if (innerH > 0 && innerB > 0) {
        ctx.rect(cx - innerB / 2, cy - innerH / 2, innerB, innerH);
    }

    // Canvas Fill Rule 'evenodd' handles the hollow part if we draw both rects in one path or use sub-path
    // Simpler: Draw Outer Fill/Stroke, then Draw Inner White Fill/Stroke
    // But 'evenodd' is better for single shape
    ctx.fill("evenodd");
    ctx.stroke();

    // Dimensions
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    // H dim
    ctx.fillText(`H=${h}`, cx - drawB / 2 - 15, cy);
    // B dim
    ctx.fillText(`B=${b}`, cx, cy + drawH / 2 + 15);
    // tw dim
    if (tw > 0) ctx.fillText(`tw=${tw}`, cx - drawB / 2 + drawTw / 2, cy - drawH / 2 - 5);
    // tf dim
    if (tf > 0) ctx.fillText(`tf=${tf}`, cx + drawB / 2 + 10, cy - drawH / 2 + drawTf / 2);
}

function drawAnchorDiagonal(f, g, angleDeg) {
    const container = document.getElementById('anchor-diagram-container');
    if (!container) return;
    const w = container.clientWidth || 300;
    const h = 260;
    const xWall = 60;
    const yTop = 60;
    const size = 120;
    const rad = angleDeg * Math.PI / 180;

    // Wall
    let svg = `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}">
        <defs>
             <marker id="arrow-red" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#ef4444" /></marker>
        </defs>
        <rect x="${xWall - 40}" y="20" width="40" height="220" fill="#e2e8f0" stroke="#cbd5e1"/>
        <line x1="${xWall - 40}" y1="20" x2="${xWall - 40}" y2="240" stroke="#cbd5e1" stroke-width="1"/>
        
        <!-- Bracket Base -->
        <rect x="${xWall}" y="${yTop}" width="10" height="${size + 20}" fill="#334155" />
        
        <!-- Top Arm (Horizontal) -->
        <line x1="${xWall + 10}" y1="${yTop + 10}" x2="${xWall + size}" y2="${yTop + 10}" stroke="#334155" stroke-width="4"/>
        
        <!-- Diagonal Arm -->
        <line x1="${xWall + 10}" y1="${yTop + size}" x2="${xWall + size}" y2="${yTop + 10}" stroke="#334155" stroke-width="4"/>
        
        <!-- Angle Arc -->
        <path d="M${xWall + 10} ${yTop + size - 30} A 30 30 0 0 1 ${xWall + 10 + (30 * Math.sin(rad))} ${yTop + size - (30 * Math.cos(rad))}" fill="none" stroke="#f59e0b" stroke-width="2"/>
        <text x="${xWall + 25}" y="${yTop + size - 40}" fill="#f59e0b" font-weight="bold" font-size="12">${angleDeg}°</text>
        
        <!-- Forces -->
        <line x1="${xWall + size + 40}" y1="${yTop + 10}" x2="${xWall + size + 5}" y2="${yTop + 10}" stroke="#ef4444" stroke-width="2" marker-end="url(#arrow-red)"/>
        <text x="${xWall + size + 45}" y="${yTop + 10}" fill="#ef4444" font-weight="bold" dominant-baseline="middle">F</text>
        
        <line x1="${xWall + size}" y1="${yTop + 10}" x2="${xWall + size}" y2="${yTop + 50}" stroke="#ef4444" stroke-width="2" marker-end="url(#arrow-red)"/>
        <text x="${xWall + size + 5}" y="${yTop + 55}" fill="#ef4444" font-weight="bold">G</text>

        <circle cx="${xWall + 5}" cy="${yTop + 20}" r="3" fill="white"/>
        <circle cx="${xWall + 5}" cy="${yTop + size}" r="3" fill="white"/>
    </svg>`;
    container.innerHTML = svg;
}

function drawAnchorNoDiagonal(f, g, l1, l2) {
    const container = document.getElementById('anchor-diagram-container');
    if (!container) return;
    const w = container.clientWidth || 300;
    const h = 260;

    // Simplified scaling logic
    const xWall = 60;
    const yTop = 60;
    const hBracket = 150;

    let svg = `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}">
        <defs>
             <marker id="arrow-red" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#ef4444" /></marker>
             <marker id="arrow-dim-grey" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#64748b" /></marker>
        </defs>
        <rect x="${xWall - 40}" y="20" width="40" height="220" fill="#e2e8f0" stroke="#cbd5e1"/>
        
        <!-- Bracket Base -->
        <rect x="${xWall}" y="${yTop}" width="15" height="${hBracket}" fill="#334155" />
        
        <!-- Bolts -->
        <line x1="${xWall - 10}" y1="${yTop + 20}" x2="${xWall + 25}" y2="${yTop + 20}" stroke="#1e293b" stroke-width="2"/>
        <line x1="${xWall - 10}" y1="${yTop + hBracket - 20}" x2="${xWall + 25}" y2="${yTop + hBracket - 20}" stroke="#1e293b" stroke-width="2"/>
        
        <!-- Load Point -->
        <line x1="${xWall}" y1="${yTop + hBracket / 2}" x2="${xWall + 100}" y2="${yTop + hBracket / 2}" stroke="#334155" stroke-width="2" stroke-dasharray="4 4"/>
        
        <!-- Forces -->
        <line x1="${xWall + 140}" y1="${yTop + hBracket / 2}" x2="${xWall + 105}" y2="${yTop + hBracket / 2}" stroke="#ef4444" stroke-width="2" marker-end="url(#arrow-red)"/>
        <text x="${xWall + 110}" y="${yTop + hBracket / 2 - 10}" fill="#ef4444" font-weight="bold" font-size="12">N1</text>
        
        <line x1="${xWall + 100}" y1="${yTop + hBracket / 2}" x2="${xWall + 100}" y2="${yTop + hBracket / 2 + 40}" stroke="#ef4444" stroke-width="2" marker-end="url(#arrow-red)"/>
        <text x="${xWall + 105}" y="${yTop + hBracket / 2 + 30}" fill="#ef4444" font-weight="bold" font-size="12">G1</text>
        
        <!-- Dimensions -->
        <line x1="${xWall}" y1="${yTop - 20}" x2="${xWall + 100}" y2="${yTop - 20}" stroke="#64748b" marker-start="url(#arrow-dim-grey)" marker-end="url(#arrow-dim-grey)"/>
        <text x="${xWall + 50}" y="${yTop - 25}" fill="#64748b" font-size="11" text-anchor="middle">L1</text>
        
        <line x1="${xWall + 120}" y1="${yTop + hBracket / 2}" x2="${xWall + 120}" y2="${yTop + 20}" stroke="#64748b" marker-start="url(#arrow-dim-grey)" marker-end="url(#arrow-dim-grey)"/>
        <text x="${xWall + 125}" y="${yTop + 40}" fill="#64748b" font-size="11" alignment-baseline="middle">L2</text>
        
    </svg>`;
    container.innerHTML = svg;
}

// Add listeners for new inputs
['inp-anchor-f', 'inp-anchor-g', 'inp-anchor-angle', 'inp-anchor-weld-len', 'inp-anchor-l1', 'inp-anchor-l2', 'inp-anchor-bolt-n', 'inp-location', 'inp-intensity', 'inp-load-div-vert', 'inp-load-div-horz'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', update);
});


update();
document.getElementById('inp-sec4-h')?.addEventListener('input', update);
document.getElementById('inp-sec4-b')?.addEventListener('input', update);
document.getElementById('inp-sec4-tw')?.addEventListener('input', update);
document.getElementById('inp-sec4-tf')?.addEventListener('input', update);

drawSection4('hanger-sec-canvas', 5, 50, 20.5, 0); // Initial Draw

// Unified Calculation Detail Display Function
window.showCalcDetail = function (boxId, key, title) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const r = window.currentResults;
    if (!r || !r[key]) return;

    // Toggle logic
    if (box.style.display === 'block' && box.dataset.activeKey === key) {
        box.style.display = 'none';
        box.dataset.activeKey = '';
        return;
    }

    const item = r[key];
    const statusColor = item.status === true ? '#059669' : (item.status === false ? '#dc2626' : '#374151');
    const statusText = item.status === true ? 'Pass' : (item.status === false ? 'Fail' : '');
    const icon = item.status === true ? '✓' : (item.status === false ? '✗' : '');

    let html = `<div style="font-weight:bold; color:#3b82f6; margin-bottom:10px; border-bottom:1px solid #e5e7eb; padding-bottom:5px;">${title}</div>
                <div class="step-row" style="margin-bottom:5px;"><strong style="color:#4b5563;">Formula:</strong> <span style="font-family:monospace; color:#2563eb;">${item.formula}</span></div>
                <div class="step-row" style="margin-bottom:5px;"><strong style="color:#4b5563;">Step:</strong> <span style="color:#374151;">${item.step}</span></div>
                <div class="step-row" style="margin-bottom:5px;"><strong style="color:#4b5563;">Result:</strong> <strong>${item.val.toFixed(3)} ${item.unit}</strong></div>`;

    if (item.limit !== null && item.limit !== undefined) {
        html += `<div class="step-row" style="margin-bottom:5px; margin-top:10px; border-top:1px dashed #e5e7eb; padding-top:5px;"><strong style="color:#4b5563;">Limit:</strong> ${item.limitStep || item.limit}</div>
                  <div class="step-row" style="font-weight:bold; color:${statusColor}">Check: ${item.val.toFixed(3)} <= ${item.limit} (${statusText}) ${icon}</div>`;
    }

    box.innerHTML = html;
    box.style.display = 'block';
    box.dataset.activeKey = key;
    // Scroll into view if needed (optional)
    // box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
