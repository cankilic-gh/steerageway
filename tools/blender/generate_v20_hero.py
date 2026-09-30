"""
Deterministic generator for Steerageway's hero boat: an original, logo-free, V20-inspired
20 ft class open-bow outboard runabout. Everything is built from code (no imported meshes or images).

Run (Blender 5.2 LTS, background mode):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    --python tools/blender/generate_v20_hero.py -- \
    --blend assets-src/blender/v20-inspired-hero.blend \
    --glb public/assets/boats/v20-inspired-hero.glb \
    [--render artifacts/qa/v20-hero] [--samples 96]

Axes (Blender): +X bow, +Y port, +Z up, waterline Z = 0, origin at the physics reference point.
The glTF exporter's +Y-up conversion gives three.js boat axes: +X bow, +Y up, +Z starboard.

Integration contract (see src/render/heroBoat.ts): nodes Hull, EnginePivot, Prop (under EnginePivot),
Wheel (under Helm_Tilt) and Throttle, animated nodes with identity rest rotation, and seat anchors
Seat_Skipper, Seat_Guest1, Seat_Guest2. Mesh datablocks are prefixed ME_ so node names stay unique.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

# ----------------------------------------------------------------------------------------- arguments

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BLEND_OUT = os.path.join(ROOT_DIR, arg('--blend', 'assets-src/blender/v20-inspired-hero.blend'))
GLB_OUT = os.path.join(ROOT_DIR, arg('--glb', 'public/assets/boats/v20-inspired-hero.glb'))
RENDER_DIR = arg('--render')
SAMPLES = int(arg('--samples', '96'))
VIEWS = arg('--views')  # optional comma-separated subset of QA view names

# ----------------------------------------------------------------------------------------- math helpers


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def smooth(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def catmull(points, samples):
    """Centripetal-ish uniform Catmull-Rom through `points`, returns `samples` points (endpoints included)."""
    pts = [Vector(p) for p in points]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    segs = len(pts) - 1
    out = []
    for i in range(samples):
        u = i / (samples - 1) * segs
        k = min(int(u), segs - 1)
        t = u - k
        p0, p1, p2, p3 = ext[k], ext[k + 1], ext[k + 2], ext[k + 3]
        t2, t3 = t * t, t * t * t
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return out


def resample(points, count):
    """Resamples a polyline to `count` points evenly spaced by arc length."""
    pts = [Vector(p) for p in points]
    d = [0.0]
    for a, b in zip(pts, pts[1:]):
        d.append(d[-1] + (b - a).length)
    total = d[-1]
    out = []
    j = 0
    for i in range(count):
        s = total * i / (count - 1)
        while j < len(d) - 2 and d[j + 1] < s:
            j += 1
        seg = max(d[j + 1] - d[j], 1e-9)
        out.append(pts[j].lerp(pts[j + 1], (s - d[j]) / seg))
    return out


def trs(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    from mathutils import Euler
    return Matrix.LocRotScale(Vector(loc), Euler(rot, 'XYZ'), Vector(scale))


# ----------------------------------------------------------------------------------------- hull lines

L = 5.2
X0, X1 = -2.6, 2.6
KEEL_AFT = -0.28
RAKE = math.tan(math.radians(5.0))  # transom rake (top leans forward)
XB = 2.12  # foredeck bulkhead (open bow ends here)


def t_of(x):
    return (x - X0) / L


def sheer_z(x):
    t = clamp(t_of(x), 0, 1)
    return 0.86 + 0.07 * t + 0.19 * t ** 3


def sheer_hb(x):
    """Half-beam at the sheer: wide transom, beam carried well forward, fine but full bow."""
    t = clamp(t_of(x), 0, 1)
    if t <= 0.42:
        return 0.975 + 0.055 * math.sin(t / 0.42 * math.pi / 2)
    u = (t - 0.42) / 0.58
    return 1.03 * max(0.0, 1 - u ** 2.4) ** 0.62


STEM = (Vector((X0 + 0.55 * L, -0.25)), Vector((1.95, -0.23)), Vector((X1, sheer_z(X1))))


def stem_point(s):
    a, b, c = STEM
    return a * (1 - s) ** 2 + b * 2 * (1 - s) * s + c * s * s


def keel_z(x):
    t = t_of(x)
    if t <= 0.55:
        return KEEL_AFT + 0.03 * (t / 0.55) ** 2
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if stem_point(mid).x < x:
            lo = mid
        else:
            hi = mid
    return stem_point((lo + hi) / 2).y


def section(x, include_rails=True):
    """Half-section from keel (y=0) up the port side to the sheer. Returns (points, tags)."""
    t = clamp(t_of(x), 0, 1)
    hbs = sheer_hb(x)
    zs = sheer_z(x)
    zk = keel_z(x)
    k = min(1.0, hbs / 0.6)
    hbc = hbs * (0.80 - 0.12 * smooth(0.45, 1.0, t))
    zc = zk + (0.237 + 0.22 * smooth(0.35, 1.0, t)) * (zs - zk)
    d = Vector((hbc, zc - zk))
    n = Vector((d.y, -d.x)).normalized() if d.length > 1e-6 else Vector((0, -1))

    def v(s):
        p = Vector((0, zk)) + d * s
        return p + n * (0.010 * k * math.sin(math.pi * s))

    pts, tags = [], []

    def add(p, tag='bottom'):
        pts.append(Vector((p.x, p.y)))
        tags.append(tag)

    add(v(0.0), 'keel')
    rails = [0.34, 0.68] if include_rails else []
    # Spray rails and the chine flat are slim, conformal steps that die out well before the stem.
    rail_fade = 1 - smooth(0.70, 0.86, t)
    chine_fade = lerp(1.0, 0.3, smooth(0.70, 0.95, t))
    s_list = [0.11, 0.22, 'R0', 0.46, 0.57, 'R1', 0.80, 0.90]
    for s in s_list:
        if isinstance(s, str):
            if not rails:
                continue
            sr = rails[int(s[1])]
            w = max(0.0015, 0.016 * k * rail_fade)
            a = v(sr)
            add(a, 'rail')
            add(Vector((a.x + w, a.y - 0.0025 * k * rail_fade)), 'rail')
            add(v(sr + w / max(hbc, 1e-4)), 'rail')
        else:
            add(v(s))
    chine = v(1.0)
    add(chine, 'chine')
    wc = 0.040 * k * chine_fade
    q = Vector((chine.x + wc, chine.y - 0.008 * k * chine_fade))
    add(q, 'chine')
    r = Vector((q.x + 0.004 * k, q.y + 0.014 * k))
    add(r, 'topside')
    s_top = Vector((hbs, zs))
    k1 = 0.45 - 0.25 * smooth(0.5, 1.0, t)
    ctrl = Vector((r.x + (s_top.x - r.x) * k1, r.y + (s_top.y - r.y) * 0.55))
    for i in range(1, 8):
        u = i / 7
        p = r * (1 - u) ** 2 + ctrl * 2 * (1 - u) * u + s_top * u * u
        add(p, 'topside')
    return pts, tags


_SECTION_CACHE = {}


def hull_y_at(x, z):
    """Outer hull half-breadth at height z (walks the section polyline)."""
    key = round(x, 3)
    pts = _SECTION_CACHE.get(key)
    if pts is None:
        pts = _SECTION_CACHE[key] = section(key, include_rails=False)[0]
    if z <= pts[0].y:
        return 0.0
    for a, b in zip(pts, pts[1:]):
        if (a.y - z) * (b.y - z) <= 0 and abs(b.y - a.y) > 1e-9:
            return a.x + (b.x - a.x) * (z - a.y) / (b.y - a.y)
    return pts[-1].x


def rake_x(x, z):
    """Leans the aft end of the hull forward toward the top (transom rake), faded out over 0.36 m."""
    w = max(0.0, 1 - t_of(x) / 0.07)
    return x + (z - KEEL_AFT) * RAKE * w


# ----------------------------------------------------------------------------------------- materials

MAT = {}


def principled(name, base, rough, metal=0.0, coat=0.0, coat_rough=0.06, alpha=1.0, emission=None, strength=0.0,
               sheen=0.0, double=False, normal_img=None, normal_strength=1.0, spec=0.5):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*base, 1.0)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Specular IOR Level'].default_value = spec
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = coat_rough
    if sheen:
        p.inputs['Sheen Weight'].default_value = sheen
        p.inputs['Sheen Roughness'].default_value = 0.4
    if alpha < 1.0:
        p.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    if emission:
        p.inputs['Emission Color'].default_value = (*emission, 1.0)
        p.inputs['Emission Strength'].default_value = strength
    if normal_img is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = normal_img
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    m.use_backface_culling = not double
    m.diffuse_color = (*base, alpha)
    MAT[name] = m
    return m


def make_nonskid_normal(size=256, cells=8):
    """Diamond-pattern non-skid normal map, computed procedurally (original, tileable, no external source)."""
    h = [[0.0] * size for _ in range(size)]
    for j in range(size):
        for i in range(size):
            u = (i + 0.5) / size * cells % 1.0
            v = (j + 0.5) / size * cells % 1.0
            dd = abs(u - 0.5) + abs(v - 0.5)
            plateau = 1.0 - smooth(0.26, 0.40, dd)
            h[j][i] = plateau
    px = []
    strength = 3.0
    for j in range(size):
        for i in range(size):
            dx = h[j][(i + 1) % size] - h[j][(i - 1) % size]
            dy = h[(j + 1) % size][i] - h[(j - 1) % size][i]
            nx, ny, nz = -dx * strength, -dy * strength, 1.0
            ln = math.sqrt(nx * nx + ny * ny + nz * nz)
            px += [nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5, 1.0]
    img = bpy.data.images.new('NonSkid_Normal', size, size, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(px)
    img.file_format = 'PNG'
    img.update()
    img.pack()
    return img


def build_materials():
    # Linear base colors. Gelcoat stays below 0.8 albedo so it does not clip in the sun (research section 8).
    principled('Gelcoat_White', (0.675, 0.685, 0.685), 0.32, coat=0.6, coat_rough=0.10, double=True)
    principled('Hull_Navy', (0.018, 0.034, 0.075), 0.22, coat=1.0, coat_rough=0.06, double=True)
    principled('Bottom_Paint', (0.030, 0.034, 0.042), 0.78, double=True, spec=0.3)
    principled('NonSkid', (0.45, 0.455, 0.452), 0.76, normal_img=make_nonskid_normal(), normal_strength=0.8, double=True)
    principled('Vinyl_Ivory', (0.62, 0.565, 0.45), 0.52, sheen=0.3)
    principled('Vinyl_Graphite', (0.035, 0.040, 0.048), 0.52, sheen=0.25)
    principled('Stainless', (0.80, 0.81, 0.82), 0.20, metal=1.0)
    principled('Rubber_Black', (0.016, 0.017, 0.019), 0.55, spec=0.4)
    principled('Glass_Smoke', (0.10, 0.13, 0.14), 0.03, alpha=0.32, double=True)
    principled('Display_Glass', (0.006, 0.008, 0.011), 0.28, emission=(0.015, 0.05, 0.085), strength=0.8, spec=0.25)
    principled('Cowl_Graphite', (0.045, 0.048, 0.052), 0.32, metal=0.55, coat=1.0, coat_rough=0.05)
    principled('Engine_Dark', (0.020, 0.021, 0.023), 0.45)
    principled('NavLight_Red', (0.6, 0.02, 0.02), 0.2, emission=(1.0, 0.04, 0.03), strength=6.0)
    principled('NavLight_Green', (0.02, 0.5, 0.12), 0.2, emission=(0.03, 1.0, 0.25), strength=6.0)
    principled('NavLight_White', (0.8, 0.8, 0.78), 0.2, emission=(1.0, 0.97, 0.9), strength=5.0)


# ----------------------------------------------------------------------------------------- mesh building

class Geo:
    """Plain vertex/face lists (quads, tris or ngons)."""

    def __init__(self, v=None, f=None):
        self.v = v or []
        self.f = f or []

    def extend(self, other):
        base = len(self.v)
        self.v += other.v
        self.f += [tuple(i + base for i in face) for face in other.f]
        return self


class MB:
    """Accumulates parts (each with a material and transform) into one Blender mesh object."""

    def __init__(self, name):
        self.name = name
        self.v, self.f, self.fm, self.mats = [], [], [], []

    def add(self, geo, mat, m=None):
        if mat not in self.mats:
            self.mats.append(mat)
        mi = self.mats.index(mat)
        m = m or Matrix.Identity(4)
        flip = m.determinant() < 0
        base = len(self.v)
        self.v += [tuple(m @ Vector(p)) for p in geo.v]
        for face in geo.f:
            face = tuple(i + base for i in face)
            self.f.append(tuple(reversed(face)) if flip else face)
            self.fm.append(mi)
        return self

    def build(self, parent=None, sharp=38.0, merge=0.0, recalc=True, uv_scale=None, collection=None, inside=None):
        if inside is not None:
            # Interior furniture conforms to the curved liner instead of poking through the flared hull sides.
            clamped = []
            for (x, y, z) in self.v:
                ymax = liner_inner_y(x, max(z, KEEL_AFT + 0.02)) + inside
                clamped.append((x, math.copysign(min(abs(y), max(ymax, 0.0)), y), z))
            self.v = clamped
        me = bpy.data.meshes.new('ME_' + self.name)
        me.from_pydata(self.v, [], self.f)
        me.validate()
        for m in self.mats:
            me.materials.append(MAT[m])
        me.polygons.foreach_set('material_index', self.fm)
        me.update()
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=max(merge, 1e-6))
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        me.set_sharp_from_angle(angle=math.radians(sharp))
        box_uv(me, uv_scale or {})
        me.update()
        obj = bpy.data.objects.new(self.name, me)
        (collection or BOAT_COLL).objects.link(obj)
        if parent is not None:
            obj.parent = parent
        return obj


def box_uv(me, scale_by_mat):
    """World-scale box projection. The non-skid material tiles every 0.16 m; other materials carry no textures."""
    uvl = me.uv_layers.new(name='UVMap')
    co = [0.0] * (len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    lv = [0] * len(me.loops)
    me.loops.foreach_get('vertex_index', lv)
    uv = [0.0] * (2 * len(me.loops))
    names = [m.name for m in me.materials]
    for p in me.polygons:
        s = scale_by_mat.get(names[p.material_index] if names else '', 1.0)
        nx, ny, nz = (abs(c) for c in p.normal)
        for li in p.loop_indices:
            vi = lv[li]
            x, y, z = co[3 * vi], co[3 * vi + 1], co[3 * vi + 2]
            if nz >= nx and nz >= ny:
                u, v = x, y
            elif nx >= ny:
                u, v = y, z
            else:
                u, v = x, z
            uv[2 * li], uv[2 * li + 1] = u * s, v * s
    uvl.data.foreach_set('uv', uv)


def grid(rows, closed_u=False):
    """Surface through a list of rows (each a list of 3D points, same length)."""
    g = Geo()
    nu = len(rows[0])
    for r in rows:
        g.v += [tuple(p) for p in r]
    ucount = nu if closed_u else nu - 1
    for j in range(len(rows) - 1):
        for i in range(ucount):
            a = j * nu + i
            b = j * nu + (i + 1) % nu
            g.f.append((a, b, b + nu, a + nu))
    return g


def cap(g, ring_start, count, center, reverse=False):
    ci = len(g.v)
    g.v.append(tuple(center))
    for i in range(count):
        a = ring_start + i
        b = ring_start + (i + 1) % count
        g.f.append((ci, b, a) if not reverse else (ci, a, b))


def loft(rings, cap_start=True, cap_end=True):
    """Closed rings (same point count) lofted in order, with optional fan caps."""
    g = grid(rings, closed_u=True)
    n = len(rings[0])
    if cap_start:
        c = sum((Vector(p) for p in rings[0]), Vector()) / n
        cap(g, 0, n, c, reverse=False)
    if cap_end:
        c = sum((Vector(p) for p in rings[-1]), Vector()) / n
        cap(g, (len(rings) - 1) * n, n, c, reverse=True)
    return g


def frames(path, up=Vector((0, 0, 1))):
    """Tangent frames along a path: (tangent, side, normal) with `normal` kept close to `up`."""
    out = []
    prev_n = None
    for i, p in enumerate(path):
        a = path[max(i - 1, 0)]
        b = path[min(i + 1, len(path) - 1)]
        t = (b - a).normalized()
        ref = up if prev_n is None else prev_n
        side = t.cross(ref)
        if side.length < 1e-6:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        nrm = side.cross(t).normalized()
        if prev_n is not None and up is not None:
            # Parallel transport, then relax toward the requested up vector.
            s2 = t.cross(up)
            if s2.length > 1e-6:
                s2.normalize()
                n2 = s2.cross(t).normalized()
                nrm = nrm.lerp(n2, 0.5).normalized()
                side = t.cross(nrm).normalized()
        prev_n = nrm
        out.append((t, side, nrm))
    return out


def sweep(path, profile, up=Vector((0, 0, 1)), caps=True, scale_fn=None):
    """Sweeps a closed 2D profile (u along `side`, v along `normal`) along a 3D path."""
    path = [Vector(p) for p in path]
    fr = frames(path, up)
    rings = []
    for i, (p, (t, side, nrm)) in enumerate(zip(path, fr)):
        s = scale_fn(i / (len(path) - 1)) if scale_fn else 1.0
        rings.append([p + side * (u * s) + nrm * (v * s) for (u, v) in profile])
    return loft(rings, caps, caps)


def circle_profile(r, n):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def tube(path, r, sides=10, caps=True, radius_fn=None):
    return sweep(path, circle_profile(r, sides), up=Vector((0, 0, 1)), caps=caps, scale_fn=radius_fn)


def rounded_rect_profile(w, h, r, seg=3):
    """Closed rounded rectangle centred on the origin (counter-clockwise)."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def rbox(sx, sy, sz, r=0.02, seg=2):
    """Rounded box centred on the origin (bmesh bevel on a cube)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    r = min(r, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4)
    if r > 1e-4:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=r, offset_type='OFFSET', segments=seg,
                        profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm_geo(bm)


def prism(profile_xz, y0, y1, r=0.03, seg=3):
    """Extrudes an XZ polygon along Y and rounds every edge: a molded fibreglass part."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in profile_xz]
    b = [bm.verts.new((x, y1, z)) for x, z in profile_xz]
    n = len(profile_xz)
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=r, offset_type='OFFSET', segments=seg,
                    profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm_geo(bm)


def cylinder(r, h, sides=16, r2=None, caps=True):
    """Cylinder (or cone) along +Z from z=0 to z=h."""
    r2 = r if r2 is None else r2
    rings = [[(r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides), 0) for i in range(sides)],
             [(r2 * math.cos(2 * math.pi * i / sides), r2 * math.sin(2 * math.pi * i / sides), h) for i in range(sides)]]
    return loft(rings, caps, caps)


def torus(R, r, seg=32, sides=8, arc=2 * math.pi):
    closed = abs(arc - 2 * math.pi) < 1e-6
    rings = []
    n = seg if closed else seg + 1
    for i in range(n):
        a = arc * i / seg
        c = Vector((R * math.cos(a), R * math.sin(a), 0))
        radial = Vector((math.cos(a), math.sin(a), 0))
        rings.append([c + radial * (r * math.cos(2 * math.pi * k / sides)) + Vector((0, 0, r * math.sin(2 * math.pi * k / sides))) for k in range(sides)])
    if closed:
        rings.append(rings[0])
        g = grid(rings, closed_u=True)
        return g
    return loft(rings, True, True)


def superellipse(a, b, n=2.6, count=24):
    out = []
    for i in range(count):
        th = 2 * math.pi * i / count
        c, s = math.cos(th), math.sin(th)
        out.append((a * math.copysign(abs(c) ** (2 / n), c), b * math.copysign(abs(s) ** (2 / n), s)))
    return out


def foil(chord, thick, count=20):
    """Symmetric NACA-like foil in (x, y), `thick` as a fraction of chord; leading edge at x=0, trailing edge at x=-chord."""
    out = []
    for i in range(count):
        th = 2 * math.pi * i / count
        xc = 0.5 * (1 - math.cos(th))  # 0..1..0
        yt = 5 * thick * chord * (0.2969 * math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4)
        y = yt if th <= math.pi else -yt
        out.append((-xc * chord, y))
    return out


def bm_geo(bm):
    bm.verts.index_update()
    g = Geo([tuple(v.co) for v in bm.verts], [tuple(v.index for v in f.verts) for f in bm.faces])
    bm.free()
    return g


# ----------------------------------------------------------------------------------------- scene setup

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


BOAT_COLL = None
QA_COLL = None


def make_collections():
    global BOAT_COLL, QA_COLL
    BOAT_COLL = bpy.data.collections.new('V20Hero')
    bpy.context.scene.collection.children.link(BOAT_COLL)
    QA_COLL = bpy.data.collections.new('QA_Studio')
    bpy.context.scene.collection.children.link(QA_COLL)


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, size=0.1):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = size
    o.location = loc
    o.rotation_euler = rot
    BOAT_COLL.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


# ----------------------------------------------------------------------------------------- hull

def build_hull(root):
    n_st = 54
    stations = []
    for i in range(n_st):
        u = i / (n_st - 1)
        stations.append(0.35 * u + 0.65 * (1 - (1 - u) ** 1.8))
    bm = bmesh.new()
    rows = []
    for t in stations:
        x = X0 + t * L
        pts, _ = section(x)
        scale = 1.0 if t < 0.9995 else 0.0
        row_p = [bm.verts.new((rake_x(x, p.y), p.x * scale, p.y)) for p in pts]
        rows.append(row_p)
    mirror_rows = []
    for row in rows:
        mirror_rows.append([row[0]] + [bm.verts.new((v.co.x, -v.co.y, v.co.z)) for v in row[1:]])
    nu = len(rows[0])
    for j in range(len(rows) - 1):
        for i in range(nu - 1):
            for R, flip in ((rows, False), (mirror_rows, True)):
                a, b, c, d = R[j][i], R[j][i + 1], R[j + 1][i + 1], R[j + 1][i]
                quad = (a, d, c, b) if not flip else (a, b, c, d)
                if len({id(q) for q in quad}) == 4:
                    try:
                        bm.faces.new(quad)
                    except ValueError:
                        pass
    # Transom with the outboard notch; it is planar (rake depends on z only at the first station).
    zs0 = sheer_z(X0)
    top = []
    for y, z in ((0.40, zs0), (0.37, 0.66), (-0.37, 0.66), (-0.40, zs0)):
        top.append(bm.verts.new((rake_x(X0, z), y, z)))
    port = rows[0]
    stbd = mirror_rows[0]
    ring = [port[-1]] + top + list(reversed(stbd[1:])) + port[:-1]
    bm.faces.new(ring)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    # Exact paint lines: boot-top stripe on the waterline and a navy side panel sweeping up to the bow.
    planes = [
        (Vector((X0, 0, 0.015)), Vector((-0.012, 0, 1)).normalized()),
        (Vector((X0, 0, 0.070)), Vector((-0.014, 0, 1)).normalized()),
        (Vector((X0, 0, 0.31)), Vector((-0.07, 0, 1)).normalized()),
    ]
    for co, no in planes:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=co, plane_no=no)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('ME_Hull')
    bm.to_mesh(me)
    bm.free()
    for name in ('Bottom_Paint', 'Gelcoat_White', 'Hull_Navy'):
        me.materials.append(MAT[name])
    idx = []
    for p in me.polygons:
        c = p.center
        side = [(c - co).dot(no) for co, no in planes]
        if side[0] < 0:
            idx.append(0)
        elif side[1] < 0:
            idx.append(1)
        elif side[2] < 0:
            idx.append(2)
        else:
            idx.append(1)
    me.polygons.foreach_set('material_index', idx)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.set_sharp_from_angle(angle=math.radians(32))
    box_uv(me, {})
    me.update()
    obj = bpy.data.objects.new('Hull', me)
    BOAT_COLL.objects.link(obj)
    obj.parent = root
    return obj


# ----------------------------------------------------------------------------------------- deck, liner, cap

def sole_z(x):
    return 0.28 + 0.08 * smooth(0.52, 0.66, x) + 0.09 * smooth(1.3, 2.1, x)


CAP_W = 0.14


def cap_profile():
    # (u outward from the hull sheer edge, v up), inner edge at u = -CAP_W. Closed so it reads solid.
    return [(0.008, -0.030), (0.008, -0.004), (-0.012, 0.016), (-CAP_W + 0.03, 0.018),
            (-CAP_W + 0.004, 0.006), (-CAP_W, -0.035), (-CAP_W + 0.02, -0.035), (-0.010, -0.034)]


def sheer_path(x_from, x_to, count, side=1):
    return [Vector((x, side * sheer_hb(x), sheer_z(x))) for x in (lerp(x_from, x_to, i / (count - 1)) for i in range(count))]


def liner_inner_y(x, z):
    return min(hull_y_at(x, z) - 0.05, sheer_hb(x) - CAP_W + 0.01)


def build_deck(root):
    mb = MB('Deck')
    # Gunwale cap, port and starboard, from the transom corner to the foredeck.
    for side in (1, -1):
        # A forward path's frame `side` points to starboard, so outward is -side on port and +side on starboard.
        path = sheer_path(-2.49, XB + 0.02, 40, side)
        mb.add(sweep(path, [(-side * u, v) for (u, v) in cap_profile()]), 'Gelcoat_White')
    # Liner: sole (non-skid) plus side walls rising under the cap.
    n = 34
    xs = [lerp(-2.27, XB, i / (n - 1)) for i in range(n)]
    rows_sole, rows_wall = [], []
    for x in xs:
        zs = sheer_z(x)
        zf = sole_z(x)
        yb = max(0.05, liner_inner_y(x, zf + 0.05))
        yt = sheer_hb(x) - CAP_W + 0.012
        sole_row = [Vector((x, yy, zf)) for yy in (-yb + 0.03, -yb * 0.5, 0.0, yb * 0.5, yb - 0.03)]
        wall_p = [Vector((x, yb - 0.03, zf)), Vector((x, yb, zf + 0.03))]
        for k in range(1, 5):
            f = k / 4
            wall_p.append(Vector((x, lerp(yb, yt, f ** 0.9), lerp(zf + 0.03, zs - 0.012, f))))
        rows_sole.append(sole_row)
        rows_wall.append(wall_p)
    mb.add(grid(rows_sole), 'NonSkid')
    mb.add(grid(rows_wall), 'Gelcoat_White')
    mb.add(grid([[Vector((p.x, -p.y, p.z)) for p in r] for r in rows_wall]), 'Gelcoat_White')
    # Foredeck: cambered surface from the bulkhead to the stem, same outer edge as the cap.
    fx = [lerp(XB, X1 - 0.004, i / 17) for i in range(18)]
    rows = []
    for x in fx:
        hb = sheer_hb(x) + 0.008
        zs = sheer_z(x)
        row = []
        for k in range(-6, 7):
            yy = hb * k / 6
            crown = 0.035 * (1 - (k / 6) ** 2)
            row.append(Vector((x, yy, zs + 0.012 + crown * min(1, hb / 0.3))))
        rows.append(row)
    mb.add(grid(rows), 'Gelcoat_White')
    # Foredeck edge lip (continues the cap's rolled edge around the bow).
    for side in (1, -1):
        edge = [Vector((x, side * (sheer_hb(x) + 0.008), sheer_z(x) + 0.012)) for x in fx]
        low = [Vector((x, side * (sheer_hb(x) + 0.008), sheer_z(x) - 0.03)) for x in fx]
        mb.add(grid([edge, low]) if side > 0 else grid([low, edge]), 'Gelcoat_White')
    # Bow bulkhead face (behind the point seat), and the anchor-locker hatch outline on the foredeck.
    zf = sole_z(XB)
    zt = sheer_z(XB) + 0.02
    zs_ = [lerp(zf, zt, k / 6) for k in range(7)]
    outline = [(XB, liner_inner_y(XB, z) + 0.02, z) for z in zs_] + [(XB, -(liner_inner_y(XB, z) + 0.02), z) for z in reversed(zs_)]
    mb.add(Geo(outline, [tuple(range(len(outline)))]), 'Gelcoat_White')
    hatch = rbox(0.28, 0.34, 0.012, 0.03, 2)
    mb.add(hatch, 'Gelcoat_White', trs((2.30, 0, sheer_z(2.30) + 0.046), (0, math.radians(-4), 0)))
    return mb.build(root, sharp=40, uv_scale={'NonSkid': 6.25})


def build_aft_deck(root):
    """Aft deck corner blocks, the outboard splash well and its forward wall, clamped inside the liner."""
    mb = MB('AftDeck')
    # Corner blocks follow the raked transom (aft face just inside it) with generously filleted molded edges.
    corner = [(-2.235, 0.28), (-2.235, 0.885), (rake_x(X0, 0.885) + 0.006, 0.885), (rake_x(X0, 0.28) + 0.006, 0.28)]
    for side in (1, -1):
        mb.add(prism(corner, 0.40 * side, 0.99 * side, r=0.045, seg=2), 'Gelcoat_White')
        mb.add(rbox(0.21, 0.40, 0.006, 0.02, 1), 'NonSkid', trs((-2.385, side * 0.64, 0.886)))
    mb.add(rbox(0.26, 0.82, 0.30, 0.03, 2), 'Gelcoat_White', trs((-2.40, 0, 0.42)))
    mb.add(rbox(0.05, 0.82, 0.40, 0.02, 2), 'Gelcoat_White', trs((-2.28, 0, 0.68)))
    return mb.build(root, sharp=40, uv_scale={'NonSkid': 6.25}, inside=0.035)


# ----------------------------------------------------------------------------------------- consoles and windshield

HELM_Y = -0.53
DASH_A = Vector((-0.19, 0.76))  # (x, z) bottom of the slanted dash face
DASH_B = Vector((-0.07, 1.04))  # top of the dash face
HELM_AXIS = Vector((-math.sin(1.02), 0, math.cos(1.02)))  # wheel shaft direction (aft and up)


def fillet_polygon(pts, r, seg=2):
    """Rounds every corner of a closed 2D polygon with a quadratic arc (molded fibreglass edges)."""
    out = []
    n = len(pts)
    for i in range(n):
        p = Vector(pts[i])
        a = Vector(pts[i - 1])
        b = Vector(pts[(i + 1) % n])
        din, dout = (p - a), (b - p)
        d = min(r, din.length * 0.45, dout.length * 0.45)
        p0 = p - din.normalized() * d
        p2 = p + dout.normalized() * d
        for k in range(seg + 1):
            t = k / seg
            out.append(p0 * (1 - t) ** 2 + p * 2 * (1 - t) * t + p2 * t * t)
    return out


def inset_polygon(pts, e):
    """Moves each vertex of a closed polygon inward along its smoothed normal by e."""
    n = len(pts)
    area = sum(pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y for i in range(n))
    sgn = 1 if area > 0 else -1
    out = []
    for i in range(n):
        t = (pts[(i + 1) % n] - pts[i - 1]).normalized()
        inward = Vector((-t.y, t.x)) * sgn
        out.append(pts[i] + inward * e)
    return out


_WS = {}


def ws_base_at(a):
    """Windshield base (x, z) at lateral distance a from the centreline (port half of the base curve)."""
    if 'base' not in _WS:
        _WS['base'] = [p for p in windshield_base() if p.y >= 0]
    pts = _WS['base']
    best = min(pts, key=lambda p: abs(p.y - a))
    return best.x, best.z


def console_profile(a):
    xf, zt = ws_base_at(a)
    xf += 0.035
    x5 = max(xf - 0.12, 0.03)
    x6 = max(xf + 0.01, x5 + 0.05)
    return [Vector(p) for p in ((-0.15, 0.28), (-0.17, 0.62), DASH_A[:], DASH_B[:], (-0.01, zt - 0.012), (x5, zt - 0.004),
                                (x6, zt - 0.075), (x6 + 0.04, 0.62), (x6 + 0.02, 0.28))]


def molded_console(sign, a0=0.24, a1=0.99, r_end=0.06):
    """Console lofted across the beam: plan follows the windshield, all edges filleted, rounded walk-through end."""
    rings = []
    stations = [(a0 + r_end * (1 - math.cos(ph)), r_end * (1 - math.sin(ph))) for ph in (0.0, 0.35, 0.75, 1.15, math.pi / 2)]
    stations += [(lerp(a0 + r_end, a1, k / 9), 0.0) for k in range(1, 10)]
    for a, e in stations:
        prof = fillet_polygon(console_profile(a), 0.04, 2)
        if e > 1e-4:
            prof = inset_polygon(prof, e)
        rings.append([Vector((p.x, sign * a, p.y)) for p in prof])
    return loft(rings)


def on_dash(f, y, lift=0.0):
    """Frame on the slanted dash face: local +Z along the face normal (aft/up), local +X up the slope."""
    d = (DASH_B - DASH_A).normalized()
    nrm = Vector((-d.y, 0, d.x))
    p = DASH_A.lerp(DASH_B, f)
    return Matrix.Translation(Vector((p.x, y, p.y)) + nrm * (0.004 + lift)) @ Matrix.Rotation(math.atan2(nrm.x, nrm.z), 4, 'Y')


def build_consoles(root):
    objs = []
    for name, sign in (('Console_Helm', -1), ('Console_Companion', 1)):
        mb = MB(name)
        mb.add(molded_console(sign), 'Gelcoat_White')
        # Toe-kick shadow line at the base of the aft face.
        mb.add(rbox(0.03, 0.62, 0.05, 0.01, 1), 'Rubber_Black', trs((-0.155, sign * 0.62, 0.31)))
        if sign > 0:
            # Glovebox door with a stainless pull on the companion dash, grab handle on the top.
            mb.add(rbox(0.20, 0.46, 0.012, 0.02, 2), 'Gelcoat_White', on_dash(0.5, 0.60, 0.004))
            mb.add(rbox(0.02, 0.12, 0.018, 0.008, 1), 'Stainless', on_dash(0.72, 0.60, 0.012))
            mb.add(tube(resample(catmull([Vector((0.02, 0.42, 1.10)), Vector((0.03, 0.48, 1.16)), Vector((0.05, 0.62, 1.16)), Vector((0.07, 0.68, 1.10))], 16), 12), 0.011, 8), 'Stainless')
        objs.append(mb.build(root, sharp=40, inside=0.03))
    return objs


def build_helm_dash(root):
    mb = MB('Helm_Dash')
    on_face = on_dash

    mb.add(rbox(0.25, 0.64, 0.012, 0.03, 2), 'Rubber_Black', on_face(0.55, -0.60))
    # Multifunction display in a black housing (upper inboard) and two gauges (upper outboard): dark glass faces
    # recessed below slim stainless bezel rings, with a needle for depth and readability.
    mb.add(rbox(0.13, 0.20, 0.012, 0.012, 1), 'Display_Glass', on_face(0.70, -0.38, 0.008))
    mb.add(rbox(0.15, 0.22, 0.008, 0.014, 1), 'Rubber_Black', on_face(0.70, -0.38, 0.003))
    for gy, ang in ((-0.72, 2.3), (-0.83, 1.4)):
        mb.add(cylinder(0.041, 0.010, 16), 'Rubber_Black', on_face(0.70, gy, 0.002))
        mb.add(cylinder(0.033, 0.0035, 16), 'Display_Glass', on_face(0.70, gy, 0.009))
        mb.add(torus(0.036, 0.0045, 16, 4), 'Stainless', on_face(0.70, gy, 0.013))
        needle = on_face(0.70, gy, 0.0125) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Translation((0.010, 0, 0.001))
        mb.add(rbox(0.022, 0.0028, 0.0016, 0.0006, 1), 'Stainless', needle)
    # Rocker switch row.
    mb.add(rbox(0.024, 0.17, 0.01, 0.004, 1), 'Stainless', on_face(0.28, -0.47, 0.008))
    # Tilt-helm shroud from the dash into the wheel hub.
    hub_at = helm_center()
    shaft_base = hub_at - HELM_AXIS * 0.15
    mb.add(tube([shaft_base, hub_at - HELM_AXIS * 0.025], 0.03, 14, radius_fn=lambda s: 1.0 - 0.35 * s), 'Rubber_Black')
    mb.add(cylinder(0.055, 0.02, 20), 'Rubber_Black', Matrix.Translation(shaft_base - HELM_AXIS * 0.005) @ axis_to_z(HELM_AXIS))
    # Side-mount control box on the dash top, outboard of the wheel; the lever pivots on its inboard face.
    tb = throttle_pivot()
    mb.add(rbox(0.13, 0.07, 0.11, 0.025, 2), 'Rubber_Black', trs((tb.x, tb.y, tb.z - 0.04)))
    return mb.build(root, sharp=40)


def axis_to_z(axis):
    """Rotation matrix mapping local +Z onto `axis`."""
    return Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()


def helm_center():
    p = DASH_A.lerp(DASH_B, 0.30)
    return Vector((p.x, HELM_Y, p.y)) + HELM_AXIS * 0.17


def throttle_pivot():
    return Vector((-0.02, -0.76, 1.13))


def windshield_base():
    ze = sheer_z(-0.14) + 0.02
    ctrl = [(-0.14, -0.975, ze), (0.06, -0.95, 1.06), (0.26, -0.80, 1.115), (0.40, -0.46, 1.12), (0.445, 0.0, 1.12),
            (0.40, 0.46, 1.12), (0.26, 0.80, 1.115), (0.06, 0.95, 1.06), (-0.14, 0.975, ze)]
    return resample(catmull(ctrl, 120), 41)


def build_windshield(root):
    base = windshield_base()
    top, rows = [], []
    for i, p in enumerate(base):
        a = base[max(i - 1, 0)]
        b = base[min(i + 1, len(base) - 1)]
        tng = (b - a)
        inward = Vector((-tng.y, tng.x, 0)).normalized()  # left of the starboard->port path = aft/inboard
        s = abs(i / (len(base) - 1) * 2 - 1)
        h = lerp(0.36, 0.16, smooth(0.55, 1.0, s))
        back = lerp(0.22, 0.10, smooth(0.55, 1.0, s))
        q = p + inward * back + Vector((0, 0, h))
        top.append(q)
        rows.append([p + Vector((0, 0, 0.004)), p.lerp(q, 0.5), q])
    glass = MB('Windshield')
    glass.add(grid(rows), 'Glass_Smoke')
    # Frame: black top rail and base gasket, walk-through mullions, end posts; stainless grab rail on top.
    glass.add(tube(resample(top, 27), 0.013, 7), 'Rubber_Black')
    glass.add(tube(resample(base, 21), 0.010, 6), 'Rubber_Black')
    n = len(base)
    for i in (0, n - 1):
        glass.add(tube([base[i], top[i]], 0.013, 8), 'Rubber_Black')
    for yy in (-0.25, 0.25):
        i = min(range(n), key=lambda k: abs(base[k].y - yy))
        glass.add(tube([base[i], top[i]], 0.014, 8), 'Rubber_Black')
    rail = [top[i] + Vector((0, 0, 0.05)) for i in range(7, 17)]
    glass.add(tube(rail, 0.010, 8), 'Stainless')
    for i in (8, 15):
        glass.add(tube([top[i], top[i] + Vector((0, 0, 0.05))], 0.008, 6), 'Stainless')
    return glass.build(root, sharp=45, recalc=False)


# ----------------------------------------------------------------------------------------- upholstery

def cushion(mb, sx, sy, sz, m, piping_edges=(), accent=None):
    """A vinyl cushion (rounded box) with optional piping along given local edges and an accent panel."""
    mb.add(rbox(sx, sy, sz, min(0.035, sz * 0.45), 2), 'Vinyl_Ivory', m)
    for (a, b) in piping_edges:
        mb.add(tube([Vector(a), Vector(b)], 0.0065, 6), 'Vinyl_Graphite', m)
    if accent:
        (cx, cy, cz), (ax, ay, az) = accent
        mb.add(rbox(ax, ay, az, min(0.02, az * 0.45), 2), 'Vinyl_Graphite', m @ Matrix.Translation((cx, cy, cz)))


def bucket_seat(mb, x, y):
    """Helm or companion bucket seat on a molded pedestal."""
    mb.add(rbox(0.36, 0.44, 0.27, 0.03, 2), 'Gelcoat_White', trs((x, y, 0.415)))
    mb.add(rbox(0.34, 0.40, 0.012, 0.008, 1), 'Rubber_Black', trs((x, y, 0.29)))
    seat = trs((x + 0.02, y, 0.60))
    cushion(mb, 0.46, 0.50, 0.11, seat, piping_edges=[((0.225, -0.22, 0.055), (0.225, 0.22, 0.055))])
    for s in (-1, 1):
        mb.add(rbox(0.42, 0.07, 0.15, 0.03, 2), 'Vinyl_Graphite', trs((x + 0.02, y + s * 0.235, 0.63)))
    back = trs((x - 0.20, y, 0.88), (0, math.radians(-12), 0))
    mb.add(rbox(0.09, 0.50, 0.44, 0.035, 2), 'Vinyl_Graphite', back)
    for k, zc in enumerate((-0.13, 0.0, 0.13)):
        mb.add(rbox(0.06, 0.36, 0.115, 0.03, 1), 'Vinyl_Ivory', back @ Matrix.Translation((0.045, 0, zc)))


def build_upholstery(root):
    # Aft bench: molded base with toe kick, one full-width seat cushion and one backrest pad, divided into three
    # seating positions only by shallow graphite welt seams, with continuous front piping and top bolster.
    mb = MB('Upholstery_AftBench')
    yin = liner_inner_y(-2.05, 0.6) - 0.01
    mb.add(rbox(0.40, 2 * yin, 0.32, 0.03, 2), 'Gelcoat_White', trs((-2.07, 0, 0.44)))
    mb.add(rbox(0.36, 2 * yin - 0.04, 0.06, 0.015, 1), 'Rubber_Black', trs((-1.89, 0, 0.31)))
    w = 2 * yin - 0.02
    cushion(mb, 0.42, w, 0.11, trs((-2.06, 0, 0.655)), piping_edges=[((0.205, -w / 2 + 0.03, 0.05), (0.205, w / 2 - 0.03, 0.05))])
    back = trs((-2.225, 0, 0.86), (0, math.radians(-10), 0))
    mb.add(rbox(0.075, w - 0.02, 0.245, 0.032, 2), 'Vinyl_Ivory', back)
    mb.add(rbox(0.06, w, 0.03, 0.012, 2), 'Vinyl_Graphite', back @ Matrix.Translation((0.0, 0, 0.135)))
    for y in (-w / 6, w / 6):
        mb.add(tube([Vector((-1.885, y, 0.7095)), Vector((-2.235, y, 0.7095))], 0.0042, 6), 'Vinyl_Graphite')
        mb.add(tube([Vector((0.0365, y, -0.092)), Vector((0.0365, y, 0.092))], 0.0042, 6), 'Vinyl_Graphite', back)
    objs = [mb.build(root, sharp=50, inside=0.03)]

    mb = MB('Upholstery_Helm')
    bucket_seat(mb, -0.90, -0.53)
    objs.append(mb.build(root, sharp=50, inside=0.03))
    mb = MB('Upholstery_Companion')
    bucket_seat(mb, -0.90, 0.53)
    objs.append(mb.build(root, sharp=50, inside=0.03))

    # Open-bow lounges: bases follow the liner, cushions and backrests are swept along the hull side.
    mb = MB('Upholstery_Bow')
    xs = [lerp(0.74, XB - 0.01, i / 15) for i in range(16)]
    depth = 0.42
    for side in (1, -1):
        base_rings, seat_rings = [], []
        for x in xs:
            yo = liner_inner_y(x, 0.62) + 0.02
            yi = max(0.004, yo - depth)
            zf = sole_z(x)
            base_rings.append([Vector((x, side * yi, zf)), Vector((x, side * yo, zf)), Vector((x, side * yo, 0.575)), Vector((x, side * yi, 0.575))])
            prof = rounded_rect_profile(max(yo - yi - 0.012, 0.04), 0.105, 0.035, 2)
            cy = (yo + yi) / 2 - 0.003
            seat_rings.append([Vector((x, side * (cy + u), 0.63 + v)) for (u, v) in prof])
        g = loft(base_rings)
        if side < 0:
            g.f = [tuple(reversed(f)) for f in g.f]
        mb.add(g, 'Gelcoat_White')
        mb.add(loft(seat_rings), 'Vinyl_Ivory')
        # Piping on the inboard top edge, backrest bolster with a graphite accent roll on the hull side.
        pipe = [Vector((x, side * (max(0.004, liner_inner_y(x, 0.62) + 0.02 - depth) + 0.018), 0.684)) for x in xs[:-3]]
        mb.add(tube(pipe, 0.0065, 6), 'Vinyl_Graphite')
        back_path = [Vector((x, side * (liner_inner_y(x, 0.80) - 0.03), 0.80)) for x in xs[:-2]]
        bprof = rounded_rect_profile(0.075, 0.24, 0.03, 1)
        bprof = [(u, v) for (u, v) in bprof]
        mb.add(sweep(back_path, bprof, up=Vector((0, 0, 1))), 'Vinyl_Ivory')
        roll = [p + Vector((0, side * 0.012, 0.135)) for p in back_path]
        mb.add(tube(roll, 0.022, 6), 'Vinyl_Graphite')
    # Point backrest against the foredeck bulkhead.
    yb = sheer_hb(XB) - CAP_W - 0.02
    mb.add(rbox(0.075, 2 * yb, 0.26, 0.03, 2), 'Vinyl_Ivory', trs((XB - 0.05, 0, 0.84), (0, math.radians(12), 0)))
    objs.append(mb.build(root, sharp=50, inside=0.03))
    return objs


# ----------------------------------------------------------------------------------------- trim and hardware

def build_rub_rail(root):
    mb = MB('RubRail')
    xs = [lerp(-2.50, X1 - 0.002, i / 89) for i in range(90)]
    port = [Vector((x, hull_y_at(x, sheer_z(x) - 0.035), sheer_z(x) - 0.035)) for x in xs]
    path = [Vector((p.x, -p.y, p.z)) for p in port] + list(reversed(port))[1:]
    path = resample(catmull([p for p in path[::2]] + [path[-1]], 240), 92)
    prof = [(0.0, -0.026), (0.018, -0.016), (0.021, 0.004), (0.010, 0.024), (-0.006, 0.02), (-0.006, -0.02)]
    # The path runs starboard aft -> bow -> port aft, so the frame's `side` (right of travel) points outboard.
    mb.add(sweep(path, prof), 'Rubber_Black')
    insert = [(0.017, -0.006), (0.0235, -0.005), (0.0235, 0.005), (0.017, 0.006)]
    mb.add(sweep(path, insert), 'Stainless')
    return mb.build(root, sharp=60)


def cleat(mb, m):
    mb.add(rbox(0.10, 0.032, 0.012, 0.006, 1), 'Stainless', m @ Matrix.Translation((0, 0, 0.006)))
    mb.add(rbox(0.074, 0.018, 0.03, 0.006, 1), 'Stainless', m @ Matrix.Translation((0, 0, 0.025)))
    horn = [Vector((-0.078, 0, 0.042)), Vector((-0.03, 0, 0.047)), Vector((0.03, 0, 0.047)), Vector((0.078, 0, 0.042))]
    mb.add(tube(resample(catmull(horn, 12), 9), 0.009, 6, radius_fn=lambda s: 0.55 + 0.45 * math.sin(math.pi * s)), 'Stainless', m)


def build_rails_and_hardware(root):
    rails = MB('Rails')
    h = 0.30
    for side in (1, -1):
        def yr(x):
            return side * (sheer_hb(x) - 0.065)

        def cz(x):
            return sheer_z(x) + 0.018

        pts = [Vector((2.44, 0.0, cz(2.44) + h)), Vector((2.33, yr(2.33) * 0.75, cz(2.33) + h)), Vector((2.12, yr(2.12), cz(2.12) + h - 0.005)),
               Vector((1.70, yr(1.70), cz(1.70) + h - 0.015)), Vector((1.25, yr(1.25), cz(1.25) + h - 0.025)), Vector((1.00, yr(1.00), cz(1.00) + h - 0.06)),
               Vector((0.90, yr(0.90), cz(0.90) + 0.11)), Vector((0.87, yr(0.87), cz(0.87) + 0.004))]
        path = resample(catmull(pts, 90), 40)
        rails.add(tube(path, 0.0125, 8), 'Stainless')
        for x in (2.05, 1.55):
            i = min(range(len(path)), key=lambda k: abs(path[k].x - x))
            p = path[i]
            rails.add(tube([Vector((p.x, p.y, cz(p.x))), p], 0.011, 6), 'Stainless')
            rails.add(cylinder(0.026, 0.008, 10), 'Stainless', Matrix.Translation((p.x, p.y, cz(p.x) - 0.002)))
        rails.add(cylinder(0.026, 0.008, 10), 'Stainless', Matrix.Translation((0.87, yr(0.87), cz(0.87) - 0.002)))
    rails.add(tube([Vector((2.44, 0, sheer_z(2.44) + 0.04)), Vector((2.44, 0, sheer_z(2.44) + 0.018 + h))], 0.011, 8), 'Stainless')
    rails.add(cylinder(0.028, 0.008, 10), 'Stainless', Matrix.Translation((2.44, 0, sheer_z(2.44) + 0.04)))
    # Stern grab handles on the aft deck and a folding boarding ladder on the starboard swim step.
    for side in (1, -1):
        grab = [Vector((-2.30, side * 0.52, 0.885)), Vector((-2.31, side * 0.54, 0.99)), Vector((-2.40, side * 0.60, 1.02)), Vector((-2.49, side * 0.66, 0.99)), Vector((-2.50, side * 0.68, 0.885))]
        rails.add(tube(resample(catmull(grab, 30), 14), 0.011, 6), 'Stainless')
    # Boarding ladder folded flat on the starboard swim platform: two stiles and three rungs.
    for yy in (-0.55, -0.73):
        rails.add(tube([Vector((-2.585, yy, SWIM_TOP + 0.013)), Vector((-2.765, yy, SWIM_TOP + 0.013))], 0.008, 6), 'Stainless')
    for xx in (-2.61, -2.675, -2.74):
        rails.add(tube([Vector((xx, -0.55, SWIM_TOP + 0.014)), Vector((xx, -0.73, SWIM_TOP + 0.014))], 0.0075, 6), 'Stainless')
    r_obj = rails.build(root, sharp=50)

    hw = MB('Hardware')
    for x, side in ((1.85, 1), (1.85, -1), (-0.95, 1), (-0.95, -1)):
        y = side * (sheer_hb(x) - 0.07)
        z = sheer_z(x) + 0.018
        ang = math.atan2(sheer_hb(x + 0.05) - sheer_hb(x - 0.05), 0.1) * side
        cleat(hw, trs((x, y, z), (0, 0, ang)))
    for side in (1, -1):
        cleat(hw, trs((-2.44, side * 0.84, 0.885), (0, 0, math.pi / 2)))
    # Bow eye on the stem.
    zc = 0.28
    lo, hi = 0.3, X1
    for _ in range(40):
        mid = (lo + hi) / 2
        if keel_z(mid) < zc:
            lo = mid
        else:
            hi = mid
    eye = Matrix.Translation((lo - 0.004, 0, zc)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
    hw.add(torus(0.028, 0.0065, 10, 6, math.pi), 'Stainless', eye)
    # Cup holders on the gunwale cap near the seats (dark recesses with stainless rims).
    for x, side in ((-1.55, 1), (-1.55, -1), (1.1, 1), (1.1, -1)):
        y = side * (sheer_hb(x) - 0.075)
        z = sheer_z(x) + 0.019
        hw.add(cylinder(0.042, 0.004, 12), 'Stainless', Matrix.Translation((x, y, z)))
        hw.add(cylinder(0.034, 0.003, 12), 'Rubber_Black', Matrix.Translation((x, y, z + 0.002)))
    h_obj = hw.build(root, sharp=50)

    nav = MB('NavLights')
    bz = sheer_z(2.52) + 0.03
    nav.add(rbox(0.07, 0.07, 0.035, 0.015, 2), 'Stainless', trs((2.52, 0, bz)))
    nav.add(rbox(0.05, 0.028, 0.03, 0.012, 2), 'NavLight_Red', trs((2.525, 0.021, bz + 0.03)))
    nav.add(rbox(0.05, 0.028, 0.03, 0.012, 2), 'NavLight_Green', trs((2.525, -0.021, bz + 0.03)))
    nav.add(tube([Vector((-2.40, 0.84, 0.89)), Vector((-2.40, 0.84, 1.80))], 0.012, 8), 'Stainless')
    nav.add(cylinder(0.024, 0.03, 12), 'Rubber_Black', Matrix.Translation((-2.40, 0.84, 1.79)))
    nav.add(cylinder(0.022, 0.045, 12), 'NavLight_White', Matrix.Translation((-2.40, 0.84, 1.82)))
    nav.add(cylinder(0.026, 0.012, 12, r2=0.01), 'Rubber_Black', Matrix.Translation((-2.40, 0.84, 1.865)))
    nav.add(cylinder(0.03, 0.02, 12), 'Stainless', Matrix.Translation((-2.40, 0.84, 0.885)))
    n_obj = nav.build(root, sharp=50)

    p_obj = build_swim_platform(root)
    return [r_obj, h_obj, n_obj, p_obj]


SWIM_TOP = 0.415


def build_swim_platform(root):
    """Molded swim platforms either side of the outboard: hull extensions, not bolt-on boxes.

    The whole platform sits in the white topside band: its underside leaves the transom right on the navy paint line
    and rises slightly aft, so in profile it reads as the topside continuing aft. The outer face runs flush with the
    hull side at the transom, then tapers in plan to a rounded outboard-aft corner; the forward end is buried in the
    transom so there is no visible joint gap.
    """
    plat = MB('SwimPlatform')
    x_in = rake_x(X0, SWIM_TOP) + 0.05
    z_paint = 0.318  # just above the navy panel's top edge at the transom
    prof = [(x_in, SWIM_TOP), (-2.79, SWIM_TOP), (-2.80, SWIM_TOP - 0.03), (-2.79, z_paint + 0.022), (-2.66, z_paint + 0.008),
            (rake_x(X0, z_paint) - 0.002, z_paint), (x_in, z_paint)]
    y_out = hull_y_at(X0, 0.36) - 0.003
    for side in (1, -1):
        g = prism(prof, 0.43, y_out, r=0.014, seg=2)
        xt = rake_x(X0, 0.36)
        for i, (x, y, z) in enumerate(g.v):
            if y > 0.6:
                # Plan taper aft of the transom, rounding the outboard-aft corner.
                aft = max(0.0, xt - x)
                y -= 0.08 * aft + 0.035 * smooth(-2.70, -2.80, x) ** 1.5
            g.v[i] = (x, y * side, z)
        if side < 0:
            g.f = [tuple(reversed(f)) for f in g.f]
        plat.add(g, 'Gelcoat_White')
        plat.add(rbox(0.19, 0.30, 0.006, 0.02, 1), 'NonSkid', trs((-2.662, side * 0.625, SWIM_TOP + 0.002)))
    return plat.build(root, sharp=40, uv_scale={'NonSkid': 6.25})


# ----------------------------------------------------------------------------------------- outboard

PIVOT = Vector((-2.66, 0.0, 0.62))


def build_outboard(root):
    """Transom bracket (static) and the steerable/trimmable engine under EnginePivot."""
    mount = MB('Outboard_Mount')
    tx = rake_x(X0, 0.64)
    for s in (-1, 1):
        mount.add(rbox(0.20, 0.03, 0.34, 0.012, 2), 'Rubber_Black', trs((tx - 0.075, s * 0.14, 0.52)))
        mount.add(cylinder(0.022, 0.012, 12), 'Stainless', trs((tx + 0.006, s * 0.14, 0.44), (0, math.pi / 2, 0)))
    mount.add(rbox(0.07, 0.34, 0.05, 0.015, 2), 'Rubber_Black', trs((tx - 0.02, 0, 0.675)))
    mount.add(tube([Vector((PIVOT.x, -0.19, PIVOT.z)), Vector((PIVOT.x, 0.19, PIVOT.z))], 0.028, 14), 'Rubber_Black')
    mount.add(cylinder(0.034, 0.015, 14), 'Stainless', trs((PIVOT.x, 0.19, PIVOT.z), (-math.pi / 2, 0, 0)))
    mount.add(cylinder(0.034, 0.015, 14), 'Stainless', trs((PIVOT.x, -0.19, PIVOT.z), (math.pi / 2, 0, 0)))
    mount_obj = mount.build(root, sharp=45)

    pivot = empty('EnginePivot', tuple(PIVOT), parent=root, size=0.2)
    eng = MB('Outboard')
    # Swivel tube (steering axis) and clamp to the midsection.
    eng.add(cylinder(0.038, 0.42, 16), 'Engine_Dark', Matrix.Translation((-0.035, 0, -0.34)))
    # Midsection: foil sections lofted from the anti-ventilation plate up into the lower pan.
    rings = []
    for k in range(7):
        f = k / 6
        z = lerp(-0.585, 0.06, f)
        chord = lerp(0.27, 0.40, smooth(0.5, 1.0, f))
        ratio = lerp(0.105, 0.14, f) / chord
        le = lerp(-0.055, -0.01, f)
        rings.append([Vector((le + x, y, z)) for (x, y) in foil(chord, ratio, 22)])
    eng.add(loft(rings), 'Cowl_Graphite')
    # Exhaust relief outlet at the back of the midsection.
    eng.add(rbox(0.012, 0.03, 0.06, 0.012, 2), 'Engine_Dark', Matrix.Translation((-0.32, 0, -0.08)))
    # Lower pan ("chaps") and upper cowl as smooth superellipse lofts.
    pan = []
    for x, a, zb, zt in ((0.035, 0.10, 0.03, 0.20), (0.02, 0.17, 0.02, 0.21), (-0.04, 0.215, 0.01, 0.215), (-0.20, 0.228, 0.0, 0.22),
                         (-0.40, 0.226, 0.0, 0.22), (-0.55, 0.21, 0.02, 0.22), (-0.62, 0.17, 0.05, 0.22), (-0.645, 0.10, 0.09, 0.215)):
        zc, b = (zb + zt) / 2, (zt - zb) / 2
        pan.append([Vector((x, u, zc + v)) for (u, v) in superellipse(a, b, 3.2, 20)])
    eng.add(loft(pan), 'Engine_Dark')
    # Satin band at the split line.
    band = []
    for x, a in ((0.04, 0.12), (0.025, 0.19), (-0.04, 0.232), (-0.20, 0.242), (-0.42, 0.240), (-0.56, 0.222), (-0.63, 0.18), (-0.655, 0.10)):
        band.append([Vector((x, u, 0.225 + v)) for (u, v) in superellipse(a, 0.022, 4.0, 16)])
    eng.add(loft(band), 'Stainless')
    cowl = []
    stations = ((0.045, 0.11, 0.30), (0.035, 0.18, 0.40), (0.0, 0.215, 0.48), (-0.07, 0.232, 0.54), (-0.18, 0.238, 0.585), (-0.32, 0.236, 0.615),
                (-0.46, 0.228, 0.625), (-0.56, 0.212, 0.615), (-0.62, 0.185, 0.585), (-0.655, 0.14, 0.53), (-0.672, 0.07, 0.45))
    for x, a, zt in stations:
        zb = 0.235
        zc, b = (zb + zt) / 2, (zt - zb) / 2
        ring = []
        for (u, v) in superellipse(a, b, 3.4, 24):
            # Taper the top slightly (a softer, sculpted crown) and pull the lower edge out to meet the band.
            w = u * (1 - 0.10 * max(0.0, v / b))
            ring.append(Vector((x, w, zc + v)))
        cowl.append(ring)
    eng.add(loft(cowl), 'Cowl_Graphite')
    # Rear air intake: recessed dark slots on both sides of the upper cowl, rear handle, front latch.
    for s in (-1, 1):
        eng.add(rbox(0.19, 0.03, 0.055, 0.02, 1), 'Engine_Dark', trs((-0.44, s * 0.212, 0.525), (s * math.radians(-8), 0, 0)))
        eng.add(rbox(0.34, 0.012, 0.012, 0.005, 1), 'Stainless', trs((-0.30, s * 0.236, 0.40)))
    eng.add(tube([Vector((-0.64, -0.08, 0.30)), Vector((-0.70, -0.07, 0.33)), Vector((-0.70, 0.07, 0.33)), Vector((-0.64, 0.08, 0.30))], 0.014, 8), 'Engine_Dark')
    eng.add(rbox(0.02, 0.10, 0.03, 0.008, 1), 'Engine_Dark', Matrix.Translation((0.04, 0, 0.13)))
    # Anti-ventilation plate: a slim tapered planform (narrow nose, widest over the gearcase, rounded trailing edge),
    # lofted as a 10 mm plate with softened edges; plus its small sacrificial anode fin.
    half = [(0.012, 0.0), (0.004, 0.034), (-0.035, 0.078), (-0.11, 0.108), (-0.22, 0.106), (-0.31, 0.088), (-0.365, 0.062), (-0.385, 0.03)]
    plan = [Vector(p) for p in half] + [Vector((-0.39, 0.0))] + [Vector((x, -y)) for (x, y) in reversed(half[1:])]
    plan = fillet_polygon(plan, 0.02, 2)
    if sum(plan[i].x * plan[i - 1].y - plan[i - 1].x * plan[i].y for i in range(len(plan))) < 0:
        plan.reverse()
    plate = [[Vector((p.x, p.y, -0.594 + dz)) for p in (inset_polygon(plan, e) if e else plan)] for dz, e in ((-0.005, 0.003), (0.0, 0.0), (0.005, 0.003))]
    eng.add(loft(plate), 'Cowl_Graphite')
    eng.add(rbox(0.09, 0.010, 0.026, 0.004, 1), 'Engine_Dark', Matrix.Translation((-0.31, 0, -0.612)))
    # Gearcase strut (leading edge raked forward toward the torpedo) and torpedo (nose forward), skeg.
    strut = []
    for k in range(4):
        f = k / 3
        z = lerp(-0.80, -0.59, f)
        chord = lerp(0.29, 0.27, f)
        strut.append([Vector((lerp(0.012, -0.01, f) + x, y, z)) for (x, y) in foil(chord, 0.21, 22)])
    eng.add(loft(strut), 'Cowl_Graphite')
    torp = []
    for x, r in ((0.045, 0.004), (0.035, 0.035), (0.015, 0.055), (-0.03, 0.066), (-0.12, 0.068), (-0.24, 0.066), (-0.32, 0.058), (-0.36, 0.05)):
        torp.append([Vector((x, u, -0.80 + v)) for (u, v) in circle_profile(r, 18)])
    eng.add(loft(torp), 'Cowl_Graphite')
    skeg = []
    for k in range(3):
        f = k / 2
        z = lerp(-0.80, -0.975, f)
        chord = lerp(0.22, 0.12, f)
        le = lerp(-0.08, -0.17, f)
        skeg.append([Vector((le + x, y, z)) for (x, y) in foil(chord, 0.14, 16)])
    eng.add(loft(skeg), 'Cowl_Graphite')
    eng_obj = eng.build(pivot, sharp=40)

    prop_obj = build_prop(pivot)
    return mount_obj, pivot, eng_obj, prop_obj


def build_prop(pivot):
    """Three-blade propeller: helicoidal, skewed, cupped blades on a tapered hub; shaft along local X."""
    mb = MB('Prop')
    hub = []
    for x, r in ((0.045, 0.05), (0.0, 0.049), (-0.06, 0.044), (-0.10, 0.034), (-0.125, 0.018), (-0.132, 0.004)):
        hub.append([Vector((x, u, v)) for (u, v) in circle_profile(r, 16)])
    mb.add(loft(hub), 'Stainless')
    pitch = 0.36
    r0, R = 0.046, 0.175
    nr, ns = 8, 9
    for b in range(3):
        base_ang = 2 * math.pi * b / 3
        surf = {1: [], -1: []}
        for i in range(nr):
            fr = i / (nr - 1)
            r = lerp(r0, R, fr)
            chord = 0.125 * math.sqrt(max(0.0, 1 - ((fr - 0.5) / 0.52) ** 2)) + 0.035 * (1 - fr)
            chord = max(chord, 0.012)
            phi = math.atan2(pitch, 2 * math.pi * r)
            skew = 0.22 * fr ** 1.6
            thick = lerp(0.014, 0.0025, fr)
            for sgn in (1, -1):
                row = []
                for j in range(ns):
                    s = (j / (ns - 1) - 0.5) * chord
                    t_off = sgn * thick * 0.5 * (1 - (2 * s / chord) ** 2) + 0.004 * (fr ** 2)
                    theta = base_ang + skew + (s * math.cos(phi)) / r
                    ax = -s * math.sin(phi) + t_off * math.cos(phi)
                    rr = r
                    row.append(Vector((ax - 0.03, rr * math.cos(theta), rr * math.sin(theta))))
                surf[sgn].append(row)
        g = grid(surf[1])
        g2 = grid(surf[-1])
        g2.f = [tuple(reversed(f)) for f in g2.f]
        g.extend(g2)
        # Close the tip and the two edges between the faces.
        n1 = nr * ns
        for i in range(nr - 1):
            for j in (0, ns - 1):
                a, bb = i * ns + j, (i + 1) * ns + j
                if j == 0:
                    g.f.append((a, n1 + a, n1 + bb, bb))
                else:
                    g.f.append((a, bb, n1 + bb, n1 + a))
        last = (nr - 1) * ns
        for j in range(ns - 1):
            a, bb = last + j, last + j + 1
            g.f.append((a, bb, n1 + bb, n1 + a))
        mb.add(g, 'Stainless')
    obj = mb.build(pivot, sharp=55, merge=1e-5)
    obj.location = (-0.40, 0.0, -0.80)
    return obj


# ----------------------------------------------------------------------------------------- helm wheel and throttle

def build_wheel(root):
    c = helm_center()
    tilt = empty('Helm_Tilt', tuple(c), (0, -1.02, 0), parent=root, size=0.15)
    mb = MB('Wheel')
    mb.add(torus(0.175, 0.0155, 32, 7), 'Rubber_Black')
    mb.add(cylinder(0.034, 0.045, 18), 'Stainless', Matrix.Translation((0, 0, -0.03)))
    mb.add(cylinder(0.026, 0.008, 18), 'Rubber_Black', Matrix.Translation((0, 0, 0.015)))
    for k in range(3):
        a = math.radians(-90 + 120 * k)
        d = Vector((math.cos(a), math.sin(a), 0))
        spoke = [d * 0.03 + Vector((0, 0, -0.01)), d * 0.10 + Vector((0, 0, -0.004)), d * 0.165]
        mb.add(sweep(resample(catmull(spoke, 10), 8), rounded_rect_profile(0.018, 0.008, 0.003, 1), up=Vector((0, 0, 1))), 'Stainless')
    obj = mb.build(tilt, sharp=50)
    return tilt, obj


def build_throttle(root):
    p = throttle_pivot()
    # Compact side-mount lever: hub on the control box's inboard face, short arm and a small inboard grip.
    # One material keeps the animated lever to a single draw call.
    mb = MB('Throttle')
    mb.add(cylinder(0.017, 0.022, 14), 'Rubber_Black', trs((0, 0.056, 0), (math.pi / 2, 0, 0)))
    arm = resample(catmull([Vector((0, 0.046, 0)), Vector((0.0, 0.048, 0.05)), Vector((-0.008, 0.052, 0.088))], 10), 6)
    mb.add(tube(arm, 0.0065, 8, radius_fn=lambda s: 1.0 - 0.2 * s), 'Rubber_Black')
    mb.add(tube([Vector((-0.008, 0.042, 0.092)), Vector((-0.008, 0.108, 0.092))], 0.0105, 10,
                radius_fn=lambda s: 0.85 + 0.15 * math.sin(math.pi * s)), 'Rubber_Black')
    obj = mb.build(root, sharp=50)
    obj.location = tuple(p)
    return obj


# ----------------------------------------------------------------------------------------- QA studio

def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def add_camera(name, loc, target, lens=50, ortho=None):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    if ortho:
        cam.type = 'ORTHO'
        cam.ortho_scale = ortho
    cam.clip_start = 0.05
    o = bpy.data.objects.new(name, cam)
    o.location = loc
    QA_COLL.objects.link(o)
    look_at(o, target)
    return o


def build_studio():
    sc = bpy.context.scene
    world = bpy.data.worlds.new('QA_World')
    sc.world = world
    if world.node_tree is None:
        world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes.get('Background')
    geo = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    fac = nt.nodes.new('ShaderNodeMath')
    fac.operation = 'MULTIPLY_ADD'
    fac.inputs[1].default_value = 0.5
    fac.inputs[2].default_value = 0.5
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.48
    ramp.color_ramp.elements[0].color = (0.38, 0.42, 0.46, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.46, 0.62, 0.86, 1)
    nt.links.new(geo.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], fac.inputs[0])
    nt.links.new(fac.outputs['Value'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.9

    sun = bpy.data.lights.new('QA_Sun', 'SUN')
    sun.energy = 3.2
    sun.angle = math.radians(2.5)
    sun.color = (1.0, 0.96, 0.9)
    so = bpy.data.objects.new('QA_Sun', sun)
    so.rotation_euler = (math.radians(38), math.radians(0), math.radians(128))
    QA_COLL.objects.link(so)
    for name, loc, energy, size in (('QA_Fill', (4, 7, 5), 900, 5.0), ('QA_Rim', (-8, -4, 4), 700, 4.0)):
        li = bpy.data.lights.new(name, 'AREA')
        li.energy = energy
        li.size = size
        lo = bpy.data.objects.new(name, li)
        lo.location = loc
        QA_COLL.objects.link(lo)
        look_at(lo, (0, 0, 0.5))

    floor_mat = bpy.data.materials.new('QA_Floor')
    p = floor_mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (0.30, 0.31, 0.32, 1)
    p.inputs['Roughness'].default_value = 0.6
    me = bpy.data.meshes.new('QA_Floor')
    s = 60
    me.from_pydata([(-s, -s, -0.36), (s, -s, -0.36), (s, s, -0.36), (-s, s, -0.36)], [], [(0, 1, 2, 3)])
    me.materials.append(floor_mat)
    fl = bpy.data.objects.new('QA_Floor', me)
    QA_COLL.objects.link(fl)

    water_mat = bpy.data.materials.new('QA_Water')
    p = water_mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (0.02, 0.09, 0.11, 1)
    p.inputs['Roughness'].default_value = 0.04
    p.inputs['Transmission Weight'].default_value = 0.85
    p.inputs['IOR'].default_value = 1.333
    me = bpy.data.meshes.new('QA_Water')
    me.from_pydata([(-s, -s, 0.0), (s, -s, 0.0), (s, s, 0.0), (-s, s, 0.0)], [], [(0, 1, 2, 3)])
    me.materials.append(water_mat)
    wa = bpy.data.objects.new('QA_Water', me)
    QA_COLL.objects.link(wa)
    wa.hide_render = True
    wa.hide_viewport = True

    cams = [
        ('01-perspective', (6.6, -6.2, 3.1), (0.1, 0, 0.45), 45),
        ('02-port-profile', (0.0, 12.0, 0.55), (-0.2, 0, 0.35), 55),
        ('03-starboard-aft', (-7.0, -5.4, 3.3), (-0.6, 0, 0.55), 45),
        ('04-top-open-bow', (4.9, 2.6, 6.4), (0.35, 0, 0.55), 40),
        ('05-helm-detail', (-1.85, -0.05, 1.95), (0.0, -0.45, 0.95), 35),
        ('06-outboard-detail', (-4.6, -2.1, 1.0), (-2.95, 0, 0.12), 45),
        ('07-coastal-waterline', (5.5, -6.8, 1.35), (0.0, 0, 0.3), 45),
        ('08-chase-view', (-9.5, 1.2, 3.8), (0.8, 0, 0.7), 45),
    ]
    for name, loc, target, lens in cams:
        add_camera('QA_' + name, loc, target, lens)


def render_views(out_dir):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e:  # noqa: BLE001 - CPU fallback keeps the script portable
        print('GPU unavailable, rendering on CPU:', e)
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 1000
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    os.makedirs(out_dir, exist_ok=True)
    water = bpy.data.objects['QA_Water']
    floor = bpy.data.objects['QA_Floor']
    for cam in sorted((o for o in QA_COLL.objects if o.type == 'CAMERA'), key=lambda o: o.name):
        if VIEWS and not any(v in cam.name for v in VIEWS.split(',')):
            continue
        coastal = 'coastal' in cam.name or 'chase' in cam.name
        water.hide_render = not coastal
        floor.hide_render = coastal
        sc.camera = cam
        sc.render.filepath = os.path.join(out_dir, cam.name.replace('QA_', '') + '.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', sc.render.filepath)
    water.hide_render = True
    floor.hide_render = False


# ----------------------------------------------------------------------------------------- main

def triangle_report():
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    per = {}
    for o in BOAT_COLL.all_objects:
        if o.type != 'MESH':
            continue
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
        per[o.name] = n
        total += n
    return total, per


def main():
    reset_scene()
    make_collections()
    build_materials()
    root = empty('V20Hero', size=0.5)
    build_hull(root)
    build_deck(root)
    build_aft_deck(root)
    build_consoles(root)
    build_helm_dash(root)
    build_windshield(root)
    build_upholstery(root)
    build_rub_rail(root)
    build_rails_and_hardware(root)
    build_outboard(root)
    build_wheel(root)
    build_throttle(root)
    # Crew anchors for the existing (unchanged) people: skipper standing at the helm, guests seated.
    empty('Seat_Skipper', (-0.53, HELM_Y + 0.01, sole_z(-0.53) - 0.055), parent=root)
    empty('Seat_Guest1', (-0.86, 0.53, 0.555), parent=root)
    # Bow guest on the starboard lounge, facing forward like the procedural boat's bow guest (legs along the cushion).
    gx = 1.55
    gy = (liner_inner_y(gx, 0.62) + 0.02 - 0.21)
    empty('Seat_Guest2', (gx, -gy, 0.585), parent=root)

    build_studio()
    total, per = triangle_report()
    print('TRIANGLES', total)
    for k in sorted(per):
        print(f'  {k:24s} {per[k]}')

    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    vl = bpy.context.view_layer
    vl.active_layer_collection = vl.layer_collection.children['V20Hero']
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format='GLB',
        use_active_collection=True,
        use_active_collection_with_nested=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_animations=False,
        export_vertex_color='NONE',
        export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False,
        export_copyright='Original work generated by tools/blender/generate_v20_hero.py (Steerageway, MIT). V20-inspired; not an official manufacturer model.',
    )
    print('exported', GLB_OUT, os.path.getsize(GLB_OUT), 'bytes')
    if os.path.exists(BLEND_OUT):
        os.remove(BLEND_OUT)  # no .blend1 backup: the generator is the source of truth
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT, compress=True)
    print('saved', BLEND_OUT)
    if RENDER_DIR:
        render_views(os.path.join(ROOT_DIR, RENDER_DIR))


main()
