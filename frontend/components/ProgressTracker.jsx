import React from 'react';

const ProgressTracker = ({ status }) => {
  const { total, sent, failed, logs } = status;

  return (
    <div className="progress-tracker">
      <h3>Sending Progress</h3>
      <p>Total: {total}</p>
      <p>Sent: {sent}</p>
      <p>Failed: {failed}</p>
      {logs && logs.length > 0 && (
        <div className="logs">
          <h4>Logs:</h4>
          <ul>
            {logs.map((log, index) => (
              <li key={index}>{log}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ProgressTracker;