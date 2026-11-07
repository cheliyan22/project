// Shared by local browser checks only; never imported by the application.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export const protocolError = detail => Object.assign(new Error(detail.message), { cdpCode: detail.code })

export async function waitForReady(evaluate, expression, ms = 30000) {
  const started = Date.now()
  while (Date.now() - started < ms) {
    try {
      // Short-circuit before evaluating predicates that dereference the body.
      if (await evaluate(`document.readyState !== 'loading' && document.body !== null && (${expression})`)) return true
    } catch (error) {
      // Only CDP context loss is transient. Runtime.exceptionDetails (including
      // TypeError from a broken predicate/application) must fail immediately.
      if (error.cdpCode !== -32000 || !/^(Execution context was destroyed\.?|Cannot find context with specified id)$/.test(error.message)) throw error
    }
    await delay(120)
  }
  return false
}

export const isBackendPath = pathname => /^\/(rest|auth|storage|functions)\/v1(?:\/|$)/.test(pathname)
export const jsonFixture = (value, status = 200) => ({ status, body: JSON.stringify(value) })

// CDP interception covers fetch, XHR, beacons and navigation, and survives full
// document changes. Only local static GET/HEAD requests ever reach the network.
// An unrecognized request is blocked AND reported, never silently passed through.
export async function installFixtureNetwork({ ws, send, origin, respond, errors }) {
  const handle = async ({ requestId, request }) => {
    const url = new URL(request.url)
    if (url.origin === origin && !isBackendPath(url.pathname) && ['GET', 'HEAD'].includes(request.method)) {
      await send('Fetch.continueRequest', { requestId })
      return
    }
    // The shipped CSS requests Google Fonts. Supply bundled fonts locally;
    // other families retain their declared system fallbacks, with no web fetch.
    const offlineFonts = request.method === 'GET' && url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2'
      ? { status: 200, headers: { 'Content-Type': 'text/css' }, body: `@font-face{font-family:Inter;src:url('${origin}/fonts/Inter-Medium.ttf') format('truetype');font-weight:100 900;font-display:swap}@font-face{font-family:Orbitron;src:url('${origin}/fonts/Orbitron-Bold.ttf') format('truetype');font-weight:100 900;font-display:swap}` }
      : null
    const response = offlineFonts ?? await respond(request, url)
    if (!response) {
      errors.push(`Unfixtureed request blocked: ${request.method} ${url.origin}${url.pathname}`)
      await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
      return
    }
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,accept-profile,content-profile,prefer,range,range-unit',
      'Access-Control-Expose-Headers': 'content-range,content-location',
      ...response.headers,
    }
    await send('Fetch.fulfillRequest', {
      requestId, responseCode: response.status,
      responseHeaders: Object.entries(headers).map(([name, value]) => ({ name, value: String(value) })),
      body: Buffer.from(response.body ?? '').toString('base64'),
    })
  }
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method !== 'Fetch.requestPaused') return
    void handle(message.params).catch(async error => {
      errors.push(`Fixture interception failed: ${error.message}`)
      try { await send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'BlockedByClient' }) }
      catch (failure) { errors.push(`Could not close intercepted request: ${failure.message}`) }
    })
  })
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Network.setBypassServiceWorker', { bypass: true })
  await send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] })
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
}
