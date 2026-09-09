import COS from 'cos-nodejs-sdk-v5'

const bucket = process.env.COS_BUCKET || ''
const region = process.env.COS_REGION || ''
const prefix = (process.env.COS_PREFIX || 'wanying').replace(/^\/+|\/+$/g, '')
const enabled = !!(process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY && bucket && region)
const client = enabled ? new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY }) : null

export function isObjectStorageEnabled() { return enabled }
function objectKey(relativePath: string) { return `${prefix}/${relativePath.replace(/^\/+/, '').replace(/^static\//, '')}` }

export function signedObjectUrl(relativePath: string, expires = 900) {
  if (!client) return null
  return client.getObjectUrl({ Bucket: bucket, Region: region, Key: objectKey(relativePath), Sign: true, Expires: expires, Protocol: 'https:' })
}

export async function mirrorToObjectStorage(relativePath: string, body: Buffer, contentType?: string) {
  if (!client) return
  await client.putObject({ Bucket: bucket, Region: region, Key: objectKey(relativePath), Body: body, ContentType: contentType })
}

export async function removeFromObjectStorage(relativePath: string) {
  if (!client) return
  await client.deleteObject({ Bucket: bucket, Region: region, Key: objectKey(relativePath) })
}

export function objectStorageStatus() { return { enabled, bucket: enabled ? bucket : '', region: enabled ? region : '' } }
