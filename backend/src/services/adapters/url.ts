export function joinProviderUrl(baseUrl: string, requiredPrefix: string, path: string) {
  const normalizedBase = normalizeProviderBaseUrl(baseUrl).replace(/\/+$/, '')
  const normalizedPrefix = normalizeSegment(requiredPrefix)
  const normalizedPath = normalizeSegment(path)

  if (!normalizedBase) {
    return `${normalizedPrefix}${normalizedPath}`
  }

  try {
    const url = new URL(normalizedBase)
    const currentPath = url.pathname.replace(/\/+$/, '')
    const mergedPrefix = currentPath.endsWith(normalizedPrefix)
      ? currentPath
      : `${currentPath}${normalizedPrefix}`

    url.pathname = `${mergedPrefix}${normalizedPath}`.replace(/\/{2,}/g, '/')
    return url.toString()
  } catch {
    const basePath = normalizedBase.endsWith(normalizedPrefix)
      ? normalizedBase
      : `${normalizedBase}${normalizedPrefix}`
    return `${basePath}${normalizedPath}`
  }
}

export function normalizeProviderBaseUrl(baseUrl: string) {
  const trimmed = (baseUrl || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)

    if (url.hostname === 'cloudapi.flowingcloud.com') {
      url.pathname = '/'
      url.search = ''
      url.hash = ''
      return url.toString().replace(/\/+$/, '')
    }

    const currentPath = url.pathname.replace(/\/+$/, '')
    const apiPrefix = firstApiPrefixIndex(currentPath)
    if (apiPrefix >= 0) {
      url.pathname = currentPath.slice(0, apiPrefix) || '/'
      url.search = ''
      url.hash = ''
    }

    return url.toString().replace(/\/+$/, '')
  } catch {
    return trimmed
      .replace(/\/(?:v\d+\/)?api\/v\d+(?:\/.*)?$/i, '')
      .replace(/\/v(?:1|1beta|2)(?:\/.*)?$/i, '')
  }
}

function firstApiPrefixIndex(pathname: string) {
  const matches = ['/api/v3', '/v1beta', '/v1', '/v2']
    .map(prefix => pathname.indexOf(prefix))
    .filter(index => index >= 0)
  return matches.length ? Math.min(...matches) : -1
}

function normalizeSegment(segment: string) {
  if (!segment) return ''
  return segment.startsWith('/') ? segment : `/${segment}`
}
