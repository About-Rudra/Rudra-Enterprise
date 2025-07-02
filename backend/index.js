const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const multer = require('multer');
const winston = require('winston');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const phoneNumber = require('libphonenumber-js');
const { Server } = require('socket.io');
const http = require('http');
const QRCode = require('qrcode');
const cors = require('cors');

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
fs.mkdir(logsDir, { recursive: true }).catch(err => console.error('Failed to create logs directory:', err));

// Logger setup with rotation
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logsDir, 'app.log'),
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 5, // Keep up to 5 rotated logs
        }),
        new winston.transports.Console()
    ]
});

// Configuration
const config = require('./config.json');

// Validate config
if (!config.numbersPath || !config.message || config.delayMin > config.delayMax || config.retryDelayMin > config.retryDelayMax) {
    logger.error('Invalid configuration in config.json');
    process.exit(1);
}

// Multer setup to preserve file extensions with file size limit
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uniqueSuffix}${ext}`);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 16 * 1024 * 1024 } // 16MB limit
});

// Express setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST']
    }
});

// Add CORS middleware
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    webVersion: '2.2412.54',
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// Add event listeners for debugging
client.on('loading_screen', (percent, message) => {
    logger.info(`Loading screen: ${percent}% - ${message}`);
});

client.on('auth_failure', (msg) => {
    logger.error(`Authentication failure: ${msg}`);
});

client.on('disconnected', (reason) => {
    logger.error(`Client disconnected: ${reason}`);
    isAuthenticated = false;
    io.emit('auth-status', { authenticated: false, message: `Disconnected: ${reason}` });
});

// Global state
let qrCodeData = null;
let isAuthenticated = false;
let sendingStatus = { total: 0, sent: 0, failed: 0, logs: [] };
let shouldStopSending = false;

// Utility functions
function validatePhoneNumber(number) {
    try {
        const parsed = phoneNumber.parsePhoneNumber(number, 'IN');
        logger.info(`Parsed number: ${number}, Country: ${parsed.country}, Valid: ${parsed.isValid()}`);
        if (!parsed.isValid()) {
            logger.error(`Number ${number} is invalid. Possible reason: ${parsed.isPossible() ? 'Not a valid number for the country' : 'Not a possible number'}`);
        }
        return parsed.isValid() ? parsed.number : null;
    } catch (err) {
        logger.error(`Error parsing number ${number}: ${err.message}`);
        return null;
    }
}

function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function validateMedia(filePath) {
    if (!filePath) return null;
    try {
        logger.info(`Validating media file: ${filePath}`);
        await fs.access(filePath);
        logger.info(`File exists: ${filePath}`);
        
        const stats = await fs.stat(filePath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        const ext = path.extname(filePath).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        const maxSize = isImage ? 5 : 16;
        if (fileSizeInMB > maxSize) {
            const errorMsg = `File too large: ${fileSizeInMB.toFixed(2)}MB. Max allowed is ${maxSize}MB for ${isImage ? 'images' : 'videos'}.`;
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }
        logger.info(`File size ${fileSizeInMB.toFixed(2)}MB is within limits`);
        
        const allowedExts = ['.jpg', '.jpeg', '.png', '.mp4', '.gif', '.webp'];
        if (!allowedExts.includes(ext)) {
            const errorMsg = `Unsupported file extension: ${ext}. Allowed extensions are: ${allowedExts.join(', ')}`;
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }
        logger.info(`File extension ${ext} is supported`);
        
        const media = MessageMedia.fromFilePath(filePath);
        logger.info(`Successfully loaded media: ${filePath}`);
        return media;
    } catch (err) {
        logger.error(`Media validation failed for ${filePath}: ${err.message}`);
        throw err;
    }
}

// Add message variation to make messages appear more human-like
function addMessageVariation(baseMessage) {
    const greetings = ['Hi', 'Hello', 'Hey', 'Greetings'];
    const closings = ['Thanks', 'Best regards', 'Cheers', 'Take care'];
    const variations = [
        baseMessage,
        `${baseMessage} How are you today?`,
        `${baseMessage} Hope you're doing well!`,
        `Just wanted to say: ${baseMessage}`,
    ];

    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    const randomClosing = closings[Math.floor(Math.random() * closings.length)];
    const randomVariation = variations[Math.floor(Math.random() * variations.length)];

    return `${randomGreeting}! ${randomVariation} ${randomClosing}.`;
}

// Simulate typing to mimic human behavior
async function simulateTyping(chatId) {
    try {
        await client.sendPresenceUpdate('composing', chatId);
        const typingDelay = getRandomDelay(1000, 3000); // 1-3 seconds of "typing"
        await new Promise(resolve => setTimeout(resolve, typingDelay));
        await client.sendPresenceUpdate('paused', chatId);
    } catch (err) {
        logger.error(`Failed to simulate typing for ${chatId}: ${err.message}`);
    }
}

// Check if the number is in your contacts
async function isInContacts(chatId) {
    try {
        const chat = await client.getChatById(chatId);
        const contact = await chat.getContact();
        return contact.isMyContact;
    } catch (err) {
        logger.error(`Failed to check contact status for ${chatId}: ${err.message}`);
        return false; // Assume not in contacts if there's an error
    }
}

async function sendMessageWithRetry(chatId, message, media, retries = config.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Simulate typing
            await simulateTyping(chatId);

            // Send the text message
            const variedMessage = addMessageVariation(message);
            await client.sendMessage(chatId, variedMessage);
            logger.info(`Sent text to ${chatId}: ${variedMessage}`);
            io.emit('status-update', { chatId, status: 'sent', message: `Text sent to ${chatId}` });

            // Send media if provided
            if (media) {
                await simulateTyping(chatId); // Simulate typing again for media
                await client.sendMessage(chatId, media);
                logger.info(`Sent media to ${chatId}`);
                io.emit('status-update', { chatId, status: 'sent', message: `Media sent to ${chatId}` });
            }
            return true;
        } catch (err) {
            logger.error(`Attempt ${attempt} failed for ${chatId}: ${err.message}`);
            io.emit('status-update', { chatId, status: 'failed', message: `Attempt ${attempt} failed for ${chatId}: ${err.message}` });
            if (attempt < retries) {
                const backoff = getRandomDelay(config.retryDelayMin, config.retryDelayMax) * attempt;
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }
    }
    return false;
}

async function processNumbers(numbers, message, mediaPath) {
    sendingStatus = { total: numbers.length, sent: 0, failed: 0, logs: [] };
    shouldStopSending = false;
    io.emit('status-update', sendingStatus);

    let media = null;
    try {
        media = await validateMedia(mediaPath);
    } catch (err) {
        sendingStatus.logs.push(`Media validation failed: ${err.message}`);
        io.emit('status-update', sendingStatus);
        return;
    }

    let sentCount = 0;
    for (let i = 0; i < numbers.length; i += config.batchSize) {
        if (shouldStopSending) {
            sendingStatus.logs.push('Stopped sending due to potential issues.');
            io.emit('status-update', { message: 'Sending stopped due to potential issues.', status: 'stopped' });
            break;
        }

        const batch = numbers.slice(i, i + config.batchSize);
        
        for (const number of batch) {
            if (sentCount >= config.maxMessagesPerSession) {
                const skipped = numbers.slice(i);
                logger.warn(`Max messages per session (${config.maxMessagesPerSession}) reached. Skipped: ${skipped.join(', ')}`);
                sendingStatus.logs.push(`Max messages per session (${config.maxMessagesPerSession}) reached. Skipped ${skipped.length} numbers.`);
                io.emit('status-update', { message: `Max messages per session reached. Skipped ${skipped.length} numbers.`, status: 'stopped' });
                return;
            }

            const validatedNumber = validatePhoneNumber(number);
            if (!validatedNumber) {
                logger.error(`Invalid number: ${number}`);
                sendingStatus.failed++;
                sendingStatus.logs.push(`Invalid number: ${number}`);
                io.emit('status-update', sendingStatus);
                continue;
            }

            const chatId = validatedNumber.replace('+', '') + '@c.us';

            // Only send to contacts to reduce ban risk
            const isContact = await isInContacts(chatId);
            if (!isContact) {
                logger.warn(`Skipping ${chatId}: Not in contacts`);
                sendingStatus.failed++;
                sendingStatus.logs.push(`Skipping ${chatId}: Not in contacts`);
                io.emit('status-update', sendingStatus);
                continue;
            }

            try {
                const success = await sendMessageWithRetry(chatId, message, media);
                if (success) {
                    sentCount++;
                    sendingStatus.sent++;
                    sendingStatus.logs.push(`Sent to ${chatId}`);
                } else {
                    sendingStatus.failed++;
                    sendingStatus.logs.push(`Failed to send to ${chatId}`);
                }
                io.emit('status-update', sendingStatus);
                
                // Longer delay to mimic human behavior
                const delay = getRandomDelay(config.delayMin, config.delayMax);
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (err) {
                logger.error(`Failed to process ${chatId}: ${err.message}`);
                sendingStatus.failed++;
                sendingStatus.logs.push(`Error for ${chatId}: ${err.message}`);
                io.emit('status-update', sendingStatus);

                // Check if the error indicates a block or spam report
                if (err.message.includes('blocked') || err.message.includes('spam')) {
                    logger.warn(`Possible block or spam report detected for ${chatId}. Stopping sending.`);
                    shouldStopSending = true;
                }
            }
        }
    }

    logger.info(`Processed ${sentCount} messages successfully.`);
    io.emit('status-update', { message: `Completed: ${sentCount} sent, ${sendingStatus.failed} failed` });

    if (mediaPath) {
        try {
            await fs.unlink(mediaPath);
            logger.info(`Deleted media file: ${mediaPath}`);
        } catch (err) {
            logger.error(`Failed to delete media file ${mediaPath}: ${err.message}`);
        }
    }
}

// Client event handlers
client.on('qr', async (qr) => {
    qrCodeData = await QRCode.toDataURL(qr);
    logger.info('QR code generated.');
    io.emit('qr', qrCodeData);
});

client.on('ready', () => {
    isAuthenticated = true;
    logger.info('WhatsApp client is ready.');
    io.emit('auth-status', { authenticated: true });
});

client.on('disconnected', async (reason) => {
    isAuthenticated = false;
    logger.error(`Client disconnected: ${reason}`);
    io.emit('auth-status', { authenticated: false, message: `Disconnected: ${reason}` });
});

// API endpoints
app.use(express.json());

// Rate limiting for the /send endpoint
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10 // Limit each IP to 10 requests per window
});
app.use('/send', limiter);

app.get('/qr', (req, res) => {
    if (isAuthenticated) {
        return res.json({ authenticated: true });
    }
    if (qrCodeData) {
        return res.json({ qr: qrCodeData });
    }
    res.status(503).json({ error: 'QR code not ready' });
});

app.get('/auth-status', (req, res) => {
    res.json({ authenticated: isAuthenticated });
});

app.post('/send', upload.single('media'), async (req, res) => {
    if (!isAuthenticated) {
        return res.status(401).json({ error: 'WhatsApp client not authenticated' });
    }

    const { message, numbers } = req.body;
    const mediaPath = req.file ? req.file.path : null;
    logger.info(`Uploaded file details: ${JSON.stringify(req.file)}`);

    if (!message || !numbers) {
        return res.status(400).json({ error: 'Message and numbers are required' });
    }

    // Avoid promotional content
    if (message.toLowerCase().includes('http') || message.toLowerCase().includes('www') || message.toLowerCase().includes('buy') || message.toLowerCase().includes('discount')) {
        return res.status(400).json({ error: 'Message contains promotional content (e.g., links, "buy", "discount"). This may lead to a ban.' });
    }

    logger.info(`Received numbers: ${numbers}`);
    let numberList = [];
    if (typeof numbers === 'string') {
        numberList = numbers.split(',').map(n => n.trim()).filter(n => n);
    } else if (req.file && req.file.mimetype === 'text/plain') {
        numberList = (await fs.readFile(req.file.path, 'utf8'))
            .split(/\r?\n/)
            .filter(line => line.trim() !== '');
    }

    logger.info(`Number list after splitting: ${JSON.stringify(numberList)}`);
    if (numberList.length === 0) {
        return res.status(400).json({ error: 'No valid numbers provided' });
    }

    try {
        processNumbers(numberList, message, mediaPath);
        res.json({ message: 'Sending started', total: numberList.length });
    } catch (err) {
        logger.error(`Error starting send process: ${err.message}`);
        res.status(500).json({ error: 'Failed to start sending' });
    }
});

app.get('/status', (req, res) => {
    res.json(sendingStatus);
});

// Initialize server and client
(async () => {
    try {
        logger.info('Initializing WhatsApp client...');
        await client.initialize();
        logger.info('WhatsApp client initialization complete.');
        server.listen(3000, () => {
            logger.info('Server running on http://localhost:3000');
        });
    } catch (err) {
        logger.error(`Initialization failed: ${err.message}`); 
    }
})();