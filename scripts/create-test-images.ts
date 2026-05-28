import sharp from 'sharp'
import fs from 'fs'

async function main() {
  // Create minimal valid JPEG (1x1 pixel, red)
  const jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .jpeg().toBuffer()
  fs.writeFileSync('/tmp/test-minimal.jpg', jpeg)
  console.log(`JPEG: ${jpeg.length} bytes`)

  // Create minimal valid PNG (1x1 pixel, blue)
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 255 } } })
    .png().toBuffer()
  fs.writeFileSync('/tmp/test-minimal.png', png)
  console.log(`PNG: ${png.length} bytes`)

  // Create minimal valid WebP (1x1 pixel, green)
  const webp = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 255, b: 0 } } })
    .webp().toBuffer()
  fs.writeFileSync('/tmp/test-minimal.webp', webp)
  console.log(`WebP: ${webp.length} bytes`)

  // Create JPEG with EXIF metadata
  const jpegExif = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Make: 'Canon', Model: 'EOS 5D' } } })
    .toBuffer()
  fs.writeFileSync('/tmp/test-jpeg-exif.jpg', jpegExif)
  console.log(`JPEG EXIF: ${jpegExif.length} bytes`)

  // Strip EXIF
  const stripped = await sharp(jpegExif).withMetadata({}).toBuffer()
  fs.writeFileSync('/tmp/test-jpeg-stripped.jpg', stripped)
  console.log(`Stripped: ${stripped.length} bytes`)

  console.log('All test images created in /tmp/')
}

main().catch(e => { console.error(e); process.exit(1) })
