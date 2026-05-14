import { useEffect, useMemo, useRef, useState } from "react";

/** Match profile column by logical names (case-insensitive). */
function findColumn(profile, ...aliases) {
  if (!profile?.columns?.length) return undefined;
  const wanted = new Set(aliases.map((a) => a.toString().trim().toLowerCase()));
  return profile.columns.find((c) =>
    wanted.has(String(c.column_name).trim().toLowerCase())
  );
}

function IncomeRangeSliders({ absMin, absMax, onIncomeChange }) {
  const [incomeMin, setIncomeMin] = useState(absMin);
  const [incomeMax, setIncomeMax] = useState(absMax);

  function handleIncomeMinChange(e) {
    const val = Number(e.target.value);
    const clamped = Math.min(val, incomeMax - 1);
    setIncomeMin(clamped);
    onIncomeChange(clamped, incomeMax);
  }

  function handleIncomeMaxChange(e) {
    const val = Number(e.target.value);
    const clamped = Math.max(val, incomeMin + 1);
    setIncomeMax(clamped);
    onIncomeChange(incomeMin, clamped);
  }

  return (
    <div className="mb-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Income Range (${incomeMin.toLocaleString()} — ${incomeMax.toLocaleString()})
      </p>
      <div className="space-y-3">
        <div>
          <label htmlFor="filter-income-min" className="text-xs text-gray-500">
            Min
          </label>
          <input
            id="filter-income-min"
            type="range"
            min={absMin}
            max={absMax}
            value={incomeMin}
            aria-label="Minimum income"
            title="Minimum income"
            onChange={handleIncomeMinChange}
            className="w-full accent-blue-600"
          />
        </div>
        <div>
          <label htmlFor="filter-income-max" className="text-xs text-gray-500">
            Max
          </label>
          <input
            id="filter-income-max"
            type="range"
            min={absMin}
            max={absMax}
            value={incomeMax}
            aria-label="Maximum income"
            title="Maximum income"
            onChange={handleIncomeMaxChange}
            className="w-full accent-blue-600"
          />
        </div>
      </div>
    </div>
  );
}

export default function FilterPanel({ profile, datasetId, onFilterChange }) {
  const [selectedEducation, setSelectedEducation] = useState([]);
  const [selectedMarital, setSelectedMarital] = useState([]);
  const [incomeResetKey, setIncomeResetKey] = useState(0);

  const educationCol = findColumn(profile, "Education", "education");
  const maritalCol = findColumn(
    profile,
    "Marital_Status",
    "marital_status",
    "marital status"
  );
  const incomeCol = findColumn(profile, "Income", "income");

  const incomeBounds = useMemo(() => {
    if (!incomeCol) return { min: 0, max: 120000 };
    return {
      min: Math.floor(incomeCol.min ?? 0),
      max: Math.ceil(incomeCol.max ?? 120000),
    };
  }, [incomeCol]);

  const latestIncome = useRef({ min: 0, max: 120000 });
  const boundsSyncKey = `${incomeBounds.min}:${incomeBounds.max}:${incomeResetKey}`;

  useEffect(() => {
    latestIncome.current = {
      min: incomeBounds.min,
      max: incomeBounds.max,
    };
  }, [boundsSyncKey, incomeBounds.min, incomeBounds.max]);

  const educationOptions = educationCol?.top_values?.map((t) => t.value) ?? [
    "Graduation",
    "PhD",
    "Master",
    "Basic",
    "2n Cycle",
  ];
  const maritalOptions = maritalCol?.top_values?.map((t) => t.value) ?? [];

  function pushFilter(edu, mar, mn, mx) {
    const categorical = {};
    if (edu.length > 0) categorical["Education"] = edu;
    if (mar.length > 0) categorical["Marital_Status"] = mar;

    const numeric = {};
    if (mn !== incomeBounds.min || mx !== incomeBounds.max) {
      numeric["Income"] = { min: mn, max: mx };
    }

    onFilterChange({
      dataset_id: datasetId,
      categorical_filters: Object.keys(categorical).length ? categorical : null,
      numeric_range: Object.keys(numeric).length ? numeric : null,
    });
  }

  function handleIncomeChange(mn, mx) {
    latestIncome.current = { min: mn, max: mx };
    pushFilter(selectedEducation, selectedMarital, mn, mx);
  }

  function handleEducationToggle(value) {
    const next = selectedEducation.includes(value)
      ? selectedEducation.filter((v) => v !== value)
      : [...selectedEducation, value];
    setSelectedEducation(next);
    const { min, max } = latestIncome.current;
    pushFilter(next, selectedMarital, min, max);
  }

  function handleMaritalToggle(value) {
    const next = selectedMarital.includes(value)
      ? selectedMarital.filter((v) => v !== value)
      : [...selectedMarital, value];
    setSelectedMarital(next);
    const { min, max } = latestIncome.current;
    pushFilter(selectedEducation, next, min, max);
  }

  function clearAll() {
    setSelectedEducation([]);
    setSelectedMarital([]);
    setIncomeResetKey((k) => k + 1);
    onFilterChange({
      dataset_id: datasetId,
      categorical_filters: null,
      numeric_range: null,
    });
  }

  const incomeSliderKey = `${datasetId}-${incomeBounds.min}-${incomeBounds.max}-${incomeResetKey}`;

  return (
    <div className="bg-white rounded-2xl shadow p-4 w-64 shrink-0 h-fit sticky top-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Filters</h2>
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-blue-600 hover:underline"
          aria-label="Clear all filters"
        >
          Clear All
        </button>
      </div>

      <div className="mb-5">
        <p
          id="filter-education-heading"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2"
        >
          Education
        </p>
        <div
          className="space-y-1"
          role="group"
          aria-labelledby="filter-education-heading"
        >
          {educationOptions.map((val) => (
            <label key={val} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedEducation.includes(val)}
                onChange={() => handleEducationToggle(val)}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-700">{val}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <p
          id="filter-marital-heading"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2"
        >
          Marital Status
        </p>
        {maritalOptions.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            No marital status values in the profile for this dataset.
          </p>
        ) : (
          <div
            className="space-y-1"
            role="group"
            aria-labelledby="filter-marital-heading"
          >
            {maritalOptions.map((val) => (
              <label key={val} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedMarital.includes(val)}
                  onChange={() => handleMaritalToggle(val)}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-700">{val}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <IncomeRangeSliders
        key={incomeSliderKey}
        absMin={incomeBounds.min}
        absMax={incomeBounds.max}
        onIncomeChange={handleIncomeChange}
      />
    </div>
  );
}
