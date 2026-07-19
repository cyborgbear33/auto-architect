import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Durable UI / application state ONLY. No server data lives here — vehicles,
 * DTCs, recognition, problems, and recommendations are owned by TanStack
 * Query. Two sources of truth is how apps get haunted.
 */
export interface UiState {
  selectedVehicleId: string;
  /** Reveals raw/technical data (rule ids, DL proof detail, LOGOS certainty
   *  strings) that's already computed server-side but hidden from the
   *  default, jargon-free UI. */
  debugMode: boolean;
}

export const initialUiState: UiState = {
  selectedVehicleId: "",
  debugMode: false,
};

const uiSlice = createSlice({
  name: "ui",
  initialState: initialUiState,
  reducers: {
    selectVehicle(state, action: PayloadAction<string>) {
      state.selectedVehicleId = action.payload;
    },
    setDebugMode(state, action: PayloadAction<boolean>) {
      state.debugMode = action.payload;
    },
  },
});

export const { selectVehicle, setDebugMode } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
