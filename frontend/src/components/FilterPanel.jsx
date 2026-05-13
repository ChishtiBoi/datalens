import { useEffect, useState } from "react";

export default function FilterPanel({ profile, datasetId, onFilterChange }) {
  const [selectedEducation, setSelectedEducation] = useState([]);
  const [selectedMarital, setSelectedMarital] = useState([]);
  const [incomeMin, setIncomeMin] = useState(0);
  const [incomeMax, setIncomeMax] = useState(120000);
  const [incomeAbsMin, setIncomeAbsMin] = useState(0);
  const [incomeAbsMax, setIncomeAbsMax] = useState(120000);

  const educationCol = profile?.columns?.find(
    (c) => c.column_name === "Education"
  );
  const maritalCol = profile?.columns?.find(
    (c) => c.column_name === "Marital_Status"
  );
  const incomeCol = profile?.columns?.find(
    (c) => c.column_name === "Income"
  );

  useEffect(() => {
    if (incomeCol) {
      const mn = Math.floor(incomeCol.min ?? 0);
      const mx = Math.ceil(incomeCol.max ?? 120000);
      setIncomeAbsMin(mn);
      setIncomeAbsMax(mx);
      setIncomeMin(mn);
      setIncomeMax(mx);
    }
  }, [profile]);

  const educationOptions = educationCol?.top_values?.map((t) => t.value) ?? [
    "Graduation","PhD","Master","Basic","2n Cycle",
  ];
  const maritalOptions = maritalCol?.top_values?.map((t) => t.value) ?? [];

  function toggleValue(list, setList, value) {
    setList((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function applyFilters(edu, mar, mn, mx) {
    const categorical = {};
    if (edu.length > 0) categorical["Education"] = edu;
    if (mar.length > 0) categorical["Marital_Status"] = mar;

    const numeric = {};
    if (mn !== incomeAbsMin || mx !== incomeAbsMax) {
      numeric["Income"] = { min: mn, max: mx };
    }

    onFilterChange({
      dataset_id: datasetId,
      categorical_filters: Object.keys(categorical).length ? categorical : null,
      numeric_range: Object.keys(numeric).length ? numeric : null,
    });
  }

  function handleEducationToggle(value) {
    const next = selectedEducation.includes(value)
      ? selectedEducation.filter((v) => v !== value)
      : [...selectedEducation, value];
    setSelectedEducation(next);
    applyFilters(next, selectedMarital, incomeMin, incomeMax);
  }

  function handleMaritalToggle(value) {
    const next = selectedMarital.includes(value)
      ? selectedMarital.filter((v) => v !== value)
      : [...selectedMarital, value];
    setSelectedMarital(next);
    applyFilters(selectedEducation, next, incomeMin, incomeMax);
  }

  function handleIncomeMinChange(e) {
    const val = Number(e.target.value);
    const clamped = Math.min(val, incomeMax - 1);
    setIncomeMin(clamped);
    applyFilters(selectedEducation, selectedMarital, clamped, incomeMax);
  }

  function handleIncomeMaxChange(e) {
    const val = Number(e.target.value);
    const clamped = Math.max(val, incomeMin + 1);
    setIncomeMax(clamped);
    applyFilters(selectedEducation, selectedMarital, incomeMin, clamped);
  }

  function clearAll() {
    setSelectedEducation([]);
    setSelectedMarital([]);
    setIncomeMin(incomeAbsMin);
    setIncomeMax(incomeAbsMax);
    onFilterChange({
      dataset_id: datasetId,
      categorical_filters: null,
      numeric_range: null,
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4 w-64 shrink-0 h-fit sticky top-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Filters</h2>
        <button
          onClick={clearAll}
          className="text-xs text-blue-600 hover:underline"
        >
          Clear All
        </button>
      </div>

      {/* Education Filter */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Education
        </p>
        <div className="space-y-1">
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

      {/* Marital Status Filter */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Marital Status
        </p>
        <div className="space-y-1">
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
      </div>

      {/* Income Range Filter */}
      <div className="mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Income Range (${incomeMin.toLocaleString()} — ${incomeMax.toLocaleString()})
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Min</label>
            <input
              type="range"
              min={incomeAbsMin}
              max={incomeAbsMax}
              value={incomeMin}
              onChange={handleIncomeMinChange}
              className="w-full accent-blue-600"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Max</label>
            <input
              type="range"
              min={incomeAbsMin}
              max={incomeAbsMax}
              value={incomeMax}
              onChange={handleIncomeMaxChange}
              className="w-full accent-blue-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}