import { fireEvent, render, screen } from '@testing-library/react'
import FilterPanel from '../components/FilterPanel'

const profileWithIncome = {
  columns: [
    {
      column_name: 'education',
      detected_type: 'categorical',
      top_values: [{ value: 'PhD', count: 10 }],
    },
    { column_name: 'income', detected_type: 'numeric', min: 10000, max: 90000 },
  ],
}

describe('FilterPanel', () => {
  it('renders headings, default education options, and Clear All', () => {
    const onFilterChange = vi.fn()
    render(
      <FilterPanel profile={profileWithIncome} datasetId="ds1" onFilterChange={onFilterChange} />,
    )

    expect(screen.getByRole('heading', { name: /filters/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /phd/i })).toBeInTheDocument()
    expect(screen.getByText(/no marital status values/i)).toBeInTheDocument()
  })

  it('matches Education column case-insensitively and toggles filters', () => {
    const onFilterChange = vi.fn()
    render(
      <FilterPanel profile={profileWithIncome} datasetId="ds1" onFilterChange={onFilterChange} />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /phd/i }))
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset_id: 'ds1',
        categorical_filters: { Education: ['PhD'] },
      }),
    )
  })
})
