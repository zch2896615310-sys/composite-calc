"""Physical support planes shared by validation and the web solver adapter.

The retained V2 engine is not modified. Missing Y retains its original value 0.
"""
import math


def layer_bounds(p):
    y = 0.
    out = []
    for layer in p['layers']:
        end = round(y + layer['thickness'], 9)
        out.append((y, end))
        y = end
    return out


def support_y(p, s):
    bounds = layer_bounds(p)
    surface = s.get('surface', 'custom')
    if not isinstance(surface, str):
        raise ValueError('挂点连接面无效')
    if surface == 'front':
        y = 0.
    elif surface == 'back':
        y = bounds[-1][1]
    elif surface.startswith('after:'):
        indices = [i for i, layer in enumerate(p['layers']) if layer['name'] == surface[6:]]
        if not indices:
            raise ValueError('挂点连接面对应的材料层已移除，请重新选择连接面')
        y = bounds[indices[0]][1]
    elif surface == 'custom':
        y = s.get('y', 0)
    else:
        raise ValueError('挂点连接面无效')
    if isinstance(y, bool) or not isinstance(y, (float, int)) or not math.isfinite(y):
        raise ValueError('挂点 Y 必须为有限数值')
    if y < -1e-8 or y > bounds[-1][1] + 1e-8:
        raise ValueError(f'挂点 Y 须在实体厚度范围 0～{bounds[-1][1]:g} mm 内')
    return round(max(0., min(bounds[-1][1], y)), 9)


def thickness_planes(p, divisions=None):
    bounds = layer_bounds(p)
    planes = {0.}
    for i, (a, b) in enumerate(bounds):
        nd = (divisions or [1]*len(bounds))[i]
        planes.update(round(a+(b-a)*j/nd, 9) for j in range(1, nd+1))
    planes.update(support_y(p, s) for s in p['supports'])
    ys = sorted(planes)
    if any(b-a < 1e-7 for a, b in zip(ys, ys[1:])):
        raise ValueError('Y 切分位置过近，间距须至少为 0.0000001 mm')
    return ys
