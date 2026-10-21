#!/usr/bin/env python3
"""
Builds Bound Up's title face from Rubik's sources, distressed.

Rubik (SIL OFL 1.1, no Reserved Font Name; github.com/googlefonts/rubik) is
drawn in Glyphs with a Light and a Black master. This takes the Black master
and makes a variable font with two axes of its own, both set from CSS with
`font-variation-settings`:

- ROUG, roughness, 0-100: the outline eroded into chips and nicks, as if
  stamped with a worn rubber stamp. 0 is Rubik Black's own shape.
- WOBL, wobble, 0-100: each letter turned a few degrees, nudged off the
  baseline and scaled a touch, as hand-set wood type sits.

Every letter and digit comes in three variants (the default, .alt1, .alt2),
each with its own chips and tilt, and `calt` cycles through them along a
word, so a doubled letter is never the same stamp twice. The variants join
the kerning groups of the letter they vary, so they kern exactly as it does.

How: every outline is decomposed and flattened into a polyline. Three
masters are made from it: the polyline as it is (clean), the polyline with
each point moved along its normal into the ink by fractal noise, capped at a
share of the local stroke thickness so a thin stroke is nicked but never cut
through (rough), and the polyline turned, shifted and scaled about the
glyph's centre (wobbled). They share every point, so they interpolate, and
ufo2ft turns each into a delta on its axis; the two effects add.

Run with `npm run title-font`, which needs uv (it installs requirements.txt
into a throwaway environment). The output is committed: rebuild only to
change the face. `python build.py --source <Rubik.glyphs> --out <file>`
runs it on a local checkout of the sources instead of the pinned download.
"""

import argparse
import copy
import hashlib
import math
import shutil
import tempfile
import urllib.request
from pathlib import Path

import glyphsLib
import numpy as np
import ufo2ft
import ufoLib2
from fontTools import subset
from fontTools.designspaceLib import AxisDescriptor, DesignSpaceDocument, SourceDescriptor
from fontTools.otlLib.builder import buildStatTable
from fontTools.pens.recordingPen import DecomposingRecordingPen

# Rubik's sources at the commit this was built from. Pinned, so a rebuild
# gives the same font until someone means to move it.
RUBIK_COMMIT = 'e337a5f69a9bea30e58d05bd40184d79cc099628'
RUBIK_SOURCE = f'https://raw.githubusercontent.com/googlefonts/rubik/{RUBIK_COMMIT}/sources/Rubik.glyphs'

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE.parent.parent / 'static' / 'fonts' / 'bound-up-title.woff2'

# What the app's titles need: ASCII, Latin-1, the typographic quotes and
# dashes, the ellipsis, the bullet and the middle dot. Rubik's other scripts
# are left out to keep the file small.
UNICODES = (
	list(range(0x20, 0x7F))
	+ list(range(0xA0, 0x100))
	+ [0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2022, 0x2026, 0x2032,
	   0x2033, 0x2039, 0x203A, 0x20AC, 0x2122]
)

# Units per em is 1000. The polyline step: fine enough that the clean outline
# reads as Rubik's curves at title sizes and the jitter has points to move,
# coarse enough to keep the file small.
STEP = 9.0

# Erosion, in font units: a large, slow bite and a small, fast jitter on top.
EROSION = (28.0, 11.0)
# Never more than this share of the stroke's local thickness, so a stroke is
# nicked but never cut through.
THICKNESS_CAP = 0.32

# Wobble: degrees of tilt, units of baseline shift, and scale, as +/- ranges.
TILT_DEGREES = 4.5
SHIFT_UNITS = 16.0
SCALE_RANGE = 0.025

# The default stamp of each letter plus .alt1 and .alt2.
VARIANTS = 3

# ---------------------------------------------------------------- noise ---


def _hash01(*parts) -> float:
	digest = hashlib.blake2b(repr(parts).encode(), digest_size=8).digest()
	return int.from_bytes(digest, 'big') / 2**64


def _lattice(ix: int, iy: int, seed: int) -> float:
	# Cheap integer hash to [-1, 1]; deterministic across runs and platforms.
	h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) & 0xFFFFFFFF
	h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
	h ^= h >> 16
	return (h / 0xFFFFFFFF) * 2.0 - 1.0


def value_noise(x: float, y: float, seed: int) -> float:
	ix, iy = math.floor(x), math.floor(y)
	fx, fy = x - ix, y - iy
	sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
	a = _lattice(ix, iy, seed)
	b = _lattice(ix + 1, iy, seed)
	c = _lattice(ix, iy + 1, seed)
	d = _lattice(ix + 1, iy + 1, seed)
	return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy


def fbm(x: float, y: float, seed: int, octaves: int = 3) -> float:
	total, amp, freq, norm = 0.0, 1.0, 1.0, 0.0
	for octave in range(octaves):
		total += amp * value_noise(x * freq, y * freq, seed + octave * 101)
		norm += amp
		amp *= 0.5
		freq *= 2.0
	return total / norm


# ------------------------------------------------------------- outlines ---


def segments_of(recording):
	"""Contours as lists of ('line', p0, p1) and ('quad', p0, c, p1)."""
	contours, current, start, last = [], [], None, None
	for op, args in recording:
		if op == 'moveTo':
			start = last = args[0]
			current = []
		elif op == 'lineTo':
			current.append(('line', last, args[0]))
			last = args[0]
		elif op == 'qCurveTo':
			points = list(args)
			if points[-1] is None:
				# A contour of off-curve points only: every on-curve point is implied.
				offs = points[:-1]
				n = len(offs)
				mids = [((offs[i][0] + offs[(i + 1) % n][0]) / 2, (offs[i][1] + offs[(i + 1) % n][1]) / 2) for i in range(n)]
				for i in range(n):
					current.append(('quad', mids[i - 1], offs[i], mids[i]))
				contours.append(current)
				current, start, last = [], None, None
				continue
			*offs, end = points
			for i, off in enumerate(offs):
				seg_end = end if i == len(offs) - 1 else ((off[0] + offs[i + 1][0]) / 2, (off[1] + offs[i + 1][1]) / 2)
				current.append(('quad', last, off, seg_end))
				last = seg_end
		elif op == 'curveTo':
			# Cubic, from the sources. A run of more than two off-curve points
			# is a Glyphs/UFO shorthand this file never contains; refuse it.
			if len(args) != 3:
				raise ValueError('cubic curveTo with implied on-curve points')
			current.append(('cubic', last, args[0], args[1], args[2]))
			last = args[2]
		elif op in ('closePath', 'endPath'):
			if start is not None and last is not None and last != start:
				current.append(('line', last, start))
			if current:
				contours.append(current)
			current, start, last = [], None, None
	return contours


def seg_length(seg) -> float:
	"""The control polygon's length: an upper bound on the curve's, which is
	all the sampling needs."""
	points = seg[1:]
	return sum(math.dist(points[i], points[i + 1]) for i in range(len(points) - 1))


def seg_point(seg, t: float):
	if seg[0] == 'cubic':
		_, p0, c1, c2, p1 = seg
		u = 1 - t
		return tuple(
			u**3 * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t**3 * p1[i] for i in (0, 1)
		)
	if seg[0] == 'line':
		(x0, y0), (x1, y1) = seg[1], seg[2]
		return (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
	_, (x0, y0), (cx, cy), (x1, y1) = seg
	u = 1 - t
	return (u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1)


def flatten(masters_contours):
	"""Polylines for every master, sampled at the same parameters in each."""
	out = [[] for _ in masters_contours]
	for contour_index, segments in enumerate(masters_contours[0]):
		polys = [[] for _ in masters_contours]
		for seg_index in range(len(segments)):
			longest = max(seg_length(m[contour_index][seg_index]) for m in masters_contours)
			n = max(1, math.ceil(longest / STEP))
			for k in range(n):
				t = k / n
				for m, master in enumerate(masters_contours):
					polys[m].append(seg_point(master[contour_index][seg_index], t))
		for m in range(len(masters_contours)):
			out[m].append(np.array(polys[m], dtype=float))
	return out


def ink_normals(poly):
	"""Unit normals pointing into the ink. TrueType keeps ink on the right of
	the direction of travel, for outer contours and counters alike."""
	tangent = np.roll(poly, -1, axis=0) - np.roll(poly, 1, axis=0)
	normal = np.stack([tangent[:, 1], -tangent[:, 0]], axis=1)
	length = np.linalg.norm(normal, axis=1, keepdims=True)
	length[length == 0] = 1
	return normal / length


def thickness(polys, which, normals):
	"""Distance from each point of contour `which`, along its ink normal, to
	the nearest other edge of the glyph: the local stroke thickness."""
	origins = polys[which] + normals * 0.5
	a = np.concatenate(polys)
	b = np.concatenate([np.roll(p, -1, axis=0) for p in polys])
	edge = b - a
	best = np.full(len(origins), 2000.0)
	for i, (o, d) in enumerate(zip(origins, normals)):
		# Ray o + s*d against segment a + u*edge.
		denom = d[0] * edge[:, 1] - d[1] * edge[:, 0]
		ok = np.abs(denom) > 1e-9
		diff = a - o
		s = np.where(ok, (diff[:, 0] * edge[:, 1] - diff[:, 1] * edge[:, 0]) / np.where(ok, denom, 1), -1)
		u = np.where(ok, (diff[:, 0] * d[1] - diff[:, 1] * d[0]) / np.where(ok, denom, 1), -1)
		hit = ok & (s > 0.5) & (u >= 0) & (u <= 1)
		if hit.any():
			best[i] = s[hit].min()
	return best


# ------------------------------------------------------------- distress ---


def erosion_offsets(polys, seed):
	"""Each point moved into the ink: a slow bite and a fast jitter."""
	big, small = EROSION
	out = []
	for c, poly in enumerate(polys):
		normals = ink_normals(poly)
		thick = thickness(polys, c, normals)
		offsets = np.empty(len(poly))
		for i, (x, y) in enumerate(poly):
			# Slow bites: only the positive half of the noise erodes, sharpened
			# so most of the edge is whole and some of it is chewed.
			slow = fbm(x / 62.0, y / 62.0, seed)
			bite = max(0.0, slow - 0.05) ** 1.3 * 2.2
			# Fast, signed jitter over the whole edge.
			jitter = fbm(x / 11.0, y / 11.0, seed + 7, octaves=2)
			offsets[i] = big * bite + small * jitter
		cap = THICKNESS_CAP * thick
		offsets = np.minimum(offsets, cap)
		out.append(poly + normals * offsets[:, None])
	return out


def wobble(polys, glyph_key):
	"""The glyph turned, shifted and scaled about its own centre."""
	angle = math.radians((_hash01('tilt', glyph_key) * 2 - 1) * TILT_DEGREES)
	shift = (_hash01('shift', glyph_key) * 2 - 1) * SHIFT_UNITS
	scale = 1 + (_hash01('scale', glyph_key) * 2 - 1) * SCALE_RANGE
	every = np.concatenate(polys) if polys else np.zeros((0, 2))
	if not len(every):
		return polys
	centre = (every.min(axis=0) + every.max(axis=0)) / 2
	cos, sin = math.cos(angle), math.sin(angle)
	rot = np.array([[cos, -sin], [sin, cos]]) * scale
	return [(p - centre) @ rot.T + centre + np.array([0.0, shift]) for p in polys]


FAMILY = 'Bound Up Title'
LAYOUT_FEATURES = ['kern', 'mark', 'mkmk', 'ccmp', 'liga', 'locl', 'case', 'calt']


def black_master(glyphs_path: Path) -> ufoLib2.Font:
	source = glyphsLib.GSFont(str(glyphs_path))
	designspace = glyphsLib.to_designspace(source, ufo_module=ufoLib2, minimal=True)
	for s in designspace.sources:
		if s.styleName == 'Black' or (s.font.info.styleName or '').endswith('Black'):
			return s.font
	raise SystemExit('No Black master in the source')


def varied(font: ufoLib2.Font):
	"""Letters and digits in ASCII: the glyphs that get .alt1 and .alt2."""
	out = []
	for glyph in font:
		for cp in glyph.unicodes:
			if cp < 0x80 and chr(cp).isalnum():
				out.append(glyph.name)
				break
	return sorted(out)


def unique_points(masters):
	"""Rounds every master's points and drops any that would land on the point
	before it in ANY master, the same index from all of them, so the masters
	keep the same number of points (a compiler that drops a duplicate point in
	one master and not another makes them impossible to interpolate)."""
	rounded = [[np.rint(c) for c in m] for m in masters]
	out = [[] for _ in masters]
	for c in range(len(rounded[0])):
		keep = np.ones(len(rounded[0][c]), dtype=bool)
		for m in rounded:
			poly = m[c]
			same = np.all(poly == np.roll(poly, 1, axis=0), axis=1)
			keep &= ~same
		if keep.sum() < 3:
			for m_index in range(len(masters)):
				out[m_index].append(np.zeros((0, 2)))
			continue
		for m_index, m in enumerate(rounded):
			out[m_index].append(m[c][keep])
	return out


def write_outline(glyph, polys):
	glyph.clearContours()
	glyph.clearComponents()
	pen = glyph.getPen()
	for poly in polys:
		if len(poly) < 3:
			continue
		pen.moveTo(tuple(map(int, poly[0])))
		for point in poly[1:]:
			pen.lineTo(tuple(map(int, point)))
		pen.closePath()


def extend_kerning(font: ufoLib2.Font, alternates):
	"""Alternates join every group their letter is in, and copy any kerning
	pair that names the letter itself rather than its group."""
	for name, members in font.groups.items():
		extra = [alt for glyph in members for alt in alternates.get(glyph, [])]
		if extra:
			font.groups[name] = list(members) + extra
	for (left, right), value in list(font.kerning.items()):
		lefts = [left, *alternates.get(left, [])]
		rights = [right, *alternates.get(right, [])]
		for l in lefts:
			for r in rights:
				font.kerning.setdefault((l, r), value)


def cycling_feature(bases):
	a = ' '.join(bases)
	b = ' '.join(f'{g}.alt1' for g in bases)
	c = ' '.join(f'{g}.alt2' for g in bases)
	return f"""
# Bound Up: cycle each letter's three stamps along a word, so a doubled
# letter is never the same twice: default, alt1, alt2, default, ...
@BoundUpVar0 = [{a}];
@BoundUpVar1 = [{b}];
@BoundUpVar2 = [{c}];
lookup BoundUpCycleOne {{ sub @BoundUpVar0 by @BoundUpVar1; }} BoundUpCycleOne;
lookup BoundUpCycleTwo {{ sub @BoundUpVar0 by @BoundUpVar2; }} BoundUpCycleTwo;
feature calt {{
	sub @BoundUpVar0 @BoundUpVar0' lookup BoundUpCycleOne;
	sub @BoundUpVar1 @BoundUpVar0' lookup BoundUpCycleTwo;
}} calt;
"""


def build(glyphs_path: Path, woff2: Path):
	base = black_master(glyphs_path)
	bases = varied(base)
	alternates = {g: [f'{g}.alt{v}' for v in range(1, VARIANTS)] for g in bases}

	clean, rough, wobbled = (copy.deepcopy(base) for _ in range(3))
	masters = {'clean': clean, 'rough': rough, 'wobble': wobbled}
	for font in masters.values():
		for glyph, alts in alternates.items():
			for alt in alts:
				new = font.newGlyph(alt)
				new.width = font[glyph].width
		extend_kerning(font, alternates)
		font.features.text += cycling_feature(bases)
		font.info.familyName = FAMILY
		font.info.styleName = 'Black'
		font.info.styleMapFamilyName = None
		font.info.openTypeNamePreferredFamilyName = None
		font.info.openTypeNamePreferredSubfamilyName = None
		font.info.postscriptFontName = None
		font.info.postscriptFullName = None
		font.info.openTypeNameUniqueID = None
		font.info.openTypeNameDescription = (
			'Derived from Rubik (github.com/googlefonts/rubik) by procedural distressing.'
		)
		# Rubik's hinting is for its own outlines; these are new ones.
		font.lib.pop('com.google.fonts.ttfautohint', None)

	for name in sorted(base.keys()):
		pen = DecomposingRecordingPen(base)
		base[name].draw(pen)
		contours = segments_of(pen.value)
		for glyph in [name, *alternates.get(name, [])]:
			if not contours:
				for font in masters.values():
					write_outline(font[glyph], [])
				continue
			flat = flatten([contours])[0]
			seed = int(_hash01('seed', glyph) * 1_000_000)
			eroded = erosion_offsets(flat, seed)
			turned = wobble(flat, glyph)
			kept = unique_points([flat, eroded, turned])
			for kind, polys in zip(('clean', 'rough', 'wobble'), kept, strict=True):
				write_outline(masters[kind][glyph], polys)

	designspace = DesignSpaceDocument()
	for tag, label in (('ROUG', 'Roughness'), ('WOBL', 'Wobble')):
		axis = AxisDescriptor()
		axis.tag, axis.name, axis.minimum, axis.default, axis.maximum = tag, label, 0, 0, 100
		designspace.addAxis(axis)
	for kind, location in (('clean', {}), ('rough', {'Roughness': 100}), ('wobble', {'Wobble': 100})):
		source = SourceDescriptor()
		source.font = masters[kind]
		source.styleName = kind
		source.location = {'Roughness': 0, 'Wobble': 0, **location}
		designspace.addSource(source)

	variable = ufo2ft.compileVariableTTF(designspace, optimizeGvar=True)
	buildStatTable(variable, [
		{'tag': 'ROUG', 'name': 'Roughness', 'values': [{'value': 0, 'name': 'Clean', 'flags': 2}]},
		{'tag': 'WOBL', 'name': 'Wobble', 'values': [{'value': 0, 'name': 'Still', 'flags': 2}]},
	])

	options = subset.Options()
	options.layout_features = LAYOUT_FEATURES
	options.name_IDs = ['*']
	options.notdef_outline = True
	options.glyph_names = False
	subsetter = subset.Subsetter(options)
	subsetter.populate(unicodes=UNICODES)
	subsetter.subset(variable)

	# Fixed timestamps, so rebuilding an unchanged face gives the same bytes
	# and the committed file only changes when the design does.
	variable.recalcTimestamp = False
	variable['head'].created = variable['head'].modified = 3_870_000_000
	variable.flavor = 'woff2'
	woff2.parent.mkdir(parents=True, exist_ok=True)
	variable.save(woff2)
	print('wrote', woff2, woff2.stat().st_size, 'bytes')


def main():
	parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
	parser.add_argument('--source', type=Path, help='a local Rubik.glyphs, instead of the pinned download')
	parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
	args = parser.parse_args()
	with tempfile.TemporaryDirectory() as tmp:
		source = args.source
		if source is None:
			source = Path(tmp) / 'Rubik.glyphs'
			print('fetching', RUBIK_SOURCE)
			with urllib.request.urlopen(RUBIK_SOURCE) as response, source.open('wb') as file:
				shutil.copyfileobj(response, file)
		build(source, args.out)



if __name__ == '__main__':
	main()
