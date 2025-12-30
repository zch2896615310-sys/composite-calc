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
            colProfile, colPitch, colSpan, colM, colArea, colN, colWx, colGamma, colHTotal, colDeflAct,
            anchorN
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
        const qEk = res(qEk_val, '5.0 × αmax × GGK', `5.0 × ${amax} × ${ggk_val.toFixed(2)}`, null, 'kN/m²');
        const qE_val = 1.4 * qEk_val;
        const qE = res(qE_val, '1.4 × qEk', `1.4 × ${qEk_val.toFixed(2)}`, null, 'kN/m²');

        // --- 2. Stone Panel Check ---
        const mb0_res = this.calculateMb0(spanA0, spanB0);
        const mb0 = { val: mb0_res.val, formula: 'Interpolation', step: mb0_res.step, limit: null, unit: '', limitStep: '' };

        const q_MPa = qE_val * 0.001;
        const sigma_val = (6 * mb0.val * q_MPa * Math.pow(spanB0, 2)) / Math.pow(thicknessT, 2);
        const limitStep_sigma = `Limit fg1 = fgm / 2.15 = ${fgm} / 2.15 = ${limit_stone_sigma.toFixed(3)} MPa`;
        const sigma = res(sigma_val, '6 × mb0 × q × b0² / t²', `6 × ${mb0.val.toFixed(4)} × ${q_MPa.toFixed(4)} × ${spanB0}² / ${thicknessT}²`, limit_stone_sigma, 'MPa', limitStep_sigma);

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
        const area_m2 = (widthB * heightH) / 1000000;
        const P_horz_val = (qE_val * area_m2) / 4;
        const P_horz = res(P_horz_val, 'qE × Area / 4', `${qE_val.toFixed(2)} × ${area_m2.toFixed(3)} / 4`, null, 'kN');
        const P_vert_val = (gd_val * area_m2) / 2;
        const P_vert = res(P_vert_val, 'Gd × Area / 2', `${gd_val.toFixed(2)} × ${area_m2.toFixed(3)} / 2`, null, 'kN');
        const tau_unweak_val = (P_horz_val * 1000) / hangerA;
        const tau_unweak = res(tau_unweak_val, 'P_horz / A', `${(P_horz_val * 1000).toFixed(2)} / ${hangerA}`, limitShear, 'MPa');
        const M_hanger_val = P_vert_val * hangerL1 + P_horz_val * hangerL2;
        const M_hanger = res(M_hanger_val, 'P_vert × L1 + P_horz × L2', `${P_vert_val.toFixed(2)} × ${hangerL1} + ${P_horz_val.toFixed(2)} × ${hangerL2}`, null, 'kN·m');
        const sigma_hanger_val = (M_hanger_val * 1000000 / hangerWx) + (P_horz_val * 1000 / hangerA0);
        const step_sigma_hanger = `${(M_hanger_val * 1000000).toFixed(0)} / ${hangerWx} + ${(P_horz_val * 1000).toFixed(0)} / ${hangerA0}`;
        const sigma_hanger = res(sigma_hanger_val, 'M / Wx + P_horz / A0', step_sigma_hanger, limitBend, 'MPa');
        const tau_weak_val = (P_vert_val * 1000) / hangerA0;
        const tau_weak = res(tau_weak_val, 'P_vert / A0', `${(P_vert_val * 1000).toFixed(2)} / ${hangerA0}`, limitShear, 'MPa');
        const N_bolt_val = (P_vert_val * hangerL1 + P_horz_val * hangerL2) / hangerL3;
        const sigma_bolt_val = (N_bolt_val * 1000) / hangerAe;
        const step_sigma_bolt = `N1 / Ae = ${(N_bolt_val * 1000).toFixed(0)} / ${hangerAe}`;
        const sigma_bolt = res(sigma_bolt_val, 'N1 / Ae', step_sigma_bolt, limitBoltT, 'MPa');
        const V_bolt_val = P_horz_val;
        const tau_bolt_val = (V_bolt_val * 1000) / hangerAe;
        const step_tau_bolt = `V / Ae = ${(V_bolt_val * 1000).toFixed(0)} / ${hangerAe}`;
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

        // --- 6. Weld Check ---
        const weldAh = weldL1 * weldHe;
        const sigma_wh_val = (weldNx * 1000) / weldAh;
        const tau_wh_val = (weldVy * 1000) / weldAh;
        const comb_wh_val = weldBf * Math.sqrt(Math.pow(sigma_wh_val, 2) + 3 * Math.pow(tau_wh_val, 2));

        const step_wh_sigma = `σ = Nx / (L1×he) = ${weldNx}×1000 / (${weldL1}×${weldHe}) = ${sigma_wh_val.toFixed(2)} MPa`;
        const step_wh_tau = `τ = Vy / (L1×he) = ${weldVy}×1000 / (${weldL1}×${weldHe}) = ${tau_wh_val.toFixed(2)} MPa`;
        const step_wh_comb = `σ_comb = βf × √(σ² + 3τ²) = ${weldBf} × √(${sigma_wh_val.toFixed(2)}² + 3×${tau_wh_val.toFixed(2)}²) = ${comb_wh_val.toFixed(2)} MPa`;

        const res_weld_h_sigma = res(sigma_wh_val, 'Nx / (L1*he)', step_wh_sigma, null, 'MPa');
        const res_weld_h_tau = res(tau_wh_val, 'Vy / (L1*he)', step_wh_tau, null, 'MPa');
        const res_weld_h_comb = res(comb_wh_val, 'βf * √(σ² + 3τ²)', step_wh_comb, weldFw, 'MPa', `Limit: < ${weldFw} MPa`);

        const weldAv = weldL2 * weldHe;
        const sigma_wv_val = (weldNx * 1000) / weldAv;
        const tau_wv_val = (weldVy * 1000) / weldAv;
        const comb_wv_val = weldBf * Math.sqrt(Math.pow(sigma_wv_val, 2) + 3 * Math.pow(tau_wv_val, 2));

        const step_wv_sigma = `σ = Nx / (L2×he) = ${weldNx}×1000 / (${weldL2}×${weldHe}) = ${sigma_wv_val.toFixed(2)} MPa`;
        const step_wv_tau = `τ = Vy / (L2×he) = ${weldVy}×1000 / (${weldL2}×${weldHe}) = ${tau_wv_val.toFixed(2)} MPa`;
        const step_wv_comb = `σ_comb = βf × √(σ² + 3τ²) = ${weldBf} × √(${sigma_wv_val.toFixed(2)}² + 3×${tau_wv_val.toFixed(2)}²) = ${comb_wv_val.toFixed(2)} MPa`;

        const res_weld_v_sigma = res(sigma_wv_val, 'Nx / (L2*he)', step_wv_sigma, null, 'MPa');
        const res_weld_v_tau = res(tau_wv_val, 'Vy / (L2*he)', step_wv_tau, null, 'MPa');
        const res_weld_v_comb = res(comb_wv_val, 'βf * √(σ² + 3τ²)', step_wv_comb, weldFw, 'MPa', `Limit: < ${weldFw} MPa`);

        // --- 7. Column Check ---
        const sigma_col_val = (colN * 1000 / colArea) + (colM * 1000000) / (colGamma * colWx);
        const step_col_sigma = `σ = N/An + M/(γ×Wx)\n  = ${colN}×1000/${colArea} + ${colM}×10⁶/(${colGamma}×${colWx})\n  = ${sigma_col_val.toFixed(2)} MPa`;
        const res_col_sigma = res(sigma_col_val, 'N/A + M/(γ*Wx)', step_col_sigma, 215, 'MPa', 'Limit: < 215 MPa');

        const limit_col_def_val = colSpan / 250;
        const res_col_def = res(colDeflAct, 'Actual Defl', `输入值: ${colDeflAct}`, limit_col_def_val, 'mm', `Limit: L/250 = ${limit_col_def_val.toFixed(2)}`);
        const res_col_n = res(colN, 'Input', '', null, 'kN');

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
            res_col_n, res_col_sigma, res_col_def,
            V_anchor, N_anchor
        };
    }
}

// Mock Inputs
const mockInputs = {
    amax: 0.16, density: 28, fgm: 12.0,
    widthB: 1220, heightH: 887, thicknessT: 25, spanA0: 1220, spanB0: 887,
    panelType: 'backbolt', boltN: 4, boltD: 60, boltH: 15, slotC: 3, slotS: 25, slotN: 4,
    hangerL1: 0.038, hangerL2: 0.019, hangerL3: 0.023,
    hangerA: 400, hangerA0: 300, hangerWx: 2000, hangerAe: 150,
    limitShear: 125, limitBend: 215, limitBoltT: 400, limitBoltV: 320,
    beamSpan: 1200, beamMx: 1.5, beamMy: 0.5, beamDx: 1.0, beamDy: 0.5, beamWx: 20000, beamWy: 5000, beamIx: 1000000, beamGamma: 1.05,
    weldL1: 60, weldL2: 100, weldHf: 6, weldHe: 4.2, weldNx: 5.0, weldVy: 2.0, weldBf: 1.22, weldFw: 160,
    colProfile: '120x60x4', colPitch: 1200, colSpan: 3800, colM: 2.5, colArea: 1500, colN: 15.0, colWx: 35000, colGamma: 1.05, colHTotal: 24.0, colDeflAct: 8.5,
    anchorN: 2
};

try {
    const calc = new StoneCalculator();
    const result = calc.calculate(mockInputs);
    console.log("Calculation Successful!");
    console.log("Result:", result);
} catch (error) {
    console.error("Calculation Crashed:", error);
}
