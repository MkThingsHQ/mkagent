import { describe, expect, it } from 'bun:test'
import { RPC_CHANNELS } from '@mkagent/shared/protocol'
import { CHANNEL_MAP } from '../../../electron/src/transport/channel-map'

describe('WebUI Client API contract', () => {
  it('maps the retained session, Skill, settings, and Browser surfaces', () => {
    expect(CHANNEL_MAP.getSessions.channel).toBe(RPC_CHANNELS.sessions.GET)
    expect(CHANNEL_MAP.getSkills.channel).toBe(RPC_CHANNELS.skills.GET)
    expect(CHANNEL_MAP.setupLlmConnection.channel).toBe(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION)
    expect(CHANNEL_MAP['browserPane.create'].channel).toBe(RPC_CHANNELS.browserPane.CREATE)
  })

  it('contains only channels that exist in the shared protocol', () => {
    const channels = new Set<string>(Object.values(RPC_CHANNELS).flatMap(group => Object.values(group)))
    for (const entry of Object.values(CHANNEL_MAP)) expect(channels.has(entry.channel)).toBe(true)
  })
})
