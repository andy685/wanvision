import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('FlowingCloud video references are normalized to COS-hosted JPEG images', () => {
  const service = read('src/services/generation.ts')
  const storage = read('src/utils/storage.ts')

  assert.match(service, /cloudapi\.flowingcloud\.com/)
  assert.match(service, /needsPublicVideoReferenceImages/)
  assert.match(service, /readImageAsCompressedBuffer/)
  assert.match(service, /mirrorToObjectStorage/)
  assert.match(service, /flowingcloud-reference-images\/\$\{hash\}\.jpg/)
  assert.match(service, /signedObjectUrl\(jpegPath, 3600\)/)
  assert.match(storage, /export async function readImageAsCompressedBuffer/)
  assert.match(storage, /mimeType = 'image\/jpeg'/)
})
