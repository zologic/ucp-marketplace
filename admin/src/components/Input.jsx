import React from 'react';

function Input({
  type = 'text',
  value,
  onChange,
  label,
  error,
  placeholder,
  required = false,
  disabled = false,
  name
}) {
  return (
    <div className="form-group">
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`form-input ${error ? 'error' : ''}`}
      />
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}

export default Input;
