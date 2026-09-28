import { describe, expect, it } from 'vitest';
import {
	describeSensitiveMetadata,
	deviceName,
	hasSensitiveMetadata,
	imageMetadataFromExif,
	NO_SENSITIVE_METADATA,
	videoMetadataFromTags
} from './media-metadata';

const taken = new Date(2026, 8, 1, 10, 0);

describe('deviceName', () => {
	it('puts the maker in front of the model', () => {
		expect(deviceName('Apple', 'iPhone 15 Pro')).toBe('Apple iPhone 15 Pro');
	});

	it('does not repeat a maker the model already names', () => {
		expect(deviceName('Canon', 'Canon EOS R5')).toBe('Canon EOS R5');
		expect(deviceName('SAMSUNG', 'samsung SM-S918B')).toBe('samsung SM-S918B');
	});

	it('makes do with either half, and trims EXIF padding', () => {
		expect(deviceName(undefined, 'Pixel 8\0\0')).toBe('Pixel 8');
		expect(deviceName('Google ', '')).toBe('Google');
		expect(deviceName(undefined, undefined)).toBeNull();
	});
});

describe('imageMetadataFromExif', () => {
	it('finds GPS, the camera, the time and an owner', () => {
		expect(
			imageMetadataFromExif({
				latitude: -37.8,
				longitude: 144.9,
				Make: 'Apple',
				Model: 'iPhone 15 Pro',
				DateTimeOriginal: taken,
				OwnerName: 'Ada'
			})
		).toEqual({ location: true, device: 'Apple iPhone 15 Pro', takenAt: taken, owner: 'Ada' });
	});

	// A photo library can name the place with no coordinates at all.
	it('counts an IPTC place name as a location', () => {
		expect(imageMetadataFromExif({ City: 'Melbourne' }).location).toBe(true);
	});

	it('finds nothing in nothing', () => {
		expect(imageMetadataFromExif(undefined)).toEqual(NO_SENSITIVE_METADATA);
		expect(imageMetadataFromExif({ Orientation: 1, ImageWidth: 800 })).toEqual(
			NO_SENSITIVE_METADATA
		);
	});

	it('ignores a date that is not one', () => {
		expect(imageMetadataFromExif({ DateTimeOriginal: 'not a date' }).takenAt).toBeNull();
	});
});

describe('videoMetadataFromTags', () => {
	it("reads an iPhone's location, model and creation date", () => {
		const metadata = videoMetadataFromTags({
			date: taken,
			raw: {
				'com.apple.quicktime.location.ISO6709': '+37.7749-122.4194+010.000/',
				'com.apple.quicktime.make': 'Apple',
				'com.apple.quicktime.model': 'iPhone 15 Pro'
			}
		});
		expect(metadata).toEqual({
			location: true,
			device: 'Apple iPhone 15 Pro',
			takenAt: taken,
			owner: null
		});
	});

	it('knows the Android and 3GPP location boxes', () => {
		expect(videoMetadataFromTags({ raw: { '©xyz': '+37.7749-122.4194/' } }).location).toBe(true);
		expect(videoMetadataFromTags({ raw: { loci: new Uint8Array(8) } }).location).toBe(true);
	});

	it('finds nothing in an encoder tag', () => {
		expect(videoMetadataFromTags({ raw: { '©too': 'Lavf62.12.102' } })).toEqual(
			NO_SENSITIVE_METADATA
		);
		expect(hasSensitiveMetadata(videoMetadataFromTags({}))).toBe(false);
	});
});

describe('describeSensitiveMetadata', () => {
	it('names everything it found, specifically', () => {
		expect(
			describeSensitiveMetadata(
				{ location: true, device: 'Apple iPhone 15 Pro', takenAt: taken, owner: 'Ada' },
				'en-AU'
			)
		).toBe(
			'Shares where it was taken, the device (Apple iPhone 15 Pro), the date (1 Sept 2026) and a name (Ada)'
		);
	});

	it('reads naturally with one or two things', () => {
		expect(describeSensitiveMetadata({ ...NO_SENSITIVE_METADATA, location: true })).toBe(
			'Shares where it was taken'
		);
		expect(
			describeSensitiveMetadata({ ...NO_SENSITIVE_METADATA, location: true, device: 'Pixel 8' })
		).toBe('Shares where it was taken and the device (Pixel 8)');
	});

	it('says nothing when there is nothing', () => {
		expect(describeSensitiveMetadata(NO_SENSITIVE_METADATA)).toBeNull();
	});
});
