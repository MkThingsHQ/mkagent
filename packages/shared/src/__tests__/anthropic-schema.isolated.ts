import { afterAll, expect, it } from 'bun:test'

const originalFetch = globalThis.fetch
const originalHint = process.env.MKAGENT_PI_MODEL_API
const originalDisable = process.env.MKAGENT_INTERCEPTOR_DISABLE_AUTO_INSTALL
const bodies: any[] = []
// Exercise the installed fetch interceptor, not just its schema helper.
globalThis.fetch = (async (_input: unknown, init: RequestInit) => {
  bodies.push(JSON.parse(init.body as string))
  return Response.json({ content: [] })
}) as any
process.env.MKAGENT_PI_MODEL_API = 'anthropic-messages'
delete process.env.MKAGENT_INTERCEPTOR_DISABLE_AUTO_INSTALL
await import('../unified-network-interceptor')
afterAll(() => {
  globalThis.fetch = originalFetch
  if (originalHint === undefined) delete process.env.MKAGENT_PI_MODEL_API
  else process.env.MKAGENT_PI_MODEL_API = originalHint
  if (originalDisable === undefined) delete process.env.MKAGENT_INTERCEPTOR_DISABLE_AUTO_INSTALL
  else process.env.MKAGENT_INTERCEPTOR_DISABLE_AUTO_INSTALL = originalDisable
})

it('keeps Anthropic tool schemas closed while adding declared metadata in Pi requests', async () => {
  await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      model: 'schema-fixture', messages: [{ role: 'user', content: 'test' }], tools: [
        { name: 'mcp__session__get_session_info', input_schema: { type: 'object', additionalProperties: false, properties: { nested: { type: 'object', additionalProperties: false, properties: {} } }, required: ['nested'] } },
        { name: 'mcp__session__list_sessions', input_schema: { type: 'object', properties: {} } },
      ],
    }),
  })
  expect(bodies).toHaveLength(1)
  for (const tool of bodies[0].tools) {
    expect(tool.input_schema.additionalProperties).toBe(false)
    expect(tool.input_schema.properties._intent).toBeDefined()
    expect(tool.input_schema.properties._displayName).toBeDefined()
  }
  expect(bodies[0].tools[0].input_schema.properties.nested.additionalProperties).toBe(false)
  expect(bodies[0].tools[0].input_schema.required).toContain('nested')
})
