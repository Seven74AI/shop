import sharp from 'sharp'
import fs from 'fs'

function findMarker(buf: Buffer, hi: number, lo: number): number {
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === hi && buf[i+1] === lo) return i
  }
  return -1
}

async function main() {
  // Create a JPEG with EXIF
  const original = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Make: 'Canon' } } })
    .toBuffer()
  console.log(`Original: ${original.length} bytes, APP1 at ${findMarker(original, 0xff, 0xe1)}, APP0 at ${findMarker(original, 0xff, 0xe0)}`)

  // Test 1: .jpeg() without withMetadata (default strips all)
  const t1 = await sharp(original).jpeg().toBuffer()
  console.log(`Test1 (.jpeg()): ${t1.length} bytes, APP1 at ${findMarker(t1, 0xff, 0xe1)}, APP0 at ${findMarker(t1, 0xff, 0xe0)}`)

  // Test 2: .jpeg().withMetadata({})
  const t2 = await sharp(original).jpeg().withMetadata({}).toBuffer()
  console.log(`Test2 (.jpeg().withMetadata({})): ${t2.length} bytes, APP1 at ${findMarker(t2, 0xff, 0xe1)}`)

  // Test 3: .resize().jpeg() forces reencoding
  const t3 = await sharp(original).resize(10, 10).jpeg().toBuffer()
  console.log(`Test3 (resize+jpeg): ${t3.length} bytes, APP1 at ${findMarker(t3, 0xff, 0xe1)}`)

  // Test 4: .resize().jpeg().withMetadata({})
  const t4 = await sharp(original).resize(10, 10).jpeg().withMetadata({}).toBuffer()
  console.log(`Test4 (resize+jpeg+withMeta): ${t4.length} bytes, APP1 at ${findMarker(t4, 0xff, 0xe1)}`)

  // Test 5: toFormat('jpeg') alternative
  const t5 = await sharp(original).toFormat('jpeg').toBuffer()
  console.log(`Test5 (toFormat jpeg): ${t5.length} bytes, APP1 at ${findMarker(t5, 0xff, 0xe1)}`)

  // Test 6: toFormat('jpeg').withMetadata({})
  const t6 = await sharp(original).toFormat('jpeg').withMetadata({}).toBuffer()
  console.log(`Test6 (toFormat+withMeta): ${t6.length} bytes, APP1 at ${findMarker(t6, 0xff, 0xe1)}`)

  // Test 7: raw resize to force full re-encode
  const t7 = await sharp(original).resize(9, 9).jpeg().withMetadata({}).toBuffer()
  console.log(`Test7 (resize 9x9): ${t7.length} bytes, APP1 at ${findMarker(t7, 0xff, 0xe1)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
