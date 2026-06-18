import { Info, Plus, Trash2, Users } from "lucide-react";
import { useStore } from "../store/useStore";
import { RATES } from "../utils/taxData";
import { useTranslation, inter } from "../i18n";
import type { FilingStatus } from "../types";

export function Step1Profile() {
  const {
    taxpayer,
    taxYear,
    exchangeRateAvg,
    exchangeRateEOY,
    dependents,
    updateTaxpayer,
    updateAddress,
    setTaxYear,
    setRates,
    addDependent,
    updateDependent,
    removeDependent,
  } = useStore();
  const { t } = useTranslation();
  const s = t.step1;

  // Changing the tax year prefills the official rates for that year (editable).
  const onYear = (year: number) => {
    setTaxYear(year);
    const r = RATES[year];
    if (r) setRates(r.avg, r.eoy);
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h3 className="text-base font-bold text-slate-900">{s.profileTitle}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{s.firstName}</label>
            <input
              className="input"
              value={taxpayer.firstName}
              onChange={(e) => updateTaxpayer({ firstName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{s.lastName}</label>
            <input
              className="input"
              value={taxpayer.lastName}
              onChange={(e) => updateTaxpayer({ lastName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">
              {s.ssn}{" "}
              <span className="text-slate-400">({s.ssnNote})</span>
            </label>
            <input
              type="password"
              autoComplete="off"
              className="input font-mono tracking-widest"
              placeholder={s.ssnPlaceholder}
              value={taxpayer.ssn}
              onChange={(e) => updateTaxpayer({ ssn: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{s.occupation}</label>
            <input
              className="input"
              placeholder={s.occupationPlaceholder}
              value={taxpayer.occupation}
              onChange={(e) => updateTaxpayer({ occupation: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{s.filingStatus}</label>
            <select
              className="input"
              value={taxpayer.filingStatus}
              onChange={(e) =>
                updateTaxpayer({ filingStatus: e.target.value as FilingStatus })
              }
            >
              {(
                Object.keys(t.filingStatuses) as FilingStatus[]
              ).map((k) => (
                <option key={k} value={k}>
                  {t.filingStatuses[k]}
                </option>
              ))}
            </select>
          </div>
          {(taxpayer.filingStatus === "Married filing separately" ||
            taxpayer.filingStatus === "Married filing jointly") && (
            <div>
              <label className="label">{s.spouseName}</label>
              <input
                className="input"
                placeholder={s.spouseNamePlaceholder}
                value={taxpayer.spouseName ?? ""}
                onChange={(e) => updateTaxpayer({ spouseName: e.target.value })}
              />
              {taxpayer.filingStatus === "Married filing separately" && (
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!taxpayer.spouseIsNRA}
                    onChange={(e) =>
                      updateTaxpayer({ spouseIsNRA: e.target.checked })
                    }
                  />
                  {s.spouseNra}
                </label>
              )}
            </div>
          )}
          <div>
            <label className="label">{s.phone}</label>
            <input
              type="tel"
              className="input"
              placeholder={s.phonePlaceholder}
              value={taxpayer.phone}
              onChange={(e) => updateTaxpayer({ phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{s.email}</label>
            <input
              type="email"
              className="input"
              value={taxpayer.email}
              onChange={(e) => updateTaxpayer({ email: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="text-base font-bold text-slate-900">{s.addressTitle}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">{s.street}</label>
            <input
              className="input"
              value={taxpayer.address.street}
              onChange={(e) => updateAddress({ street: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{s.city}</label>
            <input
              className="input"
              value={taxpayer.address.city}
              onChange={(e) => updateAddress({ city: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{s.zip}</label>
            <input
              className="input"
              value={taxpayer.address.zip}
              onChange={(e) => updateAddress({ zip: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{s.country}</label>
            <input
              className="input"
              value={taxpayer.address.country}
              onChange={(e) => updateAddress({ country: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="text-base font-bold text-slate-900">{s.ratesTitle}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">{s.taxYear}</label>
            <input
              type="number"
              className="input"
              value={taxYear}
              onChange={(e) => onYear(Number(e.target.value) || 2025)}
            />
            {RATES[taxYear] && (
              <p className="mt-1 text-xs text-emerald-600">
                {inter(s.ratesAuto, { year: taxYear })}
              </p>
            )}
          </div>
          <div>
            <label className="label">{s.avgRate}</label>
            <input
              type="number"
              step="0.0001"
              className="input"
              value={exchangeRateAvg}
              onChange={(e) =>
                setRates(Number(e.target.value) || 0, exchangeRateEOY)
              }
            />
            <p className="mt-1 text-xs text-slate-400">{s.avgRateNote}</p>
          </div>
          <div>
            <label className="label">{s.eoyRate}</label>
            <input
              type="number"
              step="0.0001"
              className="input"
              value={exchangeRateEOY}
              onChange={(e) =>
                setRates(exchangeRateAvg, Number(e.target.value) || 0)
              }
            />
            <p className="mt-1 text-xs text-slate-400">{s.eoyRateNote}</p>
          </div>
        </div>
        <div className="flex gap-2 rounded-lg bg-brand-50 p-3 text-xs text-brand-700">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>{inter(s.ratesInfo, { year: taxYear })}</p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Users size={18} /> {s.dependentsTitle}
            </h3>
            <p className="text-xs text-slate-400">{s.dependentsSub}</p>
          </div>
          <button className="btn-ghost" onClick={() => addDependent()}>
            <Plus size={16} /> {s.addDependent}
          </button>
        </div>

        {dependents.length === 0 ? (
          <p className="py-2 text-center text-sm text-slate-400">{s.noDependents}</p>
        ) : (
          <div className="space-y-3">
            {dependents.map((d) => (
              <div
                key={d.id}
                className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_120px_auto]"
              >
                <div>
                  <label className="label">{s.depName}</label>
                  <input
                    className="input"
                    value={d.name}
                    onChange={(e) => updateDependent(d.id, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">{s.depSsn}</label>
                  <input
                    className="input font-mono"
                    value={d.ssn}
                    onChange={(e) => updateDependent(d.id, { ssn: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">{s.depBirthYear}</label>
                  <input
                    type="number"
                    className="input"
                    value={d.birthYear || ""}
                    onChange={(e) =>
                      updateDependent(d.id, { birthYear: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <button
                    className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    onClick={() => removeDependent(d.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
