import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppState,
  Dependent,
  FilingSnapshot,
  FilingStatus,
  ForeignIncomeMethod,
  FbarAccount,
  IncomeRecord,
  PassiveRecord,
  SeRecord,
  Taxpayer,
} from "../types";

export interface BackupPayload {
  version: number;
  exportedAt: string;
  state: AppState;
  snapshots: FilingSnapshot[];
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

interface StoreActions {
  setRates: (avg: number, eoy: number) => void;
  saveSnapshot: () => void;
  loadSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
  setTaxYear: (year: number) => void;
  setForeignIncomeMethod: (m: ForeignIncomeMethod) => void;
  updateTaxpayer: (patch: Partial<Taxpayer>) => void;
  updateAddress: (patch: Partial<Taxpayer["address"]>) => void;

  addIncome: (rec?: Partial<IncomeRecord>) => void;
  addIncomes: (recs: Array<Partial<IncomeRecord>>) => void;
  updateIncome: (id: string, patch: Partial<IncomeRecord>) => void;
  removeIncome: (id: string) => void;

  addPassive: (rec?: Partial<PassiveRecord>) => void;
  updatePassive: (id: string, patch: Partial<PassiveRecord>) => void;
  removePassive: (id: string) => void;

  addFbar: (rec?: Partial<FbarAccount>) => void;
  updateFbar: (id: string, patch: Partial<FbarAccount>) => void;
  removeFbar: (id: string) => void;

  addDependent: (rec?: Partial<Dependent>) => void;
  updateDependent: (id: string, patch: Partial<Dependent>) => void;
  removeDependent: (id: string) => void;

  addSe: (rec?: Partial<SeRecord>) => void;
  updateSe: (id: string, patch: Partial<SeRecord>) => void;
  removeSe: (id: string) => void;

  exportBackup: () => BackupPayload;
  importBackup: (payload: BackupPayload) => void;
  resetAll: () => void;
}

// Default filing year = last completed calendar year (you file 2025 during 2026).
const DEFAULT_TAX_YEAR = new Date().getFullYear() - 1;

const initialState: AppState & { filingSnapshots: FilingSnapshot[] } = {
  taxYear: DEFAULT_TAX_YEAR,
  // Hypothetical 2025 USD/ILS reference rates — user can override.
  exchangeRateAvg: 3.75,
  exchangeRateEOY: 3.65,
  foreignIncomeMethod: "2555",
  taxpayer: {
    firstName: "",
    lastName: "",
    ssn: "",
    occupation: "",
    filingStatus: "Single" as FilingStatus,
    phone: "",
    email: "",
    address: { street: "", city: "", zip: "", country: "Israel" },
  },
  incomes: [],
  passive: [],
  fbarAccounts: [],
  dependents: [],
  selfEmployment: [],
  filingSnapshots: [],
};

// Only the AppState slice — used by snapshots and backup export.
const snapshotData = (s: AppState): AppState => ({
  taxYear: s.taxYear,
  exchangeRateAvg: s.exchangeRateAvg,
  exchangeRateEOY: s.exchangeRateEOY,
  foreignIncomeMethod: s.foreignIncomeMethod,
  taxpayer: s.taxpayer,
  incomes: s.incomes,
  passive: s.passive,
  fbarAccounts: s.fbarAccounts,
  dependents: s.dependents,
  selfEmployment: s.selfEmployment,
});

export const useStore = create<AppState & { filingSnapshots: FilingSnapshot[] } & StoreActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setRates: (avg, eoy) =>
        set({ exchangeRateAvg: avg, exchangeRateEOY: eoy }),

      saveSnapshot: () =>
        set((s) => {
          const snap: FilingSnapshot = {
            id: uid(),
            savedAt: new Date().toISOString(),
            label: `TY ${s.taxYear} — ${new Date().toLocaleDateString()}`,
            data: snapshotData(s),
          };
          return { filingSnapshots: [snap, ...s.filingSnapshots] };
        }),
      loadSnapshot: (id) =>
        set((s) => {
          const snap = s.filingSnapshots.find((f) => f.id === id);
          return snap ? { ...snap.data } : {};
        }),
      deleteSnapshot: (id) =>
        set((s) => ({
          filingSnapshots: s.filingSnapshots.filter((f) => f.id !== id),
        })),
      setTaxYear: (year) => set({ taxYear: year }),
      setForeignIncomeMethod: (m) => set({ foreignIncomeMethod: m }),

      updateTaxpayer: (patch) =>
        set((s) => ({ taxpayer: { ...s.taxpayer, ...patch } })),
      updateAddress: (patch) =>
        set((s) => ({
          taxpayer: {
            ...s.taxpayer,
            address: { ...s.taxpayer.address, ...patch },
          },
        })),

      addIncome: (rec) =>
        set((s) => ({
          incomes: [
            ...s.incomes,
            {
              id: uid(),
              sourceName: "",
              grossAmountILS: 0,
              taxPaidILS: 0,
              ...rec,
            },
          ],
        })),
      addIncomes: (recs) =>
        set((s) => ({
          incomes: [
            ...s.incomes,
            ...recs.map((r) => ({
              id: uid(),
              sourceName: "",
              grossAmountILS: 0,
              taxPaidILS: 0,
              ...r,
            })),
          ],
        })),
      updateIncome: (id, patch) =>
        set((s) => ({
          incomes: s.incomes.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),
      removeIncome: (id) =>
        set((s) => ({ incomes: s.incomes.filter((i) => i.id !== id) })),

      addPassive: (rec) =>
        set((s) => ({
          passive: [
            ...s.passive,
            {
              id: uid(),
              kind: "interest",
              sourceName: "",
              amountILS: 0,
              taxPaidILS: 0,
              isJoint: false,
              ...rec,
            },
          ],
        })),
      updatePassive: (id, patch) =>
        set((s) => ({
          passive: s.passive.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removePassive: (id) =>
        set((s) => ({ passive: s.passive.filter((p) => p.id !== id) })),

      addFbar: (rec) =>
        set((s) => ({
          fbarAccounts: [
            ...s.fbarAccounts,
            {
              id: uid(),
              bankName: "",
              accountNumber: "",
              bankAddress: "",
              maxBalanceILS: 0,
              isJoint: false,
              ...rec,
            },
          ],
        })),
      updateFbar: (id, patch) =>
        set((s) => ({
          fbarAccounts: s.fbarAccounts.map((a) =>
            a.id === id ? { ...a, ...patch } : a
          ),
        })),
      removeFbar: (id) =>
        set((s) => ({
          fbarAccounts: s.fbarAccounts.filter((a) => a.id !== id),
        })),

      addDependent: (rec) =>
        set((s) => ({
          dependents: [
            ...s.dependents,
            { id: uid(), name: "", ssn: "", birthYear: 0, ...rec },
          ],
        })),
      updateDependent: (id, patch) =>
        set((s) => ({
          dependents: s.dependents.map((d) =>
            d.id === id ? { ...d, ...patch } : d
          ),
        })),
      removeDependent: (id) =>
        set((s) => ({ dependents: s.dependents.filter((d) => d.id !== id) })),

      addSe: (rec) =>
        set((s) => ({
          selfEmployment: [
            ...s.selfEmployment,
            { id: uid(), businessName: "", grossILS: 0, expensesILS: 0, ...rec },
          ],
        })),
      updateSe: (id, patch) =>
        set((s) => ({
          selfEmployment: s.selfEmployment.map((e) =>
            e.id === id ? { ...e, ...patch } : e
          ),
        })),
      removeSe: (id) =>
        set((s) => ({
          selfEmployment: s.selfEmployment.filter((e) => e.id !== id),
        })),

      exportBackup: () => {
        const s = get();
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          state: snapshotData(s),
          snapshots: s.filingSnapshots,
        };
      },
      importBackup: (payload) =>
        set((s) => ({
          ...payload.state,
          // Merge snapshots, drop duplicates by id (incoming wins).
          filingSnapshots: [
            ...payload.snapshots,
            ...s.filingSnapshots.filter(
              (f) => !payload.snapshots.some((n) => n.id === f.id)
            ),
          ],
        })),
      resetAll: () => set({ ...initialState }),
    }),
    {
      name: "us-expat-tax-filer-v1",
      version: 1,
    }
  )
);
