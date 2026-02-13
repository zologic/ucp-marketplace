import React, { useEffect } from 'react';

function SlidePanel({ isOpen, onClose, title, children, footer, width = '500px' }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`slide-panel-overlay ${isOpen ? 'slide-panel-overlay-open' : ''}`}
        onClick={handleOverlayClick}
      ></div>

      {/* Slide Panel */}
      <div
        className={`slide-panel ${isOpen ? 'slide-panel-open' : ''}`}
        style={{ width }}
      >
        {/* Header */}
        <div className="slide-panel-header">
          <h3 className="slide-panel-title">{title}</h3>
          <button onClick={onClose} className="slide-panel-close">
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="slide-panel-body">
          {children}
        </div>

        {/* Footer - Sticky */}
        {footer && (
          <div className="slide-panel-footer">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

export default SlidePanel;
