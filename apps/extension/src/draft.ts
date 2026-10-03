import { create } from 'zustand';

/** Prompt text handed between panels (template browser, prompt library) and the Create panel. */
interface DraftState { text: string; set: (t: string) => void }
export const useDraft = create<DraftState>((set) => ({ text: '', set: (text) => set({ text }) }));
