import { useRef, useState } from 'react'

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [uploadResult, setUploadResult] = useState(null)
  const inputRef = useRef(null)

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
    } catch (uploadError) {
      setError(uploadError.message || 'Unexpected error while uploading file.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight">DataLens</h1>
        </div>
      </nav>

      <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-5xl items-center justify-center p-6">
        <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
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
      </main>
    </div>
  )
}

export default App
