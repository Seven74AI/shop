import sharp from 'sharp'
import fs from 'fs'

async function main() {
  const exif = fs.readFileSync('/tmp/test-jpeg-exif.jpg')
  const stripped = fs.readFileSync('/tmp/test-jpeg-stripped.jpg')

  function findMarker(buf: Buffer, hi: number, lo: number): number {
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i] === hi && buf[i+1] === lo) return i
    }
    return -1
  }

  console.log('EXIF JPEG APP1 at:', findMarker(exif, 0xff, 0xe1))
  console.log('Stripped APP1 at:', findMarker(stripped, 0xff, 0xe1))
  console.log('Exif sizes equal:', exif.length === stripped.length)
  console.log('Exif bytes same:', Buffer.compare(exif, stripped) === 0)

  // The issue: withMetadata({}) might be a no-op without a real transform
  // Let's try with an explicit pipeline that forces re-encoding
  const properlyStripped = await sharp(exif)
    .jpeg() // Force JPEG output
    .withMetadata({}) // Strip EXIF
    .toBuffer()
  fs.writeFileSync('/tmp/test-jpeg-stripped-v2.jpg', properlyStripped)
  console.log('Stripped v2:', properlyStripped.length, 'bytes')
  console.log('Stripped v2 APP1 at:', findMarker(properlyStripped, 0xff, 0xe1))

  // Also test with resize (forces re-encoding)
  const resizedStripped = await sharp(exif)
    .resize(4, 4)
    .withMetadata({})
    .toBuffer()
  fs.writeFileSync('/tmp/test-jpeg-stripped-v3.jpg', resizedStripped)
  console.log('Stripped v3 (resized):', resizedStripped.length, 'bytes')
  console.log('Stripped v3 APP1 at:', findMarker(resizedStripped, 0xff, 0xe1))
}

main().catch(e => { console.error(e); process.exit(1) })
