import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

const FileUpload = ({ onFileProcessed }) => {
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check if it's a text file
    if (file.type !== 'text/plain') {
      setError('Please upload a text file (.txt)');
      setFileName('');
      return;
    }

    setFileName(file.name);
    setLoading(true);
    setError('');

    try {
      const text = await file.text();
      const numbers = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line);

      // Validate numbers
      const invalidNumbers = [];
      const validNumbers = [];
      numbers.forEach((num, index) => {
        if (!num.startsWith('+')) {
          invalidNumbers.push({ number: num, reason: 'Missing "+" prefix', line: index + 1 });
          return;
        }
        if (!/^\+\d+$/.test(num)) {
          invalidNumbers.push({ number: num, reason: 'Contains invalid characters (only digits allowed after "+")', line: index + 1 });
          return;
        }
        const digitCount = num.length - 1;
        if (digitCount < 10 || digitCount > 15) {
          invalidNumbers.push({ number: num, reason: `Invalid length (${digitCount} digits). Must be between 10 and 15 digits after the "+"`, line: index + 1 });
          return;
        }
        validNumbers.push(num);
      });

      if (invalidNumbers.length > 0) {
        const errorMessage = `
          The following numbers are invalid:\n
          ${invalidNumbers.map(n => `Line ${n.line}: ${n.number} - ${n.reason}`).join('\n')}
          \n
          How to format phone numbers correctly:
          - Use the international format with a "+" prefix (e.g., +919876543210).
          - Include the country code (e.g., +91 for India, +1 for USA).
          - Use only digits after the "+" (no spaces, dashes, or other characters).
          - Ensure the total number of digits (including country code) is between 10 and 15.
          Example: +919876543210 (India) or +12025550123 (USA).
        `;
        alert(errorMessage);
        setError('Some numbers are invalid. Please fix them and try again.');
        return;
      }

      if (validNumbers.length === 0) {
        setError('No valid phone numbers found in the file');
        return;
      }

      onFileProcessed(validNumbers);
    } catch (err) {
      setError('Error reading file. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
      fileInputRef.current.value = null; // Reset file input
    }
  };

  return (
    <div className="file-upload">
      <div 
        className="upload-area"
        onClick={() => fileInputRef.current.click()}
      >
        <Upload size={32} />
        <p className="upload-text">
          {fileName || 'Upload a text file with phone numbers'}
        </p>
        <p className="upload-hint">One number per line (e.g., +919876543210)</p>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".txt"
          style={{ display: 'none' }}
        />
      </div>
      {loading && <p className="upload-status">Processing file...</p>}
      {error && <p className="upload-error">{error}</p>}
    </div>
  );
};

export default FileUpload;