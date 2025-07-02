import React from 'react';

function QRCodeDisplay({ qrCode }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Scan QR Code</h2>
      </div>
      <div className="card-body" style={{ textAlign: 'center' }}>
        {qrCode ? (
          <img
            src={qrCode}
            alt="WhatsApp QR Code"
            style={{ maxWidth: '300px', width: '100%', marginBottom: '1rem' }}
          />
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>Waiting for QR code...</p>
        )}
        <p style={{ color: 'var(--text-secondary)' }}>
          Open WhatsApp on your phone, go to Settings &gt; Linked Devices, and scan the QR code to authenticate.
        </p>
      </div>
    </div>
  );
}

export default QRCodeDisplay;