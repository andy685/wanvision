import { useAuthStore } from '~/stores/auth'

export function useAuth() {
  const store = useAuthStore()

  return {
    user: computed(() => store.user),
    loading: computed(() => store.loading),
    signIn: store.signIn,
    signOut: store.signOut,
    resetPassword: store.resetPassword,
    requestPasswordReset: store.requestPasswordReset,
    changePassword: store.changePassword,
    updateProfile: store.updateProfile,
  }
}
