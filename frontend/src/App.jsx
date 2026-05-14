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
const CHART_COLORS = ['#1d4ed8', '#0f766e', '#9333ea', '#dc2626', '#c2410c', '#64748b']
const EDUCATION_OPTIONS = ['Graduation', 'PhD', 'Master', 'Basic', '2n Cycle']

const formatApiDetail = (body) => {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === 'object' && item?.msg ? item.msg : JSON.stringify(item)))
      .join(' ')
  }
  return null
}

const normalizeKey = (value) => value?.toString().trim().toLowerCase() ?? ''

/** Match profile.columns[].column_name to logical aliases (case-insensitive); return exact API name. */
const findProfileColumnName = (profile, ...aliases) => {
  if (!profile?.columns?.length) return null
  const wanted = new Set(aliases.map((a) => normalizeKey(a)))
  for (const col of profile.columns) {
    if (wanted.has(normalizeKey(col.column_name))) {
      return col.column_name
    }
  }
  return null
}

/** Single source of truth: GET /profile column_name strings for row access and filter keys. */
const buildColumnRefs = (profile) => {
  if (!profile?.columns) return null
  const spending = {}
  for (const key of SPENDING_COLUMNS) {
    spending[key] = findProfileColumnName(profile, key)
  }
  const campaigns = {}
  for (const key of CAMPAIGN_COLUMNS) {
    campaigns[key] = findProfileColumnName(profile, key)
  }
  return {
    education: findProfileColumnName(profile, 'education'),
    maritalStatus: findProfileColumnName(profile, 'marital_status', 'marital status'),
    income: findProfileColumnName(profile, 'income'),
    dtCustomer: findProfileColumnName(profile, 'dt_customer', 'dt customer'),
    spending,
    campaigns,
  }
}

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const averageSpendingByEducation = (rows, refs) => {
  const edCol = refs?.education
  if (!edCol) return []
  const bucket = new Map()
  for (const row of rows) {
    const education = row[edCol] ?? 'Unknown'
    const key = education.toString()
    if (!bucket.has(key)) {
      bucket.set(key, { education: key, sums: {}, count: 0 })
      SPENDING_COLUMNS.forEach((canonicalKey) => {
        bucket.get(key).sums[canonicalKey] = 0
      })
    }
    const entry = bucket.get(key)
    entry.count += 1
    SPENDING_COLUMNS.forEach((canonicalKey) => {
      const dbCol = refs?.spending?.[canonicalKey]
      const numeric = dbCol ? toNumber(row[dbCol]) : null
      entry.sums[canonicalKey] += numeric ?? 0
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

const customerCountByMaritalStatus = (rows, refs) => {
  const col = refs?.maritalStatus
  if (!col) return []
  const counts = new Map()
  for (const row of rows) {
    const status = row[col] ?? 'Unknown'
    const key = status.toString()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([maritalStatus, count]) => ({ maritalStatus, count }))
}

const incomeHistogram = (rows, refs) => {
  const col = refs?.income
  if (!col) return []
  const incomes = rows
    .map((row) => toNumber(row[col]))
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

const enrollmentsByMonth = (rows, refs) => {
  const col = refs?.dtCustomer
  if (!col) return []
  const counts = new Map()
  for (const row of rows) {
    const raw = row[col]
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

const campaignAcceptanceRates = (rows, refs) => {
  const totals = Object.fromEntries(CAMPAIGN_COLUMNS.map((column) => [column, 0]))
  const rowCount = rows.length || 1
  for (const row of rows) {
    CAMPAIGN_COLUMNS.forEach((canonicalKey) => {
      const dbCol = refs?.campaigns?.[canonicalKey]
      const value = dbCol ? toNumber(row[dbCol]) : null
      totals[canonicalKey] += value ?? 0
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

const incomeVsSpendingScatter = (rows, refs) => {
  const incCol = refs?.income
  if (!incCol) return []
  return rows
    .map((row) => {
      const income = toNumber(row[incCol])
      if (income === null) return null
      const totalSpending = SPENDING_COLUMNS.reduce((sum, canonicalKey) => {
        const dbCol = refs?.spending?.[canonicalKey]
        const value = dbCol ? toNumber(row[dbCol]) : null
        return sum + (value ?? 0)
      }, 0)
      return { income, spending: Number(totalSpending.toFixed(2)) }
    })
    .filter(Boolean)
}

const emptyCharts = () => ({
  avgSpendingByEducation: [],
  countByMaritalStatus: [],
  incomeDistribution: [],
  enrollmentByMonth: [],
  campaignRates: [],
  incomeVsSpending: [],
})

const buildCharts = (rows, refs) => {
  if (!refs) return emptyCharts()
  const sampledRows = sampleRows(rows, 500)
  return {
    avgSpendingByEducation: averageSpendingByEducation(rows, refs),
    countByMaritalStatus: customerCountByMaritalStatus(rows, refs),
    incomeDistribution: incomeHistogram(sampledRows, refs),
    enrollmentByMonth: enrollmentsByMonth(rows, refs),
    campaignRates: campaignAcceptanceRates(rows, refs),
    incomeVsSpending: incomeVsSpendingScatter(sampledRows, refs),
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
  const [filteredRowCount, setFilteredRowCount] = useState(null)
  const [columnRefs, setColumnRefs] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [isSummaryLoading, setIsSummaryLoading] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)
  const inputRef = useRef(null)
  const filterRequestId = useRef(0)
  const chatScrollRef = useRef(null)

  useEffect(() => {
    const root = chatScrollRef.current
    if (!root) return
    root.scrollTop = root.scrollHeight
  }, [chatMessages, isChatLoading])

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

  const loadDatasetById = async (nextDatasetId, metadata = null) => {
    setDatasetId(nextDatasetId)
    setColumnRefs(null)
    setIsLoadingDashboard(true)
    setError('')
    setEducationFilters([])
    setMaritalFilters([])
    setIncomeMin(0)
    setIncomeMax(120000)
    setChatMessages([])
    setChatInput('')
    setSummaryText('')

    const profileResponse = await fetch(`${API_BASE_URL}/profile/${nextDatasetId}`)
    const profileBody = await profileResponse.json().catch(() => ({}))
    if (!profileResponse.ok) {
      throw new Error(formatApiDetail(profileBody) || 'Failed to load dataset profile.')
    }
    setProfile(profileBody)
    const refs = buildColumnRefs(profileBody)
    setColumnRefs(refs)

    const filterResponse = await fetch(`${API_BASE_URL}/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_id: nextDatasetId }),
    })
    const filterBody = await filterResponse.json().catch(() => ({}))
    if (!filterResponse.ok) {
      throw new Error(formatApiDetail(filterBody) || 'Failed to load dataset rows.')
    }

    const allRows = Array.isArray(filterBody.rows) ? filterBody.rows : []
    setFilteredRowCount(
      typeof filterBody.total_count === 'number' ? filterBody.total_count : allRows.length,
    )
    setCharts(buildCharts(allRows, refs))
    const mCol = refs?.maritalStatus
    const maritalFromData = mCol
      ? Array.from(new Set(allRows.map((row) => row[mCol]).filter(Boolean))).map((value) =>
          value.toString(),
        )
      : []
    setMaritalOptions(maritalFromData.sort((a, b) => a.localeCompare(b)))

    if (metadata) {
      setUploadResult({
        dataset_id: metadata.dataset_id,
        filename: metadata.filename,
        row_count: metadata.row_count,
        column_count: profileBody.column_count,
      })
    }
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
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      })

      const responseBody = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(formatApiDetail(responseBody) || 'Upload failed. Please try again.')
      }

      setUploadResult(responseBody)
      await loadDatasetById(responseBody.dataset_id, responseBody)
    } catch (uploadError) {
      const fallback =
        uploadError instanceof TypeError && uploadError.message === 'Failed to fetch'
          ? `Could not reach the API at ${API_BASE_URL}. Start the backend (e.g. uvicorn) and ensure the URL matches.`
          : uploadError.message || 'Unexpected error while uploading file.'
      setError(fallback)
      setProfile(null)
      setCharts(null)
      setDatasetId('')
      setFilteredRowCount(null)
      setColumnRefs(null)
      setSummaryText('')
    } finally {
      setIsUploading(false)
      setIsLoadingDashboard(false)
    }
  }

  useEffect(() => {
    if (hasInitialized) return

    const initializeFromDatasets = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/datasets`)
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(formatApiDetail(body) || 'Failed to load previous datasets.')
        }
        const datasets = Array.isArray(body.datasets) ? body.datasets : []
        if (datasets.length > 0) {
          await loadDatasetById(datasets[0].dataset_id, datasets[0])
        }
      } catch (initError) {
        setError(initError.message || 'Could not restore previous dataset.')
      } finally {
        setHasInitialized(true)
        setIsLoadingDashboard(false)
      }
    }

    initializeFromDatasets()
  }, [hasInitialized])

  useEffect(() => {
    if (!datasetId || !columnRefs) return

    const applyFilters = async () => {
      setIsLoadingDashboard(true)
      const requestId = filterRequestId.current + 1
      filterRequestId.current = requestId

      const payload = { dataset_id: datasetId }
      if (educationFilters.length || maritalFilters.length) {
        payload.categorical_filters = {}
        if (educationFilters.length && columnRefs.education) {
          payload.categorical_filters[columnRefs.education] = educationFilters
        }
        if (maritalFilters.length && columnRefs.maritalStatus) {
          payload.categorical_filters[columnRefs.maritalStatus] = maritalFilters
        }
        if (Object.keys(payload.categorical_filters).length === 0) {
          delete payload.categorical_filters
        }
      }
      if (columnRefs.income) {
        payload.numeric_range = {
          [columnRefs.income]: { min: incomeMin, max: incomeMax },
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
          throw new Error(formatApiDetail(responseBody) || 'Failed to apply filters.')
        }

        if (filterRequestId.current !== requestId) return
        const rows = Array.isArray(responseBody.rows) ? responseBody.rows : []
        setError('')
        setFilteredRowCount(
          typeof responseBody.total_count === 'number' ? responseBody.total_count : rows.length,
        )
        setCharts(buildCharts(rows, columnRefs))
      } catch (filterError) {
        if (filterRequestId.current !== requestId) return
        setError(filterError.message || 'Failed to refresh dashboard with filters.')
      } finally {
        if (filterRequestId.current === requestId) setIsLoadingDashboard(false)
      }
    }

    applyFilters()
  }, [datasetId, educationFilters, maritalFilters, incomeMin, incomeMax, columnRefs])

  const clearAllFilters = () => {
    setEducationFilters([])
    setMaritalFilters([])
    setIncomeMin(0)
    setIncomeMax(999999)
  }

  const handleSendChat = async () => {
    if (!datasetId || !chatInput.trim()) return

    const userMessage = { role: 'user', content: chatInput.trim() }
    const nextMessages = [...chatMessages, userMessage]
    setChatMessages(nextMessages)
    setChatInput('')
    setIsChatLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: datasetId,
          message: userMessage.content,
          history: chatMessages,
        }),
      })
      const responseBody = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(formatApiDetail(responseBody) || 'Failed to get assistant response.')
      }

      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: responseBody.answer || 'No answer returned.' },
      ])
    } catch (chatError) {
      const fallback =
        chatError instanceof TypeError && chatError.message === 'Failed to fetch'
          ? `Could not reach the API at ${API_BASE_URL}. Start the backend and ensure the URL matches.`
          : chatError.message || 'Chat request failed.'
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${fallback}` }])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleGenerateSummary = async () => {
    if (!datasetId) return
    setIsSummaryLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId }),
      })
      const responseBody = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(formatApiDetail(responseBody) || 'Failed to generate executive summary.')
      }
      setSummaryText(responseBody.summary || '')
    } catch (summaryError) {
      const fallback =
        summaryError instanceof TypeError && summaryError.message === 'Failed to fetch'
          ? `Could not reach the API at ${API_BASE_URL}. Start the backend and ensure the URL matches.`
          : summaryError.message || 'Executive summary request failed.'
      setError(fallback)
    } finally {
      setIsSummaryLoading(false)
    }
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
            role="button"
            tabIndex={0}
            aria-label="CSV file drop zone. Press Enter to open file picker."
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                inputRef.current?.click()
              }
            }}
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
              aria-label="Choose CSV file"
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
              aria-busy={isUploading}
              aria-label={isUploading ? 'Uploading CSV file' : 'Upload CSV'}
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
          <div
            className="mt-8 flex items-center justify-center gap-2 text-slate-600"
            role="status"
            aria-live="polite"
            aria-label="Loading dashboard"
          >
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
              {filteredRowCount != null &&
                (educationFilters.length > 0 ||
                  maritalFilters.length > 0 ||
                  incomeMin > 0 ||
                  incomeMax < 120000 ||
                  filteredRowCount !== profile.row_count) && (
                  <p className="mt-1 text-slate-600">
                    Charts use <span className="font-semibold">{filteredRowCount}</span> row
                    {filteredRowCount === 1 ? '' : 's'} after filters.
                  </p>
                )}
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
                    aria-label="Filter by education level"
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
                    aria-label="Filter by marital status"
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
                    max="999999"
                    value={incomeMin}
                    aria-label="Minimum income"
                    title="Minimum income"
                    onChange={(event) => {
                      const nextMin = Number(event.target.value)
                      setIncomeMin(Math.min(nextMin, incomeMax))
                    }}
                    className="w-full"
                  />
                  <input
                    type="range"
                    min="0"
                    max="999999"
                    value={incomeMax}
                    aria-label="Maximum income"
                    title="Maximum income"
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

              <div
                className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2"
                key={`charts-${datasetId}-${columnRefs?.education ?? ''}-${columnRefs?.maritalStatus ?? ''}-${columnRefs?.income ?? ''}-${[...educationFilters].sort().join(',')}-${[...maritalFilters].sort().join(',')}-${incomeMin}-${incomeMax}`}
              >
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

              <aside
                className="flex h-[880px] w-full flex-col rounded-xl border border-slate-200 bg-white lg:w-80"
                aria-label="Dataset chat assistant"
              >
                <div className="border-b border-slate-200 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-700">Chat Assistant</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Ask questions about the uploaded dataset. Press Enter to send; Shift+Enter adds a new line in
                    supporting clients.
                  </p>
                </div>

                <div
                  ref={chatScrollRef}
                  id="chat-messages"
                  className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                  aria-label="Chat messages"
                >
                  {chatMessages.length === 0 && (
                    <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500">
                      No messages yet. Try: "Which education group spends most on wines?"
                    </p>
                  )}
                  {chatMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                          message.role === 'user'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start" aria-busy="true">
                      <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                        Analyzing data...
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={2}
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          handleSendChat()
                        }
                      }}
                      placeholder="Ask about your data..."
                      aria-label="Chat message"
                      autoComplete="off"
                      className="max-h-32 min-h-[2.5rem] w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                    <button
                      type="button"
                      onClick={handleSendChat}
                      disabled={isChatLoading || !datasetId || !chatInput.trim()}
                      aria-label="Send chat message"
                      className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </aside>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-base font-semibold text-slate-800">Executive Summary</h3>
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={isSummaryLoading || !datasetId}
                  aria-busy={isSummaryLoading}
                  aria-label={
                    isSummaryLoading
                      ? 'Generating executive summary'
                      : 'Generate executive summary'
                  }
                  className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSummaryLoading ? 'Generating...' : 'Generate Executive Summary'}
                </button>
              </div>

              {isSummaryLoading && (
                <p className="mt-3 text-sm text-slate-600">Generating executive summary...</p>
              )}

              {!isSummaryLoading && summaryText && (
                <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                  {summaryText}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
