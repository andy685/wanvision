import { defineStore } from 'pinia'
import { workspaceAPI } from '~/api/workspace'
import { STORAGE_KEYS } from '~/constants/storage'
import type { Workspace } from '~/api/types'

export const useWorkspaceStore = defineStore('workspace', () => {
  const currentId = ref<number | null>(null)
  const workspaces = ref<Workspace[]>([])
  const loading = ref(false)

  function hydrate() {
    if (!import.meta.client) return
    const saved = localStorage.getItem(STORAGE_KEYS.workspace)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        currentId.value = parsed.id ?? null
      } catch {
        currentId.value = null
      }
    }
  }

  function setCurrent(workspace: Workspace | null) {
    currentId.value = workspace?.id ?? null
    if (import.meta.client) {
      if (workspace) localStorage.setItem(STORAGE_KEYS.workspace, JSON.stringify(workspace))
      else localStorage.removeItem(STORAGE_KEYS.workspace)
    }
  }

  const current = computed(() =>
    workspaces.value.find(w => w.id === currentId.value) || workspaces.value[0] || null
  )

  async function fetchWorkspaces() {
    loading.value = true
    try {
      workspaces.value = await workspaceAPI.list()
      if (!currentId.value && workspaces.value.length) {
        currentId.value = workspaces.value[0].id
      }
      return workspaces.value
    } finally {
      loading.value = false
    }
  }

  async function create(name: string) {
    const workspace = await workspaceAPI.create(name)
    workspaces.value.push(workspace)
    setCurrent(workspace)
    return workspace
  }

  hydrate()

  return {
    currentId,
    workspaces,
    current,
    loading,
    setCurrent,
    fetchWorkspaces,
    create,
  }
})
