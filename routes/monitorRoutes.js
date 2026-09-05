const express = require('express')
const { getAllMonitors, createMonitor, deleteMonitor } = require('../controllers/monitorController')

const router = express.Router()

// GET /api/monitors - Get all monitors
router.get('/monitors', getAllMonitors)

// POST /api/monitors - Create a new monitor
router.post('/monitors', createMonitor)

// DELETE /api/targets/:targetId - Delete a monitor
router.delete('/targets/:targetId', deleteMonitor)
router.delete('/monitors/:targetId', deleteMonitor)

module.exports = router
