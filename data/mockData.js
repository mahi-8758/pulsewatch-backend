// Mock data for monitors
let monitors = [
  {
    id: '1',
    label: 'My Portfolio',
    url: 'https://example.com',
    status: 'up',
    responseTime: 182,
    checkedAt: '2 minutes ago',
  },
  {
    id: '2',
    label: 'Demo API',
    url: 'https://api.example.com',
    status: 'down',
    responseTime: null,
    checkedAt: '1 minute ago',
  },
  {
    id: '3',
    label: 'Learning Portal',
    url: 'https://portal.college.edu',
    status: 'up',
    responseTime: 245,
    checkedAt: '5 minutes ago',
  },
]

// Mock incidents
const incidents = [
  {
    id: '1',
    monitorId: '2',
    title: 'Demo API went down',
    time: 'Today, 12:20 PM',
    type: 'down',
  },
  {
    id: '2',
    monitorId: '2',
    title: 'Demo API recovered',
    time: 'Today, 12:28 PM',
    type: 'up',
  },
]

module.exports = {
  monitors,
  incidents,
}
