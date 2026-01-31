const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const cron = require('node-cron');
const { deleteOldEvents } = require('./services/cleanupService');

// Schedule Cleanup Job: Run every day at midnight (00:00)
cron.schedule('0 0 * * *', () => {
    console.log('[Cron] Triggering daily event cleanup...');
    deleteOldEvents();
});



const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images

// Security Middleware: Block direct browser access
app.use('/api', (req, res, next) => {
    // Allow preflight checks
    if (req.method === 'OPTIONS') return next();

    // Allow Health Check / Keep-Alive Endpoint
    if (req.path === '/health') return next();

    const clientAppHeader = req.headers['x-client-app'];
    if (clientAppHeader === 'Avishkar-Web') {
        next();
    } else {
        res.status(403).json({ error: 'Access Denied: Direct API access is restricted.' });
    }
});

// Routes
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'active', timestamp: new Date() });
});
app.use('/api/upload', require('./routes/uploadRoutes'));
// app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/registrations', require('./routes/registrationRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/admin/data', require('./routes/dataRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

app.get('/', (req, res) => {
    res.send('Avishkar API is running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
