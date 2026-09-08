import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadGraphData = vi.fn(async (..._a: any[]) => {})
const fetchApi = vi.fn()
const getUserData = vi.fn()
const toastAdd = vi.fn()
const getWorkflowByPath = vi.fn()
const isActive = vi.fn()

vi.mock('@/lib/comfyApp', () => ({
  app: {
    loadGraphData: (...a: any[]) => loadGraphData(...a),
    api: {
      fetchApi: (...a: any[]) => fetchApi(...a),
      getUserData: (...a: any[]) => getUserData(...a),
    },
    extensionManager: {
      workflow: {
        getWorkflowByPath: (...a: any[]) => getWorkflowByPath(...a),
        isActive: (...a: any[]) => isActive(...a),
      },
      toast: { add: (...a: any[]) => toastAdd(...a) },
    },
  },
}))
vi.mock('@/i18n', () => ({
  t: (key: string, args?: Record<string, unknown>) =>
    args ? `${key}:${JSON.stringify(args)}` : key,
}))

import { LINK_TYPE_MANAGED, LINK_TYPE_NATIVE } from '@/api'

import {
  nativeWorkflowRelPath,
  openWorkflowInComfy,
  tryOpenNativeWorkflowInComfy,
  tryOpenWorkflowInComfy,
} from './useOpenInComfy'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkflowByPath.mockReturnValue(null)
  isActive.mockReturnValue(false)
})

describe('nativeWorkflowRelPath', () => {
  it('extracts the path relative to the native workflows root', () => {
    expect(nativeWorkflowRelPath('C:\\ComfyUI\\user\\default\\workflows\\sub\\wf.json'))
      .toBe('sub/wf.json')
    expect(nativeWorkflowRelPath('/srv/comfy/user/default/workflows/wf.json'))
      .toBe('wf.json')
  })

  it('returns null for paths outside the native root', () => {
    expect(nativeWorkflowRelPath('C:\\ComfyUI\\user\\default\\comfytv\\workflows\\image\\wf.json'))
      .toBe(null)
    expect(nativeWorkflowRelPath('')).toBe(null)
  })
})

describe('openWorkflowInComfy (native link)', () => {
  const target = {
    kind: 'image',
    label: 'WF',
    link_type: LINK_TYPE_NATIVE,
    file_path: '/comfy/user/default/workflows/sub/wf.json',
  }

  it('reactivates the existing native tab through the workflow store', async () => {
    const handle = { load: vi.fn(async () => ({ activeState: { nodes: [1] } })) }
    getWorkflowByPath.mockReturnValue(handle)
    await openWorkflowInComfy(target)
    expect(getWorkflowByPath).toHaveBeenCalledWith('workflows/sub/wf.json')
    expect(handle.load).toHaveBeenCalled()
    expect(loadGraphData).toHaveBeenCalledWith({ nodes: [1] }, true, true, handle)
    expect(getUserData).not.toHaveBeenCalled()
  })

  it('does nothing when the native tab is already active', async () => {
    const handle = { load: vi.fn() }
    getWorkflowByPath.mockReturnValue(handle)
    isActive.mockReturnValue(true)
    await openWorkflowInComfy(target)
    expect(handle.load).not.toHaveBeenCalled()
    expect(loadGraphData).not.toHaveBeenCalled()
  })

  it('falls back to fetching the userdata file when the store misses', async () => {
    getUserData.mockResolvedValue(jsonResponse({ nodes: [] }))
    await openWorkflowInComfy(target)
    expect(getUserData).toHaveBeenCalledWith('workflows/sub/wf.json')
    expect(loadGraphData).toHaveBeenCalledWith({ nodes: [] }, true, true, 'sub/wf')
  })

  it('falls back to the managed route when file_path is not under the native root', async () => {
    fetchApi.mockResolvedValue(jsonResponse({ nodes: [] }))
    await openWorkflowInComfy({ ...target, file_path: '/elsewhere/wf.json' })
    expect(fetchApi).toHaveBeenCalledWith('/comfytv/workflows/file?kind=image&label=WF')
    expect(loadGraphData).toHaveBeenCalledWith({ nodes: [] }, true, true, 'comfytv/image/WF')
  })
})

describe('openWorkflowInComfy (managed)', () => {
  const target = { kind: 'video', label: 'My WF', link_type: LINK_TYPE_MANAGED }

  it('fetches the workflow file and opens it as a comfytv tab', async () => {
    fetchApi.mockResolvedValue(jsonResponse({ nodes: [2] }))
    await openWorkflowInComfy(target)
    expect(fetchApi).toHaveBeenCalledWith('/comfytv/workflows/file?kind=video&label=My%20WF')
    expect(loadGraphData).toHaveBeenCalledWith({ nodes: [2] }, true, true, 'comfytv/video/My WF')
  })

  it('reuses a previously opened comfytv tab instead of creating another', async () => {
    const handle = { load: vi.fn(async () => ({ activeState: { nodes: [3] } })) }
    getWorkflowByPath.mockReturnValue(handle)
    await openWorkflowInComfy(target)
    expect(getWorkflowByPath).toHaveBeenCalledWith('workflows/comfytv/video/My WF.json')
    expect(loadGraphData).toHaveBeenCalledWith({ nodes: [3] }, true, true, handle)
    expect(fetchApi).not.toHaveBeenCalled()
  })

  it('throws with the server error detail on failure', async () => {
    fetchApi.mockResolvedValue(jsonResponse({ error: 'gone' }, 404))
    await expect(openWorkflowInComfy(target)).rejects.toThrow('gone')
    expect(loadGraphData).not.toHaveBeenCalled()
  })
})

describe('try* wrappers', () => {
  it('returns true on success without toasting', async () => {
    fetchApi.mockResolvedValue(jsonResponse({}))
    await expect(tryOpenWorkflowInComfy({ kind: 'image', label: 'A' })).resolves.toBe(true)
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('toasts and returns false when opening fails', async () => {
    fetchApi.mockResolvedValue(jsonResponse({ error: 'boom' }, 500))
    await expect(tryOpenWorkflowInComfy({ kind: 'image', label: 'A' })).resolves.toBe(false)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'error',
      summary: expect.stringContaining('boom'),
    }))
  })

  it('opens a native file by relative path and reports failures', async () => {
    getUserData.mockResolvedValue(jsonResponse({ nodes: [] }))
    await expect(tryOpenNativeWorkflowInComfy('sub/wf.json')).resolves.toBe(true)
    expect(loadGraphData).toHaveBeenCalledWith({ nodes: [] }, true, true, 'sub/wf')

    getUserData.mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' }))
    await expect(tryOpenNativeWorkflowInComfy('missing.json')).resolves.toBe(false)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }))
  })
})
