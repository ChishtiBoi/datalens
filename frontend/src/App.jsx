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
import Upload from './components/Upload'

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
  if (!edCol) return[]
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
  if (!col) return[]
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
  if (!col) return[]
  const incomes = rows
    .map((row) => toNumber(row[col]))
    .filter((value) => value !== null)
  if (!incomes.length) return[]

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
  if (!col) return[]
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
  const sampled =[]
  const step = rows.length / maxSize
  for (let i = 0; i < maxSize; i += 1) sampled.push(rows[Math.floor(i * step)])
  return sampled
}

const incomeVsSpendingScatter = (rows, refs) => {
  const incCol = refs?.income
  if (!incCol) return[]
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
  avgSpendingByEducation:[],
  countByMaritalStatus: [],
  incomeDistribution: [],
  enrollmentByMonth:[],
  campaignRates: [],
  incomeVsSpending:[],
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

    const allRows = Array.isArray(filterBody.rows) ? filterBody.rows :[]
    setFilteredRowCount(
      typeof filterBody.total_count === 'number' ? filterBody.total_count : allRows.length,
    )
    setCharts(buildCharts(allRows, refs))
    const mCol = refs?.maritalStatus
    const maritalFromData = mCol
      ? Array.from(new Set(allRows.map((row) => row[mCol]).filter(Boolean))).map((value) =>
          value.toString(),
        )
      :[]
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

  const handleUpload = async (directFile = null) => {
    const activeFile = (directFile && directFile.name) ? directFile : selectedFile;

    if (!activeFile) {
      setError('Please choose a CSV file before uploading.')
      return
    }

    const formData = new FormData()
    formData.append('file', activeFile)

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
        const datasets = Array.isArray(body.datasets) ? body.datasets :[]
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
        const rows = Array.isArray(responseBody.rows) ? responseBody.rows :[]
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
          <h1 className="text-xl font-bold tracking-tight text-indigo-600">DataLens</h1>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl p-6">
        
        {/* NEW UPLOAD SECTION INTEGRATION */}
        <section className="mx-auto w-full max-w-2xl">
          <Upload 
            onFileUpload={(file) => {
              setFile(file);
              handleUpload(file);
            }} 
          />
          
          {isUploading && (
            <div className="mt-4 flex items-center justify-center gap-3 text-indigo-600 font-medium bg-indigo-50 py-3 rounded-xl border border-indigo-100 shadow-sm">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              Uploading and analyzing dataset...
            </div>
          )}

<<<<<<< HEAD
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
=======
          {error && <p className="mt-4 text-center text-sm font-medium text-red-600 bg-red-50 py-2 rounded-lg border border-red-100">{error}</p>}
>>>>>>> 68128ac51a0b8341ff82e37e6b7f440deeb5805c

          {uploadResult && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 backdrop-blur-sm p-4 text-sm shadow-sm">
              <p className="font-semibold text-emerald-800 mb-2">✅ Upload successful</p>
              <div className="flex justify-between text-emerald-900 bg-white/60 px-4 py-2 rounded-lg">
                <p><span className="font-bold">File:</span> {uploadResult.filename}</p>
                <p><span className="font-bold">Rows:</span> {uploadResult.row_count}</p>
                <p><span className="font-bold">Columns:</span> {uploadResult.column_count}</p>
              </div>
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
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
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
                    Charts use <span className="font-semibold text-indigo-600">{filteredRowCount}</span> row
                    {filteredRowCount === 1 ? '' : 's'} after filters.
                  </p>
                )}
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <aside className="w-full rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4 lg:w-72 shadow-sm">
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
                    className="h-32 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
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
                    className="h-32 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
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
                    className="w-full accent-indigo-600"
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
                    className="mt-2 w-full accent-indigo-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                >
                  Clear All Filters
                </button>
              </aside>

              <div
                className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2"
                key={`charts-${datasetId}-${columnRefs?.education ?? ''}-${columnRefs?.maritalStatus ?? ''}-${columnRefs?.income ?? ''}-${[...educationFilters].sort().join(',')}-${[...maritalFilters].sort().join(',')}-${incomeMin}-${incomeMax}`}
              >
                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="mb-4 text-sm font-semibold text-slate-800">
                  1. Average Spending by Education
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.avgSpendingByEducation}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="education" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                      <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Legend wrapperStyle={{fontSize: '12px'}} />
                      <Bar dataKey="wines" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="fruits" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="meat" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="fish" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="sweets" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="gold" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="mb-4 text-sm font-semibold text-slate-800">
                  2. Customer Count by Marital Status
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.countByMaritalStatus}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="maritalStatus" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                      <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="mb-4 text-sm font-semibold text-slate-800">
                  3. Income Distribution (10 bins)
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.incomeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="range" interval={1} angle={-25} textAnchor="end" height={60} tick={{fill: '#64748b', fontSize: 11}} axisLine={false} tickLine={false} />
                      <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="mb-4 text-sm font-semibold text-slate-800">
                  4. Enrollment Count by Month
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={charts.enrollmentByMonth}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                      <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={3} activeDot={{r: 6}} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="mb-4 text-sm font-semibold text-slate-800">
                  5. Campaign Acceptance Rates
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.campaignRates}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="campaign" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                      <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="rate" name="Acceptance Rate (%)" radius={[6, 6, 0, 0]}>
                        {charts.campaignRates.map((entry, index) => (
                          <Cell key={`${entry.campaign}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="mb-4 text-sm font-semibold text-slate-800">
                  6. Income vs Total Spending (sampled)
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="income" name="Income" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                      <YAxis dataKey="spending" name="Total Spending" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                      <Tooltip cursor={{ strokeDasharray: '3 3', stroke: '#cbd5e1' }} />
                      <Scatter data={charts.incomeVsSpending} fill="#f43f5e" fillOpacity={0.7} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                </article>
              </div>

<<<<<<< HEAD
              <aside
                className="flex h-[880px] w-full flex-col rounded-xl border border-slate-200 bg-white lg:w-80"
                aria-label="Dataset chat assistant"
              >
                <div className="border-b border-slate-200 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-700">Chat Assistant</h3>
=======
              <aside className="flex h-[880px] w-full flex-col rounded-xl border border-slate-200 bg-white lg:w-80 shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3 bg-slate-50/50 rounded-t-xl">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                    Chat Assistant
                  </h3>
>>>>>>> 68128ac51a0b8341ff82e37e6b7f440deeb5805c
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
                    <p className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700 text-center">
                      No messages yet. Try: "Which education group spends most on wines?"
                    </p>
                  )}
                  {chatMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                          message.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-tr-none'
                            : 'bg-slate-100 text-slate-800 rounded-tl-none'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
<<<<<<< HEAD
                    <div className="flex justify-start" aria-busy="true">
                      <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                        Analyzing data...
=======
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-tl-none bg-slate-100 px-4 py-2 text-sm text-slate-500 flex items-center gap-2">
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s'}}></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s'}}></span>
>>>>>>> 68128ac51a0b8341ff82e37e6b7f440deeb5805c
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
<<<<<<< HEAD
                      aria-label="Chat message"
                      autoComplete="off"
                      className="max-h-32 min-h-[2.5rem] w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
=======
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
>>>>>>> 68128ac51a0b8341ff82e37e6b7f440deeb5805c
                    />
                    <button
                      type="button"
                      onClick={handleSendChat}
<<<<<<< HEAD
                      disabled={isChatLoading || !datasetId || !chatInput.trim()}
                      aria-label="Send chat message"
                      className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
=======
                      disabled={isChatLoading || !datasetId}
                      className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-indigo-700 transition-colors"
>>>>>>> 68128ac51a0b8341ff82e37e6b7f440deeb5805c
                    >
                      Send
                    </button>
                  </div>
                </div>
              </aside>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                  Executive Summary
                </h3>
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={isSummaryLoading || !datasetId}
<<<<<<< HEAD
                  aria-busy={isSummaryLoading}
                  aria-label={
                    isSummaryLoading
                      ? 'Generating executive summary'
                      : 'Generate executive summary'
                  }
                  className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
=======
                  className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 hover:bg-slate-800 transition-colors"
>>>>>>> 68128ac51a0b8341ff82e37e6b7f440deeb5805c
                >
                  {isSummaryLoading ? 'Generating...' : 'Generate Executive Summary'}
                </button>
              </div>

              {isSummaryLoading && (
                <p className="mt-4 text-sm text-indigo-600 flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                  Generating AI executive summary...
                </p>
              )}

              {!isSummaryLoading && summaryText && (
                <div className="mt-5 rounded-xl bg-slate-50 p-5 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap border border-slate-100">
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
