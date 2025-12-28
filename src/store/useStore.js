import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set, get) => ({
      // Main state
      instances: [],
      instanceIndex: 0,
      encryptionKey: null,

      // Temp state (not persisted)
      status: {},

      // Actions for instances
      addInstance: (name, address) =>
        set((state) => ({
          instances: [...state.instances, { name, address }],
        })),

      removeInstance: (index) =>
        set((state) => {
          const newInstances = state.instances.filter((_, i) => i !== index);
          let newInstanceIndex = state.instanceIndex;

          if (!newInstances[newInstanceIndex]) {
            newInstanceIndex = 0;
          }

          return {
            instances: newInstances,
            instanceIndex: newInstanceIndex,
          };
        }),

      setInstanceIndex: (index) =>
        set({ instanceIndex: index }),

      // Actions for encryption
      setEncryptionKey: (key, keyType) =>
        set({
          encryptionKey: { key, type: keyType },
        }),

      clearEncryptionKey: () =>
        set({ encryptionKey: null }),

      // Actions for status
      setStatus: (status) =>
        set({ status }),
    }),
    {
      name: 'sailplane-storage',
      partialize: (state) => ({
        instances: state.instances,
        instanceIndex: state.instanceIndex,
        // Don't persist encryptionKey or status
      }),
    }
  )
);

export default useStore;
