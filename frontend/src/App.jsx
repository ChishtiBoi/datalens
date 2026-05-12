import { useEffect, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const API_BASE_URL = 'http://localhost:8000'
const SPENDING_COLUMNS = [
  'mntwines',
  'mntfruits',
  'mntmeatproducts',
  'mntfishproducts',
  'mntsweetproducts',
  'mntgoldprods',
]
const CAMPAIGN_COLUMNS = [
  'acceptedcmp1',
  'acceptedcmp2',
  'acceptedcmp3',
  'acceptedcmp4',
  'acceptedcmp5',
  'response',
]
const CHART_COLORS = ['#1d4ed8', '#0f766e', '#9333ea', '#dc2626', '#c2410c', '#0f766e']
const EDUCATION_OPTIONS = ['Graduation', 'PhD', 'Master', 'Basic', '2n Cycle']

const normalizeKey = (value) => value?.toString().trim().toLowerCase() ?? ''

const getValue = (row, ...aliases) => {
  for (const alias of aliases) {
    const exact = row[alias]
    if (exact !== undefined) return exact
    const normalizedAlias = normalizeKey(alias)
    for (const key of Object.keys(row)) {
      if (normalizeKey(key) === normalizedAlias) return row[key]
    }
  }
  return null
}

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const averageSpendingByEducation = (rows) => {
  const bucket = new Map()
  for (const row of rows) {
    const education = getValue(row, 'education') ?? 'Unknown'
    const key = education.toString()
    if (!bucket.has(key)) {
      bucket.set(key, { education: key, sums: {}, count: 0 })
      SPENDING_COLUMNS.forEach((column) => {
        bucket.get(key).sums[column] = 0
      })
    }
    const entry = bucket.get(key)
    entry.count += 1
    SPENDING_COLUMNS.forEach((column) => {
      const numeric = toNumber(getValue(row, column))
      entry.sums[column] += numeric ?? 0
    })
  }

  return Array.from(bucket.values()).map((entry) => ({
    education: entry.education,
    wines: Number((entry.sums.mntwines / entry.count).toFixed(2)),
    fruits: Number((entry.sums.mntfruits / entry.count).toFixed(2)),
    meat: Number((entry.sums.mntmeatproducts / entry.count).toFixed(2)),
    fish: Number((entry.sums.mntfishproducts / entry.count).toFixed(2)),
    sweets: Number((entry.sums.mntsweetproducts / entry.count).toFixed(2)),
    gold: Number((entry.sums.mntgoldprods / entry.count).toFixed(2)),
  }))
}

const customerCountByMaritalStatus = (rows) => {
  const counts = new Map()
  for (const row of rows) {
    const status = getValue(row, 'marital_status') ?? 'Unknown'
    const key = status.toString()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([maritalStatus, count]) => ({ maritalStatus, count }))
}

const incomeHistogram = (rows) => {
  const incomes = rows
    .map((row) => toNumber(getValue(row, 'income')))
    .filter((value) => value !== null)
  if (!incomes.length) return []

  const min = Math.min(...incomes)
  const max = Math.max(...incomes)
  const binSize = (max - min) / 10 || 1
  const bins = Array.from({ length: 10 }, (_, index) => ({
    range: `${Math.round(min + index * binSize)}-${Math.round(min + (index + 1) * binSize)}`,
    count: 0,
  }))

  incomes.forEach((income) => {
    const idx = Math.min(9, Math.floor((income - min) / binSize))
    bins[idx].count += 1
  })
  return bins
}

const enrollmentsByMonth = (rows) => {
  const counts = new Map()
  for (const row of rows) {
    const raw = getValue(row, 'dt_customer')
    if (!raw) continue
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) continue
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))
}

const campaignAcceptanceRates = (rows) => {
  const totals = Object.fromEntries(CAMPAIGN_COLUMNS.map((column) => [column, 0]))
  const rowCount = rows.length || 1
  for (const row of rows) {
    CAMPAIGN_COLUMNS.forEach((column) => {
      const value = toNumber(getValue(row, column))
      totals[column] += value ?? 0
    })
  }
  return CAMPAIGN_COLUMNS.map((column) => ({
    campaign: column,
    accepted: totals[column],
    rate: Number(((totals[column] / rowCount) * 100).toFixed(2)),
  }))
}

const sampleRows = (rows, maxSize) => {
  if (rows.length <= maxSize) return rows
  const sampled = []
  const step = rows.length / maxSize
  for (let i = 0; i < maxSize; i += 1) sampled.push(rows[Math.floor(i * step)])
  return sampled
}

const incomeVsSpendingScatter = (rows) =>
  rows
    .map((row) => {
      const income = toNumber(getValue(row, 'income'))
      if (income === null) return null
      const totalSpending = SPENDING_COLUMNS.reduce((sum, column) => {
        const value = toNumber(getValue(row, column))
        return sum + (value ?? 0)
      }, 0)
      return { income, spending: Number(totalSpending.toFixed(2)) }
    })
    .filter(Boolean)

const buildCharts = (rows) => {
  const sampledRows = sampleRows(rows, 500)
  return {
    avgSpendingByEducation: averageSpendingByEducation(rows),
    countByMaritalStatus: customerCountByMaritalStatus(rows),
    incomeDistribution: incomeHistogram(sampledRows),
    enrollmentByMonth: enrollmentsByMonth(rows),
    campaignRates: campaignAcceptanceRates(rows),
    incomeVsSpending: incomeVsSpendingScatter(sampledRows),
  }
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [error, setError] = useState('')
  const [uploadResult, setUploadResult] = useState(null)
  const [profile, setProfile] = useState(null)
  const [charts, setCharts] = useState(null)
  const [datasetId, setDatasetId] = useState('')
  const [educationFilters, setEducationFilters] = useState([])
  const [maritalFilters, setMaritalFilters] = useState([])
  const [maritalOptions, setMaritalOptions] = useState([])
  const [incomeMin, setIncomeMin] = useState(0)
  const [incomeMax, setIncomeMax] = useState(120000)
  const inputRef = useRef(null)
  const filterRequestId = useRef(0)

  const setFile = (file) => {
    setError('')
    setUploadResult(null)

    if (!file) {
      setSelectedFile(null)
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setSelectedFile(null)
      setError('Only CSV files are accepted.')
      return
    }

    setSelectedFile(file)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    setFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please choose a CSV file before uploading.')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)

    setIsUploading(true)
    setError('')
    setUploadResult(null)

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      })

      const responseBody = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(responseBody.detail || 'Upload failed. Please try again.')
      }

      setUploadResult(responseBody)
      setDatasetId(responseBody.dataset_id)
      setIsLoadingDashboard(true)
      setEducationFilters([])
      setMaritalFilters([])
      setIncomeMin(0)
      setIncomeMax(120000)

      const profileResponse = await fetch(`${API_BASE_URL}/profile/${responseBody.dataset_id}`)
      const profileBody = await profileResponse.json().catch(() => ({}))
      if (!profileResponse.ok) {
        throw new Error(profileBody.detail || 'Failed to load dataset profile.')
      }
      setProfile(profileBody)

      const filterResponse = await fetch(`${API_BASE_URL}/filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: responseBody.dataset_id }),
      })
      const filterBody = await filterResponse.json().catch(() => ({}))
      if (!filterResponse.ok) {
        throw new Error(filterBody.detail || 'Failed to load dataset rows.')
      }

      const allRows = Array.isArray(filterBody.rows) ? filterBody.rows : []
      setCharts(buildCharts(allRows))
      const maritalFromData = Array.from(
        new Set(allRows.map((row) => getValue(row, 'marital_status')).filter(Boolean)),
      ).map((value) => value.toString())
      setMaritalOptions(maritalFromData.sort((a, b) => a.localeCompare(b)))
    } catch (uploadError) {
      setError(uploadError.message || 'Unexpected error while uploading file.')
      setProfile(null)
      setCharts(null)
      setDatasetId('')
    } finally {
      setIsUploading(false)
      setIsLoadingDashboard(false)
    }
  }

  useEffect(() => {
    if (!datasetId) return

    const applyFilters = async () => {
      setIsLoadingDashboard(true)
      const requestId = filterRequestId.current + 1
      filterRequestId.current = requestId

      const payload = { dataset_id: datasetId }
      if (educationFilters.length || maritalFilters.length) {
        payload.categorical_filters = {}
        if (educationFilters.length) payload.categorical_filters.Education = educationFilters
        if (maritalFilters.length) payload.categorical_filters.Marital_Status = maritalFilters
      }
      if (incomeMin > 0 || incomeMax < 120000) {
        payload.numeric_range = {
          Income: { min: incomeMin, max: incomeMax },
        }
      }

      try {
        const response = await fetch(`${API_BASE_URL}/filter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const responseBody = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(responseBody.detail || 'Failed to apply filters.')
        }

        if (filterRequestId.current !== requestId) return
        const rows = Array.isArray(responseBody.rows) ? responseBody.rows : []
        setCharts(buildCharts(rows))
      } catch (filterError) {
        if (filterRequestId.current !== requestId) return
        setError(filterError.message || 'Failed to refresh dashboard with filters.')
      } finally {
        if (filterRequestId.current === requestId) setIsLoadingDashboard(false)
      }
    }

    applyFilters()
  }, [datasetId, educationFilters, maritalFilters, incomeMin, incomeMax])

  const clearAllFilters = () => {
    setEducationFilters([])
    setMaritalFilters([])
    setIncomeMin(0)
    setIncomeMax(120000)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight">DataLens</h1>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl p-6">
        <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-center text-2xl font-semibold">Upload CSV Dataset</h2>
          <p className="mt-2 text-center text-sm text-slate-500">
            Drag and drop your CSV file here, or click to browse.
          </p>

          <div
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`mt-6 cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0])}
            />
            <p className="text-sm font-medium text-slate-700">
              {selectedFile ? selectedFile.name : 'Drop CSV file here or click to select'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Maximum size: 50MB</p>
          </div>

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="inline-flex min-w-36 items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isUploading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Uploading...
                </span>
              ) : (
                'Upload CSV'
              )}
            </button>
          </div>

          {error && <p className="mt-4 text-center text-sm font-medium text-red-600">{error}</p>}

          {uploadResult && (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="font-semibold text-emerald-800">Upload successful</p>
              <p className="mt-2 text-emerald-900">
                <span className="font-medium">Filename:</span> {uploadResult.filename}
              </p>
              <p className="text-emerald-900">
                <span className="font-medium">Rows:</span> {uploadResult.row_count}
              </p>
              <p className="text-emerald-900">
                <span className="font-medium">Columns:</span> {uploadResult.column_count}
              </p>
            </div>
          )}
        </section>

        {isLoadingDashboard && (
          <div className="mt-8 flex items-center justify-center gap-2 text-slate-600">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            Building dashboard...
          </div>
        )}

        {profile && charts && (
          <section className="mt-8">
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p>
                Profile loaded: <span className="font-semibold">{profile.row_count}</span> rows and{' '}
                <span className="font-semibold">{profile.column_count}</span> columns.
              </p>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <aside className="w-full rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4 lg:w-72">
                <h3 className="text-sm font-semibold text-slate-700">Filters</h3>

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Education
                  </label>
                  <select
                    multiple
                    value={educationFilters}
                    onChange={(event) =>
                      setEducationFilters(
                        Array.from(event.target.selectedOptions, (option) => option.value),
                      )
                    }
                    className="h-32 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  >
                    {EDUCATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Marital Status
                  </label>
                  <select
                    multiple
                    value={maritalFilters}
                    onChange={(event) =>
                      setMaritalFilters(
                        Array.from(event.target.selectedOptions, (option) => option.value),
                      )
                    }
                    className="h-32 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  >
                    {maritalOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Income Range ({incomeMin} - {incomeMax})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="120000"
                    value={incomeMin}
                    onChange={(event) => {
                      const nextMin = Number(event.target.value)
                      setIncomeMin(Math.min(nextMin, incomeMax))
                    }}
                    className="w-full"
                  />
                  <input
                    type="range"
                    min="0"
                    max="120000"
                    value={incomeMax}
                    onChange={(event) => {
                      const nextMax = Number(event.target.value)
                      setIncomeMax(Math.max(nextMax, incomeMin))
                    }}
                    className="mt-2 w-full"
                  />
                </div>

                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Clear All Filters
                </button>
              </aside>

              <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-4 text-sm font-semibold text-slate-700">
                  1. Average Spending by Education
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.avgSpendingByEducation}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="education" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="wines" fill="#1d4ed8" />
                      <Bar dataKey="fruits" fill="#0f766e" />
                      <Bar dataKey="meat" fill="#9333ea" />
                      <Bar dataKey="fish" fill="#dc2626" />
                      <Bar dataKey="sweets" fill="#c2410c" />
                      <Bar dataKey="gold" fill="#0f172a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-4 text-sm font-semibold text-slate-700">
                  2. Customer Count by Marital Status
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.countByMaritalStatus}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="maritalStatus" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-4 text-sm font-semibold text-slate-700">
                  3. Income Distribution (10 bins)
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.incomeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range" interval={1} angle={-25} textAnchor="end" height={60} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0891b2" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-4 text-sm font-semibold text-slate-700">
                  4. Enrollment Count by Month
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={charts.enrollmentByMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-4 text-sm font-semibold text-slate-700">
                  5. Campaign Acceptance Rates
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.campaignRates}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="campaign" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="rate" name="Acceptance Rate (%)">
                        {charts.campaignRates.map((entry, index) => (
                          <Cell key={`${entry.campaign}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-4 text-sm font-semibold text-slate-700">
                  6. Income vs Total Spending (sampled)
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="income" name="Income" />
                      <YAxis dataKey="spending" name="Total Spending" />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter data={charts.incomeVsSpending} fill="#dc2626" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                </article>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
