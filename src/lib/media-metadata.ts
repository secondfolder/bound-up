/**
 * The metadata a photo or video carries that says something about the person
 * who took it, and how to say what is in it. Pure, and alias-free like
 * `media-quality.ts`: the reading is browser-only and lives in
 * `src/lib/media/metadata.ts`, and this is the half the node tests can reach.
 *
 * It matters only for a file sent as picked — Original, or anything that is
 * never re-encoded — since compressing draws a new file from the pixels and
 * carries none of this over. See docs/messaging.md#transcoding.
 */

export type SensitiveMetadata = {
	/** GPS, or any other record of where it was taken. */
	location: boolean;
	/** "Apple iPhone 15 Pro", "Canon EOS R5". */
	device: string | null;
	/** When it was taken, as the camera recorded it. */
	takenAt: Date | null;
	/** A name the camera or its owner wrote into the file. */
	owner: string | null;
};

export const NO_SENSITIVE_METADATA: SensitiveMetadata = {
	location: false,
	device: null,
	takenAt: null,
	owner: null
};

export function hasSensitiveMetadata(metadata: SensitiveMetadata): boolean {
	return (
		metadata.location ||
		metadata.device !== null ||
		metadata.takenAt !== null ||
		metadata.owner !== null
	);
}

const TRAILING_NULS = /\0+$/;
/** Any tag a phone might name a location by — see `videoMetadataFromTags`. */
const LOCATION_KEY = /location|gps/i;

function text(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	// EXIF strings are fixed-width and NUL-padded more often than not.
	const trimmed = value.replace(TRAILING_NULS, '').trim();
	return trimmed === '' ? null : trimmed;
}

function validDate(value: unknown): Date | null {
	let date: Date | null = null;
	if (value instanceof Date) {
		date = value;
	} else if (typeof value === 'string') {
		date = new Date(value);
	}
	return date && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * "Apple" + "iPhone 15 Pro" → "Apple iPhone 15 Pro", but "Canon" +
 * "Canon EOS R5" → "Canon EOS R5": many makers repeat their name in the model.
 */
export function deviceName(make: unknown, model: unknown): string | null {
	const maker = text(make);
	const name = text(model);
	if (!name) {
		return maker;
	}
	if (!maker || name.toLowerCase().startsWith(maker.toLowerCase())) {
		return name;
	}
	return `${maker} ${name}`;
}

/** From what `exifr.parse` returns for a photo: EXIF, GPS and IPTC merged. */
export function imageMetadataFromExif(
	exif: Record<string, unknown> | undefined
): SensitiveMetadata {
	if (!exif) {
		return NO_SENSITIVE_METADATA;
	}
	const hasCoordinate = typeof exif.latitude === 'number' && typeof exif.longitude === 'number';
	// IPTC's place names are where it was taken too, written by hand or by a
	// photo library, even with no GPS in the file.
	const placeNamed = ['City', 'Sublocation', 'ProvinceState', 'Country'].some(
		(key) => text(exif[key]) !== null
	);
	return {
		location: hasCoordinate || placeNamed,
		device: deviceName(exif.Make, exif.Model),
		takenAt: validDate(exif.DateTimeOriginal) ?? validDate(exif.CreateDate),
		owner:
			text(exif.OwnerName) ?? text(exif.CameraOwnerName) ?? text(exif.Artist) ?? text(exif.Byline)
	};
}

/**
 * From mediabunny's `getMetadataTags()` for a video.
 *
 * Phones write location three ways: Apple's `mdta` key
 * `com.apple.quicktime.location.ISO6709`, the `©xyz` user-data box most
 * Android cameras use, and 3GPP's binary `loci` box. Any key naming a
 * location or GPS is treated the same, since a false alarm here costs a
 * sentence and a miss costs someone's address.
 */
export function videoMetadataFromTags(tags: {
	date?: Date | undefined;
	raw?: Record<string, unknown> | undefined;
}): SensitiveMetadata {
	const raw = tags.raw ?? {};
	const keys = Object.keys(raw);
	const location = keys.some((key) => key === '©xyz' || key === 'loci' || LOCATION_KEY.test(key));
	const lookup = (...names: string[]) => {
		for (const name of names) {
			const value = text(raw[name]);
			if (value) {
				return value;
			}
		}
		return null;
	};
	return {
		location,
		device: deviceName(
			lookup('com.apple.quicktime.make', 'com.android.manufacturer', '©mak'),
			lookup('com.apple.quicktime.model', 'com.android.model', '©mod')
		),
		takenAt: validDate(tags.date) ?? validDate(lookup('com.apple.quicktime.creationdate', '©day')),
		owner: lookup('com.apple.quicktime.author', '©aut')
	};
}

function list(parts: string[]): string {
	if (parts.length <= 1) {
		return parts.join('');
	}
	return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/**
 * "Shares where it was taken, the device (Apple iPhone 15 Pro) and the date
 * (1 Sep 2026)" — or null when there is nothing to say.
 *
 * Specific rather than "may contain metadata": naming the phone and the date
 * is what makes it plain what the other person would learn.
 */
export function describeSensitiveMetadata(
	metadata: SensitiveMetadata,
	locale?: string
): string | null {
	const parts: string[] = [];
	if (metadata.location) {
		parts.push('where it was taken');
	}
	if (metadata.device) {
		parts.push(`the device (${metadata.device})`);
	}
	if (metadata.takenAt) {
		const date = metadata.takenAt.toLocaleDateString(locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
		parts.push(`the date (${date})`);
	}
	if (metadata.owner) {
		parts.push(`a name (${metadata.owner})`);
	}
	return parts.length === 0 ? null : `Shares ${list(parts)}`;
}
