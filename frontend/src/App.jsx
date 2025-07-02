import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { Phone, FileText, Image, Send } from 'lucide-react';
import './App.css';
import Navbar from '/./WhatsappSender/frontend/components/Navbar.jsx';
import FileUpload from '/./WhatsappSender/frontend/components/FileUpload.jsx';
import MessageInput from '/./WhatsappSender/frontend/components/MessageInput.jsx';
import ImageUpload from '/./WhatsappSender/frontend/components/ImageUpload.jsx';
import QRCodeDisplay from '/./WhatsappSender/frontend/components/QRCodeDisplay.jsx';
import ProgressTracker from '/./WhatsappSender/frontend/components/ProgressTracker.jsx';


const socket = io('http://localhost:3000', { 
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

function App() {
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [message, setMessage] = useState('');
  const [images, setImages] = useState([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [progress, setProgress] = useState({ total: 0, sent: 0, failed: 0, logs: [] });

  useEffect(() => {
    const fetchQrCode = async (retries = 5, delay = 2000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const qrRes = await axios.get('http://localhost:3000/qr');
          if (qrRes.data.qr) {
            setQrCode(qrRes.data.qr);
            return true;
          }
        } catch (err) {
          console.error(`Attempt ${attempt} to fetch QR code failed:`, err.message);
        }
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      setStatus({ type: 'error', message: 'Failed to fetch QR code after multiple attempts.' });
      return false;
    };

    const checkAuth = async () => {
      try {
        const res = await axios.get('http://localhost:3000/auth-status');
        console.log('Auth status response:', res.data);
        setAuthenticated(res.data.authenticated);
        if (!res.data.authenticated) {
          await fetchQrCode();
        }
      } catch (err) {
        console.error('Auth check error:', err);
        setStatus({ type: 'error', message: 'Failed to check authentication status.' });
      }
    };
    checkAuth();

    const authCheckInterval = setInterval(() => {
      if (!authenticated) {
        console.log('Periodically checking auth status...');
        checkAuth();
      }
    }, 5000);

    socket.on('connect', () => {
      console.log('WebSocket connected');
      checkAuth();
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected, attempting to reconnect...');
    });

    socket.on('qr', (qr) => {
      console.log('Received QR code via WebSocket:', qr);
      setQrCode(qr);
    });

    socket.on('auth-status', (data) => {
      console.log('Received auth-status event:', data);
      setAuthenticated(data.authenticated);
      if (!data.authenticated) {
        setQrCode(null);
        fetchQrCode();
      } else {
        setProgress({ total: 0, sent: 0, failed: 0, logs: [] });
      }
    });

    socket.on('status-update', (data) => {
      console.log('Received status-update event:', data);
      setProgress(data);
      if (data.logs && data.logs.length > 0) {
        const errorLogs = data.logs.filter(log => log.includes('Invalid') || log.includes('Failed') || log.includes('Unsupported'));
        if (errorLogs.length > 0) {
          setStatus({
            type: 'error',
            message: errorLogs.join('\n'),
          });
        } else {
          setStatus({
            type: 'info',
            message: `Progress: ${data.sent} sent, ${data.failed} failed`,
          });
        }
      }
      if (data.message) {
        setStatus({
          type: data.message.includes('Completed') ? 'success' : 'info',
          message: data.message,
        });
      }
    });

    return () => {
      clearInterval(authCheckInterval);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('qr');
      socket.off('auth-status');
      socket.off('status-update');
      socket.disconnect();
    };
  }, []);

  const handleFileUpload = (numbers) => {
    console.log('Numbers loaded:', numbers);
    setPhoneNumbers(numbers);
    setStatus({
      type: 'success',
      message: `Loaded ${numbers.length} phone numbers from file`,
    });
  };

  const handleMessageChange = (text) => {
    setMessage(text);
  };

  const handleImageUpload = (uploadedImages) => {
    setImages([...images, ...uploadedImages]);
  };

  const handleImageRemove = (index) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
  };

  const handleSendMessages = async () => {
    if (!authenticated) {
      setStatus({
        type: 'error',
        message: 'Please authenticate with WhatsApp first by scanning the QR code.',
      });
      return;
    }

    if (phoneNumbers.length === 0) {
      setStatus({
        type: 'error',
        message: 'Please upload a list of phone numbers first.',
      });
      return;
    }

    if (!message.trim()) {
      setStatus({
        type: 'error',
        message: 'Please enter a message to send.',
      });
      return;
    }

    const invalidNumbers = [];
    phoneNumbers.forEach((num, index) => {
      if (!num.startsWith('+')) {
        invalidNumbers.push({ number: num, reason: 'Missing "+" prefix', index });
        return;
      }
      if (!/^\+\d+$/.test(num)) {
        invalidNumbers.push({ number: num, reason: 'Contains invalid characters (only digits allowed after "+")', index });
        return;
      }
      const digitCount = num.length - 1;
      if (digitCount < 10 || digitCount > 15) {
        invalidNumbers.push({ number: num, reason: `Invalid length (${digitCount} digits). Must be between 10 and 15 digits after the "+"`, index });
      }
    });

    if (invalidNumbers.length > 0) {
      const errorMessage = `
        The following numbers are invalid:\n
        ${invalidNumbers.map(n => `Number ${n.index + 1}: ${n.number} - ${n.reason}`).join('\n')}
        \n
        How to format phone numbers correctly:
        - Use the international format with a "+" prefix (e.g., +919876543210).
        - Include the country code (e.g., +91 for India, +1 for USA).
        - Use only digits after the "+" (no spaces, dashes, or other characters).
        - Ensure the total number of digits (including country code) is between 10 and 15.
        Example: +919876543210 (India) or +12025550123 (USA).
      `;
      alert(errorMessage);
      return;
    }

    setSending(true);
    setStatus(null);

    const formData = new FormData();
    formData.append('message', message);
    const numbersString = phoneNumbers.join(',');
    formData.append('numbers', numbersString);
    console.log('Sending numbers:', numbersString);
    images.forEach((image) => formData.append('media', image));

    try {
      await axios.post('http://localhost:3000/send', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.error || 'Failed to start sending.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="app-container">
      <Navbar />
      <main className="main-content">
        <div className="hero-section">
          <h1>WhatsApp Automated Message Sender</h1>
          <p>Send bulk messages to your contacts with just a few clicks</p>
        </div>

        {authenticated ? (
          <div className="sender-container">
            <div className="card">
              <div className="card-header">
                <FileText size={24} />
                <h2>Contact Numbers</h2>
              </div>
              <div className="card-body">
                <FileUpload onFileProcessed={handleFileUpload} />
                {phoneNumbers.length > 0 ? (
                  <div className="number-preview">
                    <p>{phoneNumbers.length} numbers loaded</p>
                    <div className="number-sample">
                      {phoneNumbers.slice(0, 3).map((num, idx) => (
                        <span key={idx}>
                          {num}
                          {idx < Math.min(2, phoneNumbers.length - 1) ? ', ' : ''}
                        </span>
                      ))}
                      {phoneNumbers.length > 3 && <span> ...</span>}
                    </div>
                  </div>
                ) : (
                  <p>No numbers loaded. Upload a .txt file with phone numbers in the format +[country code][number], e.g., +919876543210.</p>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <Phone size={24} />
                <h2>Message Content</h2>
              </div>
              <div className="card-body">
                <MessageInput value={message} onChange={handleMessageChange} />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <Image size={24} />
                <h2>Attach Images</h2>
              </div>
              <div className="card-body">
                <ImageUpload
                  images={images}
                  onUpload={handleImageUpload}
                  onRemove={handleImageRemove}
                />
              </div>
            </div>

            <div className="send-section">
              <button
                className="send-button"
                onClick={handleSendMessages}
                disabled={sending}
              >
                {sending ? 'Sending...' : 'Send Messages'}
                {!sending && <Send size={20} />}
              </button>
            </div>

            {status && (
              <div className={`status-message ${status.type}`}>
                <pre>{status.message}</pre>
              </div>
            )}

            <ProgressTracker status={progress} />
          </div>
        ) : (
          <QRCodeDisplay qrCode={qrCode} />
        )}
      </main>
    </div>
  );
}

export default App;