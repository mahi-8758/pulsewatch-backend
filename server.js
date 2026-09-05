const express = require('express')
const cors = require('cors')
const monitorRoutes = require('./routes/monitorRoutes')
const errorHandler = require('./middleware/errorHandler')
const { incidents } = require('./data/mockData')

const app = express()
const PORT = 5000

// Middleware
app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'PulseWatch backend is running',
  })
})

// Monitor routes
app.use('/api', monitorRoutes)

// Incidents endpoint
app.get('/api/incidents', (req, res) => {
  res.json({
    success: true,
    data: incidents,
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  })
})

// Error handling middleware
app.use(errorHandler)

// Start server
app.listen(PORT, () => {
  console.log(`🟢 PulseWatch backend is running on http://localhost:${PORT}`)
  console.log(`📊 API Health: http://localhost:${PORT}/api/health`)
  console.log(`📋 Monitors: http://localhost:${PORT}/api/monitors`)
  console.log(`📢 Incidents: http://localhost:${PORT}/api/incidents`)
})
