import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'

const makeJsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const profilePayload = {
  dataset_id: 'ds_1',
  row_count: 2240,
  column_count: 29,
  columns: [
    { column_name: 'education', detected_type: 'categorical', null_count: 0 },
    { column_name: 'marital_status', detected_type: 'categorical', null_count: 0 },
    { column_name: 'dt_customer', detected_type: 'datetime', null_count: 0 },
  ],
}

const rowsPayload = {
  rows: [
    {
      education: 'PhD',
      marital_status: 'Single',
      income: 50000,
      dt_customer: '2013-01-01',
      mntwines: 120,
      mntfruits: 30,
      mntmeatproducts: 220,
      mntfishproducts: 40,
      mntsweetproducts: 15,
      mntgoldprods: 12,
      acceptedcmp1: 1,
      acceptedcmp2: 0,
      acceptedcmp3: 0,
      acceptedcmp4: 1,
      acceptedcmp5: 0,
      response: 1,
    },
    {
      education: 'Graduation',
      marital_status: 'Married',
      income: 65000,
      dt_customer: '2013-02-01',
      mntwines: 160,
      mntfruits: 40,
      mntmeatproducts: 280,
      mntfishproducts: 60,
      mntsweetproducts: 25,
      mntgoldprods: 20,
      acceptedcmp1: 0,
      acceptedcmp2: 1,
      acceptedcmp3: 0,
      acceptedcmp4: 0,
      acceptedcmp5: 1,
      response: 0,
    },
  ],
}

describe('DataLens frontend', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url, options) => {
      if (url.endsWith('/datasets')) {
        return makeJsonResponse(200, { datasets: [] })
      }
      if (url.includes('/upload')) {
        return makeJsonResponse(200, {
          dataset_id: 'ds_1',
          filename: 'marketing.csv',
          row_count: 2240,
          column_count: 29,
        })
      }
      if (url.includes('/profile/ds_1')) {
        return makeJsonResponse(200, profilePayload)
      }
      if (url.endsWith('/filter') && options?.method === 'POST') {
        return makeJsonResponse(200, { dataset_id: 'ds_1', total_count: 2, ...rowsPayload })
      }
      if (url.endsWith('/chat')) {
        return makeJsonResponse(200, { answer: 'Mock answer' })
      }
      return makeJsonResponse(404, { detail: 'Not found in test mock' })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a file input for upload component', () => {
    const { container } = render(<App />)
    const fileInput = container.querySelector('input[type="file"]')
    expect(fileInput).toBeInTheDocument()
  })

  it('shows error message when upload fails', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/datasets')) return makeJsonResponse(200, { datasets: [] })
      if (url.includes('/upload')) return makeJsonResponse(400, { detail: 'Upload failed by test' })
      return makeJsonResponse(404, {})
    })

    const { container } = render(<App />)
    const fileInput = container.querySelector('input[type="file"]')
    const file = new File(['a,b\n1,2'], 'bad.csv', { type: 'text/csv' })

    fireEvent.change(fileInput, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /upload csv/i }))

    expect(await screen.findByText('Upload failed by test')).toBeInTheDocument()
  })

  it('renders dashboard when given profile data', async () => {
    global.fetch = vi.fn(async (url, options) => {
      if (url.endsWith('/datasets')) {
        return makeJsonResponse(200, {
          datasets: [{ dataset_id: 'ds_1', filename: 'marketing.csv', row_count: 2240 }],
        })
      }
      if (url.includes('/profile/ds_1')) return makeJsonResponse(200, profilePayload)
      if (url.endsWith('/filter') && options?.method === 'POST') {
        return makeJsonResponse(200, { dataset_id: 'ds_1', total_count: 2, ...rowsPayload })
      }
      return makeJsonResponse(404, {})
    })

    render(<App />)
    expect(await screen.findByText(/profile loaded:/i)).toBeInTheDocument()
    expect(screen.getByText(/average spending by education/i)).toBeInTheDocument()
  })

  it('renders Education multi-select with expected options', async () => {
    global.fetch = vi.fn(async (url, options) => {
      if (url.endsWith('/datasets')) {
        return makeJsonResponse(200, {
          datasets: [{ dataset_id: 'ds_1', filename: 'marketing.csv', row_count: 2240 }],
        })
      }
      if (url.includes('/profile/ds_1')) return makeJsonResponse(200, profilePayload)
      if (url.endsWith('/filter') && options?.method === 'POST') {
        return makeJsonResponse(200, { dataset_id: 'ds_1', total_count: 2, ...rowsPayload })
      }
      return makeJsonResponse(404, {})
    })

    render(<App />)
    await screen.findByRole('heading', { name: 'Filters' })

    const expectedOptions = ['Graduation', 'PhD', 'Master', 'Basic', '2n Cycle']
    expectedOptions.forEach((option) => {
      expect(screen.getByRole('option', { name: option })).toBeInTheDocument()
    })
  })

  it('renders chat input box and send button', async () => {
    global.fetch = vi.fn(async (url, options) => {
      if (url.endsWith('/datasets')) {
        return makeJsonResponse(200, {
          datasets: [{ dataset_id: 'ds_1', filename: 'marketing.csv', row_count: 2240 }],
        })
      }
      if (url.includes('/profile/ds_1')) return makeJsonResponse(200, profilePayload)
      if (url.endsWith('/filter') && options?.method === 'POST') {
        return makeJsonResponse(200, { dataset_id: 'ds_1', total_count: 2, ...rowsPayload })
      }
      return makeJsonResponse(404, {})
    })

    render(<App />)
    await screen.findByText(/chat assistant/i)
    expect(screen.getByPlaceholderText(/ask about your data/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })
})
