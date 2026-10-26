"""Explicit orthotropic conventions; preserve physical compliance, not labels.

CSI Analysis Reference Manual v27, 6.6 Eqn 6-5: Sij=-uij/Ej.
CalculiX 2.23 elastics.f (engineering constants): Sij=-nuij/Ei.
Order: E1,E2,E3,nu12,nu13,nu23,G12,G13,G23. Units N,mm,s.
"""
CSI = 'CSI_uij_over_Ej'
CCX = 'CCX_nuij_over_Ei'


def ccx_constants(material):
    v = list(material['engineering_constants'])
    convention = material.get('poisson_convention')
    if convention == CSI:
        v[3] *= v[0] / v[1]
        v[4] *= v[0] / v[2]
        v[5] *= v[1] / v[2]
    elif convention != CCX:
        raise ValueError('Declare poisson_convention explicitly for orthotropic material')
    return v


def compliance(material):
    e1,e2,e3,n12,n13,n23,g12,g13,g23 = ccx_constants(material)
    s = [[0.0]*6 for _ in range(6)]
    for i,v in enumerate((1/e1,1/e2,1/e3,1/g12,1/g13,1/g23)):
        s[i][i] = v
    for i,j,v in ((0,1,-n12/e1),(0,2,-n13/e1),(1,2,-n23/e2)):
        s[i][j] = s[j][i] = v
    return s
