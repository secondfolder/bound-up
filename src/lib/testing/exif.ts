/**
 * Writes an EXIF block into a JPEG, for tests that need a photo carrying a
 * location, a camera and a time — what a phone writes into every picture.
 *
 * Built by hand rather than with a library, because nothing in the project
 * writes EXIF and a test fixture is not a reason to add something that does.
 * The layout is the minimum a reader needs: an APP1 segment straight after
 * the JPEG's SOI marker, holding a little-endian TIFF header, IFD0 (make,
 * model, and pointers to the Exif and GPS IFDs), an Exif IFD
 * (DateTimeOriginal) and a GPS IFD.
 */

export type ExifFields = {
	make?: string;
	model?: string;
	/** "YYYY:MM:DD HH:MM:SS", EXIF's own format. */
	dateTimeOriginal?: string;
	gps?: { latitude: number; longitude: number };
};

type Entry = { tag: number; type: number; count: number; value: Uint8Array<ArrayBuffer> | number };

const ASCII = 2;
const LONG = 4;
const RATIONAL = 5;

function ascii(text: string): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(`${text}\0`);
}

/** Degrees as the three rationals EXIF wants: degrees, minutes, seconds × 100. */
function degrees(value: number): Uint8Array<ArrayBuffer> {
	const absolute = Math.abs(value);
	const whole = Math.floor(absolute);
	const minutes = Math.floor((absolute - whole) * 60);
	const seconds = Math.round(((absolute - whole) * 60 - minutes) * 60 * 100);
	const out = new DataView(new ArrayBuffer(24));
	for (const [index, [numerator, denominator]] of [
		[whole, 1],
		[minutes, 1],
		[seconds, 100]
	].entries()) {
		out.setUint32(index * 8, numerator ?? 0, true);
		out.setUint32(index * 8 + 4, denominator ?? 1, true);
	}
	return new Uint8Array(out.buffer);
}

/**
 * Lays out one IFD at `offset` (from the TIFF header): its entries, then the
 * values too big to sit in an entry, which the entries point at.
 */
function ifd(entries: Entry[], offset: number): Uint8Array<ArrayBuffer> {
	const headerSize = 2 + entries.length * 12 + 4;
	const overflow: Uint8Array<ArrayBuffer>[] = [];
	let overflowOffset = offset + headerSize;
	const view = new DataView(new ArrayBuffer(headerSize));
	view.setUint16(0, entries.length, true);
	for (const [index, entry] of entries.entries()) {
		const at = 2 + index * 12;
		view.setUint16(at, entry.tag, true);
		view.setUint16(at + 2, entry.type, true);
		view.setUint32(at + 4, entry.count, true);
		if (typeof entry.value === 'number') {
			view.setUint32(at + 8, entry.value, true);
		} else if (entry.value.length <= 4) {
			new Uint8Array(view.buffer).set(entry.value, at + 8);
		} else {
			view.setUint32(at + 8, overflowOffset, true);
			overflow.push(entry.value);
			overflowOffset += entry.value.length + (entry.value.length % 2);
		}
	}
	view.setUint32(headerSize - 4, 0, true);
	const parts = [new Uint8Array(view.buffer)];
	for (const value of overflow) {
		parts.push(value);
		if (value.length % 2) {
			parts.push(new Uint8Array(1));
		}
	}
	return concat(parts);
}

function concat(parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** IFD0's entries, pointing at the Exif and GPS IFDs at the offsets given. */
function ifd0Entries(fields: ExifFields, exifAt: number, gpsAt: number): Entry[] {
	const entries: Entry[] = [];
	if (fields.make) {
		const value = ascii(fields.make);
		entries.push({ tag: 0x01_0f, type: ASCII, count: value.length, value });
	}
	if (fields.model) {
		const value = ascii(fields.model);
		entries.push({ tag: 0x01_10, type: ASCII, count: value.length, value });
	}
	entries.push({ tag: 0x87_69, type: LONG, count: 1, value: exifAt });
	if (fields.gps) {
		entries.push({ tag: 0x88_25, type: LONG, count: 1, value: gpsAt });
	}
	return entries;
}

export async function withExif(jpeg: Blob, fields: ExifFields): Promise<Blob> {
	const bytes = new Uint8Array(await jpeg.arrayBuffer());
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
		throw new Error('withExif needs a JPEG');
	}

	const exifEntries: Entry[] = fields.dateTimeOriginal
		? [
				{
					tag: 0x90_03,
					type: ASCII,
					count: 20,
					value: ascii(fields.dateTimeOriginal)
				}
			]
		: [];
	const gpsEntries: Entry[] = fields.gps
		? [
				{ tag: 1, type: ASCII, count: 2, value: ascii(fields.gps.latitude < 0 ? 'S' : 'N') },
				{ tag: 2, type: RATIONAL, count: 3, value: degrees(fields.gps.latitude) },
				{ tag: 3, type: ASCII, count: 2, value: ascii(fields.gps.longitude < 0 ? 'W' : 'E') },
				{ tag: 4, type: RATIONAL, count: 3, value: degrees(fields.gps.longitude) }
			]
		: [];

	// Two passes: IFD0's size does not depend on the offsets it points to, so
	// lay it out once to learn where the Exif and GPS IFDs will land.
	const ifd0At = 8;
	const ifd0Size = ifd(ifd0Entries(fields, 0, 0), ifd0At).length;
	const exifAt = ifd0At + ifd0Size;
	const exifIfd = ifd(exifEntries, exifAt);
	const gpsAt = exifAt + exifIfd.length;
	const gpsIfd = ifd(gpsEntries, gpsAt);
	const ifd0 = ifd(ifd0Entries(fields, exifAt, gpsAt), ifd0At);

	const header = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
	const tiff = concat([header, ifd0, exifIfd, fields.gps ? gpsIfd : new Uint8Array()]);
	const payload = concat([new TextEncoder().encode('Exif\0\0'), tiff]);
	const segment = new Uint8Array(4 + payload.length);
	segment.set([0xff, 0xe1, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff]);
	segment.set(payload, 4);

	return new Blob([bytes.subarray(0, 2), segment, bytes.subarray(2)], { type: 'image/jpeg' });
}
