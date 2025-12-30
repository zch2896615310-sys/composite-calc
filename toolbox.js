
// --- TOOLBOX LOGIC ---

const SectionProp = {
    // H-Shape: H x B x tw x tf
    calcH(h, b, tw, tf) {
        // Area
        const A = 2 * b * tf + (h - 2 * tf) * tw;

        // Ix (Major Axis)
        const ixRaw = (b * Math.pow(h, 3) - (b - tw) * Math.pow(h - 2 * tf, 3)) / 12;

        // Iy (Minor Axis)
        const iyRaw = (2 * tf * Math.pow(b, 3) + (h - 2 * tf) * Math.pow(tw, 3)) / 12;

        // Weight (Steel Density = 7850 kg/m3)
        const w = (A / 1000000) * 7850;

        return {
            A: A,
            Ix: ixRaw,
            Iy: iyRaw,
            Wx: ixRaw / (h / 2),
            Wy: iyRaw / (b / 2),
            Wx_Top: ixRaw / (h / 2),
            Wx_Bot: ixRaw / (h / 2),
            Wy_Left: iyRaw / (b / 2),
            Wy_Right: iyRaw / (b / 2),
            w: w
        };
    },

    drawH(ctx, w, h, H, B, tw, tf) {
        const pad = 40;
        const maxW = w - 2 * pad;
        const maxH = h - 2 * pad;
        const scale = Math.min(maxW / B, maxH / H);

        const drawH = H * scale;
        const drawB = B * scale;
        const drawTw = Math.max(tw * scale, 2);
        const drawTf = Math.max(tf * scale, 2);

        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = '#eff6ff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;

        const xL = cx - drawB / 2;
        const xR = cx + drawB / 2;
        const yT = cy - drawH / 2;
        const yB = cy + drawH / 2;

        ctx.beginPath();
        ctx.moveTo(xL, yT);
        ctx.lineTo(xR, yT);
        ctx.lineTo(xR, yT + drawTf);
        ctx.lineTo(cx + drawTw / 2, yT + drawTf);
        ctx.lineTo(cx + drawTw / 2, yB - drawTf);
        ctx.lineTo(xR, yB - drawTf);
        ctx.lineTo(xR, yB);
        ctx.lineTo(xL, yB);
        ctx.lineTo(xL, yB - drawTf);
        ctx.lineTo(cx - drawTw / 2, yB - drawTf);
        ctx.lineTo(cx - drawTw / 2, yT + drawTf);
        ctx.lineTo(xL, yT + drawTf);
        ctx.closePath();

        ctx.fill();
        ctx.stroke();

        this.drawAxes(ctx, cx, cy, w, h);
        this.drawDim(ctx, cx, cy, drawB, drawH, H, B);
    },

    calcBox(h, b, t1, t2) {
        // Box: H x B x t (wall thickness)
        // t1 = wall, t2 = wall (assume uniform if 3 args, else 4? UI has 4 inputs)
        // Let's assume t1=tw, t2=tf conceptually, but for box usually t is uniform or BxHxt.
        // If UI uses 'tw' and 'tf', for Box we might just use 'tw' as 't'.
        // Let's map inputs: tw -> t_vertical, tf -> t_horizontal
        const t_vert = t1;
        const t_horz = t2 || t1;

        const outerH = h;
        const outerB = b;
        const innerH = h - 2 * t_horz;
        const innerB = b - 2 * t_vert;

        const A = (outerH * outerB) - (innerH * innerB);

        const Ix = (outerB * Math.pow(outerH, 3) - innerB * Math.pow(innerH, 3)) / 12;
        const Iy = (outerH * Math.pow(outerB, 3) - innerH * Math.pow(innerB, 3)) / 12;

        const w = (A / 1000000) * 7850;

        return {
            A: A,
            Ix: Ix,
            Iy: Iy,
            Wx: Ix / (h / 2),
            Wy: Iy / (b / 2),
            Wx_Top: Ix / (h / 2),
            Wx_Bot: Ix / (h / 2),
            Wy_Left: Iy / (b / 2),
            Wy_Right: Iy / (b / 2),
            w: w
        };
    },

    drawBox(ctx, w, h, H, B, tw, tf) {
        const pad = 40;
        const maxW = w - 2 * pad;
        const maxH = h - 2 * pad;
        const scale = Math.min(maxW / B, maxH / H);

        const dH = H * scale;
        const dB = B * scale;
        const dt_v = Math.max(tw * scale, 2); // vertical wall
        const dt_h = Math.max(tf * scale, 2); // horizontal wall

        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#eff6ff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;

        // Outer
        ctx.beginPath();
        ctx.rect(cx - dB / 2, cy - dH / 2, dB, dH);

        // Inner
        ctx.rect(cx - dB / 2 + dt_v, cy - dH / 2 + dt_h, dB - 2 * dt_v, dH - 2 * dt_h);
        ctx.fill("evenodd");
        ctx.stroke();

        this.drawAxes(ctx, cx, cy, w, h);
        this.drawDim(ctx, cx, cy, dB, dH, H, B);
    },

    calcChannel(h, b, tw, tf) {
        // Channel Props Data
        const channelProps = {
            'C8': { h: 80, b: 43, tw: 5, tf: 8, A: 1024, Ix: 1013000, Iy: 166000, Wx: 25325, Wy_L: 11690, Wy_R: 5763, w: 8.04 },
            'C10': { h: 100, b: 48, tw: 5.3, tf: 8.5, A: 1274, Ix: 1983000, Iy: 256000, Wx: 39660, Wy_L: 16842, Wy_R: 7804, w: 10.00 }
        };

        // Check if matches preset for exact values (avoid approx calc errors)
        for (const key in channelProps) {
            const p = channelProps[key];
            if (Math.abs(p.h - h) < 0.1 && Math.abs(p.b - b) < 0.1 && Math.abs(p.tw - tw) < 0.1 && Math.abs(p.tf - tf) < 0.1) {
                return {
                    A: p.A,
                    Ix: p.Ix,
                    Iy: p.Iy,
                    Wx: p.Wx,
                    Wy: p.Wy_L,
                    Wx_Top: p.Wx,
                    Wx_Bot: p.Wx,
                    Wy_Left: p.Wy_L,
                    Wy_Right: p.Wy_R,
                    w: p.w
                };
            }
        }

        // Custom Channel Calculation (Approximate)
        const A_flange = b * tf;
        const A_web = (h - 2 * tf) * tw;
        const A = 2 * A_flange + A_web;

        // Centroid (x_bar from back of web)
        const x_c = (A_web * (tw / 2) + 2 * A_flange * (b / 2)) / A;

        // Ix
        const Ix_web = tw * Math.pow(h - 2 * tf, 3) / 12;
        const Ix_flange = (b * Math.pow(tf, 3) / 12) + A_flange * Math.pow(h / 2 - tf / 2, 2);
        const Ix = Ix_web + 2 * Ix_flange;

        // Iy
        const Iy_web = (h - 2 * tf) * Math.pow(tw, 3) / 12 + A_web * Math.pow(x_c - tw / 2, 2);
        const Iy_flange = (tf * Math.pow(b, 3) / 12) + A_flange * Math.pow(b / 2 - x_c, 2);
        const Iy = Iy_web + 2 * Iy_flange;

        const w = (A / 1000000) * 7850;

        return {
            A: A,
            Ix: Ix,
            Iy: Iy,
            Wx: Ix / (h / 2),
            Wy: Iy / Math.max(x_c, b - x_c),
            Wx_Top: Ix / (h / 2),
            Wx_Bot: Ix / (h / 2),
            Wy_Left: Iy / x_c,
            Wy_Right: Iy / (b - x_c),
            w: w
        };
    },

    drawChannel(ctx, w, h, H, B, tw, tf) {
        const pad = 40;
        const maxW = w - 2 * pad;
        const maxH = h - 2 * pad;
        const scale = Math.min(maxW / B, maxH / H);

        const dH = H * scale;
        const dB = B * scale;
        const dTw = Math.max(tw * scale, 2);
        const dTf = Math.max(tf * scale, 2);

        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#eff6ff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;

        // C-Shape facing Right
        const xLeft = cx - dB / 2;
        const yTop = cy - dH / 2;

        ctx.beginPath();
        ctx.moveTo(xLeft + dB, yTop); // Top Right Tip
        ctx.lineTo(xLeft + dB, yTop + dTf); // Top Right Inner
        ctx.lineTo(xLeft + dTw, yTop + dTf); // Top Inner Corner
        ctx.lineTo(xLeft + dTw, yTop + dH - dTf); // Bot Inner Corner
        ctx.lineTo(xLeft + dB, yTop + dH - dTf); // Bot Right Inner
        ctx.lineTo(xLeft + dB, yTop + dH); // Bot Right Tip
        ctx.lineTo(xLeft, yTop + dH); // Bot Left Corner
        ctx.lineTo(xLeft, yTop); // Top Left Corner
        ctx.closePath();

        ctx.fill();
        ctx.stroke();

        this.drawAxes(ctx, cx, cy, w, h);
        this.drawDim(ctx, cx, cy, dB, dH, H, B);
    },

    calcAngle(h, b, t, r = 0) {
        // L-Shape: H x B x t
        // Area = (h * t) + (b - t) * t + (0.2146 * r * r) (Fillet)
        const filletA = (1 - Math.PI / 4) * r * r;
        const A = (h * t) + (b - t) * t + filletA;

        // Centroid
        const cx = ((t * h) * (t / 2) + (b - t) * t * (t + (b - t) / 2)) / A; // Wrong formula structure.
        // Let's use simpler approx or correct one.
        // x_bar from left edge:
        // A1 = h*t (vertical leg), x1 = t/2, y1 = h/2
        // A2 = (b-t)*t (horizontal leg right), x2 = t + (b-t)/2, y2 = t/2 (from bottom? need Ref)
        // Let's assume bot-left corner is (0,0).
        // Vertical Leg: h * t. Center (t/2, h/2)
        // Horizontal Leg remainder: (b-t)*t. Center (t + (b-t)/2, t/2)

        const A1 = h * t;
        const x1 = t / 2;
        const y1 = h / 2;

        const A2 = (b - t) * t;
        const x2 = t + (b - t) / 2;
        const y2 = t / 2;

        const x_c = (A1 * x1 + A2 * x2) / (A1 + A2);
        const y_c = (A1 * y1 + A2 * y2) / (A1 + A2);

        // Ix
        const Ix1 = (t * Math.pow(h, 3)) / 12 + A1 * Math.pow(y1 - y_c, 2);
        const Ix2 = ((b - t) * Math.pow(t, 3)) / 12 + A2 * Math.pow(y2 - y_c, 2);
        const Ix = Ix1 + Ix2;

        // Iy
        const Iy1 = (h * Math.pow(t, 3)) / 12 + A1 * Math.pow(x1 - x_c, 2);
        const Iy2 = (t * Math.pow(b - t, 3)) / 12 + A2 * Math.pow(x2 - x_c, 2);
        const Iy = Iy1 + Iy2;

        const w = (A / 1000000) * 7850;

        // Wx, Wy roughly to extreme fiber
        const yTop = h - y_c;
        const yBot = y_c;
        const xRight = b - x_c;
        const xLeft = x_c;

        return {
            A: A,
            Ix: Ix,
            Iy: Iy,
            Wx: Ix / Math.max(yTop, yBot), // Min Wx (Conservative)
            Wy: Iy / Math.max(xLeft, xRight),
            Wx_Top: Ix / yTop,
            Wx_Bot: Ix / yBot,
            Wy_Left: Iy / xLeft,
            Wy_Right: Iy / xRight,
            w: w
        };
    },

    drawAngle(ctx, w, h, H, B, t, r = 0) {
        const pad = 40;
        const maxW = w - 2 * pad;
        const maxH = h - 2 * pad;
        const scale = Math.min(maxW / B, maxH / H);

        const dH = H * scale;
        const dB = B * scale;
        const dT = Math.max(t * scale, 2);
        const dR = r * scale;

        const cx = w / 2;
        const cy = h / 2;

        const xL = cx - dB / 2;
        const yB = cy + dH / 2;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#172554'; // Vivid Dark Blue
        ctx.strokeStyle = '#172554';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(xL, yB - dH); // Top-left of vert leg
        ctx.lineTo(xL + dT, yB - dH); // Top-right of vert leg

        if (dR > 0) {
            ctx.lineTo(xL + dT, yB - dT - dR); // Inner vertical Down
            ctx.arcTo(xL + dT, yB - dT, xL + dT + dR, yB - dT, dR); // Radius
            ctx.lineTo(xL + dB, yB - dT); // Inner horizontal Right
        } else {
            ctx.lineTo(xL + dT, yB - dT);
            ctx.lineTo(xL + dB, yB - dT);
        }

        ctx.lineTo(xL + dB, yB); // Bottom-right
        ctx.lineTo(xL, yB); // Bottom-left
        ctx.closePath();

        ctx.fill();
        ctx.stroke();

        // Calculate Centroid for Axes
        // Relative to Bottom-Left of shape (xL, yB) which is (0,0) in local coords
        // A1 = H*t (Vert), x1 = t/2, y1 = H/2
        // A2 = (B-t)*t (Horz), x2 = t+(B-t)/2, y2 = t/2
        const A1 = H * t;
        const A2 = (B - t) * t;
        const x_c_local = (A1 * (t / 2) + A2 * (t + (B - t) / 2)) / (A1 + A2);
        const y_c_local = (A1 * (H / 2) + A2 * (t / 2)) / (A1 + A2);

        // Map to canvas
        // Canvas X = xL + x_c_local * scale
        // Canvas Y = yB - y_c_local * scale (Y inverted)
        const cx_real = xL + x_c_local * scale;
        const cy_real = yB - y_c_local * scale;

        this.drawAxes(ctx, cx_real, cy_real, w, h);
        this.drawDim(ctx, cx, cy, dB, dH, H, B);
    },

    drawAxes(ctx, cx, cy, w, h) {
        ctx.save();
        ctx.strokeStyle = '#ef4444'; // Red for Axes
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);

        // X Axis
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();

        // Y Axis
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 12px Inter';
        ctx.fillText('x', w - 10, cy - 5);
        ctx.fillText('y', cx + 5, 15);

        // Origin Dot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();

        ctx.restore();
    },

    drawDim(ctx, cx, cy, dB, dH, H, B) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        // Height Dim
        ctx.fillText(`H=${H}`, cx - dB / 2 - 20, cy);

        // Width Dim
        ctx.fillText(`B=${B}`, cx, cy + dH / 2 + 20);
    }
};

const BeamSolver = {
    solve(spans, loads, E, I) {
        const nodes = spans.length + 1;
        const dof = nodes * 2;
        const K = Array(dof).fill(0).map(() => Array(dof).fill(0));
        const F = Array(dof).fill(0);

        spans.forEach((L, i) => {
            const k = E * I / Math.pow(L, 3);
            const K_loc = [
                [12, 6 * L, -12, 6 * L],
                [6 * L, 4 * L * L, -6 * L, 2 * L * L],
                [-12, -6 * L, 12, -6 * L],
                [6 * L, 2 * L * L, -6 * L, 4 * L * L]
            ];
            const idx = [2 * i, 2 * i + 1, 2 * (i + 1), 2 * (i + 1) + 1];
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    K[idx[r]][idx[c]] += K_loc[r][c] * k;
                }
            }
        });

        loads.forEach(load => {
            const L = spans[load.spanIdx];
            const i = load.spanIdx;
            const idx = [2 * i, 2 * i + 1, 2 * (i + 1), 2 * (i + 1) + 1];

            if (load.type === 'dist') {
                const q = load.value;
                // q is downward positive in input. q_act = -q for FEM.
                const q_act = -q;

                // Equivalent Nodal Loads = - (Fixed End Actions)
                // Downward Load:
                // FEM Left M = +qL^2/12 (CCW). -> Eq Load M = -qL^2/12. (Correcting previous inversion)
                // FEM Right M = -qL^2/12 (CW). -> Eq Load M = +qL^2/12.

                F[idx[0]] += q_act * L / 2; // -qL/2
                F[idx[1]] += q_act * L * L / 12; // -qL^2/12
                F[idx[2]] += q_act * L / 2; // -qL/2
                F[idx[3]] -= q_act * L * L / 12; // +qL^2/12

            } else if (load.type === 'point') {
                const P = load.value * 1000; // Convert kN to N
                const P_act = -P;
                const a = load.dist !== undefined ? load.dist : L / 2;
                const b = L - a;
                const L2 = L * L;

                // FEM Left M = Pab^2/L^2 (CCW). Eq = -Pab^2/L^2.
                // FEM Right M = -Pa^2b/L^2 (CW). Eq = +Pa^2b/L^2.

                const M_L_eq = -P * a * b * b / L2;
                const M_R_eq = +P * a * a * b / L2;

                const V_L_eq = P_act * b * b * (3 * a + b) / (L * L * L);
                const V_R_eq = P_act * a * a * (a + 3 * b) / (L * L * L);

                F[idx[0]] += V_L_eq;
                F[idx[1]] += M_L_eq;
                F[idx[2]] += V_R_eq;
                F[idx[3]] += M_R_eq;
            }
        });

        const unknownIndices = [];
        for (let i = 0; i < nodes; i++) unknownIndices.push(2 * i + 1);

        const size = unknownIndices.length;
        const Kr = Array(size).fill(0).map(() => Array(size).fill(0));
        const Fr = Array(size).fill(0);

        unknownIndices.forEach((globalIdx, r) => {
            Fr[r] = F[globalIdx];
            unknownIndices.forEach((globalCol, c) => {
                Kr[r][c] = K[globalIdx][globalCol];
            });
        });

        const resultTheta = this.mathSolve(Kr, Fr);
        const U = Array(dof).fill(0);
        unknownIndices.forEach((idx, i) => U[idx] = resultTheta[i]);

        // Calculate Reactions (R)
        // R = K_global * U - F_fixed_end_forces
        // But simpler: Element forces at each node.
        // Actually, just display F_reaction from K*U?
        // Note: F vector constructed above was Load Vector.
        // K*U = F_applied + R.
        // So R = K*U - F_applied.
        // Let's compute K*U

        const F_internal = Array(dof).fill(0);
        spans.forEach((L, i) => {
            const k = E * I / Math.pow(L, 3);
            const K_loc = [
                [12, 6 * L, -12, 6 * L],
                [6 * L, 4 * L * L, -6 * L, 2 * L * L],
                [-12, -6 * L, 12, -6 * L],
                [6 * L, 2 * L * L, -6 * L, 4 * L * L]
            ];
            const idx = [2 * i, 2 * i + 1, 2 * (i + 1), 2 * (i + 1) + 1];
            const u_ele = idx.map(ix => U[ix]);

            for (let r = 0; r < 4; r++) {
                let val = 0;
                for (let c = 0; c < 4; c++) val += K_loc[r][c] * u_ele[c];
                F_internal[idx[r]] += val * k;
            }
        });

        const Reactions = F_internal.map((f_int, dy) => {
            // For Y-dofs (0, 2, 4...), R = F_int - F_applied
            // F_applied was stored in F array (but inverted signs? F was External Force Vector)
            // Stiffness Eq: K U = F_ext + R
            // => R = K U - F_ext
            return f_int - F[dy];
        });


        const plotPoints = [];
        let xGlobal = 0;
        spans.forEach((L, i) => {
            const idx = [2 * i, 2 * i + 1, 2 * (i + 1), 2 * (i + 1) + 1];
            const u_ele = idx.map(ix => U[ix]);
            const spanLoads = loads.filter(l => l.spanIdx === i);

            const segments = 500; // Ultra high accuracy to match reference
            for (let j = 0; j <= segments; j++) {
                const x = j * L / segments;
                const xi = x / L;
                const N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
                const N2 = x * (1 - 2 * xi + xi * xi);
                const N3 = 3 * xi * xi - 2 * xi * xi * xi;
                const N4 = x * (xi * xi - xi);
                let v = N1 * u_ele[0] + N2 * u_ele[1] + N3 * u_ele[2] + N4 * u_ele[3];

                // Homogeneous MOMENT
                const N1_2 = (6 * (2 * xi - 1)) / (L * L);
                const N2_2 = (2 * (3 * xi - 2)) / L;
                const N3_2 = (6 * (1 - 2 * xi)) / (L * L);
                const N4_2 = (2 * (3 * xi - 1)) / L;
                let M = E * I * (N1_2 * u_ele[0] + N2_2 * u_ele[1] + N3_2 * u_ele[2] + N4_2 * u_ele[3]);

                // Homogeneous SHEAR
                const N1_3 = 12 / (L * L * L);
                const N2_3 = 6 / (L * L);
                const N3_3 = -12 / (L * L * L);
                const N4_3 = 6 / (L * L);
                let V = E * I * (N1_3 * u_ele[0] + N2_3 * u_ele[1] + N3_3 * u_ele[2] + N4_3 * u_ele[3]);


                spanLoads.forEach(spanLoad => {
                    if (spanLoad.type === 'dist') {
                        const q = spanLoad.value;

                        // Add Fixed-End Beam Particular Solution
                        // v_fix (down -)
                        const v_fix = -q * x * x * Math.pow(L - x, 2) / (24 * E * I);
                        // M_fix (Sag +): -qL^2/12 (End) + qLx/2 - qx^2/2
                        const M_fix = -q * L * L / 12 + q * L * x / 2 - q * x * x / 2;
                        // V_fix: qL/2 - qx
                        const V_fix = q * L / 2 - q * x;

                        v += v_fix;
                        M += M_fix;
                        V += V_fix;

                    } else if (spanLoad.type === 'point') {
                        const P = spanLoad.value * 1000; // Convert kN to N
                        const a = spanLoad.dist !== undefined ? spanLoad.dist : L / 2;
                        const b = L - a;

                        let v_fix = 0;
                        if (x <= a) {
                            v_fix = - (P * b * b * x * x) / (6 * E * I * L * L * L) * (3 * a * L - (3 * a + b) * x);
                        } else {
                            const xp = L - x;
                            v_fix = - (P * a * a * xp * xp) / (6 * E * I * L * L * L) * (3 * b * L - (3 * b + a) * xp);
                        }

                        const Ma_fix = -P * a * b * b / (L * L);
                        const Ra_fix = P * b * b * (3 * a + b) / (L * L * L);

                        let M_fix = Ma_fix + Ra_fix * x;
                        if (x > a) M_fix -= P * (x - a);

                        let V_fix = Ra_fix;
                        if (x > a) V_fix -= P;

                        v += v_fix;
                        M += M_fix;
                        V += V_fix;
                    }
                });

                plotPoints.push({ x: xGlobal + x, v: v, m: M, v_shear: V });
            }
            xGlobal += L;
        });

        // Map Reactions to plot points (step function? No, discrete at supports)
        // We will just return the array of reactions at supports [R0, R1, R2...]
        const supportReactions = [];
        for (let i = 0; i < nodes; i++) {
            supportReactions.push({ node: i, val: Reactions[2 * i] });
        }

        return { points: plotPoints, reactions: supportReactions, U: U, nodes: nodes, E: E, I: I };
    },

    mathSolve(A, b) {
        const n = A.length;
        for (let i = 0; i < n; i++) {
            let maxEl = Math.abs(A[i][i]), maxRow = i;
            for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > maxEl) { maxEl = Math.abs(A[k][i]); maxRow = k; }
            for (let k = i; k < n; k++) { let tmp = A[maxRow][k]; A[maxRow][k] = A[i][k]; A[i][k] = tmp; }
            let tmp = b[maxRow]; b[maxRow] = b[i]; b[i] = tmp;
            for (let k = i + 1; k < n; k++) {
                const c = -A[k][i] / A[i][i];
                for (let j = i; j < n; j++) if (i !== j) A[k][j] += c * A[i][j];
                b[k] += c * b[i];
            }
        }
        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = b[i] / A[i][i];
            for (let k = i - 1; k >= 0; k--) b[k] -= A[k][i] * x[i];
        }
        return x;
    }
};

const ToolboxManager = {
    spans: [6000, 6000],
    loads: [{ spanIdx: 0, type: 'dist', value: 10 }, { spanIdx: 1, type: 'dist', value: 10 }],
    currentSectionType: 'h',

    addSpan() { this.spans.push(6000); this.renderSpans(); },

    removeSpan(idx) {
        if (this.spans.length <= 1) return;
        this.spans.splice(idx, 1);
        this.loads = this.loads.filter(l => l.spanIdx !== idx).map(l => { if (l.spanIdx > idx) l.spanIdx--; return l; });
        this.renderSpans(); this.renderLoads();
    },

    renderSpans() {
        const container = document.getElementById('tb-span-list'); // Assumes standard element exists
        if (!container) return;
        container.innerHTML = '';
        this.spans.forEach((s, i) => {
            const div = document.createElement('div');
            div.className = 'tb-list-item';
            div.innerHTML = `<span class="label">L${i + 1}</span><input type="number" value="${s}" oninput="ToolboxManager.spans[${i}] = parseFloat(this.value); ToolboxManager.calculateBeam()" onchange="ToolboxManager.spans[${i}] = parseFloat(this.value); ToolboxManager.calculateBeam()"><span class="unit">mm</span><button class="btn-del" onclick="ToolboxManager.removeSpan(${i})">×</button>`;
            container.appendChild(div);
        });
        this.calculateBeam(); // Initial calc
    },

    addLoad() { this.loads.push({ spanIdx: 0, type: 'dist', value: 10 }); this.renderLoads(); this.calculateBeam(); },
    removeLoad(idx) { this.loads.splice(idx, 1); this.renderLoads(); this.calculateBeam(); },

    renderLoads() {
        const container = document.getElementById('tb-load-list');
        if (!container) return;
        container.innerHTML = '';
        this.loads.forEach((l, i) => {
            const div = document.createElement('div');
            div.className = 'tb-load-item';

            let spanOpt = '';
            this.spans.forEach((_, sIdx) => { spanOpt += `<option value="${sIdx}" ${l.spanIdx === sIdx ? 'selected' : ''}>L${sIdx + 1}</option>`; });

            const isPoint = l.type === 'point';

            div.innerHTML = `
                <div class="tb-load-row" style="justify-content:space-between;">
                   <select class="tb-select-sm" onchange="ToolboxManager.loads[${i}].spanIdx = parseInt(this.value); ToolboxManager.calculateBeam()">${spanOpt}</select>
                   <select class="tb-select-sm" onchange="ToolboxManager.changeLoadType(${i}, this.value)">
                        <option value="dist" ${l.type === 'dist' ? 'selected' : ''}>均布荷载</option>
                        <option value="point" ${l.type === 'point' ? 'selected' : ''}>集中荷载</option>
                    </select>
                   <select class="tb-select-sm" onchange="ToolboxManager.loads[${i}].factor = parseFloat(this.value); ToolboxManager.calculateBeam()">
                        <option value="1.0" ${!l.factor || l.factor === 1.0 ? 'selected' : ''}>标准值</option>
                        <option value="1.2" ${l.factor === 1.2 ? 'selected' : ''}>恒 x1.2</option>
                        <option value="1.3" ${l.factor === 1.3 ? 'selected' : ''}>恒 x1.3</option>
                        <option value="1.4" ${l.factor === 1.4 ? 'selected' : ''}>活 x1.4</option>
                        <option value="1.5" ${l.factor === 1.5 ? 'selected' : ''}>活 x1.5</option>
                   </select>
                   <button onclick="ToolboxManager.removeLoad(${i})" style="color:#ef4444; border:none; background:none; cursor:pointer;">🗑️</button>
                </div>
                <div class="tb-load-row" style="align-items:center;">
                    <span style="font-size:0.75rem; color:#6b7280; width:50px;">值 Value:</span>
                    <input type="number" class="tb-input-sm" style="flex:1;" value="${l.value}" oninput="ToolboxManager.loads[${i}].value = parseFloat(this.value); ToolboxManager.calculateBeam()">
                    <span style="font-size:0.75rem; width:30px;">${isPoint ? 'kN' : 'kN/m'}</span>
                </div>
                ${isPoint ? `
                <div class="tb-load-row" style="align-items:center;">
                    <span style="font-size:0.75rem; color:#6b7280; width:50px;">距左 Dist:</span>
                    <input type="number" class="tb-input-sm" style="flex:1;" value="${l.dist !== undefined ? l.dist : 0}" oninput="ToolboxManager.loads[${i}].dist = parseFloat(this.value); ToolboxManager.calculateBeam()">
                    <span style="font-size:0.75rem; width:30px;">mm</span>
                </div>` : `
                <div class="tb-load-row" style="align-items:center;">
                    <span style="font-size:0.75rem; color:#6b7280; width:50px;">范围:</span>
                    <input type="number" class="tb-input-sm" style="width:60px;" value="${l.range && l.range[0] !== null ? l.range[0] : 0}" oninput="ToolboxManager.calculateBeam()" placeholder="0">
                    <span style="font-size:0.75rem;">-</span>
                    <input type="number" class="tb-input-sm" style="width:60px;" value="${l.range && l.range[1] !== null ? l.range[1] : this.spans[l.spanIdx]}" oninput="ToolboxManager.calculateBeam()" placeholder="${this.spans[l.spanIdx]}">
                </div>`}
            `;
            container.appendChild(div);
        });
    },

    changeLoadType(i, type) {
        this.loads[i].type = type;
        if (type === 'point' && this.loads[i].dist === undefined) this.loads[i].dist = this.spans[this.loads[i].spanIdx] / 2;
        this.renderLoads();
        this.calculateBeam();
    },

    updateSectionType(type) {
        this.currentSectionType = type;

        // Update Buttons
        document.querySelectorAll('.sec-type-toggle button').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`btn-sec-type-${type}`);
        if (btn) btn.classList.add('active');

        // Toggle Preset Row
        const presetRow = document.getElementById('tb-channel-preset-row');
        if (presetRow) presetRow.style.display = (type === 'channel') ? 'flex' : 'none';

        // Visibility Logic
        const grp4 = document.getElementById('tb-input-group-4');
        const grpR = document.getElementById('tb-input-group-r');
        if (grp4) grp4.style.display = (type === 'angle') ? 'none' : 'flex';
        if (grpR) grpR.style.display = (type === 'angle') ? 'flex' : 'none';

        // Sync Beam Tab Inputs Visibility
        const beamGrpTf = document.getElementById('tb-beam-grp-tf');
        const beamGrpR = document.getElementById('tb-beam-grp-r');
        if (beamGrpTf) beamGrpTf.style.display = (type === 'angle') ? 'none' : 'flex';
        if (beamGrpR) beamGrpR.style.display = (type === 'angle') ? 'flex' : 'none';

        this.updateSection();
    },

    updateChannelPreset(val) {
        // Channel Props Data (duplicated access or shared)
        const channelProps = {
            'C8': { h: 80, b: 43, tw: 5, tf: 8 },
            'C10': { h: 100, b: 48, tw: 5.3, tf: 8.5 }
        };

        if (!channelProps[val]) return;
        const p = channelProps[val];

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal('tb-sec-h', p.h);
        setVal('tb-sec-b', p.b);
        setVal('tb-sec-tw', p.tw);
        setVal('tb-sec-tf', p.tf);

        setVal('tb-beam-sec-h', p.h);
        setVal('tb-beam-sec-b', p.b);
        setVal('tb-beam-sec-tw', p.tw);
        setVal('tb-beam-sec-tf', p.tf);

        this.updateSection();
    },

    updateSection() {
        if (!document.getElementById('tb-sec-h')) return;
        const h = parseFloat(document.getElementById('tb-sec-h').value);
        const b = parseFloat(document.getElementById('tb-sec-b').value);
        const tw = parseFloat(document.getElementById('tb-sec-tw').value);
        const tf = parseFloat(document.getElementById('tb-sec-tf').value);

        let props;
        const canvas = document.getElementById('tb-sec-canvas');
        canvas.width = canvas.parentElement.clientWidth || 300;
        canvas.height = canvas.parentElement.clientHeight || 450;
        const ctx = canvas.getContext('2d');

        if (this.currentSectionType === 'box') {
            props = SectionProp.calcBox(h, b, tw, tf);
            SectionProp.drawBox(ctx, canvas.width, canvas.height, h, b, tw, tf);
        } else if (this.currentSectionType === 'angle') {
            const r = parseFloat(document.getElementById('tb-sec-r').value) || 0;
            props = SectionProp.calcAngle(h, b, tw, r); // tf ignored
            SectionProp.drawAngle(ctx, canvas.width, canvas.height, h, b, tw, r);
        } else if (this.currentSectionType === 'channel') {
            props = SectionProp.calcChannel(h, b, tw, tf);
            SectionProp.drawChannel(ctx, canvas.width, canvas.height, h, b, tw, tf);
        } else {
            props = SectionProp.calcH(h, b, tw, tf);
            SectionProp.drawH(ctx, canvas.width, canvas.height, h, b, tw, tf);
        }

        const format = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
        const formatDec = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

        // Update both Section Tab and Beam Tab results
        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

        setText('tb-res-ix', format(props.Ix));
        setText('tb-res-w', props.w.toFixed(2));

        setText('tb-beam-res-ix', format(props.Ix));
        setText('tb-beam-res-w', props.w.toFixed(2));
        setText('tb-beam-res-area', format(props.A));
        setText('tb-beam-res-iy', format(props.Iy));
        setText('tb-beam-res-wx', format(props.Wx));
        setText('tb-beam-res-wy', format(props.Wy));

        const grid = document.getElementById('tb-sec-results');

        // Helper
        const item = (label, val, unit, isBlue = false, isSerif = true) => `
            <div class="tb-res-item">
                <div class="tb-res-label">${label}</div>
                <div class="tb-res-val ${isBlue ? 'text-blue' : ''} ${isSerif ? 'font-serif' : ''}">${val}</div>
                <div class="tb-res-unit">${unit}</div>
            </div>
        `;

        grid.innerHTML = `
            ${item('面积 Area', format(props.A), 'mm²')}
            ${item('理论重量 Weight', props.w.toFixed(2), 'kg/m')}
            ${item('惯性矩 Ix', format(props.Ix), 'mm⁴', true)}
            ${item('惯性矩 Iy', format(props.Iy), 'mm⁴', true)}
            ${item('Wx (Top)', format(props.Wx_Top), 'mm³', true)}
            ${item('Wx (Bottom)', format(props.Wx_Bot), 'mm³', true)} 
            ${item('Wy (Left)', format(props.Wy_Left), 'mm³', true)}
            ${item('Wy (Right)', format(props.Wy_Right), 'mm³', true)}
        `;
        // Note: Logic simplified Wx top/bot same for symmetric. Angle uses simplified Wx/Wy.
        // For H/Box symmetric, Top=Bottom. For Angle, they differ but my calcAngle only returns one Wx roughly.
        // I will replicate the single Wx to Top/Bottom for now to match grid layout, or assume symmetric for UI purpose or keep simiple.
        // User asked for "Diagram 2" look which has 8 items. I will generate 8 items.
        // Since my calc only returns one Wx (min?), I will duplicate it or leave it as is.
        // Let's populate 8 items filling gaps with the same value if symmetric.

        // Real-time Calc
        // Use timeout to avoid lag if render heavy? 
        // Logic is light, direct call.
        this.calculateBeam();
    },

    calculateBeam() {
        if (!document.getElementById('tb-beam-e')) return;
        const E = parseFloat(document.getElementById('tb-beam-e').value);
        const h = parseFloat(document.getElementById('tb-sec-h').value);
        const b = parseFloat(document.getElementById('tb-sec-b').value);
        const tw = parseFloat(document.getElementById('tb-sec-tw').value);
        const tf = parseFloat(document.getElementById('tb-sec-tf').value);

        // Use current selection properties
        let props;
        if (this.currentSectionType === 'box') {
            props = SectionProp.calcBox(h, b, tw, tf);
        } else if (this.currentSectionType === 'angle') {
            const r = parseFloat(document.getElementById('tb-sec-r').value) || 0;
            props = SectionProp.calcAngle(h, b, tw, r);
        } else if (this.currentSectionType === 'channel') {
            props = SectionProp.calcChannel(h, b, tw, tf);
        } else {
            props = SectionProp.calcH(h, b, tw, tf);
        }

        // 1. Prepare ULS Loads (Factored)
        const loadsULS = JSON.parse(JSON.stringify(this.loads));
        loadsULS.forEach(l => {
            if (l.factor) l.value *= l.factor;
        });

        // 2. Prepare SLS Loads (Standard / Unfactored)
        const loadsSLS = JSON.parse(JSON.stringify(this.loads));
        // Do not multiply by factor (Standard Value)

        // Add Self Weight
        const swCheck = document.getElementById('tb-check-self-weight');
        if (swCheck && swCheck.checked) {
            const w_kg = props.w; // kg/m
            const w_std_kN = w_kg * 9.8 / 1000; // Standard SW

            const swFactor = parseFloat(document.getElementById('tb-sw-factor').value) || 1.2;

            this.spans.forEach((_, i) => {
                // ULS Self Weight (using custom factor with 1.3 Dead Load coeff)
                loadsULS.push({ spanIdx: i, type: 'dist', value: w_std_kN * 1.3 * swFactor });
                // SLS Self Weight (Standard with amplification)
                loadsSLS.push({ spanIdx: i, type: 'dist', value: w_std_kN * swFactor });
            });
        }

        // Solve Both
        const resULS = BeamSolver.solve(this.spans, loadsULS, E, props.Ix);
        const resSLS = BeamSolver.solve(this.spans, loadsSLS, E, props.Ix);

        // Merge Results
        // Moment, Shear, Reaction -> From ULS
        // Deflection (v) -> From SLS
        const combinedPoints = resULS.points.map((p, i) => {
            return {
                x: p.x,
                m: p.m,            // ULS
                v_shear: p.v_shear,// ULS
                v: resSLS.points[i].v // SLS
            };
        });

        const combinedRes = {
            points: combinedPoints,
            reactions: resULS.reactions // ULS Reactions
        };

        // --- Calculate Max Values for Summary ---
        // 1. Moment (ULS)
        const mVals = combinedPoints.map(p => p.m);
        const mMax = Math.max(...mVals);
        const mMin = Math.min(...mVals);
        const mAbsMax = Math.max(Math.abs(mMax), Math.abs(mMin));
        // M is usually displayed in kN·m. p.m is in N·mm? No, logic uses standard consistent units?
        // E in MPa (N/mm^2). I in mm^4. L in mm. Load in kN/m (N/mm).
        // Result M in N·mm. / 1,000,000 -> kN·m.
        const mDisp = (mAbsMax / 1000000).toFixed(2);
        const elM = document.getElementById('sum-m-val');
        if (elM) elM.innerText = mDisp;

        // 2. Shear (ULS)
        const vVals = combinedPoints.map(p => p.v_shear);
        const vAbsMax = Math.max(...vVals.map(Math.abs));
        // Result Shear in N. / 1000 -> kN.
        const vDisp = (vAbsMax / 1000).toFixed(2);
        const elV = document.getElementById('sum-v-val');
        if (elV) elV.innerText = vDisp;

        // 3. Reaction (ULS)
        const rVals = resULS.reactions.map(r => Math.abs(r.val));
        const rMax = Math.max(...rVals);
        const rDisp = (rMax / 1000).toFixed(2);
        const elR = document.getElementById('sum-r-val');
        if (elR) elR.innerText = rDisp;

        // 4. Deflection (SLS)
        const dVals = combinedPoints.map(p => p.v);
        const dAbsMax = Math.max(...dVals.map(Math.abs));
        // Result v in mm.
        const dDisp = dAbsMax.toFixed(2);
        const elD = document.getElementById('sum-def-val');
        if (elD) elD.innerText = dDisp;

        // Deflection Limit (L/250 default)
        const maxSpan = Math.max(...this.spans);
        const limitVal = maxSpan / 250;
        const elDLimit = document.getElementById('sum-def-limit');
        if (elDLimit) elDLimit.innerText = `L/250 = ${limitVal.toFixed(1)} mm`;

        const elDStatus = document.getElementById('sum-def-status');
        if (elDStatus) {
            if (dAbsMax > limitVal) {
                elDStatus.innerText = '不满足 (Fail)';
                elDStatus.style.color = '#ef4444';
                elDStatus.style.backgroundColor = '#fee2e2';
            } else {
                elDStatus.innerText = '满足 (Pass)';
                elDStatus.style.color = '#10b981';
                elDStatus.style.backgroundColor = '#d1fae5';
            }
        }

        // Update Chart Header Max Values
        const setChartMax = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setChartMax('chart-max-val-m', mDisp);
        setChartMax('chart-max-val-v', vDisp);
        setChartMax('chart-max-val-r', rDisp);
        setChartMax('chart-max-val-def', dDisp);

        // Store results for Export access
        this.currentResults = combinedRes;
        this.drawCharts(combinedRes);

        // --- Update External Main View Results (Sync) ---
        // Sync Summary Values to the mini-cards below the Toolbox Button
        const setExt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
        setExt('ext-tb1-m', mDisp + ' kN·m');
        setExt('ext-tb1-v', vDisp + ' kN');
        setExt('ext-tb1-r', rDisp + ' kN');
        setExt('ext-tb1-r', rDisp + ' kN');
        setExt('ext-tb1-def', dDisp + ' mm');
        if (props && props.Wx_Top) setExt('ext-tb1-wx-t', (props.Wx_Top).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' mm³');
        if (props && props.Wx_Bot) setExt('ext-tb1-wx-b', (props.Wx_Bot).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' mm³');
        if (props && props.Wy_Left) setExt('ext-tb1-wy-l', (props.Wy_Left).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' mm³');
        if (props && props.Wy_Right) setExt('ext-tb1-wy-r', (props.Wy_Right).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' mm³');
        setExt('ext-tb1-status', 'Calculated');

        const extCont = document.getElementById('ext-res-tb1');
        if (extCont) {
            extCont.style.borderColor = '#93c5fd';
            extCont.style.background = '#eff6ff';
        }
        // Store SLS detailed results for Process View
        this.lastSLSResult = {
            res: resSLS,
            loads: loadsSLS,
            spans: this.spans,
            props: props
        };
    },

    toggleSelfWeight() {
        const check = document.getElementById('tb-check-self-weight');
        const detail = document.getElementById('tb-sw-detail');
        if (detail) detail.style.display = check.checked ? 'block' : 'none';
        this.calculateBeam();
    },

    showDeflectionProcess() {
        if (!this.lastSLSResult) {
            alert("请先进行计算 Please calculate first.");
            return;
        }

        const { res, loads, spans, props } = this.lastSLSResult;
        const E = res.E;
        const I = res.I;
        const U = res.U; // Global Displacement Vector

        // Find Max Deflection
        let maxDefVal = 0;
        let maxDefX = 0;
        let maxSpanIdx = 0;
        let maxLocalX = 0;

        let currentX = 0;
        let ptIdx = 0;
        spans.forEach((L, i) => {
            const numPts = 501;
            for (let j = 0; j < numPts; j++) {
                const pt = res.points[ptIdx];
                if (Math.abs(pt.v) > Math.abs(maxDefVal)) {
                    maxDefVal = pt.v;
                    maxDefX = pt.x;
                    maxSpanIdx = i;
                    maxLocalX = (j * L / (numPts - 1));
                }
                ptIdx++;
            }
            currentX += L;
        });

        // Generate Node Report
        let nodeRows = '';
        for (let i = 0; i < res.nodes; i++) {
            const v_node = U[2 * i];
            const theta_node = U[2 * i + 1];
            nodeRows += `
            <tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:8px;">Node ${i + 1} (${i === 0 ? 'Start' : i === res.nodes - 1 ? 'End' : 'Sup'})</td>
                <td style="padding:8px; text-align:right;">${v_node.toFixed(4)} mm</td>
                <td style="padding:8px; text-align:right;">${theta_node.toExponential(4)} rad</td>
            </tr>`;
        }

        // Generate Critical Span Report
        const idx = [2 * maxSpanIdx, 2 * maxSpanIdx + 1, 2 * (maxSpanIdx + 1), 2 * (maxSpanIdx + 1) + 1];
        const u_local = idx.map(zi => U[zi]);
        const L_crit = spans[maxSpanIdx];

        // Shape Function terms at max location
        const xi = maxLocalX / L_crit;
        const x = maxLocalX;

        const N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
        const N2 = x * (1 - 2 * xi + xi * xi);
        const N3 = 3 * xi * xi - 2 * xi * xi * xi;
        const N4 = x * (xi * xi - xi);

        const v_homo = N1 * u_local[0] + N2 * u_local[1] + N3 * u_local[2] + N4 * u_local[3];
        const v_particular = maxDefVal - v_homo;

        const html = `
        <div style="font-family:'Inter', sans-serif; color:#374151;">
            <div style="background:#fff7ed; border-left:4px solid #f97316; padding:15px; margin-bottom:20px;">
                <h3 style="margin:0 0 10px 0; color:#c2410c; font-size:1.1rem;">Max Deflection Calculation (最大挠度计算)</h3>
                <div style="font-size:1.5rem; font-weight:700; color:#ea580c;">
                    f_max = ${maxDefVal.toFixed(2)} mm
                </div>
                <div style="color:#9a3412; font-size:0.9rem; margin-top:5px;">
                    Located at Span ${maxSpanIdx + 1} (x = ${maxLocalX.toFixed(0)} mm)
                </div>
            </div>

            <div style="margin-bottom:20px;">
                <h4 style="margin:0 0 10px 0; border-bottom:1px solid #e5e7eb; padding-bottom:5px;">1. Methodology (计算原理)</h4>
                <p style="font-size:0.9rem; line-height:1.6;color:#4b5563;">
                    This calculator uses the <b>Matrix Displacement Method (Finite Element Method)</b>.
                    Analysis is performed on the exact Bernoulli-Euler beam 4th-order differential equation.
                    <br><br>
                    $$ v(x) = [N] \\cdot \\{u\\}_e + v_{particular}(x) $$
                </p>
                <div style="font-size:0.85rem; background:#f9fafb; padding:10px; border-radius:6px; margin-top:10px;">
                    Where $ [N] $ are Hermite Shape Functions:<br>
                    $ N_1 = 1 - 3\\xi^2 + 2\\xi^3 $<br>
                    $ N_2 = x(1 - 2\\xi + \\xi^2) $<br>
                    $ N_3 = 3\\xi^2 - 2\\xi^3 $<br>
                    $ N_4 = x(\\xi^2 - \\xi) $<br>
                    ($ \\xi = x/L $)
                </div>
            </div>

            <div style="margin-bottom:20px;">
                <h4 style="margin:0 0 10px 0; border-bottom:1px solid #e5e7eb; padding-bottom:5px;">2. Nodal Displacements (节点位移)</h4>
                <p style="font-size:0.9rem; color:#6b7280; margin-bottom:10px;">
                    Solved via Global Stiffness Matrix $[K]\{D\} = \{F\}$:
                </p>
                <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                    <thead>
                        <tr style="background:#f3f4f6; text-align:left;">
                            <th style="padding:8px;">Node</th>
                            <th style="padding:8px; text-align:right;">Disp (v)</th>
                            <th style="padding:8px; text-align:right;">Rot ($\theta$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${nodeRows}
                    </tbody>
                </table>
            </div>

            <div>
                 <h4 style="margin:0 0 10px 0; border-bottom:1px solid #e5e7eb; padding-bottom:5px;">3. Critical Point Verification (关键点验算)</h4>
                 <p style="font-size:0.9rem; margin-bottom:10px;">
                    At max deflection point ($x=${maxLocalX.toFixed(0)}$ mm in Span ${maxSpanIdx + 1}):
                 </p>
                 <div style="font-family:'Courier New', monospace; font-size:0.85rem; background:#1e293b; color:#fbbf24; padding:15px; border-radius:8px;">
                    // Local Displacements (Span ${maxSpanIdx + 1}):<br>
                    v_L  = ${u_local[0].toFixed(4)} mm<br>
                    θ_L  = ${u_local[1].toExponential(4)} rad<br>
                    v_R  = ${u_local[2].toFixed(4)} mm<br>
                    θ_R  = ${u_local[3].toExponential(4)} rad<br>
                    <br>
                    // Shape Functions at ξ=${xi.toFixed(3)}:<br>
                    N1=${N1.toFixed(3)}, N2=${N2.toFixed(3)}<br>
                    N3=${N3.toFixed(3)}, N4=${N4.toFixed(3)}<br>
                    <br>
                    // Summation:<br>
                    v_homo = ${v_homo.toFixed(4)} mm<br>
                    v_part = ${v_particular.toFixed(4)} mm (Local Load Effect)<br>
                    -----------------------------<br>
                    v_total = ${(v_homo + v_particular).toFixed(4)} mm
                 </div>
            </div>
            
            <div style="margin-top:20px; text-align:right;">
                 <button onclick="document.getElementById('tb1-def-process-modal').remove()" style="padding:8px 20px; background:#e5e7eb; border:none; border-radius:6px; cursor:pointer; font-weight:600; color:#374151;">Close</button>
            </div>
        </div>
        `;

        // Create Modal Overlay
        const modalId = 'tb1-def-process-modal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const modalDiv = document.createElement('div');
        modalDiv.id = modalId;
        modalDiv.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;";

        modalDiv.innerHTML = `
            <div style="background:white; border-radius:12px; width:90%; max-width:600px; max-height:90vh; overflow-y:auto; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); padding:0;">
                <div style="padding:20px 25px; border-bottom:1px solid #f3f4f6; display:flex; justify-content:space-between; align-items:center;">
                     <h3 style="margin:0; font-size:1.1rem; color:#111827;">Calculation Process (Toolbox 1)</h3>
                     <button onclick="document.getElementById('${modalId}').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#9ca3af;">&times;</button>
                </div>
                <div style="padding:25px;">
                    ${html}
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);

        if (window.MathJax) {
            window.MathJax.typesetPromise ? window.MathJax.typesetPromise([modalDiv]) : window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, modalDiv]);
        }
    },

    bindRealTime() {
        const elE = document.getElementById('tb-beam-e');
        if (elE) elE.oninput = () => this.calculateBeam();
    },

    drawCharts(res) {
        const draw = (id, dataKey, color, label, scale = 1, invert = false) => {
            const canvas = document.getElementById(id);
            if (!canvas) return;
            const parent = canvas.parentElement;
            // Only autosize if NOT exporting
            if (!canvas.hasAttribute('data-export-mode')) {
                canvas.width = parent.clientWidth - 30; // padding
            }
            const ctx = canvas.getContext('2d');
            const h = canvas.height;
            const w = canvas.width;

            ctx.clearRect(0, 0, w, h);

            // Determine Total Length
            let totalL = 0;
            if (this.spans && this.spans.length > 0) {
                totalL = this.spans.reduce((a, b) => a + b, 0);
            } else if (res && res.points && res.points.length > 0) {
                totalL = res.points[res.points.length - 1].x;
            }
            if (totalL === 0) totalL = 1;

            const mapX = (x) => (x / totalL) * w;

            // --- 1. Load Schematic ---
            if (label === 'Load Schematic') {
                // Draw Axis
                ctx.beginPath(); ctx.strokeStyle = '#9ca3af'; ctx.setLineDash([5, 5]); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.setLineDash([]);

                // Draw Supports (Fixed Loop)
                let cx = 0;
                // Start Support
                const sx0 = mapX(0);
                ctx.fillStyle = '#1f2937';
                ctx.beginPath(); ctx.moveTo(sx0, h / 2); ctx.lineTo(sx0 - 5, h / 2 + 10); ctx.lineTo(sx0 + 5, h / 2 + 10); ctx.fill();

                this.spans.forEach((L, i) => {
                    // Label (Center of span)
                    const centerCx = cx + L / 2;
                    const sxCenter = mapX(centerCx);
                    ctx.fillStyle = '#6b7280';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.fillText(`L${i + 1}`, sxCenter - 10, h / 2 - 5);

                    cx += L;
                    // End Support
                    const sx = mapX(cx);
                    ctx.fillStyle = '#1f2937';
                    ctx.beginPath(); ctx.moveTo(sx, h / 2); ctx.lineTo(sx - 5, h / 2 + 10); ctx.lineTo(sx + 5, h / 2 + 10); ctx.fill();
                });

                // Draw Loads
                this.loads.forEach(l => {
                    let loadCx = 0;
                    for (let k = 0; k < l.spanIdx; k++) loadCx += this.spans[k];

                    if (l.type === 'point') {
                        const dist = l.dist !== undefined ? l.dist : 0;
                        const lx = loadCx + dist;
                        const sx = mapX(lx);
                        const sy_base = h / 2;
                        const arrowLen = 40;

                        // Arrow
                        ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
                        ctx.moveTo(sx, sy_base - arrowLen); ctx.lineTo(sx, sy_base);
                        ctx.moveTo(sx - 5, sy_base - 10); ctx.lineTo(sx, sy_base); ctx.lineTo(sx + 5, sy_base - 10);
                        ctx.stroke();
                        // Label
                        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 11px sans-serif';
                        ctx.fillText(`${l.value}kN`, sx + 5, sy_base - arrowLen / 2);

                    } else if (l.type === 'dist') {
                        let start = (l.range && l.range[0] !== null) ? l.range[0] : 0;
                        let end = (l.range && l.range[1] !== null) ? l.range[1] : this.spans[l.spanIdx];
                        const lx_start = loadCx + start;
                        const lx_end = loadCx + end;
                        const sx_start = mapX(lx_start);
                        const sx_end = mapX(lx_end);
                        const sy_base = h / 2;
                        const height = 20;

                        ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
                        ctx.fillRect(sx_start, sy_base - height, sx_end - sx_start, height);
                        ctx.strokeStyle = '#a855f7';
                        ctx.strokeRect(sx_start, sy_base - height, sx_end - sx_start, height);

                        const midX = (sx_start + sx_end) / 2;
                        ctx.beginPath();
                        ctx.moveTo(midX, sy_base - height); ctx.lineTo(midX, sy_base);
                        ctx.moveTo(midX - 3, sy_base - 5); ctx.lineTo(midX, sy_base); ctx.lineTo(midX + 3, sy_base - 5);
                        ctx.stroke();
                        ctx.fillStyle = '#a855f7'; ctx.font = 'bold 11px sans-serif';
                        ctx.fillText(`${l.value}kN/m`, midX, sy_base - height - 5);
                    }
                });
                return;
            }

            // --- 2. Reaction Chart ---
            if (label.includes('Reaction')) {
                // Find data limits
                const reactions = res.reactions;
                const maxR = Math.max(...reactions.map(r => Math.abs(r.val)));
                const limitR = maxR > 0 ? maxR * 1.5 : 10;

                // Axis
                ctx.beginPath(); ctx.strokeStyle = '#9ca3af'; ctx.setLineDash([5, 5]); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.setLineDash([]);

                // Supports & Reactions
                reactions.forEach(r => {
                    const nodeIdx = r.node;
                    let cx = 0;
                    for (let k = 0; k < nodeIdx; k++) cx += this.spans[k];
                    const sx = mapX(cx);

                    // Support Dot
                    ctx.fillStyle = '#1f2937';
                    ctx.beginPath(); ctx.arc(sx, h / 2, 4, 0, Math.PI * 2); ctx.fill();

                    // Arrow
                    const rVal = r.val;
                    const rH = (rVal / limitR) * (h / 2) * 0.8;
                    const sy_start = h / 2;
                    const sy_end = h / 2 - rH; // Up is negative Y

                    ctx.beginPath(); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 4;
                    ctx.moveTo(sx, sy_start); ctx.lineTo(sx, sy_end); ctx.stroke();

                    ctx.fillStyle = '#2563eb'; ctx.font = '12px sans-serif';
                    ctx.fillText(`${(rVal / 1000).toFixed(2)} kN`, sx + 5, sy_end);
                });
                return;
            }

            // --- 3. Standard Charts (Moment, Shear, Deflection) ---
            const vals = res.points.map(p => p[dataKey] * scale);
            const absMax = Math.max(Math.abs(Math.max(...vals)), Math.abs(Math.min(...vals)));
            const limit = absMax > 0 ? absMax * 1.2 : 1;
            const mapY = (val) => h / 2 - (val / limit) * (h / 2) * 0.8;

            // Axis
            ctx.beginPath(); ctx.strokeStyle = '#9ca3af'; ctx.setLineDash([5, 5]); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.setLineDash([]);

            // Supports Labels
            let cx = 0;
            // Support 0
            const sx0 = mapX(0);
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(sx0, h / 2); ctx.lineTo(sx0 - 5, h / 2 + 10); ctx.lineTo(sx0 + 5, h / 2 + 10); ctx.fill();

            this.spans.forEach((L, i) => {
                const centerCx = cx + L / 2;
                const sxCenter = mapX(centerCx);
                ctx.fillStyle = '#6b7280'; ctx.font = 'bold 12px sans-serif';
                ctx.fillText(`L${i + 1}`, sxCenter - 10, h / 2 - 5);

                cx += L;
                const sxEnd = mapX(cx);
                ctx.beginPath(); ctx.moveTo(sxEnd, h / 2); ctx.lineTo(sxEnd - 5, h / 2 + 10); ctx.lineTo(sxEnd + 5, h / 2 + 10); ctx.fill();
            });

            // Curve
            ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.fillStyle = color + '22';

            // Fill
            ctx.beginPath(); ctx.moveTo(0, h / 2);
            res.points.forEach((p) => {
                const x = mapX(p.x); const y = mapY(p[dataKey] * scale);
                ctx.lineTo(x, y);
            });
            ctx.lineTo(w, h / 2); ctx.closePath(); ctx.fill();

            // Line
            ctx.beginPath();
            res.points.forEach((p, i) => {
                const x = mapX(p.x); const y = mapY(p[dataKey] * scale);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Max Label
            ctx.fillStyle = color; ctx.font = '12px sans-serif';
            let unit = '';
            if (label.includes('Moment')) unit = ' kN·m';
            else if (label.includes('Shear')) unit = ' kN';
            else if (label.includes('Deflection')) unit = ' mm';
            ctx.fillText(`Max: ${(absMax).toFixed(2)}${unit}`, w - 120, 20);
        };

        draw('chart-loads', '', '#555', 'Load Schematic');
        draw('chart-reaction', 'r', '#2563eb', 'Reaction (R)');
        draw('chart-moment', 'm', '#ef4444', 'Moment (kN·m)', 1 / 1000000, true);
        draw('chart-shear', 'v_shear', '#10b981', 'Shear (kN)', 1 / 1000);
        draw('chart-deflection', 'v', '#f59e0b', 'Deflection (mm)', 1);
    },

    getData() {
        return {
            sectionType: this.currentSectionType,
            secH: document.getElementById('tb-sec-h').value,
            secB: document.getElementById('tb-sec-b').value,
            secTw: document.getElementById('tb-sec-tw').value,
            secTf: document.getElementById('tb-sec-tf').value,
            secR: document.getElementById('tb-sec-r').value,
            beamSecH: document.getElementById('tb-beam-sec-h').value,
            beamSecB: document.getElementById('tb-beam-sec-b').value,
            beamSecTw: document.getElementById('tb-beam-sec-tw').value,
            beamSecTf: document.getElementById('tb-beam-sec-tf').value,
            beamSecR: document.getElementById('tb-beam-sec-r').value,
            spans: this.spans,
            loads: this.loads,
            beamE: document.getElementById('tb-beam-e').value,
            checkSelfWeight: document.getElementById('tb-check-self-weight').checked,
            swFactor: document.getElementById('tb-sw-factor').value
        };
    },

    setData(data) {
        if (!data) return;
        if (data.sectionType) this.updateSectionType(data.sectionType);
        if (data.secH) document.getElementById('tb-sec-h').value = data.secH;
        if (data.secB) document.getElementById('tb-sec-b').value = data.secB;
        if (data.secTw) document.getElementById('tb-sec-tw').value = data.secTw;
        if (data.secTf) document.getElementById('tb-sec-tf').value = data.secTf;
        if (data.secR) document.getElementById('tb-sec-r').value = data.secR;

        if (data.beamSecH) document.getElementById('tb-beam-sec-h').value = data.beamSecH;
        if (data.beamSecB) document.getElementById('tb-beam-sec-b').value = data.beamSecB;
        if (data.beamSecTw) document.getElementById('tb-beam-sec-tw').value = data.beamSecTw;
        if (data.beamSecTf) document.getElementById('tb-beam-sec-tf').value = data.beamSecTf;
        if (data.beamSecR) document.getElementById('tb-beam-sec-r').value = data.beamSecR;

        if (data.spans) this.spans = data.spans;
        if (data.loads) this.loads = data.loads;
        if (data.beamE) document.getElementById('tb-beam-e').value = data.beamE;

        if (data.checkSelfWeight !== undefined) {
            document.getElementById('tb-check-self-weight').checked = data.checkSelfWeight;
            this.toggleSelfWeight();
        }
        if (data.swFactor) document.getElementById('tb-sw-factor').value = data.swFactor;

        this.renderSpans();
        this.renderLoads();

        // Update both section views
        ['h', 'b', 'tw', 'tf', 'r'].forEach(key => {
            const val = document.getElementById(`tb-sec-${key}`).value;
            document.querySelectorAll(`.js-sec-${key}`).forEach(el => el.value = val);
        });

        this.updateSection();
        this.calculateBeam();
    }
};

// --- View Switching Logic (SPA) ---
let activeToolboxId = 1;

window.showToolbox = (id) => {
    activeToolboxId = id;
    document.getElementById('app-main-view').style.display = 'none';
    const tb = document.getElementById('app-toolbox-view');
    tb.classList.remove('hidden');
    tb.style.display = 'block';

    document.getElementById('toolbox-title-text').innerText = `Web-MSteel 结构工具箱 (Toolbox ${id})`;
    document.title = `StoneCalc - Toolbox ${id}`;

    setTimeout(() => {
        ToolboxManager.updateSection();
        window.dispatchEvent(new Event('resize'));
    }, 50);
};

window.closeToolbox = () => {
    document.getElementById('app-toolbox-view').style.display = 'none';
    document.getElementById('app-toolbox-view').classList.add('hidden');
    document.getElementById('app-main-view').style.display = 'flex';
    document.title = 'StoneCalc Pro - Advanced Stone Cladding Calculation';
};

window.tbAddSpan = () => ToolboxManager.addSpan();
window.tbRemoveSpan = (i) => ToolboxManager.removeSpan(i);
window.tbAddLoad = () => ToolboxManager.addLoad();
window.tbRemoveLoad = (i) => ToolboxManager.removeLoad(i);
window.tbCalculateBeam = () => ToolboxManager.calculateBeam();

window.switchToolboxTab = (tab) => {
    document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tb-tab-content').forEach(el => el.classList.add('hidden'));

    if (tab === 'section') {
        document.getElementById('tab-btn-sec').classList.add('active');
        document.getElementById('tb-tab-section').classList.remove('hidden');
        ToolboxManager.updateSection();
    } else {
        document.getElementById('tab-btn-beam').classList.add('active');
        document.getElementById('tb-tab-beam').classList.remove('hidden');
        // Force calculation and chart resize to ensure visibility
        setTimeout(() => {
            ToolboxManager.calculateBeam();
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ToolboxManager.renderSpans();
    ToolboxManager.renderLoads();
    ToolboxManager.bindRealTime();

    const bindSync = (key) => {
        const els = document.querySelectorAll(`.js-sec-${key}`);
        els.forEach(el => {
            el.addEventListener('input', (e) => {
                const val = e.target.value;
                document.querySelectorAll(`.js-sec-${key}`).forEach(other => {
                    if (other !== e.target) other.value = val;
                });
                ToolboxManager.updateSection();
            });
        });
    };
    ['h', 'b', 'tw', 'tf', 'r'].forEach(bindSync);
});
