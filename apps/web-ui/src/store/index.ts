import { configureStore } from "@reduxjs/toolkit";
import { type TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { loadPersistedUiState, persistUiState, pickPersistedFields } from "./persistence.ts";
import { initialUiState, uiReducer } from "./uiSlice.ts";

/** Build a fresh store hydrated from whatever's persisted (or defaults, if
 *  nothing is / storage is unavailable) and wired to keep persisting on
 *  change. Factored out (rather than one module-level singleton) so tests can
 *  create isolated stores against a mocked `localStorage`. */
export function createAppStore() {
  const appStore = configureStore({
    reducer: { ui: uiReducer },
    preloadedState: { ui: { ...initialUiState, ...loadPersistedUiState() } },
  });

  let lastPersisted = JSON.stringify(pickPersistedFields(appStore.getState().ui));
  appStore.subscribe(() => {
    const next = JSON.stringify(pickPersistedFields(appStore.getState().ui));
    if (next !== lastPersisted) {
      lastPersisted = next;
      persistUiState(appStore.getState().ui);
    }
  });

  return appStore;
}

export const store = createAppStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
