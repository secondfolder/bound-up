/**
 * Reads what a picked file's metadata says about the person who took it.
 * Browser-only, like the rest of `src/lib/media/`; the rules for what counts
 * and how it is described are pure, in `src/lib/media-metadata.ts`.
 *
 * Photos go through exifr, which reads EXIF, GPS and IPTC out of JPEG, HEIC,
 * AVIF, PNG and TIFF without decoding a pixel. Videos go through mediabunny's
 * container parser, already here for transcoding. Both are imported lazily.
 */

import {
	imageMetadataFromExif,
	NO_SENSITIVE_METADATA,
	type SensitiveMetadata,
	videoMetadataFromTags
} from '../media-metadata';

async function readImage(file: File): Promise<SensitiveMetadata> {
	const { default: exifr } = await import('exifr');
	const exif = (await exifr.parse(file, {
		tiff: true,
		exif: true,
		gps: true,
		iptc: true,
		// Nothing sensitive lives in these, and they are the slow part.
		xmp: false,
		icc: false,
		jfif: false,
		ihdr: false
	})) as Record<string, unknown> | undefined;
	return imageMetadataFromExif(exif);
}

async function readVideo(file: File): Promise<SensitiveMetadata> {
	const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		return videoMetadataFromTags(await input.getMetadataTags());
	} finally {
		input.dispose();
	}
}

/**
 * Never rejects: a file whose metadata cannot be read is reported as having
 * none, because the answer only decides whether a warning shows. The
 * compressed file carries none of it either way.
 */
export async function readSensitiveMetadata(file: File): Promise<SensitiveMetadata> {
	try {
		if (file.type.startsWith('video/')) {
			return await readVideo(file);
		}
		if (file.type.startsWith('image/')) {
			return await readImage(file);
		}
	} catch (error) {
		console.warn('could not read the metadata of a picked file', error);
	}
	return NO_SENSITIVE_METADATA;
}
