import React, { useState } from 'react';

function Table({ columns, data, onRowClick, sortable = true }) {
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');

  const handleSort = (column) => {
    if (!sortable || !column.sortable) return;

    if (sortColumn === column.key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column.key);
      setSortDirection('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortColumn) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === bVal) return 0;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection]);

  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📭</div>
        <h3 className="empty-state-title">No data</h3>
        <p className="empty-state-description">There are no records to display</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead className="table-header">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="table-header-cell"
                onClick={() => handleSort(column)}
                style={{ cursor: column.sortable ? 'pointer' : 'default' }}
              >
                {column.label}
                {sortColumn === column.key && (
                  <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, index) => (
            <tr
              key={row.id || index}
              className="table-row"
              onClick={() => onRowClick && onRowClick(row)}
              style={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {columns.map((column) => (
                <td key={column.key} className="table-cell">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
