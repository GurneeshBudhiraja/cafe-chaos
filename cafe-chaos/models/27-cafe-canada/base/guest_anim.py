import bpy, math
from mathutils import Vector, Euler
# gb: build namespace. gb["RIGS"][kind] = {"St":..., "Se":..., "root":...}
EXPR = gb["EXPRESSIONS"]; SPECIES = gb["SPECIES"]
NEUTRAL = {"EyesOpen": 1, "MouthSmile": 1, "Blush": 1}
LIFT = -0.00035     # pull glancing eyes forward so they stay on the curved face
ARM_REST = {"L": (-55, 0, 30), "R": (-55, 0, -30)}
LEG_REST = -70      # seated thigh (shin rests at +70 so it hangs straight down)

# ---- human gait cycle, as (phase, degrees) curves; phase 0 = this leg's heel contact.
# Limbs hang down, so a NEGATIVE x rotation swings them forward; knee flexion is positive
# (shin back), ankle plantar-flexion (toe down) positive.
GAIT_HIP = [(0, -25), (0.1, -20), (0.3, -6), (0.5, 10), (0.6, 15), (0.72, -2), (0.88, -22), (1, -25)]
GAIT_KNEE = [(0, 5), (0.1, 16), (0.25, 6), (0.42, 8), (0.55, 28), (0.65, 50), (0.75, 58), (0.88, 22), (0.96, 4), (1, 5)]
GAIT_ANKLE = [(0, -8), (0.12, 2), (0.35, 3), (0.5, 10), (0.62, 22), (0.72, 4), (0.85, -6), (1, -8)]
GAIT_ARM = [(0, 22), (0.25, 2), (0.5, -20), (0.75, -2), (1, 22)]        # opposite the same-side leg
GAIT_BOB = [(0, 0), (0.25, 0.0006), (0.5, 0), (0.75, 0.0006), (1, 0)]     # highest at mid-stance
GAIT_SWAY = [(0, 0), (0.25, -0.0005), (0.5, 0), (0.75, 0.0005), (1, 0)]  # weight over the stance leg (L is -x)
GAIT_ROLL = [(0, 0), (0.25, -2.5), (0.5, 0), (0.75, 2.5), (1, 0)]
GAIT_YAW = [(0, -4), (0.5, 4), (1, -4)]                                   # shoulders follow the arms
GAIT_FRAMES = 24                                                           # one cycle = two steps = 1 s

# ---- the gait is solved, not hand-keyed: the foot's path is defined (planted and moving
# backward at a constant speed during stance, an arc through the air during swing) and the
# hip, knee and ankle angles are computed from it each frame, so the planted foot is truly
# stationary on the floor when the game moves the root at `speed`.
HIP_Z, KNEE_Z, ANKLE_Z = gb["HIP_Z"], gb["KNEE_Z"], gb["ANKLE_Z"]   # as built (guest_build.py)
L1, L2 = HIP_Z - KNEE_Z, KNEE_Z - ANKLE_Z             # thigh, shin
TOE = (-0.0050, -0.0022)                               # toe tip relative to the ankle (y forward is -y, z)
STRIDE = 0.0112                                        # one step, ankle to ankle (m)
STANCE = 0.62                                          # fraction of the cycle a foot is on the ground
LIFT = 0.0040                                          # swing-foot clearance at mid-swing
HEEL_RISE_FROM = 0.48                                  # heel starts rising this far into the cycle
PUSH_DEG = 26                                          # plantar-flexion at toe-off
STRIKE_DEG = -9                                        # toes up at heel strike
MIN_KNEE = 7                                           # the support leg never locks straight

def _ease(t): return t * t * (3 - 2 * t)

def gait_foot(p):
    """Ankle (y, z) in the rig frame and the foot's world pitch (deg, toe-down positive) at phase p."""
    p %= 1.0
    v = STRIDE / STANCE                                 # ground speed (m per cycle); +y = backward
    if p < STANCE:
        y_toe_flat = -STRIDE / 2 + v * p                # the toe moves back at constant speed
        if p < HEEL_RISE_FROM:
            pitch = STRIKE_DEG * max(0.0, 1 - p / 0.08)   # heel-strike slap, then flat
            return (y_toe_flat, ANKLE_Z, pitch)
        # heel rise: the toe stays planted, the foot pivots about it
        a = PUSH_DEG * _ease((p - HEEL_RISE_FROM) / (STANCE - HEEL_RISE_FROM))
        ar = math.radians(a)
        ty, tz = y_toe_flat + TOE[0], 0.0               # toe tip on the floor
        ry, rz = -TOE[0], -TOE[1]                       # toe -> ankle
        return (ty + ry * math.cos(ar) - rz * math.sin(ar), tz + ry * math.sin(ar) + rz * math.cos(ar), a)
    # swing: from where the stance ended to the next contact point, lifted in the middle
    y0, z0, a0 = gait_foot(STANCE - 1e-6)
    y1, z1, a1 = -STRIDE / 2, ANKLE_Z, STRIKE_DEG
    t = (p - STANCE) / (1 - STANCE)
    s = _ease(t)
    z = z0 + (z1 - z0) * s + LIFT * math.sin(math.pi * t)
    return (y0 + (y1 - y0) * s, z, a0 + (a1 - a0) * _ease(min(1.0, t * 1.3)))

def gait_ik(hip_z, ay, az):
    """Thigh and shin x-rotations (deg) putting the ankle at (ay, az) under a hip at (0, hip_z)."""
    dy, dz = ay, az - hip_z
    d = min(math.hypot(dy, dz), (L1 + L2) * 0.999)
    phi = math.atan2(dy, -dz)                                            # leg direction from straight down, + = back
    alpha = math.acos(max(-1, min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
    knee = math.pi - math.acos(max(-1, min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))))
    return math.degrees(phi - alpha), math.degrees(knee)

def gait_solve(n):
    """Per-frame joint angles for both legs and the rig height; also the ground speed."""
    feet = {"L": [gait_foot(i / n) for i in range(n)], "R": [gait_foot(i / n + 0.5) for i in range(n)]}
    # hip height: as high as both legs allow with the knee never straighter than MIN_KNEE
    reach = math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * math.cos(math.pi - math.radians(MIN_KNEE)))
    hz = []
    for i in range(n):
        h = HIP_Z
        for side in "LR":
            ay, az, _ = feet[side][i]
            if abs(ay) < reach:
                h = min(h, az + math.sqrt(reach * reach - ay * ay))
        hz.append(h)
    hz = [(hz[(i - 1) % n] + 2 * hz[i] + hz[(i + 1) % n]) / 4 for i in range(n)]   # a little smoothing
    legs = {}
    for side in "LR":
        rows = []
        for i in range(n):
            ay, az, pitch = feet[side][i]
            hip, knee = gait_ik(hz[i], ay, az)
            rows.append((hip, knee, pitch - hip - knee))              # foot node = world pitch minus the chain
        legs[side] = rows
    # the toe covers STRIDE/STANCE per cycle; a cycle lasts n/24 s (24 fps)
    return {"legs": legs, "rig_z": [h - HIP_Z for h in hz], "speed": (STRIDE / STANCE) / (n / 24.0)}

def curve(c, p):
    p %= 1.0
    for (p0, v0), (p1, v1) in zip(c, c[1:]):
        if p0 <= p <= p1:
            return v0 if p1 == p0 else v0 + (v1 - v0) * (p - p0) / (p1 - p0)
    return c[-1][1]

REST = gb.setdefault("REST", {}); ACTS = gb.setdefault("ACTS", {})

def _fcurves(action, o):
    try:
        return action.fcurves
    except AttributeError:
        slot = o.animation_data.action_slot
        for layer in action.layers:
            for strip in layer.strips:
                cb = strip.channelbag(slot)
                if cb: return cb.fcurves
        return []

def _act(clip, o):
    key = (clip, o)
    if key not in ACTS:
        ACTS[key] = bpy.data.actions.new(f"{clip}|{o.name}")
    o.animation_data_create()
    o.animation_data.action = ACTS[key]
    return ACTS[key]

def K(clip, o, f, loc=None, rot=None, scl=None, interp='BEZIER'):
    """Key one object. loc = offset from rest; rot = absolute degrees; scl = absolute."""
    _act(clip, o)
    rl, rr, rs = REST[o]
    paths = []
    if loc is not None: o.location = rl + Vector(loc); paths.append("location")
    if rot is not None: o.rotation_euler = Euler([math.radians(v) for v in rot]); paths.append("rotation_euler")
    if scl is not None: o.scale = scl; paths.append("scale")
    for p in paths: o.keyframe_insert(p, frame=f)
    for fc in _fcurves(o.animation_data.action, o):
        if fc.data_path in paths:
            for kp in fc.keyframe_points:
                if kp.co.x == f: kp.interpolation = interp

def face(clip, side, f, on):
    for n in EXPR:
        v = on.get(n, 0)
        s = v if isinstance(v, tuple) else (v, v, v)
        K(clip, side[n], f, scl=s, interp='CONSTANT')

def animate(R, kind):
    St, Se = R["St"], R["Se"]
    S = SPECIES[kind]
    GRIP_H = S["grip"] + gb["RAISE"]
    for side in (St, Se):
        for o in side.values():
            if o not in REST: REST[o] = (o.location.copy(), o.rotation_euler.copy(), o.scale.copy())

    def arm_aim(side, target):
        sx = 1 if side == "R" else -1
        a = math.radians(58)
        rest_dir = Vector((sx * math.cos(a), 0, -math.sin(a)))
        shx, shy, shz = S["shoulder"]
        sh = Vector((sx * shx, shy, shz))
        e = rest_dir.rotation_difference((Vector(target) - sh).normalized()).to_euler('XYZ')
        return tuple(math.degrees(v) for v in e)

    # ---------- STANDING
    c = "Idle"
    face(c, St, 1, NEUTRAL); face(c, St, 34, {"EyesClosed": 1, "MouthSmile": 1, "Blush": 1}); face(c, St, 37, NEUTRAL)
    for f, s in ((1, (1, 1, 1)), (25, (0.985, 0.985, 1.03)), (49, (1, 1, 1))): K(c, St["Torso"], f, scl=s)
    for f, x in ((1, 0), (9, 0.0006), (20, 0.0006), (26, 0), (49, 0)):
        K(c, St["EyesOpen"], f, loc=(x, LIFT if x else 0, 0))
    for f, d in ((1, 0), (25, 5), (49, 0)):
        K(c, St["Arm-R"], f, rot=(0, -d, 0)); K(c, St["Arm-L"], f, rot=(0, d, 0))

    c = "Lifted"
    # 2 s of "what is happening?!": wide eyes looking left, right, left, down at the floor far below;
    # the body twists after the eyes, arms windmill out of step, legs pedal from the hips and knees.
    face(c, St, 1, {"EyesWide": 1, "WidePupils": 1, "MouthO": 1, "Blush": 1})
    LOOK = ((1, 0, 0), (5, -1, 0.2), (13, -1, 0.2), (18, 1, 0.3), (27, 1, 0.3), (31, -0.7, -0.5), (36, -0.2, -1), (42, 0.2, -1), (46, 0.6, 0.2), (49, 0, 0))
    for f, gx, gz in LOOK:
        K(c, St["WidePupils"], f, loc=(gx * 0.0013, -0.0002, gz * 0.0009))
    for f, s in ((1, 1.0), (9, 1.25), (17, 0.95), (25, 1.3), (33, 1.0), (41, 1.25), (49, 1.0)):
        K(c, St["MouthO"], f, scl=(s, 1, s))
    for f, s in ((1, (0.96, 0.96, 1.07)), (13, (0.975, 0.975, 1.045)), (25, (0.96, 0.96, 1.07)), (37, (0.975, 0.975, 1.045)), (49, (0.96, 0.96, 1.07))):
        K(c, St["Torso"], f, scl=s)
    # hanging from the grip: swing like a pendulum and twist toward where the eyes went
    for f, th, yaw in ((1, 0, 0), (7, 8, -10), (15, -3, -16), (21, -9, 8), (29, 2, 18), (35, 7, 4), (42, -6, -6), (49, 0, 0)):
        t = math.radians(th)
        K(c, St["Rig"], f, loc=(-GRIP_H * math.sin(t), 0, GRIP_H * (1 - math.cos(t))), rot=(0, th, yaw))
    for i, f in enumerate(range(1, 50, 4)):                      # arms: out to the sides, flapping and paddling, out of step
        p = i * math.pi / 2
        up_r = 88 + 26 * math.sin(p); up_l = 88 + 26 * math.sin(p + 2.1)
        K(c, St["Arm-R"], f, rot=(34 * math.cos(p), -up_r, 0)); K(c, St["Arm-L"], f, rot=(34 * math.cos(p + 2.1), up_l, 0))
    for i, f in enumerate(range(1, 50, 4)):                      # legs: pedalling in the air
        p = i * math.pi * 2 / 3
        for side, off in (("L", 0.0), ("R", math.pi)):
            hip = -18 + 30 * math.sin(p + off)                   # negative = forward
            knee = 38 + 30 * math.sin(p + off + 1.9)
            K(c, St[f"Leg-{side}"], f, rot=(hip, 0, 0)); K(c, St[f"Shin-{side}"], f, rot=(knee, 0, 0))
            K(c, St[f"Foot-{side}"], f, rot=(18 + 14 * math.sin(p + off), 0, 0))

    c = "Impatient"
    face(c, St, 1, {"EyesOpen": (1, 1, 0.7), "MouthFrown": 1, "Blush": 0.7})
    for f in (1, 37): K(c, St["EyesOpen"], f, loc=(0.0006, LIFT, -0.0003))
    # foot tapping: heel down, toes lifting (ankle), the thigh barely moving
    for f, r in ((1, 0), (4, -28), (7, 0), (10, -28), (13, 0), (37, 0)):
        K(c, St["Foot-R"], f, rot=(r, 0, 0)); K(c, St["Leg-R"], f, rot=(r * 0.15, 0, 0))
    for f, r in ((1, 0), (19, 3), (37, 0)): K(c, St["Torso"], f, rot=(0, r, 0))
    for f in (1, 37):
        K(c, St["Arm-R"], f, rot=(0, 18, 0)); K(c, St["Arm-L"], f, rot=(0, -18, 0))

    c = "Walk"
    face(c, St, 1, NEUTRAL)
    N = GAIT_FRAMES
    sol = gait_solve(N)
    for f in range(1, N + 2):
        i = (f - 1) % N
        for side in "LR":
            hip, knee, ankle = sol["legs"][side][i]
            K(c, St[f"Leg-{side}"], f, rot=(hip, 0, 0))
            K(c, St[f"Shin-{side}"], f, rot=(knee, 0, 0))
            K(c, St[f"Foot-{side}"], f, rot=(ankle, 0, 0))
            K(c, St[f"Arm-{side}"], f, rot=(curve(GAIT_ARM, i / N + (0 if side == "L" else 0.5)), 0, 0))
        p = i / N
        K(c, St["Rig"], f, loc=(curve(GAIT_SWAY, p), 0, sol["rig_z"][i]))
        K(c, St["Torso"], f, rot=(3, curve(GAIT_ROLL, p), curve(GAIT_YAW, p)))
    S["walk_speed"] = sol["speed"]

    c = "Strum"                                                   # 1 s: busking — strumming and singing
    face(c, St, 1, {"EyesHappy": 1, "MouthOpen": 1, "Blush": (1.15, 1.15, 1.15)})
    for f in (1, 25): K(c, St["Arm-L"], f, rot=(-38, 62, 0))                       # fretting hand up the neck
    for i, f in enumerate(range(1, 26, 3)):
        K(c, St["Arm-R"], f, rot=(-52 + (12 if i % 2 == 0 else -12), -48, 0))      # strumming
    for f, (z, r, s) in ((1, (0, 0, (1, 1, 1))), (7, (0.0012, 4, (0.98, 0.98, 1.03))), (13, (0, 0, (1, 1, 1))), (19, (0.0012, -4, (0.98, 0.98, 1.03))), (25, (0, 0, (1, 1, 1)))):
        K(c, St["Rig"], f, loc=(0, 0, z)); K(c, St["Torso"], f, rot=(0, r, 0), scl=s)
    for f, s in ((1, (1, 1, 1)), (7, (1.2, 1, 1.25)), (13, (1, 1, 1)), (19, (1.2, 1, 1.25)), (25, (1, 1, 1))): K(c, St["MouthOpen"], f, scl=s)

    # ---------- SEATED
    c = "SitIdle"
    face(c, Se, 1, NEUTRAL); face(c, Se, 30, {"EyesClosed": 1, "MouthSmile": 1, "Blush": 1}); face(c, Se, 33, NEUTRAL)
    for f, s in ((1, (1, 1, 1)), (25, (0.985, 0.985, 1.025)), (49, (1, 1, 1))): K(c, Se["Torso"], f, scl=s)
    for f, r in ((1, 0), (13, 2), (37, -2), (49, 0)): K(c, Se["Torso"], f, rot=(0, r, 0))
    for f, x in ((1, 0), (12, -0.0006), (22, -0.0006), (27, 0), (49, 0)):
        K(c, Se["EyesOpen"], f, loc=(x, LIFT if x else 0, 0))
    for s in "LR":
        for f in (1, 49): K(c, Se[f"Arm-{s}"], f, rot=ARM_REST[s])

    c = "SitHappy"
    face(c, Se, 1, {"EyesHappy": 1, "MouthOpen": 1, "Blush": (1.25, 1.25, 1.25)})
    for f, z, s in ((1, 0, (1.04, 1.04, 0.95)), (7, 0.0018, (0.97, 0.97, 1.05)), (13, 0, (1.04, 1.04, 0.95)),
                    (19, 0.0012, (0.98, 0.98, 1.03)), (25, 0, (1.04, 1.04, 0.95))):
        K(c, Se["Rig"], f, loc=(0, 0, z)); K(c, Se["Torso"], f, scl=s)
    for i, f in enumerate((1, 7, 13, 19, 25)):
        up = 100 if i % 2 == 0 else 120
        K(c, Se["Arm-R"], f, rot=(0, -up, 0)); K(c, Se["Arm-L"], f, rot=(0, up, 0))
        k = 10 if i % 2 == 0 else -10
        # happy leg swinging from the knee, like a kid on a tall chair
        K(c, Se["Shin-L"], f, rot=(-LEG_REST - k * 2.5, 0, 0)); K(c, Se["Shin-R"], f, rot=(-LEG_REST + k * 2.5, 0, 0))

    c = "SitEating"
    face(c, Se, 1, {"EyesClosed": 1, "MouthNom": 1, "Blush": 1})
    for f, s in ((1, (1, 1, 1)), (7, (1.18, 1, 0.7)), (13, (1, 1, 1)), (19, (1.18, 1, 0.7)), (25, (1, 1, 1))):
        K(c, Se["MouthNom"], f, scl=s)
    mz = S["MZ"]
    R_UP = arm_aim("R", (0.017, -0.030, mz + 0.004)); L_UP = arm_aim("L", (-0.017, -0.030, mz + 0.004))
    for f, up in ((1, False), (7, True), (13, False), (19, False), (25, False)):
        K(c, Se["Arm-R"], f, rot=R_UP if up else ARM_REST["R"])
    for f, up in ((1, False), (7, False), (13, False), (19, True), (25, False)):
        K(c, Se["Arm-L"], f, rot=L_UP if up else ARM_REST["L"])
    for f, z in ((1, 0), (7, 0.0005), (13, 0), (19, 0.0005), (25, 0)): K(c, Se["Rig"], f, loc=(0, 0, z))

    c = "SitStrum"                                                # 1 s: the same, seated
    face(c, Se, 1, {"EyesHappy": 1, "MouthOpen": 1, "Blush": (1.15, 1.15, 1.15)})
    for f in (1, 25): K(c, Se["Arm-L"], f, rot=(-38, 62, 0))
    for i, f in enumerate(range(1, 26, 3)):
        K(c, Se["Arm-R"], f, rot=(-52 + (12 if i % 2 == 0 else -12), -48, 0))
    for f, (r, s) in ((1, (0, (1, 1, 1))), (7, (4, (0.98, 0.98, 1.03))), (13, (0, (1, 1, 1))), (19, (-4, (0.98, 0.98, 1.03))), (25, (0, (1, 1, 1)))):
        K(c, Se["Torso"], f, rot=(0, r, 0), scl=s)
    for f, s in ((1, (1, 1, 1)), (7, (1.2, 1, 1.25)), (13, (1, 1, 1)), (19, (1.2, 1, 1.25)), (25, (1, 1, 1))): K(c, Se["MouthOpen"], f, scl=s)

    c = "SitUnhappy"
    face(c, Se, 1, {"EyesCross": 1, "MouthFrown": 1, "Blush": 0.6})
    for f, s in ((1, (1, 1, 0.97)), (20, (1, 1, 0.97)), (23, (1.06, 1.06, 0.91)), (27, (0.98, 0.98, 1.02)),
                 (32, (1, 1, 0.96)), (49, (1, 1, 0.97))):
        K(c, Se["Torso"], f, scl=s)
    for f, r in ((1, 0), (20, 0), (30, -10), (42, -10), (49, 0)): K(c, Se["Rig"], f, rot=(0, 0, r))
    for s in "LR":
        for f in (1, 49): K(c, Se[f"Arm-{s}"], f, rot=(0, 0, 0))

def finish():
    """Actions into NLA tracks (one per clip) and the rest pose back."""
    for (clip, o), act in ACTS.items():
        ad = o.animation_data
        ad.action = None
        tr = next((t for t in ad.nla_tracks if t.name == clip), None) or ad.nla_tracks.new()
        tr.name = clip
        if not any(s.action == act for s in tr.strips):
            st = tr.strips.new(clip, 1, act)
            if getattr(st, "action_slot", 1) is None and act.slots: st.action_slot = act.slots[0]
    for o, (l, r, s) in REST.items():
        o.location, o.rotation_euler, o.scale = l, r, s

def animate_all():
    for kind, R in gb["RIGS"].items(): animate(R, kind)
    finish()

def preview(clips, frame):
    """Solo the given clip tracks (others muted) and jump to a frame."""
    for o in REST:
        if o.animation_data:
            for t in o.animation_data.nla_tracks: t.mute = t.name not in clips
    bpy.context.scene.frame_set(frame)

def unmute_all():
    for o in REST:
        if o.animation_data:
            for t in o.animation_data.nla_tracks: t.mute = False

gb["animate_all"] = animate_all; gb["preview"] = preview; gb["unmute_all"] = unmute_all; gb["K"] = K; gb["face"] = face; gb["finish"] = finish
