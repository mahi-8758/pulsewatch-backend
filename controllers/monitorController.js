const { monitors } = require('../data/mockData')

// Validate URL format (simple validation)
function isValidUrl(urlString) {
  try {
    new URL(urlString)
    return true
  } catch (error) {
    return false
  }
}

// Get all monitors
function getAllMonitors(req, res) {
  res.json({
    success: true,
    data: monitors,
  })
}

// Create a new monitor
function createMonitor(req, res) {
  const { label, url } = req.body

  // Validation
  if (!label || !url) {
    return res.status(400).json({
      success: false,
      message: 'Label and URL are required',
    })
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({
      success: false,
      message: 'Enter a valid URL',
    })
  }

  // Create new monitor
  const newMonitor = {
    id: String(Date.now()),
    label,
    url,
    status: 'unknown',
    responseTime: null,
    checkedAt: null,
  }

  // Add to monitors array
  monitors.push(newMonitor)

  res.status(201).json({
    success: true,
    data: newMonitor,
  })
}

// Delete a monitor
function deleteMonitor(req, res) {
  const { targetId } = req.params
  const index = monitors.findIndex((m) => m.id === targetId || m.targetId === targetId)

  if (index === -1) {
    return res.status(404).json({
      success: false,
      message: 'Target not found',
    })
  }

  monitors.splice(index, 1)

  res.json({
    success: true,
    message: 'Target deleted successfully',
  })
}

module.exports = {
  getAllMonitors,
  createMonitor,
  deleteMonitor,
}
