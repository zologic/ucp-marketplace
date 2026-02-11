import React from 'react';

function Button({
  variant = 'primary',
  size = 'md',
  onClick,
  children,
  disabled = false,
  type = 'button',
  className = ''
}) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  const variantClass = variant === 'secondary' ? 'btn-secondary'
    : variant === 'danger' ? 'btn-danger'
    : variant === 'success' ? 'btn-success'
    : variant === 'outline' ? 'btn-outline'
    : 'btn-primary';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn ${variantClass} ${sizeClass} ${className}`}
    >
      {children}
    </button>
  );
}

export default Button;
