import sharp from 'sharp'
import fs from 'fs'

async function main() {
  // Recreate JPEG with EXIF (larger image for visible size change)
  const jpegExif = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Make: 'Canon', Model: 'EOS 5D' } } })
    .toBuffer()
  fs.writeFileSync('/tmp/test-jpeg-exif.jpg', jpegExif)
  console.log(`JPEG with EXIF: ${jpegExif.length} bytes`)

  // Test the new stripping logic
  const meta = await sharp(jpegExif).metadata()
  let pipeline = sharp(jpegExif)
  if (meta.format === 'jpeg') pipeline = pipeline.jpeg()
  const stripped = await pipeline.withMetadata({}).toBuffer()

  fs.writeFileSync('/tmp/test-jpeg-stripped.jpg', stripped)
  console.log(`Stripped: ${stripped.length} bytes`)

  function findMarker(buf: Buffer, hi: number, lo: number): number {
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i] === hi && buf[i+1] === lo) return i
    }
    return -1
  }

  console.log('EXIF JPEG APP1 at:', findMarker(jpegExif, 0xff, 0xe1))
  console.log('Stripped APP1 at:', findMarker(stripped, 0xff, 0xe1))

  // Also add GPS data to the test for more thorough testing
  const jpegGps = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .jpeg()
    .withMetadata({
      // GPSInfo is supported by sharp at runtime but not in TypeScript types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exif: {
        IFD0: {
          Make: 'Apple',
          Model: 'iPhone 15',
        },
        GPSInfo: {
          GPSLatitudeRef: 'N',
          GPSLatitude: [48, 51, 52.9776],
          GPSLongitudeRef: 'E',
          GPSLongitude: [2, 20, 56.4504],
        },
      } as any,
    })
    .toBuffer()
  fs.writeFileSync('/tmp/test-jpeg-gps.jpg', jpegGps)
  console.log(`JPEG with GPS: ${jpegGps.length} bytes`)

  console.log('\nAll test images ready.')
}

main().catch(e => { console.error(e); process.exit(1) })
